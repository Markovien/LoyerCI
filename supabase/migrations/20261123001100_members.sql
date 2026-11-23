-- =============================================================================
-- LoyerCI — P2.5 : membres et rôles de l'organisation (propriétaire uniquement).
-- Invariant : il reste TOUJOURS au moins un propriétaire. Les lignes « owner » sont
-- verrouillées (FOR UPDATE) pour que deux rétrogradations simultanées ne puissent pas
-- laisser l'organisation sans propriétaire.
-- =============================================================================

-- Recherche d'un compte par e-mail : serveur uniquement (jamais exposée au client,
-- elle révélerait l'existence d'un compte).
create function public.find_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;

create function private.lock_owners(p_org uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform 1 from public.memberships m where m.org_id = p_org and m.role = 'owner' for update;
  select count(*) into n from public.memberships m where m.org_id = p_org and m.role = 'owner';
  return n;
end $$;

create function public.add_member(
  p_actor uuid, p_org uuid, p_user uuid, p_full_name text, p_role public.member_role, p_ip inet, p_ua text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Compte introuvable' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = p_user) then
    raise exception 'Cette personne est déjà membre de l''organisation' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, full_name) values (p_user, btrim(p_full_name)) on conflict (id) do nothing;
  insert into public.memberships (org_id, user_id, role) values (p_org, p_user, p_role);
  perform private.log(p_org, p_actor, 'user', 'membre_ajoute', 'membership', p_user::text, p_ip, p_ua,
                      jsonb_build_object('role', p_role));
end $$;

create function public.change_member_role(
  p_actor uuid, p_org uuid, p_user uuid, p_role public.member_role, p_ip inet, p_ua text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.member_role;
  v_owners int;
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  v_owners := private.lock_owners(p_org);
  select m.role into v_old from public.memberships m where m.org_id = p_org and m.user_id = p_user for update;
  if v_old is null then raise exception 'Membre introuvable' using errcode = 'P0002'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'owner' and v_owners <= 1 then
    raise exception 'Il doit rester au moins un propriétaire : nommez-en un autre d''abord' using errcode = 'P0001';
  end if;
  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
  perform private.log(p_org, p_actor, 'user', 'membre_role_modifie', 'membership', p_user::text, p_ip, p_ua,
                      jsonb_build_object('avant', v_old, 'apres', p_role));
end $$;

create function public.remove_member(p_actor uuid, p_org uuid, p_user uuid, p_ip inet, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.member_role;
  v_owners int;
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  v_owners := private.lock_owners(p_org);
  select m.role into v_old from public.memberships m where m.org_id = p_org and m.user_id = p_user for update;
  if v_old is null then raise exception 'Membre introuvable' using errcode = 'P0002'; end if;
  if v_old = 'owner' and v_owners <= 1 then
    raise exception 'Il doit rester au moins un propriétaire : nommez-en un autre d''abord' using errcode = 'P0001';
  end if;
  delete from public.memberships where org_id = p_org and user_id = p_user;
  perform private.log(p_org, p_actor, 'user', 'membre_retire', 'membership', p_user::text, p_ip, p_ua,
                      jsonb_build_object('role', v_old));
end $$;

revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
revoke execute on function private.lock_owners(uuid) from public, anon, authenticated;
revoke execute on function public.add_member(uuid, uuid, uuid, text, public.member_role, inet, text) from public, anon, authenticated;
revoke execute on function public.change_member_role(uuid, uuid, uuid, public.member_role, inet, text) from public, anon, authenticated;
revoke execute on function public.remove_member(uuid, uuid, uuid, inet, text) from public, anon, authenticated;
grant execute on function
  public.find_user_id_by_email(text),
  public.add_member(uuid, uuid, uuid, text, public.member_role, inet, text),
  public.change_member_role(uuid, uuid, uuid, public.member_role, inet, text),
  public.remove_member(uuid, uuid, uuid, inet, text)
to service_role;
