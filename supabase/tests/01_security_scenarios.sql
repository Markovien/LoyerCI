-- =============================================================================
-- Scénarios de sécurité exécutés contre les migrations (psql -v ON_ERROR_STOP=1)
-- Chaque bloc lève une exception si la propriété testée n'est pas respectée.
-- =============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------- Données
insert into vault.secrets_stub values ('receipt_signing_key', 'test-secret-0123456789abcdef0123456789abcdef');

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'aya.coulibaly@example.ci'),   -- propriétaire A
  ('a0000000-0000-4000-8000-000000000002', 'gestion@akwaba-immo.ci'),     -- gestionnaire A
  ('a0000000-0000-4000-8000-000000000003', 'jm.kouassi@example.ci'),      -- locataire A1
  ('a0000000-0000-4000-8000-000000000004', 'mariam.traore@example.ci'),   -- locataire A2
  ('b0000000-0000-4000-8000-000000000001', 'proprio.b@example.ci');       -- propriétaire B

insert into public.organizations (id, name, kind, receipt_prefix) values
  ('c0000000-0000-4000-8000-000000000001', 'Akwaba Immobilier', 'agence', 'AKW'),
  ('c0000000-0000-4000-8000-000000000002', 'SCI Lagune', 'proprietaire', 'LAG');

insert into public.memberships (org_id, user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'manager'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'owner');

insert into public.properties (id, org_id, code, label, type, commune, quartier) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'VCR01', 'Villa Duplex 5 pièces', 'villa', 'Cocody', 'Riviera 3'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'APT12', 'Appartement 3 pièces', 'appartement', 'Marcory', 'Zone 4'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'MAG03', 'Magasin 40 m²', 'magasin', 'Plateau', 'Avenue Chardy'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', 'STU01', 'Studio meublé', 'studio', 'Yopougon', 'Selmer'),
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'BUR01', 'Bureau 25 m²', 'bureau', 'Plateau', null);

insert into public.tenants (id, org_id, user_id, full_name, phone) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'Kouassi Jean-Marc', '2250707123456'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'Traoré Mariam', '2250505987654'),
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', null, 'Yao Konan', '2250101445566');

insert into public.leases (id, org_id, property_id, tenant_id, rent_amount, charges_amount, due_day, start_date) values
  ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 450000, 0, 5, '2025-09-01'),
  ('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 250000, 15000, 5, '2026-01-01'),
  ('f0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000003', 85000, 0, 10, '2026-02-01');

-- Plafond légal : 3 mois de caution sur un bail d'habitation doit être refusé
do $$ begin
  insert into public.leases (org_id, property_id, tenant_id, rent_amount, deposit_months, due_day, start_date)
  values ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003',
          'e0000000-0000-4000-8000-000000000002', 600000, 3, 5, '2026-05-01');
  raise exception 'ÉCHEC : caution de 3 mois acceptée';
exception when check_violation then raise notice 'OK  plafond légal caution/avance (loi 2019-576)';
end $$;

-- Mélange inter-organisations : bail de l'org A sur un bien de l'org B refusé (FK composite)
do $$ begin
  insert into public.leases (org_id, property_id, tenant_id, rent_amount, due_day, start_date)
  values ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005',
          'e0000000-0000-4000-8000-000000000001', 100000, 5, '2026-05-01');
  raise exception 'ÉCHEC : bail inter-organisations accepté';
exception when foreign_key_violation then raise notice 'OK  cloisonnement inter-organisations (FK composites)';
end $$;

-- ---------------------------------------------------------------- Génération des avis
set role service_role;
do $$ begin
  assert public.generate_monthly_invoices('2026-05-01') = 3, 'il faut 3 avis';
  assert public.generate_monthly_invoices('2026-05-01') = 0, 'génération non idempotente';
  raise notice 'OK  génération des avis idempotente';
end $$;
reset role;

do $$
declare v text;
begin
  select payment_reference into v from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001';
  assert v = 'LOYER-2026-05-VCR01-' || private.ref_checksum('LOYER-2026-05-VCR01'), 'référence inattendue : ' || v;
  raise notice 'OK  référence de virement : %', v;
