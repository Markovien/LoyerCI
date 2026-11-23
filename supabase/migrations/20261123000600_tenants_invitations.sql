-- =============================================================================
-- LoyerCI — P2.2 : fiches locataires et invitation à créer un compte (facultatif).
-- Invitation : jeton aléatoire (32 octets) dont SEULE l'empreinte SHA-256 est stockée,
-- usage unique, 7 jours, révocable. Le rattachement n'a lieu qu'une fois le locataire
-- CONNECTÉ (propriété de l'adresse e-mail prouvée par le lien de connexion).
-- Aucune pièce d'identité n'est stockée (minimisation, loi n° 2013-450).
-- =============================================================================

create table public.tenant_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  tenant_id   uuid not null,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz,
  foreign key (tenant_id, org_id) references public.tenants (id, org_id) on delete cascade
);
create index tenant_invitations_tenant_idx on public.tenant_invitations (tenant_id, created_at desc);
alter table public.tenant_invitations enable row level security;
-- Lecture par les membres (statut affiché sur la fiche) ; jamais par anon ni locataire.
grant select (id, org_id, tenant_id, created_by, created_at, expires_at, consumed_at, revoked_at)
  on public.tenant_invitations to authenticated;
create policy tenant_invitations_select on public.tenant_invitations for select to authenticated
  using (org_id in (select private.user_org_ids()));

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
  'reauthentification',
  'document_envoye',
  'compte_locataire_supprime',
  'bien_cree', 'bien_modifie',
  'locataire_cree', 'locataire_modifie', 'locataire_invite', 'locataire_lie', 'locataire_delie'));

