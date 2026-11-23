-- =============================================================================
-- LoyerCI — P2.6 : journal d'audit consultable par le propriétaire.
-- Lecture des lignes : RLS existante (audit_select, propriétaires uniquement).
-- Intégrité et traçage de l'export : fonctions SERVEUR uniquement (service_role),
-- rôle revérifié en base. Aucune nouvelle fonction exécutable par authenticated.
-- =============================================================================

-- Intégrité de la chaîne (globale : la chaîne SHA-256 couvre toutes les organisations).
-- On ne renvoie qu'un verdict, pas le détail des maillons d'autres organisations.
create function public.audit_integrity(p_actor uuid, p_org uuid)
returns table (ok boolean, checked_at timestamptz, org_rows bigint, head_seq bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_broken bigint;
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  select v.broken_at_seq into v_broken from private.verify_audit_chain() v limit 1;
  return query select
    v_broken is null,
    clock_timestamp(),
    (select count(*) from public.audit_logs a where a.org_id = p_org),
    (select h.chain_seq from private.audit_chain_head() h);
end $$;

-- Export CSV : tracé AVANT la remise du fichier (qui, quand, quels filtres, combien).
create function public.log_audit_export(
  p_actor uuid, p_org uuid, p_filters jsonb, p_rows integer, p_ip inet, p_ua text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_role(p_actor, p_org, array['owner']::public.member_role[]);
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' or octet_length(p_filters::text) > 1000 then
    raise exception 'Filtres invalides' using errcode = '22023';
  end if;
  perform private.log(p_org, p_actor, 'user', 'audit_exporte', 'audit_logs', null, p_ip, p_ua,
                      jsonb_build_object('filtres', p_filters, 'lignes', greatest(coalesce(p_rows, 0), 0)));
end $$;

-- (Index de filtrage déjà présent : audit_logs_org_idx (org_id, created_at desc).)

revoke execute on function public.audit_integrity(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.log_audit_export(uuid, uuid, jsonb, integer, inet, text) from public, anon, authenticated;
grant execute on function
  public.audit_integrity(uuid, uuid),
  public.log_audit_export(uuid, uuid, jsonb, integer, inet, text)
to service_role;
