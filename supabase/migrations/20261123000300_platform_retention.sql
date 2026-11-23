-- =============================================================================
-- LoyerCI — D.4 (plateforme Supabase) : tâche quotidienne de rétention des comptes
-- locataires (avis de départ, rappel à M+2, suppression du compte à M+3).
-- 04:15 UTC = 04:15 à Abidjan.
-- =============================================================================
select cron.schedule('loyerci-tenant-retention', '15 4 * * *', $$select * from public.process_tenant_retention()$$);
