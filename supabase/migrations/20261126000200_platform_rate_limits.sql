-- =============================================================================
-- LoyerCI — P4.1 (plateforme Supabase) : nettoyage horaire des compteurs du limiteur.
-- =============================================================================
select cron.schedule('loyerci-purge-rate-limits', '17 * * * *', $$select public.purge_rate_limits()$$);
