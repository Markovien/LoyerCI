-- =============================================================================
-- LoyerCI — P1.1 (2/2) : schéma du paiement direct vers les comptes du bailleur
-- (docs/ETUDE-PAIEMENT-DIRECT.md §5.1). La plateforme ne détient jamais les fonds.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Liens de paiement marchands : hôtes autorisés (liste blanche, gérée par l'équipe
-- LoyerCI via service_role). VIDE à dessein : aucun domaine n'est figé à l'aveugle ;
-- tant qu'un hôte n'est pas validé (pilote), aucun lien marchand n'est accepté.
-- -----------------------------------------------------------------------------
create table public.allowed_payment_link_hosts (
  host       text primary key check (host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  operator   public.mobile_operator not null,
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
alter table public.allowed_payment_link_hosts enable row level security;
grant select on public.allowed_payment_link_hosts to authenticated;
create policy allowed_hosts_select on public.allowed_payment_link_hosts for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Coordonnées de réception : alias PI-SPI et liens marchands
-- -----------------------------------------------------------------------------
alter table public.payout_accounts
  add column pispi_alias text
    check (pispi_alias ~ '^\+225(01|05|07)[0-9]{8}$'
        or pispi_alias ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  add column payment_link_url text
    check (char_length(payment_link_url) <= 300 and payment_link_url ~ '^https://[a-z0-9.-]+(/[A-Za-z0-9._~%/?=&+-]*)?$'),
  -- Nom que l'application de l'opérateur affiche avant validation (« Vérifiez que le nom affiché est … »).
  add column display_name_expected text check (char_length(display_name_expected) between 2 and 120);

alter table public.payout_accounts drop constraint payout_accounts_check;
alter table public.payout_accounts add constraint payout_accounts_kind_fields check (
  (kind = 'banque' and iban is not null and bank_name is not null
     and msisdn is null and pispi_alias is null and payment_link_url is null)
  or (kind = 'mobile_money' and msisdn is not null and operator is not null
     and iban is null and pispi_alias is null and payment_link_url is null)
  or (kind = 'pispi_alias' and pispi_alias is not null
     and iban is null and msisdn is null and payment_link_url is null)
  or (kind = 'payment_link' and payment_link_url is not null and operator is not null
     and iban is null and msisdn is null and pispi_alias is null)
);

-- Lien marchand : l'hôte doit figurer dans la liste blanche (un CHECK ne peut pas lire une table).
create function private.payout_link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_host text;
begin
  if new.kind = 'payment_link' then
    v_host := lower(substring(new.payment_link_url from '^https://([^/?#]+)'));
    if not exists (select 1 from public.allowed_payment_link_hosts h
                    where h.host = v_host and h.operator = new.operator) then
      raise exception 'Lien de paiement refusé : domaine % non autorisé pour cet opérateur', v_host
        using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger payout_accounts_link_guard before insert on public.payout_accounts
  for each row execute function private.payout_link_guard();

-- -----------------------------------------------------------------------------
-- Paiements directs : référence opérateur unique, numéro payeur
-- -----------------------------------------------------------------------------
alter table public.payments
  add column operator_txn_ref text check (operator_txn_ref ~ '^[A-Za-z0-9._-]{4,60}$'),
  add column payer_msisdn text check (payer_msisdn ~ '^225(01|05|07)[0-9]{8}$'),
  add constraint payments_direct_fields check (
    provider <> 'direct' or (method = 'mobile_money' and operator is not null and operator_txn_ref is not null)
  );
-- IDEMPOTENCE / ANTI-RÉUTILISATION : une transaction opérateur ne sert qu'une fois,
-- quel que soit le locataire, l'avis ou le mois (y compris après rejet : une
-- référence rejetée ne peut pas être resoumise telle quelle).
create unique index payments_direct_txn_ref_uniq
  on public.payments (operator, upper(operator_txn_ref)) where provider = 'direct';

-- -----------------------------------------------------------------------------
-- Formats des n° de transaction par opérateur (configurables)
-- -----------------------------------------------------------------------------
create table public.operator_ref_formats (
  operator   public.mobile_operator primary key,
  pattern    text not null check (char_length(pattern) between 3 and 200),
  example    text check (char_length(example) <= 60),
  updated_at timestamptz not null default now()
);
alter table public.operator_ref_formats enable row level security;
grant select on public.operator_ref_formats to authenticated;
create policy ref_formats_select on public.operator_ref_formats for select to authenticated using (true);
-- TODO(pilote) : resserrer avec les formats relevés sur de vrais reçus anonymisés
-- (ROADMAP P1.5, question ouverte n° 2). Valeurs volontairement permissives.
insert into public.operator_ref_formats (operator, pattern, example) values
  ('orange', '^[A-Za-z0-9._-]{6,40}$', null),
  ('mtn',    '^[A-Za-z0-9._-]{6,40}$', null),
  ('moov',   '^[A-Za-z0-9._-]{6,40}$', null),
  ('wave',   '^[A-Za-z0-9._-]{6,40}$', null);

-- -----------------------------------------------------------------------------
-- Paramètres de paiement par organisation
-- -----------------------------------------------------------------------------
create table public.org_payment_settings (
  org_id            uuid primary key references public.organizations (id) on delete cascade,
  direct_enabled    boolean not null default true,
  cinetpay_enabled  boolean not null default false,  -- décision produit du 18/11/2026
  transfer_enabled  boolean not null default true,
  fees_notice       text check (char_length(fees_notice) <= 600),
  -- Décision D2 : au-delà, un encaissement en espèces déclaré par un comptable
  -- attend la confirmation d'un propriétaire avant toute quittance.
  cash_validation_threshold bigint not null default 100000 check (cash_validation_threshold between 0 and 100000000),
  updated_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now()
);
alter table public.org_payment_settings enable row level security;
grant select on public.org_payment_settings to authenticated;
create policy payment_settings_select on public.org_payment_settings for select to authenticated
  using (org_id in (select private.user_org_ids()) or org_id in (select private.tenant_org_ids()));

insert into public.org_payment_settings (org_id) select id from public.organizations on conflict do nothing;

create function private.org_payment_settings_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.org_payment_settings (org_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger organizations_payment_settings after insert on public.organizations
  for each row execute function private.org_payment_settings_default();

create trigger org_payment_settings_touch before update on public.org_payment_settings
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Journal d'audit : nouvelles actions
-- -----------------------------------------------------------------------------
alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'bail_cree', 'bail_resilie',
  'avis_generes',
  'paiement_initie', 'paiement_confirme', 'paiement_echoue', 'paiement_anomalie',
  'preuve_virement_soumise', 'virement_valide', 'virement_rejete',
  'rib_ajoute', 'rib_annule',
  'quittance_generee', 'quittance_annulee',
  'acces_preuve_virement',
  'paiement_direct_declare', 'paiement_direct_confirme', 'paiement_direct_rejete',
  'especes_a_confirmer', 'especes_confirme', 'especes_rejete',
  'parametres_paiement_modifies', 'affiche_guichet_generee'));

revoke execute on function private.payout_link_guard()             from public, anon, authenticated;
revoke execute on function private.org_payment_settings_default() from public, anon, authenticated;