-- -----------------------------------------------------------------------------
-- Fiche locataire
-- -----------------------------------------------------------------------------
create function public.create_tenant(
  p_actor uuid, p_org uuid, p_full_name text, p_phone text, p_email text, p_ip inet, p_ua text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.assert_role(p_actor, p_org, array['owner', 'manager']::public.member_role[]);
  begin
    insert into public.tenants (org_id, full_name, phone, email)
    values (p_org, btrim(p_full_name), p_phone, nullif(lower(btrim(coalesce(p_email, ''))), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Un locataire avec ce numéro existe déjà dans votre organisation' using errcode = 'P0001';
  end;
  perform private.log(p_org, p_actor, 'user', 'locataire_cree', 'tenant', v_id::text, p_ip, p_ua,
                      jsonb_build_object('telephone', '****' || right(p_phone, 4)));
  return v_id;
end $$;

create function public.update_tenant(
  p_actor uuid, p_tenant uuid, p_full_name text, p_phone text, p_email text, p_ip inet, p_ua text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.tenants;
begin
  select * into v_old from public.tenants where id = p_tenant for update;
  if not found then raise exception 'Locataire introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_old.org_id, array['owner', 'manager']::public.member_role[]);
  begin
    update public.tenants set full_name = btrim(p_full_name), phone = p_phone,
                              email = nullif(lower(btrim(coalesce(p_email, ''))), '')
     where id = p_tenant;
  exception when unique_violation then
    raise exception 'Un locataire avec ce numéro existe déjà dans votre organisation' using errcode = 'P0001';
  end;
  perform private.log(v_old.org_id, p_actor, 'user', 'locataire_modifie', 'tenant', p_tenant::text, p_ip, p_ua,
    jsonb_build_object('nom_modifie', v_old.full_name <> btrim(p_full_name),
                       'telephone_modifie', v_old.phone <> p_phone,
                       'email_modifie', coalesce(v_old.email, '') <> coalesce(nullif(lower(btrim(coalesce(p_email, ''))), ''), '')));
end $$;

-- -----------------------------------------------------------------------------
-- Invitation
-- -----------------------------------------------------------------------------
create function public.create_tenant_invitation(p_actor uuid, p_tenant uuid, p_token_hash text, p_ip inet, p_ua text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tenants;
  v_exp timestamptz;
begin
  select * into v_t from public.tenants where id = p_tenant for update;
  if not found then raise exception 'Locataire introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_t.org_id, array['owner', 'manager']::public.member_role[]);
  if v_t.user_id is not null then
    raise exception 'Ce locataire a déjà un compte rattaché' using errcode = 'P0001';
  end if;
  -- Une seule invitation valide à la fois : les précédentes sont révoquées.
  update public.tenant_invitations set revoked_at = now()
   where tenant_id = p_tenant and consumed_at is null and revoked_at is null;
  insert into public.tenant_invitations (org_id, tenant_id, token_hash, created_by)
  values (v_t.org_id, p_tenant, p_token_hash, p_actor)
  returning expires_at into v_exp;
  perform private.log(v_t.org_id, p_actor, 'user', 'locataire_invite', 'tenant', p_tenant::text, p_ip, p_ua,
                      jsonb_build_object('expire_le', v_exp));
  return v_exp;
end $$;

-- Lecture publique (page d'invitation, côté serveur) : uniquement ce qui rassure le
-- locataire, rien qui serve un usurpateur (nom masqué, numéro masqué).
create function public.get_invitation(p_token_hash text)
returns table (status text, landlord_name text, tenant_masked text, phone_hint text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select i.*, t.full_name, t.phone, t.user_id as linked, o.name as org_name into r
    from public.tenant_invitations i
    join public.tenants t on t.id = i.tenant_id
    join public.organizations o on o.id = i.org_id
   where i.token_hash = p_token_hash;
  if not found then
    return query select 'invalide'::text, null::text, null::text, null::text, null::timestamptz; return;
  end if;
  return query select
    case when r.revoked_at is not null then 'revoquee'
         when r.consumed_at is not null or r.linked is not null then 'utilisee'
         when r.expires_at <= now() then 'expiree'
         else 'valide' end,
    r.org_name, private.mask_name(r.full_name), '•••• ' || right(r.phone, 4), r.expires_at;
end $$;

-- Consommation : appelée par le serveur pour l'utilisateur CONNECTÉ (p_user vient de getUser()).
create function public.accept_invitation(p_token_hash text, p_user uuid, p_ip inet, p_ua text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.tenant_invitations;
  v_t   public.tenants;
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into v_inv from public.tenant_invitations where token_hash = p_token_hash for update;
  if not found or v_inv.revoked_at is not null or v_inv.consumed_at is not null or v_inv.expires_at <= now() then
    raise exception 'Invitation invalide, expirée ou déjà utilisée' using errcode = 'P0001';
  end if;
  select * into v_t from public.tenants where id = v_inv.tenant_id for update;
  if v_t.user_id is not null then
    raise exception 'Invitation invalide, expirée ou déjà utilisée' using errcode = 'P0001';
  end if;
  update public.tenants set user_id = p_user where id = v_t.id;
  update public.tenant_invitations set consumed_at = now(), consumed_by = p_user where id = v_inv.id;
  perform private.log(v_t.org_id, p_user, 'user', 'locataire_lie', 'tenant', v_t.id::text, p_ip, p_ua, '{}'::jsonb);
  return v_t.id;
end $$;

-- Révocation par le bailleur (compte rattaché par erreur, téléphone perdu…).
create function public.unlink_tenant_account(p_actor uuid, p_tenant uuid, p_ip inet, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.tenants;
begin
  select * into v_t from public.tenants where id = p_tenant for update;
  if not found then raise exception 'Locataire introuvable' using errcode = 'P0002'; end if;
  perform private.assert_role(p_actor, v_t.org_id, array['owner', 'manager']::public.member_role[]);
  if v_t.user_id is null then return; end if;
  update public.tenants set user_id = null where id = p_tenant;
  perform private.log(v_t.org_id, p_actor, 'user', 'locataire_delie', 'tenant', p_tenant::text, p_ip, p_ua, '{}'::jsonb);
end $$;

revoke execute on function public.create_tenant(uuid, uuid, text, text, text, inet, text) from public, anon, authenticated;
revoke execute on function public.update_tenant(uuid, uuid, text, text, text, inet, text) from public, anon, authenticated;
revoke execute on function public.create_tenant_invitation(uuid, uuid, text, inet, text) from public, anon, authenticated;
revoke execute on function public.get_invitation(text) from public, anon, authenticated;
revoke execute on function public.accept_invitation(text, uuid, inet, text) from public, anon, authenticated;
revoke execute on function public.unlink_tenant_account(uuid, uuid, inet, text) from public, anon, authenticated;
grant execute on function
  public.create_tenant(uuid, uuid, text, text, text, inet, text),
  public.update_tenant(uuid, uuid, text, text, text, inet, text),
  public.create_tenant_invitation(uuid, uuid, text, inet, text),
  public.get_invitation(text),
  public.accept_invitation(text, uuid, inet, text),
  public.unlink_tenant_account(uuid, uuid, inet, text)
to service_role;
