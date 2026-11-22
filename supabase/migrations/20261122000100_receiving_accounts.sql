-- =============================================================================
-- LoyerCI — P1.6 : coordonnées de réception des fonds (RIB, Mobile Money, alias
-- PI-SPI, liens marchands) protégées par une RÉ-AUTHENTIFICATION vérifiée EN BASE.
--
-- Menace : prise de contrôle de la session d'un propriétaire (cookie volé, appareil
-- partagé) pour ajouter le numéro d'un escroc. La carence de 48 h ne protège que si
-- le propriétaire est alerté ; la ré-authentification empêche l'ajout lui-même.
--   1. le serveur vérifie un code à usage unique (Supabase Auth, e-mail) ;
--   2. il appelle grant_reauth : autorisation à usage unique, valable 5 minutes ;
--   3. add_receiving_account (et l'ancienne add_payout_account) la CONSOMME, sinon refus.
-- Les alertes partent dans une file d'envoi (expédition : phase D / P3.2) et
-- s'affichent en bandeau sur le tableau de bord pendant toute la carence.
-- =============================================================================

create table private.reauth_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  consumed_at timestamptz
);
create index reauth_grants_user_idx on private.reauth_grants (user_id, granted_at desc);

-- File d'envoi des notifications (alertes de sécurité d'abord). Aucun accès client.
create table private.outbox (
  id         bigint generated always as identity primary key,
  org_id     uuid references public.organizations (id) on delete cascade,
  kind       text not null check (kind in ('alerte_compte_reception')),
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- Journal d'audit : nouvelle action
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
  'parametres_paiement_modifies', 'affiche_guichet_generee',
  'reauthentification'));

-- -----------------------------------------------------------------------------
-- Ré-authentification
-- -----------------------------------------------------------------------------
-- Appelée par le serveur UNIQUEMENT après vérification réussie d'un code à usage
-- unique pour CET utilisateur. Une autorisation non consommée est remplacée.
create function public.grant_reauth(p_actor uuid, p_ip inet, p_ua text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is null or not exists (select 1 from auth.users u where u.id = p_actor) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update private.reauth_grants set consumed_at = now() where user_id = p_actor and consumed_at is null;
  insert into private.reauth_grants (user_id) values (p_actor);
  perform private.log(null, p_actor, 'user', 'reauthentification', 'user', p_actor::text, p_ip, p_ua, '{}'::jsonb);
end $$;

create function private.consume_reauth(p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select g.id into v_id from private.reauth_grants g
   where g.user_id = p_actor and g.consumed_at is null and g.granted_at > now() - interval '5 minutes'
   order by g.granted_at desc limit 1
   for update;
  if v_id is null then
    raise exception 'Ré-authentification requise (code de moins de 5 minutes)' using errcode = '42501';
  end if;
  update private.reauth_grants set consumed_at = now() where id = v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Ajout d'une coordonnée de réception (tous types)
-- -----------------------------------------------------------------------------
create function public.add_receiving_account(
  p_actor uuid, p_org uuid, p_kind public.payout_kind, p_holder text, p_display_name text,
  p_bank text, p_iban text, p_operator public.mobile_operator, p_msisdn text,
  p_pispi_alias text, p_link_url text, p_ip inet, p_ua text
) returns table (id uuid, activates_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_id        uuid;
  v_activates timestamptz;
  v_iban      text := nullif(upper(replace(coalesce(p_iban, ''), ' ', '')), '');
  v_alias     text := nullif(btrim(coalesce(p_pispi_alias, '')), '');
  v_masked    text;
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  perform private.consume_reauth(p_actor);

  -- Sérialise les ajouts concurrents d'une même organisation (deux « premiers » comptes).
  perform pg_advisory_xact_lock(hashtext('loyerci.payout.' || p_org::text));

  -- Immédiat pour la toute première coordonnée de l'organisation, 48 h sinon (S1).
  v_activates := case when exists (select 1 from public.payout_accounts pa where pa.org_id = p_org)
                 then now() + interval '48 hours' else now() end;

  insert into public.payout_accounts (org_id, kind, account_holder, display_name_expected, bank_name, iban,
                                      operator, msisdn, pispi_alias, payment_link_url, activates_at, created_by)
  values (p_org, p_kind, btrim(p_holder), nullif(btrim(coalesce(p_display_name, '')), ''),
          case when p_kind = 'banque' then nullif(btrim(coalesce(p_bank, '')), '') end,
          case when p_kind = 'banque' then v_iban end,
          case when p_kind in ('mobile_money', 'payment_link') then p_operator end,
          case when p_kind = 'mobile_money' then p_msisdn end,
          case when p_kind = 'pispi_alias' then v_alias end,
          case when p_kind = 'payment_link' then nullif(btrim(coalesce(p_link_url, '')), '') end,
          v_activates, p_actor)
  returning payout_accounts.id into v_id;

  v_masked := case p_kind
    when 'banque' then private.mask_iban(v_iban)
    when 'mobile_money' then '****' || right(p_msisdn, 4)
    when 'pispi_alias' then case when v_alias like '+225%' then '****' || right(v_alias, 4) else left(v_alias, 8) || '…' end
    else lower(substring(p_link_url from '^https://([^/?#]+)')) end;

  perform private.log(p_org, p_actor, 'user', 'rib_ajoute', 'payout_account', v_id::text, p_ip, p_ua,
    jsonb_build_object('type', p_kind, 'operateur', p_operator, 'coordonnee', v_masked, 'effectif_le', v_activates,
                       'reauthentifie', true));

  -- Alerte à tous les propriétaires de l'organisation (expédition : phase D / P3.2).
  insert into private.outbox (org_id, kind, payload)
  values (p_org, 'alerte_compte_reception',
          jsonb_build_object('payout_account_id', v_id, 'type', p_kind, 'operateur', p_operator,
                             'coordonnee', v_masked, 'effectif_le', v_activates, 'ajoute_par', p_actor));
  return query select v_id, v_activates;
end $$;

-- L'ancienne fonction (RIB / Mobile Money) passe par la nouvelle : même exigence de
-- ré-authentification, mêmes alertes. Aucune voie d'ajout ne la contourne.
create or replace function public.add_payout_account(
  p_actor uuid, p_org uuid, p_kind public.payout_kind, p_holder text, p_bank text,
  p_iban text, p_operator public.mobile_operator, p_msisdn text, p_ip inet, p_ua text
) returns table (id uuid, activates_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query select * from public.add_receiving_account(p_actor, p_org, p_kind, p_holder, null, p_bank, p_iban,
                                                          p_operator, p_msisdn, null, null, p_ip, p_ua);
end $$;

-- -----------------------------------------------------------------------------
-- Privilèges
-- -----------------------------------------------------------------------------
revoke execute on function public.grant_reauth(uuid, inet, text) from public, anon, authenticated;
revoke execute on function public.add_receiving_account(uuid, uuid, public.payout_kind, text, text, text, text,
  public.mobile_operator, text, text, text, inet, text) from public, anon, authenticated;
revoke execute on function private.consume_reauth(uuid) from public, anon, authenticated;
grant execute on function public.grant_reauth(uuid, inet, text) to service_role;
grant execute on function public.add_receiving_account(uuid, uuid, public.payout_kind, text, text, text, text,
  public.mobile_operator, text, text, text, inet, text) to service_role;
