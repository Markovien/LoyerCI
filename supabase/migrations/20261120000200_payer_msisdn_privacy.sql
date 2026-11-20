-- =============================================================================
-- LoyerCI — P1.4 : minimisation du numéro du payeur (loi n° 2013-450).
-- La RLS laisse tout membre de l'organisation (y compris un gestionnaire) lire les
-- paiements via l'API avec son jeton : masquer à l'affichage ne suffit pas.
-- Le numéro complet n'est plus lisible par « authenticated » (privilège de colonne) ;
-- seul un indice (4 derniers chiffres) l'est. Le rapprochement (P1.5) se fait en SQL.
-- Effet de bord voulu : toute FUTURE colonne de payments est illisible par défaut
-- tant qu'elle n'est pas ajoutée explicitement ci-dessous (nouvelle migration).
-- =============================================================================
alter table public.payments
  add column payer_msisdn_hint text generated always as (
    case when payer_msisdn is null then null else '•••• ' || right(payer_msisdn, 4) end
  ) stored;

revoke select on public.payments from authenticated;
grant select (
  id, org_id, invoice_id, method, provider, operator, amount, currency, status,
  provider_transaction_id, bank_reference, checkout_url, proof_path, declared_by,
  validated_by, validated_at, failure_reason, created_at, updated_at,
  operator_txn_ref, payer_msisdn_hint
) on public.payments to authenticated;
