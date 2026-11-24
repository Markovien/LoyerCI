-- =============================================================================
-- LoyerCI — P3.3 (plateforme Supabase) : rappels automatiques par e-mail, chaque jour à
-- 08:10 (heure d'Abidjan = UTC), pour les organisations qui les ont activés.
-- =============================================================================
select cron.schedule('loyerci-reminder-emails', '10 8 * * *', $$select public.enqueue_reminder_emails()$$);
