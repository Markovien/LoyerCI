-- Exécuté par `supabase db reset` (environnement LOCAL uniquement).
-- En production : créer le secret via le tableau de bord Supabase > Vault, avec 64 caractères aléatoires :
--   select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'receipt_signing_key');
select vault.create_secret('dev-only-receipt-signing-key-change-me-0123456789abcdef', 'receipt_signing_key')
where not exists (select 1 from vault.secrets where name = 'receipt_signing_key');
