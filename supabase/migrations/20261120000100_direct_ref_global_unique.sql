-- =============================================================================
-- LoyerCI — P1.3 (constat e2e) : un n° de transaction déjà déclaré pour un opérateur
-- était accepté s'il était redéclaré pour un AUTRE opérateur (unicité par couple
-- opérateur/référence). Un fraudeur pouvait ainsi resservir la même transaction.
-- Unicité désormais GLOBALE sur les paiements directs, insensible à la casse.
-- Échec de la migration si des doublons existent déjà (à traiter manuellement).
-- =============================================================================
create unique index payments_direct_txn_ref_global_uniq
  on public.payments (upper(operator_txn_ref)) where provider = 'direct';
