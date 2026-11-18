-- =============================================================================
-- LoyerCI — Migration 2/4 : Row Level Security et privilèges
--
-- Modèle « Zero Trust » en deux couches :
--   1. LECTURES : le navigateur/serveur lit avec le JWT de l'utilisateur ; la RLS
--      filtre chaque ligne (bailleur = son organisation ; locataire = ses lignes).
--   2. ÉCRITURES : AUCUNE écriture directe autorisée pour anon/authenticated.
--      Toute mutation passe par une fonction métier (migration 3) exécutable
--      uniquement par le serveur (service_role), qui revérifie l'autorisation de
--      l'acteur, journalise l'IP et applique les invariants financiers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS)
-- -----------------------------------------------------------------------------
create function private.user_org_ids(p_roles public.member_role[] default null)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.org_id from public.memberships m
   where m.user_id = auth.uid()
     and (p_roles is null or m.role = any (p_roles));
$$;

create function private.user_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.tenants t where t.user_id = auth.uid() and auth.uid() is not null;
$$;

create function private.tenant_org_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.org_id from public.tenants t where t.user_id = auth.uid() and auth.uid() is not null;
$$;

create function private.tenant_property_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select l.property_id from public.leases l
    join public.tenants t on t.id = l.tenant_id
   where t.user_id = auth.uid() and auth.uid() is not null;
$$;

grant usage on schema private to authenticated;
grant execute on function private.user_org_ids(public.member_role[]) to authenticated;
grant execute on function private.user_tenant_ids()     to authenticated;
grant execute on function private.tenant_org_ids()      to authenticated;
grant execute on function private.tenant_property_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- Activation RLS sur TOUTES les tables (y compris celles sans politique = refus total)
-- -----------------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.memberships     enable row level security;
alter table public.properties      enable row level security;
alter table public.tenants         enable row level security;
alter table public.leases          enable row level security;
alter table public.invoices        enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.payments        enable row level security;
alter table public.webhook_events  enable row level security;
alter table public.receipts        enable row level security;
alter table public.audit_logs      enable row level security;

-- Note : on n'utilise PAS « FORCE ROW LEVEL SECURITY » : les fonctions métier
-- SECURITY DEFINER (propriétaire = postgres) doivent pouvoir écrire. Le verrou est
-- ailleurs : anon/authenticated n'ont aucun privilège d'écriture (ci-dessous).

-- -----------------------------------------------------------------------------
-- Privilèges de table : lecture seule pour authenticated, rien pour anon
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on
  public.organizations, public.profiles, public.memberships, public.properties,
  public.tenants, public.leases, public.invoices, public.payout_accounts,
  public.payments, public.receipts, public.audit_logs
to authenticated;
-- webhook_events : aucun accès client (service_role uniquement).

-- Personne, même service_role, ne peut modifier/supprimer le journal d'audit.
revoke update, delete, truncate on public.audit_logs from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Politiques SELECT
-- -----------------------------------------------------------------------------
create policy org_select on public.organizations for select to authenticated
  using (id in (select private.user_org_ids()) or id in (select private.tenant_org_ids()));

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select m.user_id from public.memberships m
               where m.org_id in (select private.user_org_ids()))
  );

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or org_id in (select private.user_org_ids()));

create policy properties_select on public.properties for select to authenticated
  using (org_id in (select private.user_org_ids()) or id in (select private.tenant_property_ids()));

create policy tenants_select on public.tenants for select to authenticated
  using (org_id in (select private.user_org_ids()) or user_id = (select auth.uid()));

create policy leases_select on public.leases for select to authenticated
  using (org_id in (select private.user_org_ids()) or tenant_id in (select private.user_tenant_ids()));

create policy invoices_select on public.invoices for select to authenticated
  using (org_id in (select private.user_org_ids()) or tenant_id in (select private.user_tenant_ids()));

create policy payments_select on public.payments for select to authenticated
  using (
    org_id in (select private.user_org_ids())
    or invoice_id in (select i.id from public.invoices i
                       where i.tenant_id in (select private.user_tenant_ids()))
  );

create policy receipts_select on public.receipts for select to authenticated
  using (org_id in (select private.user_org_ids()) or tenant_id in (select private.user_tenant_ids()));

-- RIB : propriétaire et comptable uniquement. Les gestionnaires ne voient pas les IBAN,
-- les locataires y accèdent seulement via get_transfer_instructions() pour LEUR avis.
create policy payout_select on public.payout_accounts for select to authenticated
  using (org_id in (select private.user_org_ids(array['owner', 'accountant']::public.member_role[])));

-- Journal d'audit : propriétaire uniquement.
create policy audit_select on public.audit_logs for select to authenticated
  using (org_id in (select private.user_org_ids(array['owner']::public.member_role[])));

-- Aucune politique INSERT/UPDATE/DELETE n'est créée : toute écriture client est refusée.
