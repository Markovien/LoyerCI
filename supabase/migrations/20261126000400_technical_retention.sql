-- =============================================================================
-- LoyerCI — P4.3 : purge des données techniques (minimisation, loi n° 2013-450).
--   - webhook_events : 90 jours (le corps brut peut contenir le numéro du payeur). Un
--     rejeu ultérieur d'une notification reste sans effet : l'imputation est idempotente.
--   - File d'envoi (messages expédiés ou abandonnés) : 90 jours.
--   - Fichiers retirés du stockage : 90 jours après leur retrait.
--   - Autorisations de ré-authentification consommées ou expirées : 30 jours.
-- Le journal d'audit n'est JAMAIS purgé ; les documents suivent P3.4 (2 ans).
-- =============================================================================
create function public.purge_technical_data()
returns table (webhooks integer, messages integer, fichiers integer, reauth integer)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.webhook_events where received_at < now() - interval '90 days';
  get diagnostics webhooks = row_count;
  delete from private.outbox where coalesce(sent_at, failed_at) < now() - interval '90 days';
  get diagnostics messages = row_count;
  delete from private.storage_deletions where done_at < now() - interval '90 days';
  get diagnostics fichiers = row_count;
  delete from private.reauth_grants where granted_at < now() - interval '30 days';
  get diagnostics reauth = row_count;
  return next;
end $$;

revoke execute on function public.purge_technical_data() from public, anon, authenticated;
grant execute on function public.purge_technical_data() to service_role;
