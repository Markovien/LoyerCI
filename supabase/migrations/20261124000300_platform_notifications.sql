-- =============================================================================
-- LoyerCI — P3.2 (plateforme Supabase) : rappel quotidien des déclarations de paiement
-- en attente depuis plus de 48 h (07:20, heure d'Abidjan = UTC). L'expédition des
-- e-mails est déclenchée par l'ordonnanceur de l'hébergeur (route /api/cron/notifications).
-- =============================================================================
select cron.schedule('loyerci-stale-declarations', '20 7 * * *', $$select public.enqueue_stale_declarations()$$);
