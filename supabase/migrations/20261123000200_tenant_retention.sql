-- =============================================================================
-- LoyerCI — D.4 : sortie du parc et suppression du compte locataire (décision du
-- 21/11/2026). Quand un locataire n'a plus AUCUN bail actif chez AUCUN bailleur :
--   J0   : invitation à télécharger ses documents (file d'envoi) ;
--   M+2  : rappel avant suppression ;
--   M+3  : suppression du COMPTE (identifiants, accès). Les documents (avis,
--          quittances, paiements) restent dans les archives du bailleur pendant la
--          durée légale et /verify continue de répondre (données masquées).
-- Un utilisateur qui est aussi membre d'une organisation n'est jamais supprimé ici.
-- =============================================================================

-- Date de fin effective d'un bail (posée automatiquement au passage hors « actif »).
alter table public.leases add column ended_at timestamptz;
update public.leases set ended_at = coalesce(end_date::timestamptz, now()) where status <> 'actif' and ended_at is null;

create function private.lease_ended_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'actif' and new.status <> 'actif' then
    new.ended_at := coalesce(new.ended_at, now());
  elsif new.status = 'actif' then
    new.ended_at := null;
  end if;
  return new;
end $$;
create trigger leases_ended_at before update of status on public.leases
  for each row execute function private.lease_ended_at();

-- La suppression d'un compte locataire ne doit pas être bloquée par ses déclarations
-- passées : le paiement reste rattaché à l'avis (donc au locataire) ; seul le lien vers
-- le compte supprimé disparaît.
alter table public.payments drop constraint payments_declared_by_fkey;
alter table public.payments add constraint payments_declared_by_fkey
  foreign key (declared_by) references auth.users (id) on delete set null;

-- File d'envoi et audit : nouveaux types
alter table private.outbox drop constraint outbox_kind_check;
alter table private.outbox add constraint outbox_kind_check check (kind in (
  'alerte_compte_reception', 'depart_locataire', 'rappel_suppression_compte'));

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
  'compte_locataire_supprime'));

-- -----------------------------------------------------------------------------
-- Statut de rétention d'un compte locataire (pour l'affichage et la tâche planifiée)
-- -----------------------------------------------------------------------------
create function private.tenant_departure(p_user uuid)
returns table (departed_at timestamptz, deletion_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select max(l.ended_at), max(l.ended_at) + interval '3 months'
    from public.tenants t
    join public.leases l on l.tenant_id = t.id
   where t.user_id = p_user
  having count(*) filter (where l.status = 'actif') = 0
     and count(*) > 0
     and not exists (select 1 from public.memberships m where m.user_id = p_user);
$$;

-- Lecture pour le locataire connecté : « votre compte sera supprimé le … ».
create function public.my_account_deletion() returns table (departed_at timestamptz, deletion_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from private.tenant_departure(auth.uid()) where auth.uid() is not null;
$$;

-- -----------------------------------------------------------------------------
-- Tâche quotidienne (pg_cron, migration *_platform*) : avis de départ, rappel,
-- suppression. Idempotente. Renvoie le nombre d'actions effectuées.
-- -----------------------------------------------------------------------------
create function public.process_tenant_retention(p_now timestamptz default now())
returns table (departs integer, rappels integer, suppressions integer)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_dep int := 0; v_rap int := 0; v_sup int := 0;
  v_key text;
begin
  for r in
    select distinct t.user_id as uid, d.departed_at, d.deletion_at,
           (select t2.org_id from public.tenants t2 join public.leases l2 on l2.tenant_id = t2.id
             where t2.user_id = t.user_id order by l2.ended_at desc nulls last limit 1) as org_id,
           (select array_agg(t3.id) from public.tenants t3 where t3.user_id = t.user_id) as tenant_ids
      from public.tenants t
      cross join lateral private.tenant_departure(t.user_id) d
     where t.user_id is not null and d.departed_at is not null and d.departed_at <= p_now
  loop
    v_key := r.uid::text || '|' || to_char(r.departed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');

    if p_now >= r.deletion_at then
      delete from auth.users u where u.id = r.uid;
      perform private.log(r.org_id, null, 'system', 'compte_locataire_supprime', 'user', r.uid::text, null, null,
        jsonb_build_object('locataires', to_jsonb(r.tenant_ids), 'depart', r.departed_at, 'documents_conserves', true));
      v_sup := v_sup + 1;
      continue;
    end if;

    if not exists (select 1 from private.outbox o where o.kind = 'depart_locataire' and o.payload ->> 'cle' = v_key) then
      insert into private.outbox (org_id, kind, payload)
      values (r.org_id, 'depart_locataire',
              jsonb_build_object('cle', v_key, 'user_id', r.uid, 'suppression_le', r.deletion_at));
      v_dep := v_dep + 1;
    end if;

    if p_now >= r.deletion_at - interval '1 month'
       and not exists (select 1 from private.outbox o where o.kind = 'rappel_suppression_compte' and o.payload ->> 'cle' = v_key) then
      insert into private.outbox (org_id, kind, payload)
      values (r.org_id, 'rappel_suppression_compte',
              jsonb_build_object('cle', v_key, 'user_id', r.uid, 'suppression_le', r.deletion_at));
      v_rap := v_rap + 1;
    end if;
  end loop;
  return query select v_dep, v_rap, v_sup;
end $$;

revoke execute on function private.lease_ended_at() from public, anon, authenticated;
revoke execute on function private.tenant_departure(uuid) from public, anon, authenticated;
revoke execute on function public.my_account_deletion() from public, anon;
grant  execute on function public.my_account_deletion() to authenticated;
revoke execute on function public.process_tenant_retention(timestamptz) from public, anon, authenticated;
grant  execute on function public.process_tenant_retention(timestamptz) to service_role;
