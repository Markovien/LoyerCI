-- =============================================================================
-- LoyerCI — Migration 1/4 : schéma de données
-- Cible : Supabase (PostgreSQL 15+). Devise unique : XOF (Franc CFA, sans décimales).
-- Principe : toutes les sommes sont des BIGINT en FCFA entiers. Jamais de float.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Schéma non exposé par l'API PostgREST : fonctions internes, compteurs, secrets.
create schema if not exists private;
revoke all on schema private from public;

-- Par défaut, PostgreSQL accorde EXECUTE à PUBLIC sur toute nouvelle fonction,
-- et Supabase accorde des droits larges à anon/authenticated sur le schéma public.
-- On inverse la logique : rien n'est accessible tant que ce n'est pas accordé explicitement.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- Contrôle ISO 13616 (modulo 97) d'un IBAN, utilisé en contrainte de table.
create function private.iban_ok(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  s text := substr(p, 5) || substr(p, 1, 4);
  r int := 0;
  c text;
  d text;
begin
  foreach c in array regexp_split_to_array(s, '') loop
    d := case when c ~ '^[A-Z]$' then (ascii(c) - 55)::text else c end;
    for i in 1 .. char_length(d) loop
      r := (r * 10 + substr(d, i, 1)::int) % 97;
    end loop;
  end loop;
  return r = 1;
end $$;

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.member_role     as enum ('owner', 'manager', 'accountant');
create type public.property_type   as enum ('appartement', 'villa', 'studio', 'magasin', 'bureau', 'entrepot');
create type public.lease_usage     as enum ('habitation', 'professionnel');
create type public.lease_status    as enum ('actif', 'termine', 'resilie');
create type public.invoice_status  as enum ('a_payer', 'partiel', 'en_retard', 'paye', 'annule');
create type public.payment_method  as enum ('mobile_money', 'virement', 'especes');
create type public.payment_provider as enum ('cinetpay', 'wave', 'pispi', 'manuel');
create type public.mobile_operator as enum ('orange', 'mtn', 'moov', 'wave');
create type public.payment_status  as enum ('initie', 'en_attente_validation', 'reussi', 'echoue', 'rejete');
create type public.payout_kind     as enum ('banque', 'mobile_money');
create type public.receipt_status  as enum ('valide', 'annulee');

-- -----------------------------------------------------------------------------
-- Organisations (un propriétaire individuel = une organisation d'un seul membre)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 120),
  kind          text not null default 'proprietaire' check (kind in ('proprietaire', 'agence')),
  receipt_prefix text not null default 'Q' check (receipt_prefix ~ '^[A-Z0-9]{1,6}$'),
  contact_phone text check (contact_phone ~ '^225(01|05|07|21|25|27)[0-9]{8}$'),
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 2 and 120),
  phone      text check (phone ~ '^225(01|05|07|21|25|27)[0-9]{8}$'),
  created_at timestamptz not null default now()
);

-- RBAC interne à l'organisation
--   owner      : tout, y compris RIB, validation des virements, journal d'audit
--   manager    : biens, locataires, baux, avis d'échéance (pas de RIB)
--   accountant : lecture + validation des virements + RIB en lecture
create table public.memberships (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- -----------------------------------------------------------------------------
-- Biens immobiliers
-- -----------------------------------------------------------------------------
create table public.properties (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete restrict,
  code            text not null check (code ~ '^[A-Z0-9]{2,10}$'),          -- ex : VCR01, APT12
  label           text not null check (char_length(label) between 2 and 120), -- ex : Villa Duplex 5 pièces
  type            public.property_type not null,
  city            text not null default 'Abidjan' check (char_length(city) between 2 and 60),
  commune         text not null check (char_length(commune) between 2 and 60),  -- ex : Cocody
  quartier        text check (char_length(quartier) <= 80),                       -- ex : Riviera 3
  address_details text check (char_length(address_details) <= 200),
  created_at      timestamptz not null default now(),
  unique (org_id, code),
  unique (id, org_id) -- cible des clés étrangères composites (anti-mélange entre organisations)
);

-- -----------------------------------------------------------------------------
-- Locataires (fiche gérée par le bailleur ; user_id lie un compte de connexion)
-- Minimisation des données : pas de numéro de CNI/passeport stocké ici.
-- -----------------------------------------------------------------------------
create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete restrict,
  user_id    uuid references auth.users (id) on delete set null,
  full_name  text not null check (char_length(full_name) between 2 and 120),
  phone      text not null check (phone ~ '^225(01|05|07|21|25|27)[0-9]{8}$'),
  email      text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  unique (org_id, phone),
  unique (id, org_id)
);
create index tenants_user_idx on public.tenants (user_id) where user_id is not null;

