-- =============================================================================
-- LoyerCI — Migration 5 : correctifs de l'audit de sécurité du 18/11/2026
-- (voir docs/AUDIT-SECURITE.md). Les migrations 1 à 4 ne sont pas modifiées :
-- les fonctions concernées sont redéfinies ici (CREATE OR REPLACE conserve les GRANT).
--
--   S1  Carence de 48 h contournable (révocation puis ajout = activation immédiate)
--   S2  Privilèges par défaut Supabase : toute FUTURE table/fonction de public
--       serait accessible à anon/authenticated
--   S3  Webhook sur un avis annulé : exception -> 503 en boucle, encaissement non tracé
--   S4  Quittance : bailleur, adresse, détail des sommes et mode de règlement non signés
--   S5  Journal d'audit : user_agent hors du chaînage SHA-256
--   S7  private.iban_ok(NULL) en erreur : aucun compte Mobile Money enregistrable
--   S6  verify_receipt appelable directement via PostgREST par anon (contourne le
--       limiteur de débit applicatif) : désormais réservée au serveur
-- =============================================================================

-- -----------------------------------------------------------------------------
-- S2 — Privilèges par défaut : plus rien n'est accordé implicitement.
-- Supabase accorde par défaut ALL sur les tables/séquences et EXECUTE sur les
-- fonctions créées par « postgres » dans public à anon et authenticated. Une
-- migration future qui oublierait un REVOKE exposerait sa table ou sa fonction
-- (y compris une fonction SECURITY DEFINER prenant p_actor : usurpation d'identité).
-- -----------------------------------------------------------------------------
alter default privileges in schema public  revoke all     on tables    from anon, authenticated;
alter default privileges in schema public  revoke all     on sequences from anon, authenticated;
-- NB : un REVOKE ... FROM PUBLIC « in schema » est sans effet (les ACL par schéma ne
-- font qu'ajouter aux ACL globales, et EXECUTE à PUBLIC est un défaut global). Les
-- lignes équivalentes de la migration 1 étaient donc inopérantes : révocation globale.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public  revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke all     on tables    from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- S7 — private.iban_ok(NULL) levait une exception (FOREACH sur NULL) : la contrainte
-- CHECK de payout_accounts rendait IMPOSSIBLE l'ajout d'un compte Mobile Money
-- (iban NULL). PostgreSQL ne garantit pas l'ordre d'évaluation d'un AND dans un
-- CHECK : la fonction doit être totale (NULL -> NULL, caractère invalide -> false).
-- -----------------------------------------------------------------------------
create or replace function private.iban_ok(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  s text;
  r int := 0;
  c text;
  d text;
begin
  if p is null then return null; end if;
  if p !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$' then return false; end if;
  s := substr(p, 5) || substr(p, 1, 4);
  foreach c in array regexp_split_to_array(s, '') loop
    d := case when c ~ '^[A-Z]$' then (ascii(c) - 55)::text else c end;
    for i in 1 .. char_length(d) loop
      r := (r * 10 + substr(d, i, 1)::int) % 97;
    end loop;
  end loop;
  return r = 1;
end $$;

-- -----------------------------------------------------------------------------
-- S1 — Carence : l'activation immédiate n'est permise que pour la toute première
-- coordonnée de l'organisation (aucune ligne, même révoquée, quel que soit le type).
-- Tout ajout ultérieur attend 48 h, y compris après révocation de l'ancien compte
-- ou pour un nouveau type (ex. Mobile Money après un RIB).
-- -----------------------------------------------------------------------------
create or replace function public.add_payout_account(
  p_actor uuid, p_org uuid, p_kind public.payout_kind, p_holder text, p_bank text,
  p_iban text, p_operator public.mobile_operator, p_msisdn text, p_ip inet, p_ua text
) returns table (id uuid, activates_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_activates timestamptz;
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);

  -- Sérialise les ajouts concurrents d'une même organisation (deux « premiers » comptes).
  perform pg_advisory_xact_lock(hashtext('loyerci.payout.' || p_org::text));

  v_activates := case when exists (select 1 from public.payout_accounts pa where pa.org_id = p_org)
                 then now() + interval '48 hours' else now() end;

  insert into public.payout_accounts (org_id, kind, account_holder, bank_name, iban, operator,
                                      msisdn, activates_at, created_by)
  values (p_org, p_kind, p_holder, p_bank, upper(replace(p_iban, ' ', '')), p_operator, p_msisdn,
          v_activates, p_actor)
  returning payout_accounts.id into v_id;

  perform private.log(p_org, p_actor, 'user', 'rib_ajoute', 'payout_account', v_id::text, p_ip, p_ua,
    jsonb_build_object('type', p_kind, 'iban', private.mask_iban(upper(replace(p_iban, ' ', ''))),
                       'msisdn', case when p_msisdn is null then null else '****' || right(p_msisdn, 4) end,
                       'effectif_le', v_activates));
  return query select v_id, v_activates;
end $$;

-- -----------------------------------------------------------------------------
-- S3 — Encaissement confirmé sur un avis annulé : l'argent est bien arrivé chez le
-- bailleur. On le trace (paiement « reussi » + anomalie), sans imputation ni
-- quittance ; le webhook répond normalement au lieu d'échouer en boucle.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_provider_payment(
  p_provider public.payment_provider, p_tx_id text, p_amount bigint, p_currency text,
  p_operator public.mobile_operator, p_ip inet, p_meta jsonb default '{}'::jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments;
  v_inv_status public.invoice_status;
begin
  select * into v_pay from public.payments
   where provider = p_provider and provider_transaction_id = p_tx_id
   for update;

  if not found then
    perform private.log(null, null, 'provider', 'paiement_anomalie', 'payment', p_tx_id, p_ip, null,
                        jsonb_build_object('type', 'transaction_inconnue', 'fournisseur', p_provider) || p_meta);
    return 'inconnu';
  end if;

  if v_pay.status = 'reussi' then
    return 'deja_traite';
  end if;
  if v_pay.status not in ('initie', 'echoue') then
    return 'statut_incompatible';
  end if;

  if p_currency <> 'XOF' or p_amount <> v_pay.amount then
    update public.payments set status = 'echoue', failure_reason = 'montant_ou_devise_incoherent'
     where id = v_pay.id;
    perform private.log(v_pay.org_id, null, 'provider', 'paiement_anomalie', 'payment', v_pay.id::text,
                        p_ip, null, jsonb_build_object('type', 'montant_incoherent', 'attendu', v_pay.amount,
                        'recu', p_amount, 'devise', p_currency) || p_meta);
    return 'anomalie';
  end if;

  -- Verrou de l'avis pris dans le même ordre que apply_payment (paiement puis avis).
  select i.status into v_inv_status from public.invoices i where i.id = v_pay.invoice_id for update;

  update public.payments
     set status = 'reussi', validated_at = now(), failure_reason = null,
         operator = coalesce(p_operator, operator)
   where id = v_pay.id;

  if v_inv_status = 'annule' then
    perform private.log(v_pay.org_id, null, 'provider', 'paiement_anomalie', 'payment', v_pay.id::text,
                        p_ip, null, jsonb_build_object('type', 'avis_annule', 'montant', p_amount,
                        'fournisseur', p_provider) || p_meta);
    return 'anomalie_avis_annule';
  end if;

  perform private.log(v_pay.org_id, null, 'provider', 'paiement_confirme', 'payment', v_pay.id::text,
                      p_ip, null, jsonb_build_object('montant', p_amount, 'fournisseur', p_provider) || p_meta);
  perform private.apply_payment(v_pay.invoice_id, v_pay.amount, null, 'provider', p_ip, null);
  return 'confirme';
end $$;

-- -----------------------------------------------------------------------------
-- S4 — Quittances v2 : la signature couvre TOUS les champs affichés ou imprimés.
-- Sérialisation canonique en JSON (jsonb : ordre de clés déterministe), ce qui
-- supprime aussi l'ambiguïté du séparateur « | » des champs libres de la v1.
-- Les quittances v1 restent vérifiées avec l'ancien format.
-- -----------------------------------------------------------------------------
alter table public.receipts
  add column signature_version smallint not null default 1 check (signature_version in (1, 2));

create function private.receipt_payload_v2(r public.receipts) returns text
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'v', 'LOYERCI-QUITTANCE-v2',
    'id', r.id, 'numero', r.receipt_number, 'org', r.org_id, 'avis', r.invoice_id,
    'locataire_id', r.tenant_id, 'bailleur', r.landlord_name, 'locataire', r.tenant_name,
    'bien', r.property_label, 'adresse', r.property_location,
    'periode', to_char(r.period, 'YYYY-MM'),
    'loyer', r.rent_amount, 'charges', r.charges_amount, 'montant', r.amount,
    'modes', r.payment_methods,
    'paye_le', to_char(r.paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'emise_le', to_char(r.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
$$;

create or replace function private.issue_receipt(
  p_invoice uuid, p_actor uuid, p_actor_kind text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v        record;
  v_year   int := extract(year from private.today_ci());
  v_no     int;
  r        public.receipts;
  v_payload text;
begin
  select i.id, i.org_id, i.tenant_id, i.period, i.rent_amount, i.charges_amount, i.amount_due,
         i.paid_at, i.status, t.full_name as tenant_name, p.label as property_label,
         concat_ws(', ', nullif(p.quartier, ''), p.commune, p.city) as property_location,
         o.name as landlord_name, o.receipt_prefix
    into v
    from public.invoices i
    join public.leases l      on l.id = i.lease_id
    join public.tenants t     on t.id = i.tenant_id
    join public.properties p  on p.id = l.property_id
    join public.organizations o on o.id = i.org_id
   where i.id = p_invoice;

  if v.status is distinct from 'paye' then
    raise exception 'Quittance impossible : avis non soldé';
  end if;

  insert into private.receipt_counters as c (org_id, year, last_no) values (v.org_id, v_year, 1)
  on conflict (org_id, year) do update set last_no = c.last_no + 1
  returning c.last_no into v_no;

  r.id                := gen_random_uuid();
  r.org_id            := v.org_id;
  r.invoice_id        := v.id;
  r.tenant_id         := v.tenant_id;
  r.receipt_number    := v.receipt_prefix || '-' || v_year || '-' || lpad(v_no::text, 6, '0');
  r.landlord_name     := v.landlord_name;
  r.tenant_name       := v.tenant_name;
  r.property_label    := v.property_label;
  r.property_location := v.property_location;
  r.period            := v.period;
  r.rent_amount       := v.rent_amount;
  r.charges_amount    := v.charges_amount;
  r.amount            := v.amount_due;
  r.paid_at           := v.paid_at;
  r.issued_at         := now();
  select coalesce(string_agg(distinct pm.method::text, '+' order by pm.method::text), 'inconnu')
    into r.payment_methods
    from public.payments pm where pm.invoice_id = p_invoice and pm.status = 'reussi';

  v_payload := private.receipt_payload_v2(r);

  insert into public.receipts (id, org_id, invoice_id, tenant_id, receipt_number, landlord_name,
    tenant_name, property_label, property_location, period, rent_amount, charges_amount, amount,
    payment_methods, paid_at, issued_at, content_hash, signature, signature_version)
  values (r.id, r.org_id, r.invoice_id, r.tenant_id, r.receipt_number, r.landlord_name,
    r.tenant_name, r.property_label, r.property_location, r.period, r.rent_amount, r.charges_amount,
    r.amount, r.payment_methods, r.paid_at, r.issued_at,
    encode(extensions.digest(v_payload, 'sha256'), 'hex'),
    encode(extensions.hmac(v_payload, private.receipt_secret(), 'sha256'), 'hex'),
    2);

  perform private.log(v.org_id, p_actor, p_actor_kind, 'quittance_generee', 'receipt', r.id::text,
                      p_ip, p_ua, jsonb_build_object('numero', r.receipt_number, 'montant', r.amount));
  return r.id;
end $$;

create or replace function public.verify_receipt(p_id uuid, p_code text)
returns table (verdict text, receipt_number text, landlord_name text, tenant_masked text,
               property_location text, period date, amount bigint, paid_at timestamptz,
               issued_at timestamptz, fingerprint text, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.receipts;
  v_code text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  v_payload text;
begin
  select * into r from public.receipts where id = p_id;
  if not found or char_length(v_code) < 16 or left(r.signature, char_length(v_code)) <> v_code then
    return query select 'invalide'::text, null::text, null::text, null::text, null::text,
                        null::date, null::bigint, null::timestamptz, null::timestamptz, null::text, null::timestamptz;
    return;
  end if;

  v_payload := case r.signature_version
    when 2 then private.receipt_payload_v2(r)
    else private.receipt_payload(r.id, r.receipt_number, r.org_id, r.invoice_id, r.tenant_name,
                                 r.property_label, r.period, r.amount, r.paid_at)
  end;
  if encode(extensions.hmac(v_payload, private.receipt_secret(), 'sha256'), 'hex') <> r.signature
     or encode(extensions.digest(v_payload, 'sha256'), 'hex') <> r.content_hash then
    return query select 'alteree'::text, r.receipt_number, null::text, null::text, null::text,
                        null::date, null::bigint, null::timestamptz, null::timestamptz, null::text, null::timestamptz;
    return;
  end if;

  return query select
    case r.status when 'annulee' then 'annulee' else 'authentique' end,
    r.receipt_number, r.landlord_name, private.mask_name(r.tenant_name),
    r.property_location, r.period, r.amount, r.paid_at, r.issued_at,
    upper(left(r.content_hash, 16)), r.revoked_at;
end $$;

-- S6 — Plus d'appel direct par anon/authenticated : la page /verify appelle la
-- fonction côté serveur (service_role), derrière le limiteur de débit.
revoke execute on function public.verify_receipt(uuid, text) from public, anon, authenticated;
grant  execute on function public.verify_receipt(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- S5 — Chaînage d'audit v2 : le user_agent entre dans l'empreinte.
-- Les lignes existantes (v1) restent vérifiées avec l'ancienne formule.
-- -----------------------------------------------------------------------------
alter table public.audit_logs
  add column hash_version smallint not null default 1 check (hash_version in (1, 2));

create function private.audit_row_hash(a public.audit_logs) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(
    case a.hash_version
      when 2 then concat_ws('|',
        'v2', a.prev_hash, a.chain_seq::text, coalesce(a.org_id::text, '-'),
        coalesce(a.actor_id::text, '-'), a.actor_kind, a.action, a.entity_type,
        coalesce(a.entity_id, '-'), coalesce(host(a.ip), '-'),
        coalesce(encode(convert_to(a.user_agent, 'UTF8'), 'base64'), '-'), a.metadata::text,
        to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      else concat_ws('|',
        a.prev_hash, a.chain_seq::text, coalesce(a.org_id::text, '-'),
        coalesce(a.actor_id::text, '-'), a.actor_kind, a.action, a.entity_type,
        coalesce(a.entity_id, '-'), coalesce(host(a.ip), '-'), a.metadata::text,
        to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    end, 'sha256'), 'hex');
$$;

create or replace function private.audit_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prev_hash text;
  v_prev_seq  bigint;
begin
  perform pg_advisory_xact_lock(hashtext('loyerci.audit_logs.chain'));
  select a.hash, a.chain_seq into v_prev_hash, v_prev_seq
    from public.audit_logs a order by a.chain_seq desc limit 1;

  new.chain_seq    := coalesce(v_prev_seq, 0) + 1;
  new.prev_hash    := coalesce(v_prev_hash, repeat('0', 64));
  new.created_at   := clock_timestamp();
  new.hash_version := 2;
  new.hash         := private.audit_row_hash(new);
  return new;
end $$;

create or replace function private.verify_audit_chain()
returns table (broken_at_seq bigint, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.audit_logs;
  v_prev text := repeat('0', 64);
  v_expected_seq bigint := 1;
begin
  for a in select * from public.audit_logs order by chain_seq loop
    if a.chain_seq <> v_expected_seq then
      return query select a.chain_seq, 'maillon manquant'; return;
    end if;
    if a.prev_hash <> v_prev then
      return query select a.chain_seq, 'prev_hash incohérent'; return;
    end if;
    if a.hash <> private.audit_row_hash(a) then
      return query select a.chain_seq, 'contenu altéré'; return;
    end if;
    v_prev := a.hash;
    v_expected_seq := v_expected_seq + 1;
  end loop;
end $$;

-- Tête de chaîne : à exporter régulièrement HORS de la base (P4.4) pour détecter
-- la suppression des derniers maillons, indétectable depuis l'intérieur.
create function private.audit_chain_head()
returns table (chain_seq bigint, hash text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.chain_seq, a.hash, a.created_at from public.audit_logs a order by a.chain_seq desc limit 1;
$$;

-- Les nouvelles fonctions private ne sont exécutables par personne d'autre que leur propriétaire.
revoke execute on function private.receipt_payload_v2(public.receipts) from public, anon, authenticated;
revoke execute on function private.audit_row_hash(public.audit_logs)  from public, anon, authenticated;
revoke execute on function private.audit_chain_head()                 from public, anon, authenticated;
