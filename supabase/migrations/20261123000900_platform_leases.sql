-- =============================================================================
-- LoyerCI — P2.3 (plateforme Supabase) : clôture quotidienne des baux arrivés à
-- leur date de fin (avant la tâche de rétention des comptes locataires, 04:15).
-- =============================================================================
select cron.schedule('loyerci-close-ended-leases', '5 4 * * *', $$select public.close_ended_leases()$$);