-- -----------------------------------------------------------------------------
-- Baux
-- Loi n° 2019-576 (Code de la construction et de l'habitat) : pour un bail à usage
-- d'habitation, au plus 2 mois de caution et 2 mois d'avance.
-- -----------------------------------------------------------------------------
create table public.leases (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete restrict,
  property_id    uuid not null,
  tenant_id      uuid not null,
  usage          public.lease_usage not null default 'habitation',
  rent_amount    bigint not null check (rent_amount between 1000 and 100000000),
  charges_amount bigint not null default 0 check (charges_amount between 0 and 10000000),
  deposit_months smallint not null default 2 check (deposit_months between 0 and 12),
  advance_months smallint not null default 2 check (advance_months between 0 and 12),
  due_day        smallint not null default 5 check (due_day between 1 and 28),
  start_date     date not null,
  end_date       date,
  status         public.lease_status not null default 'actif',
  created_at     timestamptz not null default now(),
  check (end_date is null or end_date > start_date),
  constraint leases_plafond_legal_habitation
    check (usage = 'professionnel' or (deposit_months <= 2 and advance_months <= 2)),
  foreign key (property_id, org_id) references public.properties (id, org_id),
  foreign key (tenant_id, org_id)   references public.tenants (id, org_id),
  unique (id, org_id)
);
create unique index leases_one_active_per_property on public.leases (property_id) where status = 'actif';
create index leases_tenant_idx on public.leases (tenant_id);

-- -----------------------------------------------------------------------------
-- Avis d'échéance (une ligne par bail et par mois)
-- -----------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete restrict,
  lease_id          uuid not null,
  tenant_id         uuid not null, -- dénormalisé pour des politiques RLS simples et rapides
  period            date not null check (extract(day from period) = 1),
  rent_amount       bigint not null check (rent_amount > 0),
  charges_amount    bigint not null default 0 check (charges_amount >= 0),
  amount_due        bigint generated always as (rent_amount + charges_amount) stored,
  amount_paid       bigint not null default 0 check (amount_paid >= 0),
  credit_amount     bigint not null default 0 check (credit_amount >= 0), -- trop-perçu à imputer
  due_date          date not null,
  status            public.invoice_status not null default 'a_payer',
  payment_reference text not null check (payment_reference ~ '^LOYER-[0-9]{4}-[0-9]{2}-[A-Z0-9]{2,10}(-[0-9])?-[0-9]{2}$'),
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  check (amount_paid <= rent_amount + charges_amount),
  check ((status = 'paye') = (paid_at is not null)),
  unique (lease_id, period),
  unique (org_id, payment_reference),
  unique (id, org_id),
  foreign key (lease_id, org_id)  references public.leases (id, org_id),
  foreign key (tenant_id, org_id) references public.tenants (id, org_id)
);
create index invoices_org_period_idx on public.invoices (org_id, period);
create index invoices_tenant_idx on public.invoices (tenant_id);
create index invoices_open_due_idx on public.invoices (due_date) where status in ('a_payer', 'partiel');

