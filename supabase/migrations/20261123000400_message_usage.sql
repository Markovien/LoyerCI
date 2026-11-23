-- =============================================================================
-- LoyerCI — D.5 : comptage des envois et facturation (décision du 21/11/2026).
-- Tous les envois sont à la charge du bailleur et inclus dans son abonnement.
--   - registre en ajout seul de chaque envoi (manuel ou automatique) ;
--   - plafonds quotidiens anti-abus pour les envois automatiques (SMS, codes, e-mails),
--     appliqués EN BASE (un code serveur compromis ne peut pas vider le crédit SMS) ;
--   - récapitulatif mensuel et export pour la facturation.
-- Les envois manuels (WhatsApp, e-mail, partage depuis les comptes du bailleur) ne
-- coûtent rien à LoyerCI : comptés, non facturables.
-- =============================================================================

create type public.message_kind   as enum ('whatsapp', 'email', 'sms', 'otp', 'partage', 'telechargement');
create type public.message_source as enum ('manuel', 'automatique');

create table public.message_events (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  kind        public.message_kind not null,
  source      public.message_source not null,
  billable    boolean not null,
  document_id uuid,
  created_at  timestamptz not null default now(),
  check (source = 'automatique' or not billable)
);
create index message_events_org_idx on public.message_events (org_id, created_at desc);
create trigger message_events_append_only before update or delete on public.message_events
  for each row execute function private.forbid_mutation();

alter table public.message_events enable row level security;
grant select on public.message_events to authenticated;
create policy message_events_select on public.message_events for select to authenticated
  using (org_id in (select private.user_org_ids(array['owner', 'accountant']::public.member_role[])));

-- Plafonds quotidiens par organisation (modifiables par l'équipe LoyerCI selon l'abonnement).
create table public.org_message_quotas (
  org_id      uuid primary key references public.organizations (id) on delete cascade,
  sms_daily   integer not null default 200 check (sms_daily between 0 and 100000),
  otp_daily   integer not null default 100 check (otp_daily between 0 and 100000),
  email_daily integer not null default 500 check (email_daily between 0 and 100000),
  updated_at  timestamptz not null default now()
);
alter table public.org_message_quotas enable row level security;
grant select on public.org_message_quotas to authenticated;
create policy org_message_quotas_select on public.org_message_quotas for select to authenticated
  using (org_id in (select private.user_org_ids(array['owner', 'accountant']::public.member_role[])));

-- Reprise des envois déjà tracés (D.2)
insert into public.message_events (org_id, kind, source, billable, document_id, created_at)
select d.org_id, d.channel::text::public.message_kind, 'manuel', false, d.document_id, d.sent_at
  from public.document_deliveries d;

-- -----------------------------------------------------------------------------
-- Envoi manuel tracé (D.2) : alimente aussi le registre.
-- -----------------------------------------------------------------------------
create or replace function public.mark_document_sent(
  p_actor uuid, p_invoice uuid, p_doc_type public.document_type, p_channel public.delivery_channel,
  p_ip inet, p_ua text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_doc uuid;
  v_id  bigint;
begin
  select i.org_id into v_org from public.invoices i where i.id = p_invoice;
  if v_org is null then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_org, array['owner', 'manager', 'accountant']::public.member_role[]);

  if p_doc_type = 'avis' then
    select n.id into v_doc from public.notices n where n.invoice_id = p_invoice;
  else
    select r.id into v_doc from public.receipts r where r.invoice_id = p_invoice and r.status = 'valide';
  end if;
  if v_doc is null then
    raise exception 'Document non émis : préparez-le avant de l''envoyer' using errcode = 'P0001';
  end if;

  insert into public.document_deliveries (org_id, invoice_id, doc_type, document_id, channel, sent_by)
  values (v_org, p_invoice, p_doc_type, v_doc, p_channel, p_actor)
  returning id into v_id;
  insert into public.message_events (org_id, kind, source, billable, document_id)
  values (v_org, p_channel::text::public.message_kind, 'manuel', false, v_doc);

  perform private.log(v_org, p_actor, 'user', 'document_envoye', p_doc_type::text, v_doc::text, p_ip, p_ua,
                      jsonb_build_object('canal', p_channel, 'avis', p_invoice));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Envoi automatique (SMS, code, e-mail transactionnel) : plafond quotidien vérifié
-- et envoi compté de façon atomique, AVANT l'appel au fournisseur (D.3, P3.2).
-- -----------------------------------------------------------------------------
create function public.reserve_automated_message(p_org uuid, p_kind public.message_kind, p_document uuid default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_cap   integer;
  v_count integer;
  v_id    bigint;
begin
  if p_kind not in ('sms', 'otp', 'email') then
    raise exception 'Type d''envoi automatique non pris en charge' using errcode = '22023';
  end if;
  -- Sérialise les réservations d'une même organisation (pas de dépassement en concurrence).
  perform pg_advisory_xact_lock(hashtext('loyerci.quota.' || p_org::text));
  insert into public.org_message_quotas (org_id) values (p_org) on conflict do nothing;
  select case p_kind when 'sms' then q.sms_daily when 'otp' then q.otp_daily else q.email_daily end
    into v_cap from public.org_message_quotas q where q.org_id = p_org;
  select count(*) into v_count from public.message_events e
   where e.org_id = p_org and e.kind = p_kind and e.source = 'automatique'
     and e.created_at >= date_trunc('day', now() at time zone 'Africa/Abidjan') at time zone 'Africa/Abidjan';
  if v_count >= v_cap then
    raise exception 'Plafond quotidien d''envoi atteint (%)', p_kind using errcode = 'P0001';
  end if;
  insert into public.message_events (org_id, kind, source, billable, document_id)
  values (p_org, p_kind, 'automatique', true, p_document)
  returning id into v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Récapitulatif mensuel (propriétaire ou comptable de l'organisation)
-- -----------------------------------------------------------------------------
create function public.message_usage_summary(p_org uuid, p_month date)
returns table (kind public.message_kind, source public.message_source, billable boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_month date := date_trunc('month', p_month)::date;
begin
  if p_org not in (select private.user_org_ids(array['owner', 'accountant']::public.member_role[])) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select e.kind, e.source, e.billable, count(*)::bigint
      from public.message_events e
     where e.org_id = p_org
       and e.created_at >= v_month::timestamp at time zone 'Africa/Abidjan'
       and e.created_at < (v_month + interval '1 month')::timestamp at time zone 'Africa/Abidjan'
     group by e.kind, e.source, e.billable
     order by e.billable desc, e.source, e.kind;
end $$;

revoke execute on function public.reserve_automated_message(uuid, public.message_kind, uuid) from public, anon, authenticated;
grant  execute on function public.reserve_automated_message(uuid, public.message_kind, uuid) to service_role;
revoke execute on function public.message_usage_summary(uuid, date) from public, anon;
grant  execute on function public.message_usage_summary(uuid, date) to authenticated;
