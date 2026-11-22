-- =============================================================================
-- LoyerCI — D.1 : avis d'échéance signés et vérifiables.
-- Un avis est un INSTANTANÉ figé (comme une quittance) : ce qui a été imprimé et
-- envoyé au locataire est signé, et toute altération est détectée par /verify.
-- Émis à la première demande du PDF (pas de dépendance de la génération mensuelle
-- à la clé de signature). Aucune coordonnée de paiement (invariant n° 9).
-- =============================================================================

create table public.notices (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete restrict,
  invoice_id        uuid not null unique,
  tenant_id         uuid not null,
  landlord_name     text not null,
  tenant_name       text not null,
  property_label    text not null,
  property_location text not null,
  period            date not null,
  rent_amount       bigint not null,
  charges_amount    bigint not null,
  amount_due        bigint not null,
  due_date          date not null,
  payment_reference text not null,
  issued_at         timestamptz not null,
  content_hash      text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  signature         text not null check (signature ~ '^[0-9a-f]{64}$'),
  signature_version smallint not null default 1 check (signature_version in (1)),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id)
);
create index notices_tenant_idx on public.notices (tenant_id);

-- Immuable : un avis émis n'est jamais modifié ni supprimé. L'annulation éventuelle
-- se lit sur l'avis d'échéance (invoices.status = 'annule').
create trigger notices_immutable before update or delete on public.notices
  for each row execute function private.forbid_mutation();
create trigger notices_no_truncate before truncate on public.notices
  for each statement execute function private.forbid_mutation();

alter table public.notices enable row level security;
grant select on public.notices to authenticated;
create policy notices_select on public.notices for select to authenticated
  using (org_id in (select private.user_org_ids()) or tenant_id in (select private.user_tenant_ids()));

-- Journal d'audit : nouvelle action
alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'bail_cree', 'bail_resilie',
  'avis_generes', 'avis_emis',
  'paiement_initie', 'paiement_confirme', 'paiement_echoue', 'paiement_anomalie',
  'preuve_virement_soumise', 'virement_valide', 'virement_rejete',
  'rib_ajoute', 'rib_annule',
  'quittance_generee', 'quittance_annulee',
  'acces_preuve_virement',
  'paiement_direct_declare', 'paiement_direct_confirme', 'paiement_direct_rejete',
  'especes_a_confirmer', 'especes_confirme', 'especes_rejete',
  'parametres_paiement_modifies', 'affiche_guichet_generee',
  'reauthentification'));

