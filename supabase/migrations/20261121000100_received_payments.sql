-- =============================================================================
-- LoyerCI — P1.5 révisé (décisions du 21/11/2026) : le bailleur atteste lui-même
-- la réception des fonds. Le locataire peut prévenir (« J'ai payé ») sans obligation
-- de saisir un n° de transaction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Contraintes assouplies (sans rien relâcher sur l'unicité des références)
-- -----------------------------------------------------------------------------
-- Paiement direct : l'opérateur reste obligatoire, le n° de transaction devient
-- facultatif. Quand il est renseigné, l'index unique global (migration
-- 20261120000100) interdit toute réutilisation.
alter table public.payments drop constraint payments_direct_fields;
alter table public.payments add constraint payments_direct_fields check (
  provider <> 'direct' or (method = 'mobile_money' and operator is not null)
);

-- Virement : preuve obligatoire pour une DÉCLARATION du locataire ; un virement
-- constaté par le bailleur sur son relevé (déclarant = valideur) n'en exige pas.
alter table public.payments drop constraint payments_check;
alter table public.payments add constraint payments_virement_proof check (
  method <> 'virement' or proof_path is not null
  or (status = 'reussi' and declared_by is not null and declared_by = validated_by)
);

-- -----------------------------------------------------------------------------
-- Déclaration du locataire : n° de transaction facultatif (décision 1 a)
-- -----------------------------------------------------------------------------
create or replace function public.submit_direct_payment(
  p_actor uuid, p_invoice uuid, p_operator public.mobile_operator, p_amount bigint,
  p_txn_ref text, p_payer_msisdn text, p_proof_path text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv     public.invoices;
  v_ref     text := nullif(btrim(coalesce(p_txn_ref, '')), '');
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

  if v_ref is not null then
    select f.pattern into v_pattern from public.operator_ref_formats f where f.operator = p_operator;
    if v_pattern is null or v_ref !~ v_pattern then
      raise exception 'Numéro de transaction invalide pour cet opérateur' using errcode = '22023';
    end if;
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
    -- Pas de private.log ici : il serait annulé avec la transaction (la Server Action trace la tentative).
    raise exception 'Ce numéro de transaction a déjà été déclaré' using errcode = 'P0001';
  end;

  perform private.log(v_inv.org_id, p_actor, 'user', 'paiement_direct_declare', 'payment', v_id::text, p_ip, p_ua,
    jsonb_build_object('montant', p_amount, 'operateur', p_operator, 'reference', v_inv.payment_reference,
                       'avec_numero_transaction', v_ref is not null,
                       'payeur', case when p_payer_msisdn is null then null else '****' || right(p_payer_msisdn, 4) end,
                       'preuve', p_proof_path is not null));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Validation : refuser de confirmer une déclaration sur un avis soldé ou annulé
-- (sinon tout le montant partirait en trop-perçu, ou l'imputation échouerait).
-- -----------------------------------------------------------------------------
create or replace function public.review_manual_payment(
  p_actor uuid, p_payment uuid, p_approve boolean, p_reason text, p_ip inet, p_ua text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pay        public.payments;
  v_kind       text;
  v_action     text;
  v_inv_status public.invoice_status;
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
    select i.status into v_inv_status from public.invoices i where i.id = v_pay.invoice_id for update;
    if v_inv_status in ('paye', 'annule') then
      raise exception 'Avis déjà soldé ou annulé : rejetez cette déclaration' using errcode = 'P0001';
    end if;
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

-- -----------------------------------------------------------------------------
-- « Encaissement reçu » : le bailleur constate sur SON compte un loyer reçu en
-- Mobile Money ou par virement, sans déclaration préalable du locataire.
-- Imputation immédiate (owner ou accountant) : l'opération est traçable chez
-- l'opérateur ou la banque. Les espèces restent sur record_cash_payment (D2).
-- -----------------------------------------------------------------------------
create function public.record_received_payment(
  p_actor uuid, p_invoice uuid, p_method public.payment_method, p_operator public.mobile_operator,
  p_amount bigint, p_txn_ref text, p_bank_reference text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv     public.invoices;
  v_role    public.member_role;
  v_ref     text := nullif(btrim(coalesce(p_txn_ref, '')), '');
  v_bank    text := nullif(btrim(coalesce(p_bank_reference, '')), '');
  v_pattern text;
  v_id      uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  v_role := private.assert_role(p_actor, v_inv.org_id, array['owner', 'accountant']::public.member_role[]);

  if v_inv.status in ('paye', 'annule') then
    raise exception 'Cet avis n''est plus payable' using errcode = 'P0001';
  end if;
  if p_method not in ('mobile_money', 'virement') then
    raise exception 'Mode non pris en charge ici (espèces : encaissement en espèces)' using errcode = '22023';
  end if;
  if p_method = 'mobile_money' and p_operator is null then
    raise exception 'Indiquez l''opérateur Mobile Money' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > v_inv.amount_due - v_inv.amount_paid then
    raise exception 'Montant invalide' using errcode = '22023';
  end if;
  if p_method = 'mobile_money' and v_ref is not null then
    select f.pattern into v_pattern from public.operator_ref_formats f where f.operator = p_operator;
    if v_pattern is null or v_ref !~ v_pattern then
      raise exception 'Numéro de transaction invalide pour cet opérateur' using errcode = '22023';
    end if;
  end if;
  if v_bank is not null and char_length(v_bank) > 80 then
    raise exception 'Référence bancaire trop longue' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments pm
              where pm.invoice_id = p_invoice and pm.status = 'en_attente_validation') then
    raise exception 'Une déclaration est en attente pour cet avis : confirmez-la ou rejetez-la d''abord' using errcode = 'P0001';
  end if;

  begin
    insert into public.payments (org_id, invoice_id, method, provider, operator, amount, status,
                                 provider_transaction_id, operator_txn_ref, bank_reference,
                                 declared_by, validated_by, validated_at)
    values (v_inv.org_id, p_invoice, p_method,
            case when p_method = 'mobile_money' then 'direct' else 'manuel' end::public.payment_provider,
            case when p_method = 'mobile_money' then p_operator end, p_amount, 'reussi',
            'ENC-' || gen_random_uuid(),
            case when p_method = 'mobile_money' then v_ref end,
            case when p_method = 'virement' then v_bank end,
            p_actor, p_actor, now())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ce numéro de transaction est déjà enregistré' using errcode = 'P0001';
  end;

  perform private.log(v_inv.org_id, p_actor, 'user', 'paiement_confirme', 'payment', v_id::text, p_ip, p_ua,
    jsonb_build_object('source', 'bailleur', 'methode', p_method, 'operateur', p_operator, 'montant', p_amount,
                       'numero_transaction', v_ref, 'reference_banque', v_bank, 'role', v_role));
  perform private.apply_payment(p_invoice, p_amount, p_actor, 'user', p_ip, p_ua);
  return v_id;
end $$;

revoke execute on function public.record_received_payment(uuid, uuid, public.payment_method, public.mobile_operator, bigint, text, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.record_received_payment(uuid, uuid, public.payment_method, public.mobile_operator, bigint, text, text, inet, text)
  to service_role;