-- -----------------------------------------------------------------------------
-- Coordonnées de reversement (RIB / Mobile Money) — données à très haut risque
-- Jamais modifiées : chaque changement crée une ligne, effective après un délai
-- de carence (48 h) pour contrer la prise de contrôle de compte.
-- -----------------------------------------------------------------------------
create table public.payout_accounts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete restrict,
  kind           public.payout_kind not null,
  account_holder text not null check (char_length(account_holder) between 2 and 120),
  bank_name      text check (char_length(bank_name) between 2 and 80),
  iban           text check (iban ~ '^CI[0-9]{2}[A-Z0-9]{24}$' and private.iban_ok(iban)),
  operator       public.mobile_operator,
  msisdn         text check (msisdn ~ '^225(01|05|07)[0-9]{8}$'),
  activates_at   timestamptz not null default now() + interval '48 hours',
  revoked_at     timestamptz,
  created_by     uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  check (
    (kind = 'banque' and iban is not null and bank_name is not null and msisdn is null)
    or (kind = 'mobile_money' and msisdn is not null and operator is not null and iban is null)
  )
);
create index payout_accounts_org_idx on public.payout_accounts (org_id, kind, activates_at desc);

-- -----------------------------------------------------------------------------
-- Paiements (tentatives et encaissements)
-- -----------------------------------------------------------------------------
create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations (id) on delete restrict,
  invoice_id              uuid not null,
  method                  public.payment_method not null,
  provider                public.payment_provider not null,
  operator                public.mobile_operator,
  amount                  bigint not null check (amount > 0),
  currency                char(3) not null default 'XOF' check (currency = 'XOF'),
  status                  public.payment_status not null default 'initie',
  provider_transaction_id text not null check (char_length(provider_transaction_id) between 8 and 80),
  bank_reference          text check (char_length(bank_reference) <= 80),
  checkout_url            text check (checkout_url ~ '^https://[a-z0-9.-]+/'),
  proof_path              text check (proof_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'),
  declared_by             uuid references auth.users (id),
  validated_by            uuid references auth.users (id),
  validated_at            timestamptz,
  failure_reason          text check (char_length(failure_reason) <= 300),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- IDEMPOTENCE : une transaction fournisseur ne peut exister qu'une fois.
  unique (provider, provider_transaction_id),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id),
  check (method <> 'virement' or proof_path is not null),
  check ((status = 'reussi') = (validated_at is not null))
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_org_status_idx on public.payments (org_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- Journal brut des webhooks (dédoublonnage des réémissions + preuve)
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id              bigint generated always as identity primary key,
  provider        public.payment_provider not null,
  event_key       text not null,       -- SHA-256 du corps brut
  transaction_id  text,
  signature_valid boolean not null,
  payload         jsonb not null,
  outcome         text,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  unique (provider, event_key)
);

-- -----------------------------------------------------------------------------
-- Quittances : instantané figé, signé, jamais modifiable (seule l'annulation est permise)
-- -----------------------------------------------------------------------------
create table public.receipts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete restrict,
  invoice_id        uuid not null unique,
  tenant_id         uuid not null,
  receipt_number    text not null,
  landlord_name     text not null,
  tenant_name       text not null,
  property_label    text not null,
  property_location text not null,
  period            date not null,
  rent_amount       bigint not null,
  charges_amount    bigint not null,
  amount            bigint not null,
  payment_methods   text not null,
  paid_at           timestamptz not null,
  content_hash      text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  signature         text not null check (signature ~ '^[0-9a-f]{64}$'),
  status            public.receipt_status not null default 'valide',
  revoked_reason    text,
  revoked_at        timestamptz,
  issued_at         timestamptz not null default now(),
  unique (org_id, receipt_number),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id)
);
create index receipts_tenant_idx on public.receipts (tenant_id);

create table private.receipt_counters (
  org_id  uuid not null,
  year    int  not null,
  last_no int  not null default 0,
  primary key (org_id, year)
);

