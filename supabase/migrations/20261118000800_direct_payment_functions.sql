-- =============================================================================
-- LoyerCI — P1.2 : fonctions du paiement direct, validation manuelle unifiée,
-- espèces soumises à confirmation (décision D2) et paramètres de paiement.
-- Règle d'or : une déclaration du locataire n'émet JAMAIS de quittance ; seule
-- la confirmation d'un membre habilité (review_manual_payment) l'impute.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lecture contrôlée pour le locataire : coordonnées de réception EFFECTIVES de
-- son bailleur (hors carence, non révoquées), pour SON avis uniquement, si le
-- paiement direct est activé et l'avis encore payable. Hors virement (RIB servi
-- par get_transfer_instructions).
-- -----------------------------------------------------------------------------
create function public.get_direct_payment_instructions(p_invoice uuid)
returns table (kind public.payout_kind, operator public.mobile_operator, msisdn text,
               pispi_alias text, payment_link_url text, display_name text,
               payment_reference text, amount_remaining bigint, due_date date, fees_notice text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_settings public.org_payment_settings;
begin
  select * into v_inv from public.invoices i
   where i.id = p_invoice and i.tenant_id in (select private.user_tenant_ids());
  if not found then raise exception 'Accès refusé' using errcode = '42501'; end if;

  select * into v_settings from public.org_payment_settings s where s.org_id = v_inv.org_id;
  if not coalesce(v_settings.direct_enabled, true)
     or v_inv.status in ('paye', 'annule') or v_inv.amount_due <= v_inv.amount_paid then
    return;
  end if;

  return query
    select a.kind, a.operator, a.msisdn, a.pispi_alias, a.payment_link_url,
           coalesce(a.display_name_expected, a.account_holder),
           v_inv.payment_reference, v_inv.amount_due - v_inv.amount_paid, v_inv.due_date,
           v_settings.fees_notice
      from (select distinct on (pa.kind, pa.operator) pa.*
              from public.payout_accounts pa
             where pa.org_id = v_inv.org_id
               and pa.kind in ('mobile_money', 'pispi_alias', 'payment_link')
               and pa.revoked_at is null and pa.activates_at <= now()
             order by pa.kind, pa.operator, pa.activates_at desc) a
     order by a.kind, a.operator;
end $$;

-- -----------------------------------------------------------------------------
-- Déclaration d'un paiement direct par le locataire (Server Action, service_role)
-- -----------------------------------------------------------------------------
create function public.submit_direct_payment(
  p_actor uuid, p_invoice uuid, p_operator public.mobile_operator, p_amount bigint,
  p_txn_ref text, p_payer_msisdn text, p_proof_path text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv     public.invoices;
  v_ref     text := btrim(coalesce(p_txn_ref, ''));
  v_pattern text;
  v_id      uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_tenant(p_actor, v_inv.tenant_id);

  if v_inv.status in ('paye', 'annule') then
    raise exception 'Cet avis n''est plus payable' using errcode = 'P0001';
  end if;
  if not coalesce((select s.direct_enabled from public.org_payment_settings s where s.org_id = v_inv.org_id), true) then
    raise exception 'Le paiement direct n''est pas activé par votre bailleur' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.payout_accounts pa
                  where pa.org_id = v_inv.org_id and pa.kind in ('mobile_money', 'pispi_alias', 'payment_link')
                    and pa.revoked_at is null and pa.activates_at <= now()) then
    raise exception 'Votre bailleur n''a pas encore de compte de réception actif' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > v_inv.amount_due - v_inv.amount_paid then
    raise exception 'Montant déclaré invalide' using errcode = '22023';
  end if;

  select f.pattern into v_pattern from public.operator_ref_formats f where f.operator = p_operator;
  if v_pattern is null or v_ref !~ v_pattern then
    raise exception 'Numéro de transaction invalide pour cet opérateur' using errcode = '22023';
  end if;
  if p_proof_path is not null
     and p_proof_path not like v_inv.org_id::text || '/' || v_inv.id::text || '/%' then
    raise exception 'Chemin de preuve invalide' using errcode = '22023';
  end if;
  if (select count(*) from public.payments pm
       where pm.invoice_id = p_invoice and pm.status = 'en_attente_validation') >= 3 then
    raise exception 'Trop de déclarations en attente pour cet avis' using errcode = 'P0001';
  end if;

  begin
    insert into public.payments (org_id, invoice_id, method, provider, operator, amount, status,
                                 provider_transaction_id, operator_txn_ref, payer_msisdn, proof_path, declared_by)
    values (v_inv.org_id, p_invoice, 'mobile_money', 'direct', p_operator, p_amount, 'en_attente_validation',
            'DIR-' || gen_random_uuid(), v_ref, p_payer_msisdn, p_proof_path, p_actor)
    returning id into v_id;
  exception when unique_violation then
    -- Même transaction présentée deux fois (autre mois, autre locataire, ou après rejet).
    -- Pas de private.log ici : il serait annulé avec la transaction ; la Server Action
    -- journalise la tentative côté serveur.
    raise exception 'Ce numéro de transaction a déjà été déclaré' using errcode = 'P0001';
  end;

  perform private.log(v_inv.org_id, p_actor, 'user', 'paiement_direct_declare', 'payment', v_id::text, p_ip, p_ua,
    jsonb_build_object('montant', p_amount, 'operateur', p_operator, 'reference', v_inv.payment_reference,
                       'payeur', case when p_payer_msisdn is null then null else '****' || right(p_payer_msisdn, 4) end,
                       'preuve', p_proof_path is not null));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Validation manuelle unifiée : virement, paiement direct, espèces en attente.
--   virement / direct : owner ou accountant
--   espèces en attente (décision D2) : owner uniquement
--   séparation des tâches : jamais sa propre déclaration ; rejet motivé ; idempotent
-- -----------------------------------------------------------------------------
create function public.review_manual_payment(
  p_actor uuid, p_payment uuid, p_approve boolean, p_reason text, p_ip inet, p_ua text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pay    public.payments;
  v_kind   text;
  v_action text;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then raise exception 'Paiement introuvable' using errcode = 'P0002'; end if;

  v_kind := case
    when v_pay.method = 'virement' then 'virement'
    when v_pay.method = 'mobile_money' and v_pay.provider = 'direct' then 'direct'
    when v_pay.method = 'especes' then 'especes'
    else null end;
  if v_kind is null then
    raise exception 'Ce paiement est confirmé par le fournisseur, pas manuellement' using errcode = '22023';
  end if;

  perform private.assert_role(p_actor, v_pay.org_id,
    case when v_kind = 'especes' then array['owner']::public.member_role[]
         else array['owner', 'accountant']::public.member_role[] end);

  if v_pay.status <> 'en_attente_validation' then
    return 'deja_traite';
  end if;
  if v_pay.declared_by = p_actor then
    raise exception 'Séparation des tâches : on ne valide pas sa propre déclaration' using errcode = '42501';
  end if;

  if p_approve then
    update public.payments set status = 'reussi', validated_by = p_actor, validated_at = now(), failure_reason = null
     where id = p_payment;
    v_action := case v_kind when 'virement' then 'virement_valide'
                            when 'direct' then 'paiement_direct_confirme'
                            else 'especes_confirme' end;
    perform private.log(v_pay.org_id, p_actor, 'user', v_action, 'payment', p_payment::text, p_ip, p_ua,
                        jsonb_build_object('montant', v_pay.amount, 'operateur', v_pay.operator));
    perform private.apply_payment(v_pay.invoice_id, v_pay.amount, p_actor, 'user', p_ip, p_ua);
    return 'valide';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'Motif de rejet obligatoire' using errcode = '22023';
  end if;
  update public.payments set status = 'rejete', validated_by = p_actor, failure_reason = left(btrim(p_reason), 300)
   where id = p_payment;
  v_action := case v_kind when 'virement' then 'virement_rejete'
                          when 'direct' then 'paiement_direct_rejete'
                          else 'especes_rejete' end;
  perform private.log(v_pay.org_id, p_actor, 'user', v_action, 'payment', p_payment::text, p_ip, p_ua,
                      jsonb_build_object('motif', left(btrim(p_reason), 300)));
  return 'rejete';
end $$;

-- Compatibilité : l'ancienne fonction ne traite que les virements et délègue.
create or replace function public.review_transfer(
  p_actor uuid, p_payment uuid, p_approve boolean, p_reason text, p_ip inet, p_ua text
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.payments pm where pm.id = p_payment and pm.method = 'virement') then
    if not exists (select 1 from public.payments pm where pm.id = p_payment) then
      raise exception 'Paiement introuvable' using errcode = 'P0002';
    end if;
    raise exception 'Seuls les virements se valident manuellement' using errcode = '22023';
  end if;
  return public.review_manual_payment(p_actor, p_payment, p_approve, p_reason, p_ip, p_ua);
end $$;

-- Accès à la preuve : virement OU paiement direct avec capture.
create or replace function public.log_proof_access(p_actor uuid, p_payment uuid, p_ip inet, p_ua text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments;
begin
  select * into v_pay from public.payments where id = p_payment;
  if not found or v_pay.proof_path is null then
    raise exception 'Preuve introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_role(p_actor, v_pay.org_id, array['owner', 'accountant']::public.member_role[]);
  perform private.log(v_pay.org_id, p_actor, 'user', 'acces_preuve_virement', 'payment', p_payment::text,
                      p_ip, p_ua, jsonb_build_object('methode', v_pay.method, 'fournisseur', v_pay.provider));
  return v_pay.proof_path;
end $$;

-- -----------------------------------------------------------------------------
-- Espèces (décision D2) : un comptable qui déclare un montant supérieur au seuil
-- de l'organisation crée un encaissement EN ATTENTE ; seule la confirmation d'un
-- propriétaire l'impute et émet la quittance. Le propriétaire, lui, encaisse
-- directement. Le type de retour change : la fonction est recréée.
-- -----------------------------------------------------------------------------
drop function public.record_cash_payment(uuid, uuid, bigint, inet, text);

create function public.record_cash_payment(
  p_actor uuid, p_invoice uuid, p_amount bigint, p_ip inet, p_ua text
) returns table (payment_id uuid, status public.payment_status)
language plpgsql security definer set search_path = '' as $$
declare
  v_inv       public.invoices;
  v_role      public.member_role;
  v_threshold bigint;
  v_id        uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  v_role := private.assert_role(p_actor, v_inv.org_id, array['owner', 'accountant']::public.member_role[]);
  if v_inv.status in ('paye', 'annule') then
    raise exception 'Cet avis n''est plus payable' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > v_inv.amount_due - v_inv.amount_paid then
    raise exception 'Montant invalide' using errcode = '22023';
  end if;

  select coalesce((select s.cash_validation_threshold from public.org_payment_settings s where s.org_id = v_inv.org_id), 100000)
    into v_threshold;

  if v_role = 'accountant' and p_amount > v_threshold then
    insert into public.payments (org_id, invoice_id, method, provider, amount, status,
                                 provider_transaction_id, declared_by)
    values (v_inv.org_id, p_invoice, 'especes', 'manuel', p_amount, 'en_attente_validation',
            'ESP-' || gen_random_uuid(), p_actor)
    returning id into v_id;
    perform private.log(v_inv.org_id, p_actor, 'user', 'especes_a_confirmer', 'payment', v_id::text, p_ip, p_ua,
                        jsonb_build_object('montant', p_amount, 'seuil', v_threshold));
    return query select v_id, 'en_attente_validation'::public.payment_status;
    return;
  end if;

  insert into public.payments (org_id, invoice_id, method, provider, amount, status,
                               provider_transaction_id, declared_by, validated_by, validated_at)
  values (v_inv.org_id, p_invoice, 'especes', 'manuel', p_amount, 'reussi',
          'ESP-' || gen_random_uuid(), p_actor, p_actor, now())
  returning id into v_id;
  perform private.log(v_inv.org_id, p_actor, 'user', 'paiement_confirme', 'payment', v_id::text,
                      p_ip, p_ua, jsonb_build_object('methode', 'especes', 'montant', p_amount, 'role', v_role));
  perform private.apply_payment(p_invoice, p_amount, p_actor, 'user', p_ip, p_ua);
  return query select v_id, 'reussi'::public.payment_status;
end $$;

-- -----------------------------------------------------------------------------
-- Paramètres de paiement (propriétaire uniquement, journalisés avant/après)
-- -----------------------------------------------------------------------------
create function public.set_payment_settings(
  p_actor uuid, p_org uuid, p_direct boolean, p_cinetpay boolean, p_transfer boolean,
  p_fees_notice text, p_cash_threshold bigint, p_ip inet, p_ua text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.org_payment_settings;
  v_after  public.org_payment_settings;
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  if not (coalesce(p_direct, false) or coalesce(p_cinetpay, false) or coalesce(p_transfer, false)) then
    raise exception 'Au moins un mode de paiement en ligne doit rester actif' using errcode = '22023';
  end if;

  insert into public.org_payment_settings (org_id) values (p_org) on conflict do nothing;
  select * into v_before from public.org_payment_settings where org_id = p_org for update;

  update public.org_payment_settings
     set direct_enabled = p_direct, cinetpay_enabled = p_cinetpay, transfer_enabled = p_transfer,
         fees_notice = nullif(btrim(p_fees_notice), ''),
         cash_validation_threshold = coalesce(p_cash_threshold, cash_validation_threshold),
         updated_by = p_actor
   where org_id = p_org
  returning * into v_after;

  perform private.log(p_org, p_actor, 'user', 'parametres_paiement_modifies', 'org_payment_settings', p_org::text,
    p_ip, p_ua, jsonb_build_object(
      'avant', jsonb_build_object('direct', v_before.direct_enabled, 'cinetpay', v_before.cinetpay_enabled,
                                  'virement', v_before.transfer_enabled, 'seuil_especes', v_before.cash_validation_threshold),
      'apres', jsonb_build_object('direct', v_after.direct_enabled, 'cinetpay', v_after.cinetpay_enabled,
                                  'virement', v_after.transfer_enabled, 'seuil_especes', v_after.cash_validation_threshold)));
end $$;

-- -----------------------------------------------------------------------------
-- Privilèges (rien n'est accordé implicitement depuis la migration 5)
-- -----------------------------------------------------------------------------
revoke execute on function public.get_direct_payment_instructions(uuid) from public, anon;
grant  execute on function public.get_direct_payment_instructions(uuid) to authenticated;

revoke execute on function
  public.submit_direct_payment(uuid, uuid, public.mobile_operator, bigint, text, text, text, inet, text),
  public.review_manual_payment(uuid, uuid, boolean, text, inet, text),
  public.record_cash_payment(uuid, uuid, bigint, inet, text),
  public.set_payment_settings(uuid, uuid, boolean, boolean, boolean, text, bigint, inet, text)
from public, anon, authenticated;
grant execute on function
  public.submit_direct_payment(uuid, uuid, public.mobile_operator, bigint, text, text, text, inet, text),
  public.review_manual_payment(uuid, uuid, boolean, text, inet, text),
  public.record_cash_payment(uuid, uuid, bigint, inet, text),
  public.set_payment_settings(uuid, uuid, boolean, boolean, boolean, text, bigint, inet, text)
to service_role;