-- Charge utile canonique (JSON, ordre de clés déterministe) couvrant TOUS les champs
-- imprimés. Préfixe distinct des quittances : une signature d'avis ne peut jamais
-- passer pour une signature de quittance (et inversement).
create function private.notice_payload_v1(n public.notices) returns text
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'v', 'LOYERCI-AVIS-v1',
    'id', n.id, 'org', n.org_id, 'avis', n.invoice_id, 'locataire_id', n.tenant_id,
    'bailleur', n.landlord_name, 'locataire', n.tenant_name,
    'bien', n.property_label, 'adresse', n.property_location,
    'periode', to_char(n.period, 'YYYY-MM'),
    'loyer', n.rent_amount, 'charges', n.charges_amount, 'montant', n.amount_due,
    'echeance', to_char(n.due_date, 'YYYY-MM-DD'), 'reference', n.payment_reference,
    'emis_le', to_char(n.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
$$;

-- -----------------------------------------------------------------------------
-- Émission (idempotente) : locataire de l'avis ou membre de l'organisation.
-- -----------------------------------------------------------------------------
create function public.issue_notice(p_actor uuid, p_invoice uuid, p_ip inet, p_ua text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v       record;
  n       public.notices;
  v_id    uuid;
  v_payload text;
begin
  select i.id, i.org_id, i.tenant_id, i.period, i.rent_amount, i.charges_amount, i.amount_due, i.due_date,
         i.payment_reference, t.full_name as tenant_name, t.user_id as tenant_user, p.label as property_label,
         concat_ws(', ', nullif(p.quartier, ''), p.commune, p.city) as property_location, o.name as landlord_name
    into v
    from public.invoices i
    join public.leases l        on l.id = i.lease_id
    join public.tenants t       on t.id = i.tenant_id
    join public.properties p    on p.id = l.property_id
    join public.organizations o on o.id = i.org_id
   where i.id = p_invoice;
  if v.id is null then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;

  if p_actor is null or not (
       v.tenant_user = p_actor
       or exists (select 1 from public.memberships m where m.org_id = v.org_id and m.user_id = p_actor)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select x.id into v_id from public.notices x where x.invoice_id = p_invoice;
  if v_id is not null then return v_id; end if;

  -- Sérialise deux premières demandes simultanées pour le même avis.
  perform pg_advisory_xact_lock(hashtext('loyerci.notice.' || p_invoice::text));
  select x.id into v_id from public.notices x where x.invoice_id = p_invoice;
  if v_id is not null then return v_id; end if;

  n.id := gen_random_uuid();
  n.org_id := v.org_id; n.invoice_id := v.id; n.tenant_id := v.tenant_id;
  n.landlord_name := v.landlord_name; n.tenant_name := v.tenant_name;
  n.property_label := v.property_label; n.property_location := v.property_location;
  n.period := v.period; n.rent_amount := v.rent_amount; n.charges_amount := v.charges_amount;
  n.amount_due := v.amount_due; n.due_date := v.due_date; n.payment_reference := v.payment_reference;
  n.issued_at := now();
  v_payload := private.notice_payload_v1(n);

  insert into public.notices (id, org_id, invoice_id, tenant_id, landlord_name, tenant_name, property_label,
    property_location, period, rent_amount, charges_amount, amount_due, due_date, payment_reference, issued_at,
    content_hash, signature, signature_version)
  values (n.id, n.org_id, n.invoice_id, n.tenant_id, n.landlord_name, n.tenant_name, n.property_label,
    n.property_location, n.period, n.rent_amount, n.charges_amount, n.amount_due, n.due_date, n.payment_reference,
    n.issued_at, encode(extensions.digest(v_payload, 'sha256'), 'hex'),
    encode(extensions.hmac(v_payload, private.receipt_secret(), 'sha256'), 'hex'), 1);

  perform private.log(v.org_id, p_actor, 'user', 'avis_emis', 'notice', n.id::text, p_ip, p_ua,
                      jsonb_build_object('reference', v.payment_reference, 'montant', v.amount_due));
  return n.id;
end $$;

-- -----------------------------------------------------------------------------
-- Vérification publique (serveur uniquement, derrière le limiteur de /verify)
-- Même réponse pour « inconnu » et « code faux » ; nom du locataire masqué en base.
-- -----------------------------------------------------------------------------
create function public.verify_notice(p_id uuid, p_code text)
returns table (verdict text, payment_reference text, landlord_name text, tenant_masked text,
               property_location text, period date, amount_due bigint, due_date date,
               issued_at timestamptz, fingerprint text)
language plpgsql stable security definer set search_path = '' as $$
declare
  n public.notices;
  v_code text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  v_payload text;
  v_cancelled boolean;
begin
  select * into n from public.notices where id = p_id;
  if not found or char_length(v_code) < 16 or left(n.signature, char_length(v_code)) <> v_code then
    return query select 'invalide'::text, null::text, null::text, null::text, null::text,
                        null::date, null::bigint, null::date, null::timestamptz, null::text;
    return;
  end if;
  v_payload := private.notice_payload_v1(n);
  if encode(extensions.hmac(v_payload, private.receipt_secret(), 'sha256'), 'hex') <> n.signature
     or encode(extensions.digest(v_payload, 'sha256'), 'hex') <> n.content_hash then
    return query select 'alteree'::text, n.payment_reference, null::text, null::text, null::text,
                        null::date, null::bigint, null::date, null::timestamptz, null::text;
    return;
  end if;
  select i.status = 'annule' into v_cancelled from public.invoices i where i.id = n.invoice_id;
  return query select case when v_cancelled then 'annulee' else 'authentique' end,
    n.payment_reference, n.landlord_name, private.mask_name(n.tenant_name), n.property_location,
    n.period, n.amount_due, n.due_date, n.issued_at, upper(left(n.content_hash, 16));
end $$;

revoke execute on function private.notice_payload_v1(public.notices) from public, anon, authenticated;
revoke execute on function public.issue_notice(uuid, uuid, inet, text) from public, anon, authenticated;
revoke execute on function public.verify_notice(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_notice(uuid, uuid, inet, text) to service_role;
grant execute on function public.verify_notice(uuid, text) to service_role;
