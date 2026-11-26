-- =============================================================================
-- LoyerCI — P4.5 : état de santé de la plateforme (lu chaque jour par la route
-- /api/cron/health et écrit dans les journaux structurés). Aucune donnée personnelle :
-- uniquement des compteurs et l'intégrité de la chaîne d'audit (jusqu'ici vérifiée par
-- pg_cron sans que personne ne lise le résultat).
-- =============================================================================
create function public.system_health()
returns table (audit_ok boolean, audit_broken_at bigint, audit_rows bigint,
               outbox_pending bigint, outbox_oldest_minutes integer, outbox_failed_24h bigint,
               storage_pending bigint, payments_waiting_48h bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_broken bigint;
begin
  select v.broken_at_seq into v_broken from private.verify_audit_chain() v limit 1;
  return query select
    v_broken is null,
    v_broken,
    (select count(*) from public.audit_logs),
    (select count(*) from private.outbox o where o.sent_at is null and o.failed_at is null),
    (select coalesce(extract(epoch from now() - min(o.created_at))::integer / 60, 0)
       from private.outbox o where o.sent_at is null and o.failed_at is null),
    (select count(*) from private.outbox o where o.failed_at > now() - interval '24 hours'),
    (select count(*) from private.storage_deletions s where s.done_at is null),
    (select count(*) from public.payments p where p.status = 'en_attente_validation' and p.created_at < now() - interval '48 hours');
end $$;

revoke execute on function public.system_health() from public, anon, authenticated;
grant execute on function public.system_health() to service_role;