end $$;

-- ---------------------------------------------------------------- RLS lecture
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) from public.invoices) = 2, 'propriétaire A doit voir 2 avis';
  assert (select count(*) from public.properties) = 3, 'propriétaire A doit voir 3 biens';
  assert not exists (select 1 from public.tenants where full_name = 'Yao Konan'), 'fuite org B';
  raise notice 'OK  RLS : le propriétaire A ne voit que son organisation';
end $$;

set request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) from public.invoices) = 1, 'propriétaire B doit voir 1 avis';
  raise notice 'OK  RLS : le propriétaire B ne voit que son organisation';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.invoices) = 1, 'le locataire ne doit voir que son avis';
  assert (select count(*) from public.properties) = 1, 'le locataire ne doit voir que son bien';
  assert (select count(*) from public.tenants) = 1, 'le locataire ne voit que sa fiche';
  assert (select count(*) from public.payout_accounts) = 0, 'le locataire ne lit pas les RIB';
  raise notice 'OK  RLS : le locataire ne voit que ses propres données';
end $$;

-- ---------------------------------------------------------------- Écritures client interdites
do $$ begin
  update public.invoices set status = 'paye', paid_at = now();
  raise exception 'ÉCHEC : un locataire a pu modifier un avis';
exception when insufficient_privilege then raise notice 'OK  écriture directe refusée (UPDATE invoices)';
end $$;

do $$ begin
  insert into public.payments (org_id, invoice_id, method, provider, amount, provider_transaction_id)
  select org_id, id, 'mobile_money', 'cinetpay', 1, 'FAKE-00000001' from public.invoices limit 1;
  raise exception 'ÉCHEC : insertion de paiement autorisée';
exception when insufficient_privilege then raise notice 'OK  écriture directe refusée (INSERT payments)';
end $$;

do $$ begin
  perform public.confirm_provider_payment('cinetpay', 'X', 1, 'XOF', null, null, '{}');
  raise exception 'ÉCHEC : authenticated peut confirmer un paiement';
exception when insufficient_privilege then raise notice 'OK  RPC serveur interdite aux utilisateurs (confirm_provider_payment)';
end $$;

do $$ begin
  perform public.generate_monthly_invoices('2026-06-01');
  raise exception 'ÉCHEC : authenticated peut générer des avis';
exception when insufficient_privilege then raise notice 'OK  RPC serveur interdite aux utilisateurs (generate_monthly_invoices)';
end $$;
reset role;

-- ---------------------------------------------------------------- RIB et carence
set role service_role;
do $$
declare r record;
begin
  select * into r from public.add_payout_account('a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001', 'banque', 'AKWABA IMMOBILIER SARL', 'Société Générale Côte d''Ivoire',
    'CI15 CI00 8011 1301 3400 1253 0091', null, null, '41.202.10.5', 'test');
  assert r.activates_at <= now(), 'le premier RIB doit être actif immédiatement';

  select * into r from public.add_payout_account('a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001', 'banque', 'PIRATE', 'Banque X',
    'CI51 CI00 9999 9999 9999 9999 9999', null, null, '102.0.0.66', 'test');
  assert r.activates_at > now() + interval '47 hours', 'un changement de RIB doit attendre 48 h';
  raise notice 'OK  RIB : délai de carence de 48 h sur modification';
end $$;

do $$ begin
  perform public.add_payout_account('a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001', 'banque', 'X', 'Banque Y', 'CI15CI0080111301340012530092', null, null, null, null);
  raise exception 'ÉCHEC : IBAN à clé fausse accepté';
exception when check_violation then raise notice 'OK  IBAN : clé ISO 13616 contrôlée en base';
end $$;

do $$ begin
  perform public.add_payout_account('a0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000001', 'banque', 'X', 'Y', 'CI15CI0080111301340012530091', null, null, null, null);
  raise exception 'ÉCHEC : un gestionnaire a modifié le RIB';
