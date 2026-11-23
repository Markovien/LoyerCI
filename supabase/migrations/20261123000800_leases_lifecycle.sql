-- =============================================================================
-- LoyerCI — P2.3 (2/2) : cycle de vie du bail (décisions du 23/11/2026).
--   - Prorata : le mois d'entrée est facturé ENTIER (la génération mensuelle le fait
--     déjà : tout bail commencé dans le mois reçoit l'avis du mois).
--   - Avance : enregistrée par le PROPRIÉTAIRE ; les N premiers mois reçoivent un avis
--     soldé et une quittance signée « réglé par l'avance ». Une seule fois par bail.
--   - Consentement du locataire au canal WhatsApp (reporté de D.2), tracé.
--   - Résiliation : immédiate, ou à une date future (clôture automatique ensuite).
-- =============================================================================

alter table public.leases add column advance_recorded_at timestamptz;
alter table public.tenants add column whatsapp_consent_at timestamptz;

alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'bail_cree', 'bail_resilie', 'bail_termine',
  'avis_generes', 'avis_emis',
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
  'avance_enregistree', 'consentement_whatsapp'));

-- -----------------------------------------------------------------------------
-- Création du bail : messages explicites (plafond légal, bien déjà loué, cloisonnement)
-- -----------------------------------------------------------------------------
create or replace function public.create_lease(
  p_actor uuid, p_org uuid, p_property uuid, p_tenant uuid, p_usage public.lease_usage,
  p_rent bigint, p_charges bigint, p_deposit_months smallint, p_advance_months smallint,
  p_due_day smallint, p_start date, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.assert_role(p_actor, p_org, array['owner', 'manager']::public.member_role[]);
  -- Appartenance vérifiée AVANT l'insertion : sinon l'index « un bail actif par bien » est
  -- évalué avant la clé étrangère et révélerait qu'un bien d'une AUTRE organisation est loué.
  if not exists (select 1 from public.properties p where p.id = p_property and p.org_id = p_org)
     or not exists (select 1 from public.tenants t where t.id = p_tenant and t.org_id = p_org) then
    raise exception 'Bien ou locataire inconnu dans votre organisation' using errcode = '22023';
  end if;
  begin
    insert into public.leases (org_id, property_id, tenant_id, usage, rent_amount, charges_amount,
                               deposit_months, advance_months, due_day, start_date)
    values (p_org, p_property, p_tenant, p_usage, p_rent, p_charges,
            p_deposit_months, p_advance_months, p_due_day, p_start)
    returning id into v_id;
  exception
    when check_violation then
      if sqlerrm like '%leases_plafond_legal_habitation%' then
        raise exception 'Loi n° 2019-576 : un bail d''habitation est limité à 2 mois de caution et 2 mois d''avance' using errcode = '22023';
      end if;
      raise exception 'Valeurs du bail invalides (loyer, charges, jour d''échéance ou dates)' using errcode = '22023';
    when unique_violation then
      raise exception 'Ce bien a déjà un bail en cours' using errcode = 'P0001';
    when foreign_key_violation then
      raise exception 'Bien ou locataire inconnu dans votre organisation' using errcode = '22023';
  end;

  perform private.log(p_org, p_actor, 'user', 'bail_cree', 'lease', v_id::text, p_ip, p_ua,
    jsonb_build_object('property_id', p_property, 'tenant_id', p_tenant, 'loyer', p_rent,
                       'charges', p_charges, 'caution_mois', p_deposit_months, 'avance_mois', p_advance_months));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Consentement du locataire au canal WhatsApp (recueilli par le bailleur, tracé)
-- -----------------------------------------------------------------------------
create function public.set_whatsapp_consent(p_actor uuid, p_tenant uuid, p_consent boolean, p_ip inet, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select t.org_id into v_org from public.tenants t where t.id = p_tenant;
  if v_org is null then raise exception 'Locataire introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_org, array['owner', 'manager']::public.member_role[]);
  update public.tenants set whatsapp_consent_at = case when p_consent then coalesce(whatsapp_consent_at, now()) end
   where id = p_tenant;
  perform private.log(v_org, p_actor, 'user', 'consentement_whatsapp', 'tenant', p_tenant::text, p_ip, p_ua,
                      jsonb_build_object('consentement', p_consent));
end $$;

-- -----------------------------------------------------------------------------
-- Avis d'un bail pour une période donnée (même règle que la génération mensuelle)
-- -----------------------------------------------------------------------------
create function private.ensure_invoice(p_lease uuid, p_period date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  l record;
begin
  select i.id into v_id from public.invoices i where i.lease_id = p_lease and i.period = p_period;
  if v_id is not null then return v_id; end if;
  select x.id, x.org_id, x.tenant_id, x.rent_amount, x.charges_amount, x.due_day, p.code into l
    from public.leases x join public.properties p on p.id = x.property_id where x.id = p_lease;
  insert into public.invoices (org_id, lease_id, tenant_id, period, rent_amount, charges_amount, due_date, payment_reference)
  values (l.org_id, l.id, l.tenant_id, p_period, l.rent_amount, l.charges_amount, p_period + (l.due_day - 1),
          private.make_payment_reference(l.org_id, p_period, l.code))
  on conflict (lease_id, period) do nothing
  returning id into v_id;
  if v_id is null then
    select i.id into v_id from public.invoices i where i.lease_id = p_lease and i.period = p_period;
  end if;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Avance : propriétaire uniquement, une seule fois par bail. Chaque mois couvert
-- (à partir du mois d'entrée, compté entier) est soldé et reçoit sa quittance.
-- -----------------------------------------------------------------------------
create function public.record_advance(p_actor uuid, p_lease uuid, p_ip inet, p_ua text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  l       public.leases;
  v_inv   public.invoices;
  v_first date;
  v_id    uuid;
  k       int;
  v_done  int := 0;
begin
  select * into l from public.leases where id = p_lease for update;
  if not found then raise exception 'Bail introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, l.org_id, array['owner']::public.member_role[]);
  if l.advance_months = 0 then
    raise exception 'Ce bail ne prévoit pas d''avance' using errcode = 'P0001';
  end if;
  if l.advance_recorded_at is not null then
    raise exception 'L''avance de ce bail a déjà été enregistrée' using errcode = 'P0001';
  end if;

  v_first := date_trunc('month', l.start_date)::date;
  for k in 0 .. l.advance_months - 1 loop
    v_id := private.ensure_invoice(l.id, (v_first + make_interval(months => k))::date);
    select * into v_inv from public.invoices where id = v_id for update;
    if v_inv.status in ('paye', 'annule') or v_inv.amount_due - v_inv.amount_paid <= 0 then
      continue; -- mois déjà réglé autrement : l'avance ne le recouvre pas deux fois
    end if;
    insert into public.payments (org_id, invoice_id, method, provider, amount, status,
                                 provider_transaction_id, declared_by, validated_by, validated_at)
    values (l.org_id, v_inv.id, 'avance', 'manuel', v_inv.amount_due - v_inv.amount_paid, 'reussi',
            'AVA-' || gen_random_uuid(), p_actor, p_actor, now());
    perform private.apply_payment(v_inv.id, v_inv.amount_due - v_inv.amount_paid, p_actor, 'user', p_ip, p_ua);
    v_done := v_done + 1;
  end loop;

  update public.leases set advance_recorded_at = now() where id = l.id;
  perform private.log(l.org_id, p_actor, 'user', 'avance_enregistree', 'lease', l.id::text, p_ip, p_ua,
                      jsonb_build_object('mois_prevus', l.advance_months, 'mois_soldes', v_done));
  return v_done;
end $$;

-- -----------------------------------------------------------------------------
-- Résiliation / fin de bail
--   date de fin <= aujourd'hui : bail clos immédiatement (statut « resilie ») ;
--   date future : la date est posée, le bail reste actif jusque-là (clôture par la
--   tâche quotidienne close_ended_leases, statut « termine »).
-- -----------------------------------------------------------------------------
create function public.terminate_lease(p_actor uuid, p_lease uuid, p_end_date date, p_reason text, p_ip inet, p_ua text)
returns text
language plpgsql security definer set search_path = '' as $$
declare l public.leases;
begin
  select * into l from public.leases where id = p_lease for update;
  if not found then raise exception 'Bail introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, l.org_id, array['owner', 'manager']::public.member_role[]);
  if l.status <> 'actif' then raise exception 'Ce bail est déjà terminé' using errcode = 'P0001'; end if;
  if p_end_date is null or p_end_date <= l.start_date then
    raise exception 'La date de fin doit suivre la date de début du bail' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Indiquez le motif' using errcode = '22023';
  end if;

  if p_end_date <= private.today_ci() then
    update public.leases set end_date = p_end_date, status = 'resilie' where id = l.id;
  else
    update public.leases set end_date = p_end_date where id = l.id;
  end if;
  perform private.log(l.org_id, p_actor, 'user', 'bail_resilie', 'lease', l.id::text, p_ip, p_ua,
                      jsonb_build_object('fin', p_end_date, 'motif', left(btrim(p_reason), 300),
                                         'immediat', p_end_date <= private.today_ci()));
  return case when p_end_date <= private.today_ci() then 'resilie' else 'planifie' end;
end $$;

create function public.close_ended_leases() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v int := 0;
begin
  for r in select id, org_id from public.leases where status = 'actif' and end_date is not null and end_date < private.today_ci() for update loop
    update public.leases set status = 'termine' where id = r.id;
    perform private.log(r.org_id, null, 'system', 'bail_termine', 'lease', r.id::text, null, null, '{}'::jsonb);
    v := v + 1;
  end loop;
  return v;
end $$;

revoke execute on function private.ensure_invoice(uuid, date) from public, anon, authenticated;
revoke execute on function public.set_whatsapp_consent(uuid, uuid, boolean, inet, text) from public, anon, authenticated;
revoke execute on function public.record_advance(uuid, uuid, inet, text) from public, anon, authenticated;
revoke execute on function public.terminate_lease(uuid, uuid, date, text, inet, text) from public, anon, authenticated;
revoke execute on function public.close_ended_leases() from public, anon, authenticated;
grant execute on function
  public.set_whatsapp_consent(uuid, uuid, boolean, inet, text),
  public.record_advance(uuid, uuid, inet, text),
  public.terminate_lease(uuid, uuid, date, text, inet, text),
  public.close_ended_leases()
to service_role;
