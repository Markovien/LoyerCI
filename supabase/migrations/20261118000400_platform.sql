-- =============================================================================
-- LoyerCI — Migration 4/4 : intégrations plateforme Supabase
-- (Storage, Realtime, planification pg_cron). Spécifique à Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Storage : preuves de virement dans un bucket PRIVÉ
-- Aucune politique storage.objects n'est créée pour anon/authenticated :
-- dépôt et lecture passent exclusivement par le serveur (service_role),
-- la lecture se fait via une URL signée valable 60 secondes, après contrôle de rôle
-- et journalisation (public.log_proof_access).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('transfer-proofs', 'transfer-proofs', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Realtime : le tableau de bord se met à jour à chaque paiement.
-- Les événements postgres_changes respectent la RLS (SELECT) de l'abonné.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.invoices, public.payments;

-- -----------------------------------------------------------------------------
-- Planification : avis d'échéance le 1er du mois, retards chaque jour à 08:00 (UTC = Abidjan)
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule('loyerci-generate-invoices', '5 0 1 * *',
                     $$select public.generate_monthly_invoices()$$);
select cron.schedule('loyerci-mark-overdue', '0 8 * * *',
                     $$select public.mark_overdue_invoices()$$);
select cron.schedule('loyerci-verify-audit-chain', '30 3 * * *',
                     $$select private.verify_audit_chain()$$);
