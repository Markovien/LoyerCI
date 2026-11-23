-- =============================================================================
-- LoyerCI — P2.3 (1/2) : mode de règlement « avance » (versée à la signature).
-- Migration séparée : une valeur d'enum n'est pas utilisable dans sa transaction.
-- =============================================================================
alter type public.payment_method add value if not exists 'avance';