-- -----------------------------------------------------------------------------
-- Journal d'audit : append-only + chaînage cryptographique (tamper-evident)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  chain_seq   bigint not null unique,
  org_id      uuid references public.organizations (id) on delete restrict,
  actor_id    uuid,          -- pas de FK : le journal survit à la suppression d'un compte
  actor_kind  text not null check (actor_kind in ('user', 'system', 'provider')),
  action      text not null check (action in (
                'bail_cree', 'bail_resilie',
                'avis_generes',
                'paiement_initie', 'paiement_confirme', 'paiement_echoue', 'paiement_anomalie',
                'preuve_virement_soumise', 'virement_valide', 'virement_rejete',
                'rib_ajoute', 'rib_annule',
                'quittance_generee', 'quittance_annulee',
                'acces_preuve_virement')),
  entity_type text not null,
  entity_id   text,
  ip          inet,
  user_agent  text check (char_length(user_agent) <= 400),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default clock_timestamp(),
  prev_hash   text not null,
  hash        text not null
);
create index audit_logs_org_idx on public.audit_logs (org_id, created_at desc);

-- Chaînage : hash(n) = SHA-256(hash(n-1) | contenu(n)). Toute suppression ou
-- modification a posteriori (même par un superutilisateur) casse la chaîne.
create function private.audit_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prev_hash text;
  v_prev_seq  bigint;
begin
  -- Sérialise les insertions pour garantir un ordre de chaîne strict.
  perform pg_advisory_xact_lock(hashtext('loyerci.audit_logs.chain'));
  select a.hash, a.chain_seq into v_prev_hash, v_prev_seq
    from public.audit_logs a order by a.chain_seq desc limit 1;

  new.chain_seq  := coalesce(v_prev_seq, 0) + 1;
  new.prev_hash  := coalesce(v_prev_hash, repeat('0', 64));
  new.created_at := clock_timestamp();
  new.hash := encode(extensions.digest(concat_ws('|',
      new.prev_hash, new.chain_seq::text, coalesce(new.org_id::text, '-'),
      coalesce(new.actor_id::text, '-'), new.actor_kind, new.action, new.entity_type,
      coalesce(new.entity_id, '-'), coalesce(host(new.ip), '-'), new.metadata::text,
      to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ), 'sha256'), 'hex');
  return new;
end $$;

create trigger audit_logs_chain before insert on public.audit_logs
  for each row execute function private.audit_chain();

create function private.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Table % en ajout seul : % interdit', tg_table_name, tg_op
    using errcode = '42501';
end $$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function private.forbid_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.forbid_mutation();

-- Quittances : seule transition autorisée = valide -> annulee (avec motif).
create function private.receipts_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une quittance ne peut pas être supprimée' using errcode = '42501';
  end if;
  if old.status = 'valide' and new.status = 'annulee' and new.revoked_reason is not null
     and (to_jsonb(new) - array['status', 'revoked_reason', 'revoked_at'])
       = (to_jsonb(old) - array['status', 'revoked_reason', 'revoked_at']) then
    new.revoked_at := now();
    return new;
  end if;
  raise exception 'Une quittance émise est immuable' using errcode = '42501';
end $$;

create trigger receipts_immutable before update or delete on public.receipts
  for each row execute function private.receipts_guard();

-- Coordonnées de reversement : seule la révocation est permise.
create function private.payout_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Coordonnées de reversement : suppression interdite' using errcode = '42501';
  end if;
  if old.revoked_at is null and new.revoked_at is not null
     and (to_jsonb(new) - 'revoked_at') = (to_jsonb(old) - 'revoked_at') then
    return new;
  end if;
  raise exception 'Coordonnées de reversement : modification interdite, créer une nouvelle entrée'
    using errcode = '42501';
end $$;

create trigger payout_accounts_guard before update or delete on public.payout_accounts
  for each row execute function private.payout_guard();

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger payments_touch before update on public.payments
  for each row execute function private.touch_updated_at();
