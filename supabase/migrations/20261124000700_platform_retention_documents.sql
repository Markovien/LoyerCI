-- =============================================================================
-- LoyerCI — P3.4 (plateforme Supabase) : purge des documents de plus de 2 ans (03:30)
-- et alerte 30 jours avant (07:40), heure d'Abidjan = UTC. Les fichiers mis en file sont
-- retirés du stockage par la route /api/cron/retention (API Storage).
-- =============================================================================
select cron.schedule('loyerci-purge-documents', '30 3 * * *', $$select public.purge_expired_documents()$$);
select cron.schedule('loyerci-purge-alerts', '40 7 * * *', $$select public.enqueue_purge_alerts()$$);
