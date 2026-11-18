-- =============================================================================
-- LoyerCI — P1.1 (1/2) : valeurs d'énumération du paiement direct.
-- Migration séparée : PostgreSQL interdit d'utiliser une valeur d'enum ajoutée
-- dans la même transaction (index partiels et CHECK de la migration suivante).
-- =============================================================================
alter type public.payment_provider add value if not exists 'direct';
alter type public.payout_kind      add value if not exists 'pispi_alias';
alter type public.payout_kind      add value if not exists 'payment_link';