exception when insufficient_privilege then raise notice 'OK  RBAC : seul le propriétaire modifie le RIB';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) from public.payout_accounts) = 0, 'le gestionnaire ne doit pas voir les IBAN';
  raise notice 'OK  RBAC : le gestionnaire ne lit pas les IBAN';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$
declare r record;
begin
  select * into r from public.get_transfer_instructions(
    (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001'));
  assert r.account_holder = 'AKWABA IMMOBILIER SARL', 'le RIB en carence ne doit pas être servi : ' || r.account_holder;
  raise notice 'OK  instructions de virement : RIB effectif (pas celui en carence)';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000004';
do $$ begin
  perform public.get_transfer_instructions(
    (select id from public.invoices i where i.lease_id = 'f0000000-0000-4000-8000-000000000001'));
  raise exception 'ÉCHEC : un autre locataire lit les instructions';
exception when insufficient_privilege then raise notice 'OK  instructions de virement refusées à un tiers';
end $$;
reset role;

-- ---------------------------------------------------------------- Mobile Money
set role service_role;
do $$
declare
  v_inv uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001');
  r record;
  r2 record;
begin
  -- Un autre locataire ne peut pas initier le paiement de Kouassi
  begin
    perform public.create_payment_intent('a0000000-0000-4000-8000-000000000004', v_inv, 'cinetpay', 'wave', 'TX-INTRUS-0001', null, null);
    raise exception 'ÉCHEC : intention créée par un tiers';
  exception when insufficient_privilege then null;
  end;

  select * into r from public.create_payment_intent('a0000000-0000-4000-8000-000000000003', v_inv, 'cinetpay', 'wave', 'TX-WAVE-00000001', '41.66.1.2', 'Mozilla');
  assert r.amount = 450000 and not r.reused, 'montant serveur attendu 450000';
  select * into r2 from public.create_payment_intent('a0000000-0000-4000-8000-000000000003', v_inv, 'cinetpay', 'wave', 'TX-WAVE-00000002', '41.66.1.2', 'Mozilla');
  assert r2.reused and r2.transaction_id = 'TX-WAVE-00000001', 'double clic : intention à réutiliser';
  raise notice 'OK  intention de paiement : montant serveur, anti double-clic, contrôle d''appartenance';

  -- Montant falsifié dans la notification
  assert public.confirm_provider_payment('cinetpay', 'TX-WAVE-00000001', 5, 'XOF', 'wave', '1.2.3.4', '{}') = 'anomalie', 'montant falsifié non détecté';
  assert (select status from public.invoices where id = v_inv) = 'a_payer', 'avis modifié malgré anomalie';
  -- Transaction inconnue
  assert public.confirm_provider_payment('cinetpay', 'TX-INCONNUE-01', 450000, 'XOF', 'wave', '1.2.3.4', '{}') = 'inconnu', 'transaction inconnue acceptée';
  raise notice 'OK  webhook : montant incohérent et transaction inconnue rejetés';

  -- Confirmation authentique (après revérification fournisseur), puis rejeu
  assert public.confirm_provider_payment('cinetpay', 'TX-WAVE-00000001', 450000, 'XOF', 'wave', '1.2.3.4', '{}') = 'confirme', 'confirmation attendue';
  assert public.confirm_provider_payment('cinetpay', 'TX-WAVE-00000001', 450000, 'XOF', 'wave', '1.2.3.4', '{}') = 'deja_traite', 'rejeu non idempotent';
  assert (select amount_paid from public.invoices where id = v_inv) = 450000, 'double imputation !';
  assert (select status from public.invoices where id = v_inv) = 'paye', 'avis non soldé';
  assert (select count(*) from public.receipts where invoice_id = v_inv) = 1, 'quittance absente ou dupliquée';
  raise notice 'OK  idempotence : rejeu du webhook sans double imputation, 1 quittance émise';
end $$;
reset role;

-- ---------------------------------------------------------------- Quittance
do $$
declare
  q public.receipts := (select r from public.receipts r limit 1);
  v record;
begin
  assert q.receipt_number = 'AKW-' || extract(year from now())::int || '-000001', 'numérotation : ' || q.receipt_number;

  select * into v from public.verify_receipt(q.id, left(q.signature, 16));
  assert v.verdict = 'authentique', 'verdict attendu authentique : ' || v.verdict;
  assert v.tenant_masked = 'Ko***** J.-M.', 'masquage : ' || v.tenant_masked;
  assert v.amount = 450000, 'montant';
  select * into v from public.verify_receipt(q.id, '0000000000000000');
  assert v.verdict = 'invalide' and v.tenant_masked is null, 'code faux accepté';
  select * into v from public.verify_receipt(gen_random_uuid(), left(q.signature, 16));
  assert v.verdict = 'invalide', 'identifiant inconnu accepté';
  raise notice 'OK  vérification publique : authentique / invalide, nom masqué « % »', 'Ko***** J.-M.';

  begin
    update public.receipts set amount = 45000 where id = q.id;
    raise exception 'ÉCHEC : quittance modifiable';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.receipts where id = q.id;
    raise exception 'ÉCHEC : quittance supprimable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  quittance immuable (UPDATE/DELETE bloqués même pour postgres)';
end $$;

-- Altération directe en base (attaquant avec accès SQL mais sans la clé Vault)
alter table public.receipts disable trigger receipts_immutable;
update public.receipts set amount = 45000;
alter table public.receipts enable trigger receipts_immutable;
do $$
declare q public.receipts := (select r from public.receipts r limit 1); v record;
begin
  select * into v from public.verify_receipt(q.id, left(q.signature, 16));
  assert v.verdict = 'alteree', 'altération non détectée : ' || v.verdict;
  raise notice 'OK  altération SQL directe détectée par recalcul HMAC';
end $$;
alter table public.receipts disable trigger receipts_immutable;
update public.receipts set amount = 450000;
alter table public.receipts enable trigger receipts_immutable;

-- Accès anonyme : RPC de vérification OK, lecture de table refusée
set role anon;
do $$
declare q_id uuid; ok boolean := false;
begin
  begin
    perform 1 from public.receipts;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'anon lit la table receipts';
  raise notice 'OK  anon : lecture directe des quittances refusée';
end $$;
reset role;
do $$ begin
  assert has_function_privilege('anon', 'public.verify_receipt(uuid, text)', 'execute'), 'anon doit pouvoir vérifier';
  assert not has_function_privilege('anon', 'public.get_transfer_instructions(uuid)', 'execute'), 'anon ne doit pas lire de RIB';
  assert not has_function_privilege('authenticated', 'public.review_transfer(uuid, uuid, boolean, text, inet, text)', 'execute'), 'review_transfer exposé';
  raise notice 'OK  liste blanche des fonctions exécutables';
end $$;

-- ---------------------------------------------------------------- Virement bancaire
set role service_role;
do $$
declare
  v_inv public.invoices;
  v_pay uuid;
  v_path text;
begin
  select * into v_inv from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002';
  v_path := v_inv.org_id || '/' || v_inv.id || '/' || gen_random_uuid() || '.pdf';

  begin -- chemin de preuve pointant vers un autre avis
    perform public.submit_transfer_proof('a0000000-0000-4000-8000-000000000004', v_inv.id, 100000, 'SGCI-778',
      'c0000000-0000-4000-8000-000000000002/' || gen_random_uuid() || '/' || gen_random_uuid() || '.pdf',
      'VIR-' || gen_random_uuid(), null, null);
    raise exception 'ÉCHEC : chemin de preuve étranger accepté';
  exception when invalid_parameter_value then null;
  end;

  v_pay := public.submit_transfer_proof('a0000000-0000-4000-8000-000000000004', v_inv.id, 100000,
             'SGCI-778', v_path, 'VIR-' || gen_random_uuid(), '41.66.9.9', 'Android');

  begin
    perform public.review_transfer('a0000000-0000-4000-8000-000000000002', v_pay, true, null, null, null);
    raise exception 'ÉCHEC : un gestionnaire a validé un virement';
  exception when insufficient_privilege then null;
  end;

  assert public.review_transfer('a0000000-0000-4000-8000-000000000001', v_pay, true, null, '41.202.10.5', 'Chrome') = 'valide', 'validation';
  assert public.review_transfer('a0000000-0000-4000-8000-000000000001', v_pay, true, null, '41.202.10.5', 'Chrome') = 'deja_traite', 'double validation';
  assert (select amount_paid from public.invoices where id = v_inv.id) = 100000, 'imputation partielle';
  assert (select status from public.invoices where id = v_inv.id) in ('partiel', 'en_retard'), 'statut partiel attendu';
  assert not exists (select 1 from public.receipts where invoice_id = v_inv.id), 'pas de quittance sur un paiement partiel';
  raise notice 'OK  virement : preuve, validation propriétaire seulement, paiement partiel sans quittance';
end $$;
reset role;

-- ---------------------------------------------------------------- KPIs
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
do $$
declare k record;
begin
  select * into k from public.dashboard_kpis('c0000000-0000-4000-8000-000000000001', '2026-05-01');
  assert k.expected = 715000, 'attendu 715000 : ' || k.expected;
  assert k.properties_total = 3 and k.properties_occupied = 2, 'occupation';
  raise notice 'OK  KPIs : % FCFA attendus, %/% biens occupés', k.expected, k.properties_occupied, k.properties_total;
end $$;
set request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000001';
do $$ begin
  perform public.dashboard_kpis('c0000000-0000-4000-8000-000000000001', '2026-05-01');
  raise exception 'ÉCHEC : KPIs d''une autre organisation';
exception when insufficient_privilege then raise notice 'OK  KPIs refusés hors organisation';
end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) from public.audit_logs) = 0, 'le gestionnaire ne doit pas lire l''audit';
  raise notice 'OK  journal d''audit réservé au propriétaire';
