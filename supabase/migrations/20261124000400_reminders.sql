-- =============================================================================
-- LoyerCI — P3.3 : relances de loyer (décisions du 24/11/2026).
--   - Échéances par organisation : J-3, J+3, J+10 par défaut, réglables (propriétaire).
--   - « Relances du jour » : pour chaque avis non soldé, la dernière étape atteinte et pas
--     encore traitée ; envoi WhatsApp en un geste depuis le compte du bailleur (D.2), tracé.
--   - Rappel automatique par e-mail aux locataires qui en ont un, si l'organisation l'active
--     (désactivé par défaut) : file P3.2, plafond quotidien D.5.
--   - Aucune pénalité de retard n'est calculée ni annoncée (décision du 24/11/2026).
-- =============================================================================

create table public.org_reminder_settings (
  org_id        uuid primary key references public.organizations (id) on delete cascade,
  offsets       smallint[] not null default '{-3,3,10}',
  email_enabled boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  check (cardinality(offsets) between 1 and 5),
  check (-15 <= all (offsets) and 60 >= all (offsets))
);
alter table public.org_reminder_settings enable row level security;
grant select on public.org_reminder_settings to authenticated;
create policy org_reminder_settings_select on public.org_reminder_settings for select to authenticated
  using (org_id in (select private.user_org_ids()));

-- Relances effectuées : registre en ajout seul (une par avis, étape et canal).
create table public.invoice_reminders (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  step       smallint not null check (step between -15 and 60),
  channel    text not null check (channel in ('whatsapp', 'sms', 'email_auto')),
  sent_at    timestamptz not null default now(),
  sent_by    uuid references auth.users (id) on delete set null,
  unique (invoice_id, step, channel)
);
create index invoice_reminders_org_idx on public.invoice_reminders (org_id, sent_at desc);
create trigger invoice_reminders_append_only before update or delete on public.invoice_reminders
  for each row execute function private.forbid_mutation();
alter table public.invoice_reminders enable row level security;
grant select on public.invoice_reminders to authenticated;
create policy invoice_reminders_select on public.invoice_reminders for select to authenticated
  using (org_id in (select private.user_org_ids()));

alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'bail_cree', 'bail_resilie', 'bail_termine',
  'avis_generes', 'avis_emis', 'avis_annule',
  'paiement_initie', 'paiement_confirme', 'paiement_echoue', 'paiement_anomalie',
  'preuve_virement_soumise', 'virement_valide', 'virement_rejete',
  'rib_ajoute', 'rib_annule',
  'quittance_generee', 'quittance_annulee',
  'acces_preuve_virement',
  'paiement_direct_declare', 'paiement_direct_confirme', 'paiement_direct_rejete',
  'especes_a_confirmer', 'especes_confirme', 'especes_rejete',
  'parametres_paiement_modifies', 'affiche_guichet_generee',
  'reauthentification',
  'document_envoye',
  'compte_locataire_supprime',
  'bien_cree', 'bien_modifie',
  'locataire_cree', 'locataire_modifie', 'locataire_invite', 'locataire_lie', 'locataire_delie',
  'avance_enregistree', 'consentement_whatsapp',
  'membre_ajoute', 'membre_role_modifie', 'membre_retire', 'audit_exporte',
  'relances_parametrees', 'relance_envoyee'));

alter table private.outbox drop constraint outbox_kind_check;
alter table private.outbox add constraint outbox_kind_check check (kind in (
  'alerte_compte_reception', 'depart_locataire', 'rappel_suppression_compte',
  'paiement_declare', 'paiement_confirme', 'paiement_rejete', 'declaration_en_attente',
  'relance_loyer'));

-- Dernière étape atteinte (jours écoulés depuis l'échéance, négatifs avant), ou null.
create function private.reminder_step(p_due date, p_today date, p_offsets smallint[]) returns smallint
language sql immutable set search_path = '' as $$
  select max(o)::smallint from unnest(p_offsets) o where o <= (p_today - p_due);
$$;

create function private.reminder_offsets(p_org uuid) returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.offsets from public.org_reminder_settings s where s.org_id = p_org), '{-3,3,10}'::smallint[]);
$$;

