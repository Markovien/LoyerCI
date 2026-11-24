-- =============================================================================
-- LoyerCI — P3.2 : notifications transactionnelles par e-mail (décision du 24/11/2026).
--   - Expéditeur unique LoyerCI (SMTP) ; les documents restent envoyés par le bailleur (D.2).
--   - Production : déclencheur sur le journal d'audit. Chaque événement de paiement déjà
--     journalisé alimente la file DANS LA MÊME TRANSACTION (pas d'oubli, pas de doublon,
--     aucune fonction métier réécrite).
--   - Expédition : la route serveur réserve un lot (FOR UPDATE SKIP LOCKED), envoie, puis
--     acquitte. 5 tentatives au plus. Plafond quotidien d'e-mails appliqué EN BASE (D.5),
--     sauf pour les alertes de sécurité, qui ne doivent jamais être bloquées.
--   - Contenu (invariant 9) : aucune coordonnée de paiement, aucun texte libre saisi par
--     un utilisateur (motif de rejet compris) ; uniquement un lien vers la page authentifiée.
-- =============================================================================

alter table private.outbox
  add column attempts     integer not null default 0,
  add column locked_until timestamptz,
  add column last_error   text check (char_length(last_error) <= 300),
  add column failed_at    timestamptz,
  add column dedupe_key   text unique;

alter table private.outbox drop constraint outbox_kind_check;
alter table private.outbox add constraint outbox_kind_check check (kind in (
  'alerte_compte_reception', 'depart_locataire', 'rappel_suppression_compte',
  'paiement_declare', 'paiement_confirme', 'paiement_rejete', 'declaration_en_attente'));

create index outbox_pending_idx on private.outbox (created_at) where sent_at is null and failed_at is null;

