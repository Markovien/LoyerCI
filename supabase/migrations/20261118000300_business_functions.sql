-- =============================================================================
-- LoyerCI — Migration 3/4 : fonctions métier
--
-- Toutes les mutations financières vivent ici, dans des transactions PostgreSQL
-- avec verrous de ligne (SELECT ... FOR UPDATE). Les fonctions « serveur » prennent
-- l'acteur en paramètre (p_actor), identifié par le serveur Next.js via
-- supabase.auth.getUser() (JWT vérifié), et ne sont exécutables QUE par service_role.
-- Elles revérifient néanmoins l'autorisation (défense en profondeur).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------
create function private.today_ci() returns date
language sql stable set search_path = '' as $$
  -- Côte d'Ivoire : UTC+0 toute l'année (Africa/Abidjan)
  select (now() at time zone 'Africa/Abidjan')::date;
$$;

create function private.log(
  p_org uuid, p_actor uuid, p_actor_kind text, p_action text,
  p_entity_type text, p_entity_id text, p_ip inet, p_ua text, p_meta jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (org_id, actor_id, actor_kind, action, entity_type, entity_id, ip, user_agent, metadata, chain_seq, prev_hash, hash)
  values (p_org, p_actor, p_actor_kind, p_action, p_entity_type, p_entity_id, p_ip, left(p_ua, 400), coalesce(p_meta, '{}'::jsonb), 0, '', '');
$$;

create function private.assert_role(p_actor uuid, p_org uuid, p_roles public.member_role[])
returns public.member_role
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.member_role;
begin
  select m.role into v_role from public.memberships m
   where m.org_id = p_org and m.user_id = p_actor and m.role = any (p_roles);
  if v_role is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return v_role;
end $$;

create function private.assert_tenant(p_actor uuid, p_tenant uuid)
returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor is null or not exists (
    select 1 from public.tenants t where t.id = p_tenant and t.user_id = p_actor
  ) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
end $$;

-- Clé de contrôle de la référence de virement (base 36, modulo 97) :
-- détecte toute faute de frappe sur un caractère et toute inversion de deux
-- caractères adjacents. Implémentation miroir : src/lib/payments/reference.ts
create function private.ref_checksum(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  acc int := 0;
  c   text;
  v   int;
begin
  foreach c in array regexp_split_to_array(upper(replace(p, '-', '')), '') loop
    if c ~ '^[0-9]$' then v := ascii(c) - 48;
    elsif c ~ '^[A-Z]$' then v := ascii(c) - 55;
    else raise exception 'Caractère invalide dans la référence : %', c;
    end if;
    acc := (acc * 36 + v) % 97;
  end loop;
  return lpad(acc::text, 2, '0');
end $$;

create function private.make_payment_reference(p_org uuid, p_period date, p_code text)
returns text
language plpgsql stable set search_path = '' as $$
declare
  v_base text := 'LOYER-' || to_char(p_period, 'YYYY-MM') || '-' || p_code;
  v_candidate text := v_base;
  n int := 1;
begin
  while exists (
    select 1 from public.invoices i
     where i.org_id = p_org and i.payment_reference like v_candidate || '-__'
  ) loop
    n := n + 1;
    if n > 9 then raise exception 'Trop de références pour %', v_base; end if;
    v_candidate := v_base || '-' || n;
  end loop;
  return v_candidate || '-' || private.ref_checksum(v_candidate);
end $$;

create function private.mask_name(p text) returns text
language sql immutable set search_path = '' as $$
  -- « Kouassi Jean-Marc » -> « Ko***** J.-M. »
  select string_agg(
           case when t.ord = 1
                then left(t.w, 2) || repeat('*', greatest(char_length(t.w) - 2, 1))
                else (select string_agg(left(x, 1) || '.', '-') from unnest(string_to_array(t.w, '-')) x)
           end, ' ' order by t.ord)
    from unnest(regexp_split_to_array(btrim(p), '\s+')) with ordinality as t(w, ord);
$$;

create function private.mask_iban(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then null else left(p, 4) || ' **** **** ' || right(p, 4) end;
$$;

-- Secret de signature des quittances, stocké chiffré dans Supabase Vault :
--   select vault.create_secret('<64 caractères aléatoires>', 'receipt_signing_key');
create function private.receipt_secret() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  select s.decrypted_secret into v from vault.decrypted_secrets s
   where s.name = 'receipt_signing_key' limit 1;
  if v is null or char_length(v) < 32 then
    raise exception 'Secret receipt_signing_key absent ou trop court (Vault)';
  end if;
  return v;
end $$;

create function private.receipt_payload(
  p_id uuid, p_number text, p_org uuid, p_invoice uuid, p_tenant_name text,
  p_property_label text, p_period date, p_amount bigint, p_paid_at timestamptz
) returns text
language sql stable set search_path = '' as $$
  select concat_ws('|', 'LOYERCI-QUITTANCE-v1', p_id::text, p_number, p_org::text, p_invoice::text,
                   p_tenant_name, p_property_label, to_char(p_period, 'YYYY-MM'), p_amount::text,
                   to_char(p_paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
$$;

-- -----------------------------------------------------------------------------
-- Baux
-- -----------------------------------------------------------------------------
create function public.create_lease(
  p_actor uuid, p_org uuid, p_property uuid, p_tenant uuid, p_usage public.lease_usage,
  p_rent bigint, p_charges bigint, p_deposit_months smallint, p_advance_months smallint,
  p_due_day smallint, p_start date, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.assert_role(p_actor, p_org, array['owner', 'manager']::public.member_role[]);
  insert into public.leases (org_id, property_id, tenant_id, usage, rent_amount, charges_amount,
                             deposit_months, advance_months, due_day, start_date)
  values (p_org, p_property, p_tenant, p_usage, p_rent, p_charges,
          p_deposit_months, p_advance_months, p_due_day, p_start)
  returning id into v_id;

  perform private.log(p_org, p_actor, 'user', 'bail_cree', 'lease', v_id::text, p_ip, p_ua,
    jsonb_build_object('property_id', p_property, 'tenant_id', p_tenant, 'loyer', p_rent,
                       'charges', p_charges, 'caution_mois', p_deposit_months, 'avance_mois', p_advance_months));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Avis d'échéance (planifiés via pg_cron, cf. migration 4)
-- -----------------------------------------------------------------------------
create function public.generate_monthly_invoices(p_period date default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_period date := date_trunc('month', coalesce(p_period, private.today_ci()))::date;
  v_end    date := (v_period + interval '1 month - 1 day')::date;
  r        record;
  v_count  int := 0;
  v_rows   int;
  v_by_org jsonb := '{}'::jsonb;
begin
  for r in
    select l.id, l.org_id, l.tenant_id, l.rent_amount, l.charges_amount, l.due_day, p.code
      from public.leases l
      join public.properties p on p.id = l.property_id
     where l.status = 'actif'
       and l.start_date <= v_end
       and (l.end_date is null or l.end_date >= v_period)
       and not exists (select 1 from public.invoices i where i.lease_id = l.id and i.period = v_period)
     order by l.org_id, p.code
  loop
    insert into public.invoices (org_id, lease_id, tenant_id, period, rent_amount, charges_amount,
                                 due_date, payment_reference)
    values (r.org_id, r.id, r.tenant_id, v_period, r.rent_amount, r.charges_amount,
            v_period + (r.due_day - 1),
            private.make_payment_reference(r.org_id, v_period, r.code))
    on conflict (lease_id, period) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_count := v_count + 1;
      v_by_org := jsonb_set(v_by_org, array[r.org_id::text],
                            to_jsonb(coalesce((v_by_org ->> r.org_id::text)::int, 0) + 1));
    end if;
  end loop;

  for r in select key::uuid as org_id, value::int as n from jsonb_each_text(v_by_org) loop
    perform private.log(r.org_id, null, 'system', 'avis_generes', 'invoice', null, null, null,
                        jsonb_build_object('periode', to_char(v_period, 'YYYY-MM'), 'nombre', r.n));
  end loop;
  return v_count;
end $$;

create function public.mark_overdue_invoices() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.invoices
     set status = 'en_retard'
   where status in ('a_payer', 'partiel')
     and due_date < private.today_ci();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Quittance : émise UNIQUEMENT par apply_payment quand l'avis est soldé
-- -----------------------------------------------------------------------------
create function private.issue_receipt(
  p_invoice uuid, p_actor uuid, p_actor_kind text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v        record;
  v_year   int := extract(year from private.today_ci());
  v_no     int;
  v_id     uuid := gen_random_uuid();
  v_number text;
  v_methods text;
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

  if v.status <> 'paye' then
    raise exception 'Quittance impossible : avis non soldé';
  end if;

  insert into private.receipt_counters as c (org_id, year, last_no) values (v.org_id, v_year, 1)
  on conflict (org_id, year) do update set last_no = c.last_no + 1
  returning c.last_no into v_no;
  v_number := v.receipt_prefix || '-' || v_year || '-' || lpad(v_no::text, 6, '0');

  select string_agg(distinct pm.method::text, '+' order by pm.method::text) into v_methods
    from public.payments pm where pm.invoice_id = p_invoice and pm.status = 'reussi';

  v_payload := private.receipt_payload(v_id, v_number, v.org_id, v.id, v.tenant_name,
                                       v.property_label, v.period, v.amount_due, v.paid_at);

  insert into public.receipts (id, org_id, invoice_id, tenant_id, receipt_number, landlord_name,
    tenant_name, property_label, property_location, period, rent_amount, charges_amount, amount,
    payment_methods, paid_at, content_hash, signature)
  values (v_id, v.org_id, v.id, v.tenant_id, v_number, v.landlord_name, v.tenant_name,
    v.property_label, v.property_location, v.period, v.rent_amount, v.charges_amount, v.amount_due,
    coalesce(v_methods, 'inconnu'), v.paid_at,
    encode(extensions.digest(v_payload, 'sha256'), 'hex'),
    encode(extensions.hmac(v_payload, private.receipt_secret(), 'sha256'), 'hex'));

  perform private.log(v.org_id, p_actor, p_actor_kind, 'quittance_generee', 'receipt', v_id::text,
                      p_ip, p_ua, jsonb_build_object('numero', v_number, 'montant', v.amount_due));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Imputation d'un encaissement sur un avis (cœur financier, verrouillé)
-- -----------------------------------------------------------------------------
create function private.apply_payment(
  p_invoice uuid, p_amount bigint, p_actor uuid, p_actor_kind text, p_ip inet, p_ua text
) returns public.invoice_status
language plpgsql security definer set search_path = '' as $$
declare
  v_inv    public.invoices;
  v_total  bigint;
  v_credit bigint;
  v_status public.invoice_status;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if v_inv.status = 'annule' then
    raise exception 'Avis annulé : encaissement refusé';
  end if;

  v_total  := v_inv.amount_paid + p_amount;
  v_credit := greatest(v_total - v_inv.amount_due, 0);
  v_total  := least(v_total, v_inv.amount_due);
  v_status := case
                when v_total >= v_inv.amount_due then 'paye'
                when v_inv.due_date < private.today_ci() then 'en_retard'
                else 'partiel'
              end;

  update public.invoices
     set amount_paid   = v_total,
         credit_amount = credit_amount + v_credit,
         status        = v_status,
         paid_at       = case when v_status = 'paye' then coalesce(paid_at, now()) else null end
   where id = p_invoice;

  if v_credit > 0 then
    perform private.log(v_inv.org_id, p_actor, p_actor_kind, 'paiement_anomalie', 'invoice',
                        p_invoice::text, p_ip, p_ua,
                        jsonb_build_object('type', 'trop_percu', 'credit', v_credit));
  end if;

  if v_status = 'paye' and not exists (select 1 from public.receipts r where r.invoice_id = p_invoice) then
    perform private.issue_receipt(p_invoice, p_actor, p_actor_kind, p_ip, p_ua);
  end if;
  return v_status;
end $$;

-- -----------------------------------------------------------------------------
-- Mobile Money : création d'intention (montant calculé côté serveur, JAMAIS côté client)
-- -----------------------------------------------------------------------------
create function public.create_payment_intent(
  p_actor uuid, p_invoice uuid, p_provider public.payment_provider,
  p_operator public.mobile_operator, p_tx_id text, p_ip inet, p_ua text
) returns table (payment_id uuid, transaction_id text, amount bigint, reused boolean, checkout_url text)
language plpgsql security definer set search_path = '' as $$
declare
  v_inv       public.invoices;
  v_remaining bigint;
  v_existing  public.payments;
  v_id        uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_tenant(p_actor, v_inv.tenant_id);

  if v_inv.status in ('paye', 'annule') then
    raise exception 'Cet avis n''est plus payable' using errcode = 'P0001';
  end if;
  v_remaining := v_inv.amount_due - v_inv.amount_paid;

  -- Anti double-paiement : on réutilise une intention récente identique (15 min).
  select * into v_existing from public.payments pm
   where pm.invoice_id = p_invoice and pm.status = 'initie' and pm.method = 'mobile_money'
     and pm.operator = p_operator and pm.amount = v_remaining
     and pm.created_at > now() - interval '15 minutes'
   order by pm.created_at desc limit 1;
  if found then
    return query select v_existing.id, v_existing.provider_transaction_id, v_existing.amount, true,
                        v_existing.checkout_url;
    return;
  end if;

  insert into public.payments (org_id, invoice_id, method, provider, operator, amount,
                               status, provider_transaction_id, declared_by)
  values (v_inv.org_id, p_invoice, 'mobile_money', p_provider, p_operator, v_remaining,
          'initie', p_tx_id, p_actor)
  returning id into v_id;

  perform private.log(v_inv.org_id, p_actor, 'user', 'paiement_initie', 'payment', v_id::text,
                      p_ip, p_ua, jsonb_build_object('operateur', p_operator, 'montant', v_remaining));
  return query select v_id, p_tx_id, v_remaining, false, null::text;
end $$;

-- Mémorise l'URL de paiement renvoyée par l'agrégateur (réutilisée en cas de double clic).
create function public.set_checkout_url(p_payment uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.payments set checkout_url = p_url
   where id = p_payment and status = 'initie' and checkout_url is null;
  if not found then raise exception 'Paiement introuvable ou déjà engagé' using errcode = 'P0002'; end if;
end $$;

-- Appelée par le webhook APRÈS vérification de signature ET revérification
-- serveur-à-serveur auprès du fournisseur. Idempotente.
create function public.confirm_provider_payment(
  p_provider public.payment_provider, p_tx_id text, p_amount bigint, p_currency text,
  p_operator public.mobile_operator, p_ip inet, p_meta jsonb default '{}'::jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments;
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
    return 'deja_traite'; -- IDEMPOTENCE : un même paiement n'est jamais imputé deux fois
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

  update public.payments
     set status = 'reussi', validated_at = now(), failure_reason = null,
         operator = coalesce(p_operator, operator)
   where id = v_pay.id;

  perform private.log(v_pay.org_id, null, 'provider', 'paiement_confirme', 'payment', v_pay.id::text,
                      p_ip, null, jsonb_build_object('montant', p_amount, 'fournisseur', p_provider) || p_meta);
  perform private.apply_payment(v_pay.invoice_id, v_pay.amount, null, 'provider', p_ip, null);
  return 'confirme';
end $$;

create function public.fail_provider_payment(
  p_provider public.payment_provider, p_tx_id text, p_reason text, p_ip inet
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments;
begin
  select * into v_pay from public.payments
   where provider = p_provider and provider_transaction_id = p_tx_id for update;
  if not found then return 'inconnu'; end if;
  if v_pay.status <> 'initie' then return 'deja_traite'; end if;

  update public.payments set status = 'echoue', failure_reason = left(p_reason, 300) where id = v_pay.id;
  perform private.log(v_pay.org_id, null, 'provider', 'paiement_echoue', 'payment', v_pay.id::text,
                      p_ip, null, jsonb_build_object('motif', left(p_reason, 300)));
  return 'echoue';
end $$;

-- -----------------------------------------------------------------------------
-- Virement bancaire : dépôt de preuve par le locataire, validation par le bailleur
-- -----------------------------------------------------------------------------
create function public.submit_transfer_proof(
  p_actor uuid, p_invoice uuid, p_amount bigint, p_bank_reference text,
  p_proof_path text, p_tx_id text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_id  uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_tenant(p_actor, v_inv.tenant_id);

  if v_inv.status in ('paye', 'annule') then
    raise exception 'Cet avis n''est plus payable' using errcode = 'P0001';
  end if;
  if p_amount < 1 or p_amount > v_inv.amount_due - v_inv.amount_paid then
    raise exception 'Montant déclaré invalide' using errcode = '22023';
  end if;
  if p_proof_path not like v_inv.org_id::text || '/' || v_inv.id::text || '/%' then
    raise exception 'Chemin de preuve invalide' using errcode = '22023';
  end if;
  if (select count(*) from public.payments pm
       where pm.invoice_id = p_invoice and pm.status = 'en_attente_validation') >= 3 then
    raise exception 'Trop de preuves en attente pour cet avis' using errcode = 'P0001';
  end if;

  insert into public.payments (org_id, invoice_id, method, provider, amount, status,
                               provider_transaction_id, bank_reference, proof_path, declared_by)
  values (v_inv.org_id, p_invoice, 'virement', 'manuel', p_amount, 'en_attente_validation',
          p_tx_id, p_bank_reference, p_proof_path, p_actor)
  returning id into v_id;

  perform private.log(v_inv.org_id, p_actor, 'user', 'preuve_virement_soumise', 'payment', v_id::text,
                      p_ip, p_ua, jsonb_build_object('montant', p_amount, 'reference', v_inv.payment_reference));
  return v_id;
end $$;

create function public.review_transfer(
  p_actor uuid, p_payment uuid, p_approve boolean, p_reason text, p_ip inet, p_ua text
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then raise exception 'Paiement introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_pay.org_id, array['owner', 'accountant']::public.member_role[]);

  if v_pay.method <> 'virement' then
    raise exception 'Seuls les virements se valident manuellement' using errcode = '22023';
  end if;
  if v_pay.status <> 'en_attente_validation' then
    return 'deja_traite';
  end if;
  if v_pay.declared_by = p_actor then
    raise exception 'Séparation des tâches : on ne valide pas sa propre déclaration' using errcode = '42501';
  end if;

  if p_approve then
    update public.payments set status = 'reussi', validated_by = p_actor, validated_at = now()
     where id = p_payment;
    perform private.log(v_pay.org_id, p_actor, 'user', 'virement_valide', 'payment', p_payment::text,
                        p_ip, p_ua, jsonb_build_object('montant', v_pay.amount));
    perform private.apply_payment(v_pay.invoice_id, v_pay.amount, p_actor, 'user', p_ip, p_ua);
    return 'valide';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'Motif de rejet obligatoire' using errcode = '22023';
  end if;
  update public.payments set status = 'rejete', validated_by = p_actor, failure_reason = left(p_reason, 300)
   where id = p_payment;
  perform private.log(v_pay.org_id, p_actor, 'user', 'virement_rejete', 'payment', p_payment::text,
                      p_ip, p_ua, jsonb_build_object('motif', left(p_reason, 300)));
  return 'rejete';
end $$;

create function public.log_proof_access(p_actor uuid, p_payment uuid, p_ip inet, p_ua text)
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
                      p_ip, p_ua, '{}'::jsonb);
  return v_pay.proof_path;
end $$;

-- Espèces : réalité du terrain, encaissement saisi par le bailleur.
create function public.record_cash_payment(
  p_actor uuid, p_invoice uuid, p_amount bigint, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_id  uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Avis introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_inv.org_id, array['owner', 'accountant']::public.member_role[]);
  if p_amount < 1 or p_amount > v_inv.amount_due - v_inv.amount_paid then
    raise exception 'Montant invalide' using errcode = '22023';
  end if;

  insert into public.payments (org_id, invoice_id, method, provider, amount, status,
                               provider_transaction_id, declared_by, validated_by, validated_at)
  values (v_inv.org_id, p_invoice, 'especes', 'manuel', p_amount, 'reussi',
          'ESP-' || gen_random_uuid(), p_actor, p_actor, now())
  returning id into v_id;

  perform private.log(v_inv.org_id, p_actor, 'user', 'paiement_confirme', 'payment', v_id::text,
                      p_ip, p_ua, jsonb_build_object('methode', 'especes', 'montant', p_amount));
  perform private.apply_payment(p_invoice, p_amount, p_actor, 'user', p_ip, p_ua);
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Coordonnées de reversement (RIB / Mobile Money)
-- -----------------------------------------------------------------------------
create function public.add_payout_account(
  p_actor uuid, p_org uuid, p_kind public.payout_kind, p_holder text, p_bank text,
  p_iban text, p_operator public.mobile_operator, p_msisdn text, p_ip inet, p_ua text
) returns table (id uuid, activates_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_activates timestamptz;
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);

  -- Première configuration : immédiate. Changement ultérieur : délai de carence de 48 h,
  -- pendant lequel l'ancien compte reste actif et le propriétaire est alerté (e-mail + SMS).
  v_activates := case when exists (
                   select 1 from public.payout_accounts pa
                    where pa.org_id = p_org and pa.kind = p_kind and pa.revoked_at is null)
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

create function public.cancel_payout_account(p_actor uuid, p_account uuid, p_ip inet, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select pa.org_id into v_org from public.payout_accounts pa where pa.id = p_account and pa.revoked_at is null;
  if v_org is null then raise exception 'Compte introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_org, array['owner']::public.member_role[]);
  update public.payout_accounts set revoked_at = now() where id = p_account;
  perform private.log(v_org, p_actor, 'user', 'rib_annule', 'payout_account', p_account::text, p_ip, p_ua, '{}'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- Lecture contrôlée pour le locataire : RIB du bailleur pour SON avis uniquement
-- -----------------------------------------------------------------------------
create function public.get_transfer_instructions(p_invoice uuid)
returns table (account_holder text, bank_name text, iban text, payment_reference text,
               amount_remaining bigint, due_date date)
language plpgsql stable security definer set search_path = '' as $$
declare v_inv public.invoices;
begin
  select * into v_inv from public.invoices i
   where i.id = p_invoice and i.tenant_id in (select private.user_tenant_ids());
  if not found then raise exception 'Accès refusé' using errcode = '42501'; end if;

  return query
    select pa.account_holder, pa.bank_name, pa.iban, v_inv.payment_reference,
           v_inv.amount_due - v_inv.amount_paid, v_inv.due_date
      from public.payout_accounts pa
     where pa.org_id = v_inv.org_id and pa.kind = 'banque'
       and pa.revoked_at is null and pa.activates_at <= now()
     order by pa.activates_at desc
     limit 1;
end $$;

-- -----------------------------------------------------------------------------
-- KPIs du tableau de bord (SECURITY INVOKER : la RLS s'applique)
-- -----------------------------------------------------------------------------
create function public.dashboard_kpis(p_org uuid, p_month date)
returns table (collected bigint, expected bigint, pending bigint, overdue_count bigint,
               overdue_amount bigint, properties_total bigint, properties_occupied bigint,
               transfers_pending bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare v_month date := date_trunc('month', p_month)::date;
begin
  if p_org not in (select private.user_org_ids()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query select
    (select coalesce(sum(pm.amount), 0)::bigint from public.payments pm
      where pm.org_id = p_org and pm.status = 'reussi'
        and pm.validated_at >= v_month and pm.validated_at < v_month + interval '1 month'),
    (select coalesce(sum(i.amount_due), 0)::bigint from public.invoices i
      where i.org_id = p_org and i.period = v_month and i.status <> 'annule'),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0)::bigint from public.invoices i
      where i.org_id = p_org and i.period = v_month and i.status in ('a_payer', 'partiel')),
    (select count(*) from public.invoices i where i.org_id = p_org and i.status = 'en_retard'),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0)::bigint from public.invoices i
      where i.org_id = p_org and i.status = 'en_retard'),
    (select count(*) from public.properties p where p.org_id = p_org),
    (select count(distinct l.property_id) from public.leases l where l.org_id = p_org and l.status = 'actif'),
    (select count(*) from public.payments pm where pm.org_id = p_org and pm.status = 'en_attente_validation');
end $$;

-- -----------------------------------------------------------------------------
-- Vérification publique d'une quittance (page /verify/[id], sans connexion)
-- Ne renvoie que des données masquées. Réponse identique si l'identifiant
-- n'existe pas ou si le code de contrôle est faux (pas d'oracle d'énumération).
-- -----------------------------------------------------------------------------
create function public.verify_receipt(p_id uuid, p_code text)
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

  -- Recalcul de la signature : détecte toute altération directe de la ligne en base.
  v_payload := private.receipt_payload(r.id, r.receipt_number, r.org_id, r.invoice_id, r.tenant_name,
                                       r.property_label, r.period, r.amount, r.paid_at);
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

-- Vérification d'intégrité de la chaîne d'audit (à lancer périodiquement)
create function private.verify_audit_chain()
returns table (broken_at_seq bigint, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  a record;
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
    if a.hash <> encode(extensions.digest(concat_ws('|',
        a.prev_hash, a.chain_seq::text, coalesce(a.org_id::text, '-'), coalesce(a.actor_id::text, '-'),
        a.actor_kind, a.action, a.entity_type, coalesce(a.entity_id, '-'), coalesce(host(a.ip), '-'),
        a.metadata::text, to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ), 'sha256'), 'hex') then
      return query select a.chain_seq, 'contenu altéré'; return;
    end if;
    v_prev := a.hash;
    v_expected_seq := v_expected_seq + 1;
  end loop;
end $$;

-- =============================================================================
-- PRIVILÈGES D'EXÉCUTION (liste blanche stricte)
-- =============================================================================
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Helpers RLS (réaccordés après la révocation globale ci-dessus)
grant execute on function private.user_org_ids(public.member_role[]) to authenticated;
grant execute on function private.user_tenant_ids()     to authenticated;
grant execute on function private.tenant_org_ids()      to authenticated;
grant execute on function private.tenant_property_ids() to authenticated;

-- Lecture pour utilisateurs connectés
grant execute on function public.get_transfer_instructions(uuid) to authenticated;
grant execute on function public.dashboard_kpis(uuid, date)     to authenticated;

-- Public (sans connexion) : vérification de quittance uniquement
grant execute on function public.verify_receipt(uuid, text) to anon, authenticated;

-- Serveur uniquement (clé service_role, jamais exposée au navigateur)
grant execute on function
  public.create_lease(uuid, uuid, uuid, uuid, public.lease_usage, bigint, bigint, smallint, smallint, smallint, date, inet, text),
  public.generate_monthly_invoices(date),
  public.mark_overdue_invoices(),
  public.create_payment_intent(uuid, uuid, public.payment_provider, public.mobile_operator, text, inet, text),
  public.set_checkout_url(uuid, text),
  public.confirm_provider_payment(public.payment_provider, text, bigint, text, public.mobile_operator, inet, jsonb),
  public.fail_provider_payment(public.payment_provider, text, text, inet),
  public.submit_transfer_proof(uuid, uuid, bigint, text, text, text, inet, text),
  public.review_transfer(uuid, uuid, boolean, text, inet, text),
  public.log_proof_access(uuid, uuid, inet, text),
  public.record_cash_payment(uuid, uuid, bigint, inet, text),
  public.add_payout_account(uuid, uuid, public.payout_kind, text, text, text, public.mobile_operator, text, inet, text),
  public.cancel_payout_account(uuid, uuid, inet, text)
to service_role;