-- -----------------------------------------------------------------------------
-- Réglages (propriétaire)
-- -----------------------------------------------------------------------------
create function public.set_reminder_settings(
  p_actor uuid, p_org uuid, p_offsets smallint[], p_email boolean, p_ip inet, p_ua text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint[];
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  select array_agg(distinct o order by o) into v from unnest(p_offsets) o;
  if v is null or cardinality(v) not between 1 and 5 or -15 > any (v) or 60 < any (v) then
    raise exception 'Échéances de relance : de 1 à 5 valeurs entre J-15 et J+60' using errcode = '22023';
  end if;
  insert into public.org_reminder_settings (org_id, offsets, email_enabled, updated_at, updated_by)
  values (p_org, v, coalesce(p_email, false), now(), p_actor)
  on conflict (org_id) do update
    set offsets = excluded.offsets, email_enabled = excluded.email_enabled, updated_at = now(), updated_by = p_actor;
  perform private.log(p_org, p_actor, 'user', 'relances_parametrees', 'organization', p_org::text, p_ip, p_ua,
                      jsonb_build_object('echeances', to_jsonb(v), 'email', coalesce(p_email, false)));
end $$;

-- -----------------------------------------------------------------------------
-- Relance envoyée depuis le compte du bailleur (WhatsApp ou SMS), en un geste
-- -----------------------------------------------------------------------------
create function public.record_reminder(
  p_actor uuid, p_invoice uuid, p_step smallint, p_channel text, p_ip inet, p_ua text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  i      public.invoices;
  v_new  boolean;
begin
  select * into i from public.invoices where id = p_invoice;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, i.org_id, array['owner', 'manager', 'accountant']::public.member_role[]);
  if p_channel not in ('whatsapp', 'sms') then
    raise exception 'Canal de relance invalide' using errcode = '22023';
  end if;
  if i.status in ('paye', 'annule') then
    raise exception 'Cet avis est soldé ou annulé : pas de relance' using errcode = 'P0001';
  end if;
  if p_step is null or not (p_step = any (private.reminder_offsets(i.org_id))) then
    raise exception 'Étape de relance inconnue' using errcode = '22023';
  end if;
  insert into public.invoice_reminders (org_id, invoice_id, step, channel, sent_by)
  values (i.org_id, i.id, p_step, p_channel, p_actor)
  on conflict (invoice_id, step, channel) do nothing;
  v_new := found;
  if v_new then
    insert into public.message_events (org_id, kind, source, billable, document_id)
    values (i.org_id, p_channel::public.message_kind, 'manuel', false, null);
    perform private.log(i.org_id, p_actor, 'user', 'relance_envoyee', 'invoice', i.id::text, p_ip, p_ua,
                        jsonb_build_object('etape', p_step, 'canal', p_channel, 'reference', i.payment_reference));
  end if;
  return v_new;
end $$;

-- -----------------------------------------------------------------------------
-- Rappels automatiques par e-mail (organisations qui l'ont activé)
-- Seules les étapes atteintes depuis 2 jours au plus partent : activer l'option ne
-- déclenche pas une avalanche de rappels pour des échéances anciennes.
-- -----------------------------------------------------------------------------
create function public.enqueue_reminder_emails(p_today date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := coalesce(p_today, private.today_ci());
  r       record;
  v       integer := 0;
begin
  for r in
    select i.id, i.org_id, private.reminder_step(i.due_date, v_today, s.offsets) as step, i.due_date
      from public.invoices i
      join public.org_reminder_settings s on s.org_id = i.org_id and s.email_enabled
      join public.tenants t on t.id = i.tenant_id
      left join auth.users u on u.id = t.user_id
     where i.status in ('a_payer', 'partiel', 'en_retard')
       and coalesce(u.email, t.email) is not null
  loop
    continue when r.step is null or (v_today - r.due_date) - r.step > 2;
    insert into private.outbox (org_id, kind, payload, dedupe_key)
    values (r.org_id, 'relance_loyer', jsonb_build_object('invoice_id', r.id, 'etape', r.step),
            'relance:' || r.id || ':' || r.step)
    on conflict (dedupe_key) do nothing;
    if found then
      insert into public.invoice_reminders (org_id, invoice_id, step, channel)
      values (r.org_id, r.id, r.step, 'email_auto') on conflict do nothing;
      v := v + 1;
    end if;
  end loop;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Message d'une relance (P3.2) : montant restant, période, échéance, référence de l'avis.
-- Jamais de coordonnée de paiement ni de pénalité.
-- -----------------------------------------------------------------------------
create or replace function private.outbox_message(o private.outbox)
returns table (recipients jsonb, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_staff  jsonb;
  v_pay    record;
  v_inv    record;
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
  elsif o.kind = 'relance_loyer' then
    select i.id, i.period, i.due_date, i.amount_due - i.amount_paid as remaining, i.payment_reference, i.status,
           t.full_name as tenant_name, coalesce(tu.email, t.email) as tenant_email, t.user_id is not null as has_account
      into v_inv
      from public.invoices i
      join public.tenants t on t.id = i.tenant_id
      left join auth.users tu on tu.id = t.user_id
     where i.id = (o.payload ->> 'invoice_id')::uuid;
    -- Avis soldé ou annulé entre-temps : plus rien à rappeler.
    if not found or v_inv.status in ('paye', 'annule') or v_inv.tenant_email is null then
      return query select '[]'::jsonb, '{}'::jsonb; return;
    end if;
    return query select
      jsonb_build_array(jsonb_build_object('email', lower(v_inv.tenant_email), 'name', v_inv.tenant_name)),
      jsonb_build_object('montant', v_inv.remaining, 'periode', v_inv.period, 'echeance', v_inv.due_date,
                         'etape', (o.payload ->> 'etape')::int, 'reference', v_inv.payment_reference,
                         'invoice_id', v_inv.id, 'compte', v_inv.has_account);
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

revoke execute on function private.reminder_step(date, date, smallint[]) from public, anon, authenticated;
revoke execute on function private.reminder_offsets(uuid) from public, anon, authenticated;
revoke execute on function public.set_reminder_settings(uuid, uuid, smallint[], boolean, inet, text) from public, anon, authenticated;
revoke execute on function public.record_reminder(uuid, uuid, smallint, text, inet, text) from public, anon, authenticated;
revoke execute on function public.enqueue_reminder_emails(date) from public, anon, authenticated;
grant execute on function
  public.set_reminder_settings(uuid, uuid, smallint[], boolean, inet, text),
  public.record_reminder(uuid, uuid, smallint, text, inet, text),
  public.enqueue_reminder_emails(date)
to service_role;