end $$;
reset role;

-- ---------------------------------------------------------------- Journal d'audit
set role service_role;
do $$ begin
  update public.audit_logs set ip = '8.8.8.8';
  raise exception 'ÉCHEC : service_role modifie l''audit';
exception when insufficient_privilege then raise notice 'OK  audit : UPDATE refusé à service_role';
end $$;
reset role;
do $$ begin
  delete from public.audit_logs;
  raise exception 'ÉCHEC : audit supprimable';
exception when insufficient_privilege then raise notice 'OK  audit : DELETE bloqué même pour postgres (trigger)';
end $$;
do $$
declare n int;
begin
  assert not exists (select 1 from private.verify_audit_chain()), 'chaîne d''audit cassée';
  select count(*) into n from public.audit_logs;
  assert exists (select 1 from public.audit_logs where action = 'rib_ajoute' and host(ip) = '102.0.0.66'), 'IP non tracée';
  assert exists (select 1 from public.audit_logs where action = 'quittance_generee'), 'génération de quittance non tracée';
  assert exists (select 1 from public.audit_logs where action = 'virement_valide'), 'validation de virement non tracée';
  raise notice 'OK  audit : % entrées, chaîne SHA-256 intègre, IP tracées', n;
end $$;

-- Altération du journal par un superutilisateur (triggers désactivés) -> détectée
alter table public.audit_logs disable trigger audit_logs_no_update;
update public.audit_logs set ip = '8.8.8.8' where action = 'rib_ajoute' and host(ip) = '102.0.0.66';
alter table public.audit_logs enable trigger audit_logs_no_update;
do $$
declare b record;
begin
  select * into b from private.verify_audit_chain();
  assert b.reason = 'contenu altéré', 'altération de l''audit non détectée';
  raise notice 'OK  audit : altération superutilisateur détectée au maillon %', b.broken_at_seq;
end $$;

\echo '=== TOUS LES SCÉNARIOS DE SÉCURITÉ SONT PASSÉS ==='
