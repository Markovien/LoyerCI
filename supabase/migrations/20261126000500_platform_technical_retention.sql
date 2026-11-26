-- =============================================================================
-- LoyerCI — P4.3 (plateforme Supabase) : purge quotidienne des données techniques (03:50).
-- =============================================================================
select cron.schedule('loyerci-purge-technical', '50 3 * * *', $$select public.purge_technical_data()$$);