-- -----------------------------------------------------------------------------
-- Production : journal d'audit -> file d'envoi
-- -----------------------------------------------------------------------------
create function private.enqueue_from_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_pay  public.payments;
begin
  v_kind := case new.action
    when 'paiement_direct_declare'  then 'paiement_declare'
    when 'preuve_virement_soumise'  then 'paiement_declare'
    when 'paiement_direct_confirme' then 'paiement_confirme'
    when 'virement_valide'          then 'paiement_confirme'
    when 'paiement_direct_rejete'   then 'paiement_rejete'
    when 'virement_rejete'          then 'paiement_rejete'
  end;
  if v_kind is null or new.entity_type <> 'payment' then return null; end if;
  select * into v_pay from public.payments where id = new.entity_id::uuid;
  if not found then return null; end if;
  -- Le locataire n'est prévenu que d'une décision portant sur SA déclaration
  -- (un encaissement saisi par le bailleur donne lieu à une quittance qu'il envoie lui-même).
  if v_kind in ('paiement_confirme', 'paiement_rejete') and not exists (
       select 1 from public.invoices i join public.tenants t on t.id = i.tenant_id
        where i.id = v_pay.invoice_id and t.user_id is not null and t.user_id = v_pay.declared_by) then
    return null;
  end if;
  insert into private.outbox (org_id, kind, payload, dedupe_key)
  values (new.org_id, v_kind, jsonb_build_object('payment_id', v_pay.id), v_kind || ':' || v_pay.id)
  on conflict (dedupe_key) do nothing;
  return null;
end $$;

create trigger audit_logs_enqueue after insert on public.audit_logs
  for each row when (new.action in ('paiement_direct_declare', 'preuve_virement_soumise',
                                    'paiement_direct_confirme', 'virement_valide',
                                    'paiement_direct_rejete', 'virement_rejete'))
  execute function private.enqueue_from_audit();

-- Déclarations en attente depuis plus de 48 h : un rappel unique par déclaration.
create function public.enqueue_stale_declarations() returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into private.outbox (org_id, kind, payload, dedupe_key)
  select p.org_id, 'declaration_en_attente', jsonb_build_object('payment_id', p.id), 'attente:' || p.id
    from public.payments p
   where p.status = 'en_attente_validation' and p.created_at < now() - interval '48 hours'
  on conflict (dedupe_key) do nothing;
  get diagnostics v = row_count;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Destinataires et données d'un message (jamais de coordonnées de paiement)
-- -----------------------------------------------------------------------------
create function private.outbox_message(o private.outbox)
returns table (recipients jsonb, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_staff  jsonb;
  v_pay    record;
  v_tenant jsonb;
  v_roles  public.member_role[];
begin
  v_roles := case when o.kind = 'alerte_compte_reception' then array['owner']::public.member_role[]
                  else array['owner', 'accountant']::public.member_role[] end;
  select coalesce(jsonb_agg(distinct jsonb_build_object('email', lower(u.email), 'name', coalesce(pr.full_name, ''))), '[]')
    into v_staff
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles pr on pr.id = m.user_id
   where m.org_id = o.org_id and m.role = any (v_roles) and u.email is not null;

  if o.kind in ('paiement_declare', 'paiement_confirme', 'paiement_rejete', 'declaration_en_attente') then
    select p.amount, p.method, p.created_at, i.id as invoice_id, i.period, i.payment_reference,
           t.full_name as tenant_name, coalesce(tu.email, t.email) as tenant_email
      into v_pay
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
      join public.tenants t on t.id = i.tenant_id
      left join auth.users tu on tu.id = t.user_id
     where p.id = (o.payload ->> 'payment_id')::uuid;
    if not found then return query select '[]'::jsonb, '{}'::jsonb; return; end if;
    v_tenant := case when v_pay.tenant_email is null then '[]'::jsonb
                     else jsonb_build_array(jsonb_build_object('email', lower(v_pay.tenant_email), 'name', v_pay.tenant_name)) end;
    return query select
      case when o.kind in ('paiement_confirme', 'paiement_rejete') then v_tenant else v_staff end,
      jsonb_build_object('montant', v_pay.amount, 'mode', v_pay.method, 'periode', v_pay.period,
                         'reference', v_pay.payment_reference, 'locataire', v_pay.tenant_name,
                         'invoice_id', v_pay.invoice_id, 'declare_le', v_pay.created_at);
  elsif o.kind = 'alerte_compte_reception' then
    return query select v_staff,
      jsonb_build_object('type', o.payload ->> 'type', 'effectif_le', o.payload ->> 'effectif_le');
  elsif o.kind in ('depart_locataire', 'rappel_suppression_compte') then
    return query select
      coalesce((select jsonb_build_array(jsonb_build_object('email', lower(u.email), 'name', coalesce(pr.full_name, '')))
                  from auth.users u left join public.profiles pr on pr.id = u.id
                 where u.id = (o.payload ->> 'user_id')::uuid and u.email is not null), '[]'::jsonb),
      jsonb_build_object('suppression_le', o.payload ->> 'suppression_le');
  else
    return query select '[]'::jsonb, '{}'::jsonb;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Expédition : réservation d'un lot, puis acquittement
-- -----------------------------------------------------------------------------
create function public.claim_notifications(p_limit integer default 20)
returns table (id bigint, kind text, org_name text, recipients jsonb, data jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  o     private.outbox;
  m     record;
  v_org text;
  r     jsonb;
begin
  for o in
    select * from private.outbox x
     where x.sent_at is null and x.failed_at is null and x.attempts < 5
       and (x.locked_until is null or x.locked_until < now())
     order by x.created_at
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update skip locked
  loop
    update private.outbox set attempts = attempts + 1, locked_until = now() + interval '10 minutes' where private.outbox.id = o.id;
    select * into m from private.outbox_message(o);
    if jsonb_array_length(m.recipients) = 0 then
      update private.outbox set sent_at = now(), last_error = 'aucun destinataire' where private.outbox.id = o.id;
      continue;
    end if;
    -- Plafond quotidien (D.5), réservé en base AVANT l'envoi. Les alertes de sécurité y échappent
    -- mais restent comptées.
    begin
      for r in select * from jsonb_array_elements(m.recipients) loop
        if o.kind = 'alerte_compte_reception' then
          insert into public.message_events (org_id, kind, source, billable) values (o.org_id, 'email', 'automatique', true);
        else
          perform public.reserve_automated_message(o.org_id, 'email');
        end if;
      end loop;
    exception when raise_exception then
      update private.outbox set failed_at = now(), last_error = 'plafond quotidien d''e-mails atteint', locked_until = null
       where private.outbox.id = o.id;
      continue;
    end;
    select og.name into v_org from public.organizations og where og.id = o.org_id;
    return query select o.id, o.kind, v_org, m.recipients, m.data;
  end loop;
end $$;

create function public.complete_notification(p_id bigint, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_error is null then
    update private.outbox set sent_at = now(), locked_until = null, last_error = null where id = p_id;
  else
    update private.outbox
       set last_error = left(p_error, 300), locked_until = null,
           failed_at = case when attempts >= 5 then now() end
     where id = p_id;
  end if;
end $$;

revoke execute on function private.enqueue_from_audit() from public, anon, authenticated;
revoke execute on function private.outbox_message(private.outbox) from public, anon, authenticated;
revoke execute on function public.enqueue_stale_declarations() from public, anon, authenticated;
revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
revoke execute on function public.complete_notification(bigint, text) from public, anon, authenticated;
grant execute on function
  public.enqueue_stale_declarations(),
  public.claim_notifications(integer),
  public.complete_notification(bigint, text)
to service_role;
