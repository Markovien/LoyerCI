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
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null); -- P1.6 : ré-authentification requise
  select * into r from public.add_payout_account('a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001', 'banque', 'AKWABA IMMOBILIER SARL', 'Société Générale Côte d''Ivoire',
    'CI15 CI00 8011 1301 3400 1253 0091', null, null, '41.202.10.5', 'test');
  assert r.activates_at <= now(), 'le premier RIB doit être actif immédiatement';

  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null); -- P1.6 : ré-authentification requise
  select * into r from public.add_payout_account('a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001', 'banque', 'PIRATE', 'Banque X',
    'CI51 CI00 9999 9999 9999 9999 9999', null, null, '102.0.0.66', 'test');
  assert r.activates_at > now() + interval '47 hours', 'un changement de RIB doit attendre 48 h';
  raise notice 'OK  RIB : délai de carence de 48 h sur modification';
end $$;

do $$ begin
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null); -- P1.6 : ré-authentification requise
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
  -- S6 : la vérification passe par le serveur (limiteur de débit), plus d'appel PostgREST direct.
  assert not has_function_privilege('anon', 'public.verify_receipt(uuid, text)', 'execute'), 'verify_receipt exposé à anon';
  assert has_function_privilege('service_role', 'public.verify_receipt(uuid, text)', 'execute'), 'le serveur doit pouvoir vérifier';
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


-- =============================================================================
-- Correctifs de l'audit de sécurité (migration 20261118000500_security_hardening)
-- =============================================================================

-- S1 : révoquer le RIB actif puis en ajouter un nouveau ne contourne plus la carence
set role service_role;
do $$
declare r record;
begin
  for r in select id from public.payout_accounts where org_id = 'c0000000-0000-4000-8000-000000000001' and revoked_at is null loop
    perform public.cancel_payout_account('a0000000-0000-4000-8000-000000000001', r.id, '102.0.0.66', 'pirate');
  end loop;
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null); -- P1.6 : ré-authentification requise
  select * into r from public.add_payout_account('a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001', 'banque', 'PIRATE 2', 'Banque X',
    'CI51CI0099999999999999999999', null, null, '102.0.0.66', 'pirate');
  assert r.activates_at > now() + interval '47 hours', 'S1 : carence contournée par révocation préalable';
  -- Nouveau type (Mobile Money après un RIB) : carence également
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null); -- P1.6 : ré-authentification requise
  select * into r from public.add_payout_account('a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001', 'mobile_money', 'PIRATE 3', null, null, 'wave', '2250707999999', '102.0.0.66', 'pirate');
  assert r.activates_at > now() + interval '47 hours', 'S1 : carence contournée par changement de type';
  -- Première configuration d'une organisation vierge : immédiate
  perform public.grant_reauth('b0000000-0000-4000-8000-000000000001', null, null); -- P1.6 : ré-authentification requise
  select * into r from public.add_payout_account('b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002', 'mobile_money', 'SCI LAGUNE', null, null, 'orange', '2250707111222', null, null);
  assert r.activates_at <= now(), 'S1 : la toute première coordonnée doit être active immédiatement';
  raise notice 'OK  S1 carence : ni la révocation préalable ni le changement de type ne la contournent';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$
declare r record;
begin
  select * into r from public.get_transfer_instructions(
    (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001'));
  assert r.account_holder is null, 'S1 : un RIB en carence est servi au locataire : ' || coalesce(r.account_holder, '');
  raise notice 'OK  S1 carence : aucun RIB pirate servi au locataire pendant 48 h';
end $$;
reset role;

-- S2 : une table ou une fonction créée par une FUTURE migration n'est accessible à personne par défaut
create table public.zz_future_table (id int);
create function public.zz_future_fn() returns int language sql security definer set search_path = '' as $$ select 1 $$;
do $$ begin
  assert not has_table_privilege('anon', 'public.zz_future_table', 'select'), 'S2 : SELECT par défaut pour anon';
  assert not has_table_privilege('authenticated', 'public.zz_future_table', 'insert'), 'S2 : INSERT par défaut pour authenticated';
  assert not has_function_privilege('anon', 'public.zz_future_fn()', 'execute'), 'S2 : EXECUTE par défaut pour anon';
  assert not has_function_privilege('authenticated', 'public.zz_future_fn()', 'execute'), 'S2 : EXECUTE par défaut pour authenticated';
  raise notice 'OK  S2 privilèges par défaut : rien n''est accordé implicitement aux nouvelles tables/fonctions';
end $$;
drop function public.zz_future_fn();
drop table public.zz_future_table;

-- Garde-fou générique (à garder à jour) : liste blanche exhaustive des fonctions
-- exécutables par anon/authenticated, RLS active partout, aucune écriture client,
-- search_path figé sur toute fonction SECURITY DEFINER.
do $$
declare v text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute');
  assert v is null, 'fonctions exécutables par anon : ' || v;

  select string_agg(p.oid::regprocedure::text, ', ') into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'execute')
     and p.oid::regprocedure::text not in (
       'private.user_org_ids(member_role[])', 'private.user_tenant_ids()', 'private.tenant_org_ids()',
       'private.tenant_property_ids()', 'get_transfer_instructions(uuid)', 'dashboard_kpis(uuid,date)',
       'get_direct_payment_instructions(uuid)', 'my_account_deletion()',
       'message_usage_summary(uuid,date)');
  assert v is null, 'fonctions exécutables par authenticated hors liste blanche : ' || v;

  select string_agg(c.relname, ', ') into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  assert v is null, 'tables sans RLS : ' || v;

  select string_agg(c.relname || ':' || r.rolname || ':' || pr.p, ', ') into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) r(rolname)
    cross join (values ('insert'), ('update'), ('delete'), ('truncate')) pr(p)
   where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege(r.rolname, c.oid, pr.p);
  assert v is null, 'écritures client autorisées : ' || v;

  select string_agg(c.relname, ', ') into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, 'select');
  assert v is null, 'tables lisibles par anon : ' || v;

  select string_agg(p.oid::regprocedure::text, ', ') into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false);
  assert v is null, 'SECURITY DEFINER sans search_path figé : ' || v;
  raise notice 'OK  garde-fou : liste blanche EXECUTE, RLS partout, aucune écriture client, search_path figé';
end $$;

-- S3 : encaissement confirmé sur un avis annulé -> tracé, sans imputation ni quittance, sans exception
set role service_role;
do $$
declare v_inv uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000003');
begin
  perform public.create_payment_intent('a0000000-0000-4000-8000-000000000003', v_inv, 'cinetpay', 'orange', 'TX-NOTMINE-0001', null, null);
  raise exception 'ÉCHEC : intention sur l''avis d''un autre locataire';
exception when insufficient_privilege then null;
end $$;
reset role;
-- Yao Konan (org B) n'a pas de compte : on lui en lie un le temps du test
insert into auth.users (id, email) values ('b0000000-0000-4000-8000-000000000009', 'yao.konan@example.ci');
update public.tenants set user_id = 'b0000000-0000-4000-8000-000000000009' where id = 'e0000000-0000-4000-8000-000000000003';
set role service_role;
select * from public.create_payment_intent('b0000000-0000-4000-8000-000000000009',
  (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000003'), 'cinetpay', 'orange', 'TX-ANNULE-00001', null, null) \g /dev/null
reset role;
update public.invoices set status = 'annule' where lease_id = 'f0000000-0000-4000-8000-000000000003';
set role service_role;
do $$
declare v_inv uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000003');
begin
  assert public.confirm_provider_payment('cinetpay', 'TX-ANNULE-00001', 85000, 'XOF', 'orange', '1.2.3.4', '{}') = 'anomalie_avis_annule', 'S3 : issue attendue';
  assert (select status from public.payments where provider_transaction_id = 'TX-ANNULE-00001') = 'reussi', 'S3 : encaissement non tracé';
  assert (select amount_paid from public.invoices where id = v_inv) = 0, 'S3 : avis annulé imputé';
  assert not exists (select 1 from public.receipts where invoice_id = v_inv), 'S3 : quittance sur avis annulé';
  assert public.confirm_provider_payment('cinetpay', 'TX-ANNULE-00001', 85000, 'XOF', 'orange', '1.2.3.4', '{}') = 'deja_traite', 'S3 : rejeu';
  raise notice 'OK  S3 avis annulé : encaissement tracé en anomalie, ni imputation ni quittance, webhook non bloqué';
end $$;
reset role;

-- S4 : quittance v2 — toute altération d'un champ affiché est détectée
do $$
declare q public.receipts := (select r from public.receipts r where signature_version = 2 limit 1); v record;
begin
  assert q.id is not null, 'S4 : aucune quittance v2 émise';
  select * into v from public.verify_receipt(q.id, left(q.signature, 16));
  assert v.verdict = 'authentique', 'S4 : quittance v2 intacte non reconnue : ' || v.verdict;
end $$;
alter table public.receipts disable trigger receipts_immutable;
update public.receipts set landlord_name = 'ESCROC SARL' where signature_version = 2;
alter table public.receipts enable trigger receipts_immutable;
do $$
declare q public.receipts := (select r from public.receipts r where signature_version = 2 limit 1); v record;
begin
  select * into v from public.verify_receipt(q.id, left(q.signature, 16));
  assert v.verdict = 'alteree', 'S4 : bailleur falsifié non détecté : ' || v.verdict;
end $$;
alter table public.receipts disable trigger receipts_immutable;
update public.receipts set landlord_name = 'Akwaba Immobilier', payment_methods = 'especes' where signature_version = 2;
alter table public.receipts enable trigger receipts_immutable;
do $$
declare q public.receipts := (select r from public.receipts r where signature_version = 2 limit 1); v record;
begin
  select * into v from public.verify_receipt(q.id, left(q.signature, 16));
  assert v.verdict = 'alteree', 'S4 : mode de règlement falsifié non détecté : ' || v.verdict;
  raise notice 'OK  S4 quittance v2 : bailleur et mode de règlement signés (altérations détectées)';
end $$;

-- S5 : chaînage d'audit v2 — le user_agent est couvert
do $$ begin
  assert not exists (select 1 from private.verify_audit_chain() where reason <> 'contenu altéré'
                     or broken_at_seq > (select min(chain_seq) from public.audit_logs where host(ip) = '8.8.8.8')),
    'S5 : chaîne mixte v1/v2 invalide hors altération volontaire précédente';
end $$;
alter table public.audit_logs disable trigger audit_logs_no_update;
update public.audit_logs set ip = '102.0.0.66' where host(ip) = '8.8.8.8';
alter table public.audit_logs enable trigger audit_logs_no_update;
do $$ begin
  assert not exists (select 1 from private.verify_audit_chain()), 'S5 : chaîne mixte v1/v2 non intègre';
  assert exists (select 1 from public.audit_logs where hash_version = 2), 'S5 : aucune ligne v2';
end $$;
alter table public.audit_logs disable trigger audit_logs_no_update;
update public.audit_logs set user_agent = 'falsifié' where chain_seq = (select max(chain_seq) from public.audit_logs where hash_version = 2);
alter table public.audit_logs enable trigger audit_logs_no_update;
do $$
declare b record;
begin
  select * into b from private.verify_audit_chain();
  assert b.reason = 'contenu altéré', 'S5 : altération du user_agent non détectée';
  raise notice 'OK  S5 audit v2 : altération du user_agent détectée au maillon %', b.broken_at_seq;
end $$;


-- =============================================================================
-- P1.1 — Schéma du paiement direct
-- =============================================================================
do $$
declare v_inv public.invoices;
begin
  select * into v_inv from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001';
  insert into public.payments (org_id, invoice_id, method, provider, operator, amount, status, provider_transaction_id, operator_txn_ref, declared_by)
  values (v_inv.org_id, v_inv.id, 'mobile_money', 'direct', 'wave', 1000, 'en_attente_validation', 'DIR-' || gen_random_uuid(), 'T2611AB12CD', 'a0000000-0000-4000-8000-000000000003');
  begin
    insert into public.payments (org_id, invoice_id, method, provider, operator, amount, status, provider_transaction_id, operator_txn_ref, declared_by)
    values (v_inv.org_id, v_inv.id, 'mobile_money', 'direct', 'wave', 1000, 'en_attente_validation', 'DIR-' || gen_random_uuid(), 't2611ab12cd', 'a0000000-0000-4000-8000-000000000004');
    raise exception 'ÉCHEC : n° de transaction opérateur réutilisé (casse différente)';
  exception when unique_violation then null;
  end;
  begin -- depuis le 21/11/2026 le n° de transaction est facultatif, mais l'opérateur reste obligatoire
    insert into public.payments (org_id, invoice_id, method, provider, amount, status, provider_transaction_id, declared_by)
    values (v_inv.org_id, v_inv.id, 'mobile_money', 'direct', 1000, 'en_attente_validation', 'DIR-' || gen_random_uuid(), 'a0000000-0000-4000-8000-000000000003');
    raise exception 'ÉCHEC : paiement direct sans opérateur';
  exception when check_violation then null;
  end;
  delete from public.payments where operator_txn_ref = 'T2611AB12CD';
  raise notice 'OK  P1.1 n° de transaction opérateur unique (insensible à la casse) ; opérateur obligatoire';
end $$;

set role service_role;
do $$ begin
  begin
    perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null); -- P1.6 : ré-authentification requise
    perform public.add_payout_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'pispi_alias', 'AKWABA', null, null, null, null, null, null);
    raise exception 'ÉCHEC : alias PI-SPI absent accepté';
  exception when check_violation then null;
  end;
  raise notice 'OK  P1.1 coordonnées : champs obligatoires par type contrôlés';
end $$;
reset role;
do $$ begin
  begin
    insert into public.payout_accounts (org_id, kind, account_holder, pispi_alias, created_by)
    values ('c0000000-0000-4000-8000-000000000001', 'pispi_alias', 'AKWABA', '+2250707', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'ÉCHEC : alias PI-SPI mal formé accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.payout_accounts (org_id, kind, account_holder, pispi_alias, created_by)
    values ('c0000000-0000-4000-8000-000000000001', 'pispi_alias', 'AKWABA', '6f1c2b8e-1d2a-1b3c-8d4e-123456789abc', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'ÉCHEC : SHID non UUID v4 accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.payout_accounts (org_id, kind, account_holder, operator, payment_link_url, created_by)
    values ('c0000000-0000-4000-8000-000000000001', 'payment_link', 'AKWABA', 'wave', 'https://pay.escroc.example/akwaba', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'ÉCHEC : lien marchand hors liste blanche accepté';
  exception when invalid_parameter_value then null;
  end;
  insert into public.allowed_payment_link_hosts (host, operator, note) values ('pay.exemple-operateur.ci', 'wave', 'test');
  begin
    insert into public.payout_accounts (org_id, kind, account_holder, operator, payment_link_url, created_by)
    values ('c0000000-0000-4000-8000-000000000001', 'payment_link', 'AKWABA', 'orange', 'https://pay.exemple-operateur.ci/m/akwaba', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'ÉCHEC : hôte autorisé pour un autre opérateur accepté';
  exception when invalid_parameter_value then null;
  end;
  delete from public.allowed_payment_link_hosts;
  raise notice 'OK  P1.1 alias PI-SPI (+225… ou UUID v4) et liens marchands en liste blanche par opérateur';
end $$;

-- Paramètres : un locataire lit ceux de SON bailleur seulement ; personne n'écrit
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.org_payment_settings) = 1, 'le locataire doit lire les paramètres de son bailleur uniquement';
  assert (select cinetpay_enabled from public.org_payment_settings) = false, 'CinetPay doit être désactivé par défaut';
  assert (select count(*) from public.operator_ref_formats) = 4, 'formats de référence lisibles';
  begin
    update public.org_payment_settings set cinetpay_enabled = true;
    raise exception 'ÉCHEC : un locataire modifie les paramètres de paiement';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  P1.1 paramètres de paiement : lecture cloisonnée, CinetPay désactivé par défaut, aucune écriture client';
end $$;
reset role;
do $$ begin
  insert into public.organizations (id, name) values ('c0000000-0000-4000-8000-000000000009', 'Nouvelle agence');
  assert exists (select 1 from public.org_payment_settings where org_id = 'c0000000-0000-4000-8000-000000000009'), 'paramètres par défaut non créés';
  raise notice 'OK  P1.1 paramètres par défaut créés avec l''organisation';
end $$;


-- =============================================================================
-- P1.2 — Paiement direct, validation manuelle unifiée, espèces (D2), paramètres
-- =============================================================================
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-000000000005', 'compta@akwaba-immo.ci');
insert into public.memberships (org_id, user_id, role) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'accountant');
-- Compte Wave de la propriétaire dont la carence est écoulée (simulée) ; le compte
-- « PIRATE 3 » (Wave, en carence) ajouté en S1 ne doit jamais être servi.
insert into public.payout_accounts (org_id, kind, account_holder, operator, msisdn, display_name_expected, activates_at, created_by)
values ('c0000000-0000-4000-8000-000000000001', 'mobile_money', 'Akwaba Immobilier SARL', 'orange', '2250707000111',
        'AKWABA IMMOBILIER', now() - interval '1 hour', 'a0000000-0000-4000-8000-000000000001');
set role service_role;
select public.generate_monthly_invoices('2026-06-01') \g /dev/null
reset role;

-- Instructions : comptes EFFECTIFS du bailleur, pour SON avis uniquement
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$
declare v_inv uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001' and period = '2026-06-01');
begin
  assert (select count(*) from public.get_direct_payment_instructions(v_inv)) = 1, 'un seul compte effectif attendu (pas celui en carence)';
  assert (select display_name from public.get_direct_payment_instructions(v_inv)) = 'AKWABA IMMOBILIER', 'nom attendu du bénéficiaire';
  assert (select amount_remaining from public.get_direct_payment_instructions(v_inv)) = 450000, 'reste dû';
  assert not exists (select 1 from public.get_direct_payment_instructions(v_inv) where msisdn = '2250707999999'), 'compte pirate en carence servi';
end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000004';
do $$ begin
  perform public.get_direct_payment_instructions((select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001' and period = '2026-06-01'));
  raise exception 'ÉCHEC : un autre locataire lit les coordonnées de réception';
exception when insufficient_privilege then null;
end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';
do $$ begin
  perform public.get_direct_payment_instructions((select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001' and period = '2026-06-01'));
  raise exception 'ÉCHEC : un gestionnaire lit les coordonnées via la fonction locataire';
exception when insufficient_privilege then
  raise notice 'OK  P1.2 instructions : comptes effectifs seulement, nom attendu, réservées au locataire de l''avis';
end $$;
reset role;

-- Déclarations du locataire
set role service_role;
do $$
declare
  v_inv uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001' and period = '2026-06-01');
  v_tra uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002' and period = '2026-06-01');
  v_kouassi constant uuid := 'a0000000-0000-4000-8000-000000000003';
  p1 uuid; p2 uuid; p3 uuid;
begin
  begin
    perform public.submit_direct_payment('a0000000-0000-4000-8000-000000000004', v_inv, 'orange', 1000, 'MP261119.0001', null, null, null, null);
    raise exception 'ÉCHEC : déclaration sur l''avis d''un autre locataire';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_direct_payment(v_kouassi, v_inv, 'orange', 450001, 'MP261119.0001', null, null, null, null);
    raise exception 'ÉCHEC : montant supérieur au reste dû accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_direct_payment(v_kouassi, v_inv, 'orange', 1000, 'a b', null, null, null, null);
    raise exception 'ÉCHEC : n° de transaction mal formé accepté';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_direct_payment(v_kouassi, v_inv, 'orange', 1000, 'MP261119.0001', null,
      'c0000000-0000-4000-8000-000000000002/' || gen_random_uuid() || '/' || gen_random_uuid() || '.jpg', null, null);
    raise exception 'ÉCHEC : chemin de preuve étranger accepté';
  exception when invalid_parameter_value then null;
  end;

  p1 := public.submit_direct_payment(v_kouassi, v_inv, 'orange', 200000, ' MP261119.0001 ', '2250707123456', null, '41.66.1.2', 'Android');
  assert (select amount_paid from public.invoices where id = v_inv) = 0, 'une déclaration ne doit rien imputer';
  assert not exists (select 1 from public.receipts where invoice_id = v_inv), 'une déclaration ne doit jamais émettre de quittance';

  begin -- même transaction présentée par un autre locataire, casse différente
    perform public.submit_direct_payment('a0000000-0000-4000-8000-000000000004', v_tra, 'orange', 1000, 'mp261119.0001', null, null, null, null);
    raise exception 'ÉCHEC : n° de transaction réutilisé accepté';
  exception when raise_exception then
    assert sqlerrm like '%déjà été déclaré%', 'message inattendu : ' || sqlerrm;
  end;

  begin -- même transaction redéclarée pour un AUTRE opérateur (constat e2e P1.3)
    perform public.submit_direct_payment(v_kouassi, v_inv, 'wave', 1000, 'MP261119.0001', null, null, null, null);
    raise exception 'ÉCHEC : n° de transaction réutilisé sous un autre opérateur';
  exception when raise_exception then null;
  end;
  p2 := public.submit_direct_payment(v_kouassi, v_inv, 'wave', 150000, 'T26111900002', null, null, null, null);
  p3 := public.submit_direct_payment(v_kouassi, v_inv, 'orange', 100000, 'MP261119.0003', null, null, null, null);
  begin
    perform public.submit_direct_payment(v_kouassi, v_inv, 'orange', 1000, 'MP261119.0004', null, null, null, null);
    raise exception 'ÉCHEC : 4e déclaration en attente acceptée';
  exception when raise_exception then null;
  end;
  raise notice 'OK  P1.2 déclaration : appartenance, montant, format, chemin, unicité inter-locataires et inter-opérateurs, 3 en attente max, aucune imputation';

  -- Validation
  begin
    perform public.review_manual_payment('a0000000-0000-4000-8000-000000000002', p1, true, null, null, null);
    raise exception 'ÉCHEC : un gestionnaire a validé un paiement direct';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_transfer('a0000000-0000-4000-8000-000000000001', p1, true, null, null, null);
    raise exception 'ÉCHEC : review_transfer a traité un paiement direct';
  exception when invalid_parameter_value then null;
  end;
  assert public.review_manual_payment('a0000000-0000-4000-8000-000000000005', p1, true, null, '41.202.10.6', 'Chrome') = 'valide', 'validation comptable';
  assert public.review_manual_payment('a0000000-0000-4000-8000-000000000001', p1, true, null, null, null) = 'deja_traite', 'double validation';
  begin
    perform public.review_manual_payment('a0000000-0000-4000-8000-000000000001', p3, false, 'non', null, null);
    raise exception 'ÉCHEC : rejet sans motif accepté';
  exception when invalid_parameter_value then null;
  end;
  assert public.review_manual_payment('a0000000-0000-4000-8000-000000000001', p3, false, 'Montant absent de l''historique Orange Money', null, null) = 'rejete', 'rejet';
  assert (select amount_paid from public.invoices where id = v_inv) = 200000, 'le rejet ne doit rien imputer';
  assert not exists (select 1 from public.receipts where invoice_id = v_inv), 'pas de quittance sur un paiement partiel';
  begin -- la référence rejetée ne peut pas être resoumise telle quelle
    perform public.submit_direct_payment(v_kouassi, v_inv, 'orange', 100000, 'MP261119.0003', null, null, null, null);
    raise exception 'ÉCHEC : référence rejetée resoumise';
  exception when raise_exception then null;
  end;
  p3 := public.submit_direct_payment(v_kouassi, v_inv, 'mtn', 100000, 'MTN.26111905', null, null, null, null);
  assert public.review_manual_payment('a0000000-0000-4000-8000-000000000001', p2, true, null, null, null) = 'valide', 'p2';
  assert public.review_manual_payment('a0000000-0000-4000-8000-000000000001', p3, true, null, null, null) = 'valide', 'p3';
  assert (select status from public.invoices where id = v_inv) = 'paye', 'avis soldé attendu';
  assert (select count(*) from public.receipts where invoice_id = v_inv and signature_version = 2) = 1, 'une seule quittance v2';
  assert (select payment_methods from public.receipts where invoice_id = v_inv) = 'mobile_money', 'mode de règlement';
  raise notice 'OK  P1.2 validation : gestionnaire refusé, double validation idempotente, rejet motivé sans effet, soldé -> 1 quittance';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.audit_logs where action = 'paiement_direct_declare') = 4, 'déclarations tracées';
  assert (select count(*) from public.audit_logs where action = 'paiement_direct_confirme') = 3, 'confirmations tracées';
  assert (select count(*) from public.audit_logs where action = 'paiement_direct_rejete') = 1, 'rejet tracé';
  assert not exists (select 1 from public.audit_logs where metadata::text like '%2250707123456%'), 'numéro payeur en clair dans l''audit';
  raise notice 'OK  P1.2 audit : déclarations, confirmations, rejet tracés ; numéro payeur masqué';
end $$;

-- Espèces (décision D2)
set role service_role;
do $$
declare
  v_tra uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002' and period = '2026-06-01');
  r record;
begin
  select * into r from public.record_cash_payment('a0000000-0000-4000-8000-000000000005', v_tra, 150000, '41.202.10.6', 'Chrome');
  assert r.status = 'en_attente_validation', 'D2 : espèces > seuil par un comptable doivent attendre';
  assert (select amount_paid from public.invoices where id = v_tra) = 0, 'D2 : imputation prématurée';
  begin
    perform public.review_manual_payment('a0000000-0000-4000-8000-000000000005', r.payment_id, true, null, null, null);
    raise exception 'ÉCHEC : un comptable confirme des espèces';
  exception when insufficient_privilege then null;
  end;
  assert public.review_manual_payment('a0000000-0000-4000-8000-000000000001', r.payment_id, true, null, null, null) = 'valide', 'D2 : confirmation propriétaire';
  assert (select amount_paid from public.invoices where id = v_tra) = 150000, 'D2 : imputation après confirmation';
  select * into r from public.record_cash_payment('a0000000-0000-4000-8000-000000000005', v_tra, 50000, null, null);
  assert r.status = 'reussi', 'D2 : sous le seuil, imputation immédiate';
  begin
    perform public.record_cash_payment('a0000000-0000-4000-8000-000000000002', v_tra, 1000, null, null);
    raise exception 'ÉCHEC : un gestionnaire encaisse des espèces';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  P1.2 espèces (D2) : au-delà du seuil, attente et confirmation par le propriétaire seul';
end $$;

-- Paramètres de paiement
do $$
declare v_inv uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002' and period = '2026-06-01');
begin
  begin
    perform public.set_payment_settings('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', true, false, true, null, null, null, null);
    raise exception 'ÉCHEC : un comptable modifie les paramètres';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_payment_settings('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', false, false, false, null, null, null, null);
    raise exception 'ÉCHEC : tous les modes désactivés';
  exception when invalid_parameter_value then null;
  end;
  perform public.set_payment_settings('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
    false, false, true, '  Frais de transfert à la charge du locataire.  ', 200000, '41.202.10.5', 'Chrome');
  begin
    perform public.submit_direct_payment('a0000000-0000-4000-8000-000000000004', v_inv, 'orange', 1000, 'MP261119.0099', null, null, null, null);
    raise exception 'ÉCHEC : déclaration directe acceptée alors que le mode est désactivé';
  exception when raise_exception then null;
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000004';
do $$ begin
  assert (select count(*) from public.get_direct_payment_instructions(
    (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002' and period = '2026-06-01'))) = 0,
    'coordonnées servies alors que le paiement direct est désactivé';
  assert (select fees_notice from public.org_payment_settings) = 'Frais de transfert à la charge du locataire.', 'texte des frais';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.audit_logs where action = 'parametres_paiement_modifies'
                 and metadata -> 'apres' ->> 'direct' = 'false' and metadata -> 'avant' ->> 'direct' = 'true'), 'modification non tracée';
  update public.org_payment_settings set direct_enabled = true where org_id = 'c0000000-0000-4000-8000-000000000001';
  raise notice 'OK  P1.2 paramètres : propriétaire seul, au moins un mode actif, désactivation effective, avant/après tracés';
end $$;


-- =============================================================================
-- P1.4 — Numéro du payeur : jamais lisible en clair côté client
-- =============================================================================
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
do $$
declare ok boolean := false;
begin
  begin
    perform payer_msisdn from public.payments limit 1;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'le propriétaire lit le numéro payeur en clair via l''API';
  assert exists (select 1 from public.payments where payer_msisdn_hint = '•••• 3456'), 'indice du numéro payeur attendu';
  raise notice 'OK  P1.4 numéro payeur : illisible en clair (privilège de colonne), indice des 4 derniers chiffres seulement';
end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';
do $$
declare ok boolean := false;
begin
  begin
    perform payer_msisdn from public.payments limit 1;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'le gestionnaire lit le numéro payeur en clair';
end $$;
reset role;
do $$ begin
  assert not has_column_privilege('authenticated', 'public.payments', 'payer_msisdn', 'select'), 'privilège de colonne';
  assert not has_column_privilege('anon', 'public.payments', 'payer_msisdn_hint', 'select'), 'anon';
end $$;


-- =============================================================================
-- P1.5 révisé — « Encaissement reçu » par le bailleur ; n° de transaction facultatif
-- =============================================================================
set role service_role;
select public.generate_monthly_invoices('2026-08-01') \g /dev/null
do $$
declare
  v_k uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001' and period = '2026-08-01');
  v_t uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002' and period = '2026-08-01');
  v_owner constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_acc   constant uuid := 'a0000000-0000-4000-8000-000000000005';
  p uuid;
begin
  -- Gestionnaire : jamais d'attestation d'encaissement (décision du 21/11)
  begin
    perform public.record_received_payment('a0000000-0000-4000-8000-000000000002', v_k, 'mobile_money', 'wave', 1000, null, null, null, null);
    raise exception 'ÉCHEC : un gestionnaire enregistre un encaissement';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_received_payment(v_owner, v_k, 'especes', null, 1000, null, null, null, null);
    raise exception 'ÉCHEC : espèces acceptées hors record_cash_payment (contournement D2)';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_received_payment(v_owner, v_k, 'mobile_money', null, 1000, null, null, null, null);
    raise exception 'ÉCHEC : Mobile Money sans opérateur';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_received_payment(v_owner, v_k, 'mobile_money', 'wave', 450001, null, null, null, null);
    raise exception 'ÉCHEC : montant supérieur au reste dû';
  exception when invalid_parameter_value then null;
  end;

  -- Propriétaire : Wave avec n° lu dans son historique -> imputé aussitôt, pas de quittance (partiel)
  p := public.record_received_payment(v_owner, v_k, 'mobile_money', 'wave', 200000, 'W261121.AAA01', null, '41.202.10.5', 'Chrome');
  assert (select status from public.payments where id = p) = 'reussi', 'encaissement immédiat';
  assert (select amount_paid from public.invoices where id = v_k) = 200000, 'imputation';
  begin -- même transfert enregistré deux fois (autre avis, autre opérateur, casse différente)
    perform public.record_received_payment(v_owner, v_t, 'mobile_money', 'orange', 1000, 'w261121.aaa01', null, null, null);
    raise exception 'ÉCHEC : même transfert enregistré deux fois';
  exception when raise_exception then null;
  end;
  -- Comptable : virement sans preuve, immédiat (décision 3 du 21/11) ; le solde émet la quittance
  p := public.record_received_payment(v_acc, v_k, 'virement', null, 250000, null, 'SGCI-20261121-0042', null, null);
  assert (select status from public.invoices where id = v_k) = 'paye', 'avis soldé';
  assert (select count(*) from public.receipts where invoice_id = v_k) = 1, 'une quittance';
  assert (select payment_methods from public.receipts where invoice_id = v_k) = 'mobile_money+virement', 'modes de règlement';
  raise notice 'OK  P1.5 encaissement reçu : owner/accountant, immédiat, MM et virement, gestionnaire et espèces refusés, transfert unique';

  -- Locataire : « J'ai payé » sans n° de transaction (décision 1 a)
  p := public.submit_direct_payment('a0000000-0000-4000-8000-000000000004', v_t, 'orange', 100000, null, null, null, null, null);
  assert (select operator_txn_ref from public.payments where id = p) is null, 'déclaration sans n° acceptée';
  begin -- le bailleur ne peut pas enregistrer en double pendant qu'une déclaration attend
    perform public.record_received_payment(v_owner, v_t, 'mobile_money', 'orange', 100000, null, null, null, null);
    raise exception 'ÉCHEC : encaissement enregistré malgré une déclaration en attente';
  exception when raise_exception then null;
  end;
  raise notice 'OK  P1.5 locataire : déclaration sans n° de transaction ; pas de double saisie bailleur pendant l''attente';

end $$;
-- Les espèces (autre canal d'argent) ne sont pas bloquées par une déclaration en attente :
-- on solde l'avis en espèces puis on tente de confirmer la déclaration.
do $$
declare
  v_t uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002' and period = '2026-08-01');
  p uuid := (select id from public.payments where invoice_id = (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000002' and period = '2026-08-01') and status = 'en_attente_validation');
begin
  perform public.record_cash_payment('a0000000-0000-4000-8000-000000000001', v_t, (select amount_due - amount_paid from public.invoices where id = v_t), null, null);
  assert (select status from public.invoices where id = v_t) = 'paye', 'avis soldé en espèces';
  begin
    perform public.review_manual_payment('a0000000-0000-4000-8000-000000000001', p, true, null, null, null);
    raise exception 'ÉCHEC : déclaration confirmée sur un avis soldé';
  exception when raise_exception then
    assert sqlerrm like '%déjà soldé%', 'message inattendu : ' || sqlerrm;
  end;
  assert (select credit_amount from public.invoices where id = v_t) = 0, 'trop-perçu fantôme';
  assert public.review_manual_payment('a0000000-0000-4000-8000-000000000001', p, false, 'Déjà réglé en espèces au guichet', null, null) = 'rejete', 'rejet';
  raise notice 'OK  P1.5 confirmation refusée sur un avis soldé (rejet motivé possible), aucun trop-perçu fantôme';
end $$;
reset role;


-- =============================================================================
-- P1.6 — Coordonnées de réception : ré-authentification vérifiée en base
-- =============================================================================
-- Exécuté en superutilisateur : le test manipule private.* (expiration simulée, file
-- d'alertes), auquel service_role lui-même n'a pas accès.
do $$
declare r record;
begin
  begin -- sans code : refus, même pour le propriétaire
    perform public.add_receiving_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'mobile_money', 'AKWABA', 'AKWABA IMMOBILIER', null, null, 'moov', '2250101000222', null, null, null, null);
    raise exception 'ÉCHEC : ajout sans ré-authentification';
  exception when insufficient_privilege then
    assert sqlerrm like '%Ré-authentification requise%', 'message inattendu : ' || sqlerrm;
  end;

  -- avec code : accepté, en carence (l'organisation a déjà des comptes), alerte en file
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', '41.202.10.5', 'Chrome');
  select * into r from public.add_receiving_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
    'mobile_money', 'AKWABA', 'AKWABA IMMOBILIER', null, null, 'moov', '2250101000222', null, null, '41.202.10.5', 'Chrome');
  assert r.activates_at > now() + interval '47 hours', 'carence attendue';
  assert exists (select 1 from private.outbox o where o.kind = 'alerte_compte_reception'
                  and (o.payload ->> 'payout_account_id')::uuid = r.id and o.payload ->> 'coordonnee' = '****0222'), 'alerte absente ou non masquée';

  begin -- l'autorisation est à usage unique
    perform public.add_receiving_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'pispi_alias', 'AKWABA', null, null, null, null, null, '+2250707000111', null, null, null);
    raise exception 'ÉCHEC : autorisation réutilisée';
  exception when insufficient_privilege then null;
  end;

  -- autorisation expirée (plus de 5 minutes)
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null);
  update private.reauth_grants set granted_at = now() - interval '6 minutes' where consumed_at is null;
  begin
    perform public.add_receiving_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'pispi_alias', 'AKWABA', null, null, null, null, null, '+2250707000111', null, null, null);
    raise exception 'ÉCHEC : autorisation expirée acceptée';
  exception when insufficient_privilege then null;
  end;

  -- l'autorisation d'un autre utilisateur ne sert à rien
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000005', null, null); -- comptable
  begin
    perform public.add_receiving_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'pispi_alias', 'AKWABA', null, null, null, null, null, '+2250707000111', null, null, null);
    raise exception 'ÉCHEC : autorisation d''un autre utilisateur utilisée';
  exception when insufficient_privilege then null;
  end;
  begin -- et un comptable ré-authentifié reste interdit d'ajout (owner uniquement)
    perform public.add_receiving_account('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001',
      'pispi_alias', 'AKWABA', null, null, null, null, null, '+2250707000111', null, null, null);
    raise exception 'ÉCHEC : un comptable ajoute une coordonnée';
  exception when insufficient_privilege then null;
  end;

  -- alias PI-SPI (SHID) et lien marchand en liste blanche
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null);
  perform public.add_receiving_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
    'pispi_alias', 'AKWABA', 'AKWABA IMMOBILIER', null, null, null, null, '6f1c2b8e-1d2a-4b3c-8d4e-123456789abc', null, null, null);
  insert into public.allowed_payment_link_hosts (host, operator) values ('pay.exemple-operateur.ci', 'wave');
  perform public.grant_reauth('a0000000-0000-4000-8000-000000000001', null, null);
  perform public.add_receiving_account('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
    'payment_link', 'AKWABA', null, null, null, 'wave', null, null, 'https://pay.exemple-operateur.ci/m/akwaba', null, null);
  delete from public.allowed_payment_link_hosts;

  begin
    perform public.grant_reauth('00000000-0000-4000-8000-00000000dead', null, null);
    raise exception 'ÉCHEC : autorisation pour un utilisateur inexistant';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  P1.6 ré-authentification en base : obligatoire, usage unique, 5 min, non transférable ; alerte en file ; tous types de compte';
end $$;
do $$ begin
  assert has_function_privilege('service_role', 'public.grant_reauth(uuid, inet, text)', 'execute'), 'serveur : grant_reauth';
  assert not has_schema_privilege('service_role', 'private', 'usage'), 'service_role ne doit pas accéder au schéma private';
  assert not has_function_privilege('authenticated', 'public.grant_reauth(uuid, inet, text)', 'execute'), 'grant_reauth exposé';
  assert not has_table_privilege('authenticated', 'private.reauth_grants', 'select'), 'reauth_grants lisible';
  assert not has_table_privilege('authenticated', 'private.outbox', 'select'), 'outbox lisible';
  assert exists (select 1 from public.audit_logs where action = 'reauthentification' and host(ip) = '41.202.10.5'), 'ré-authentification non tracée';
end $$;


-- =============================================================================
-- D.1 — Avis d'échéance signés et vérifiables
-- =============================================================================
set role service_role;
select public.generate_monthly_invoices('2026-09-01') \g /dev/null
do $$
declare
  v_inv uuid := (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-000000000001' and period = '2026-09-01');
  n1 uuid; n2 uuid;
begin
  begin
    perform public.issue_notice('a0000000-0000-4000-8000-000000000004', v_inv, null, null); -- autre locataire
    raise exception 'ÉCHEC : avis émis pour un tiers';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.issue_notice('b0000000-0000-4000-8000-000000000001', v_inv, null, null); -- propriétaire d'une autre organisation
    raise exception 'ÉCHEC : avis émis par une autre organisation';
  exception when insufficient_privilege then null;
  end;
  n1 := public.issue_notice('a0000000-0000-4000-8000-000000000003', v_inv, '41.66.1.2', 'Android'); -- locataire
  n2 := public.issue_notice('a0000000-0000-4000-8000-000000000002', v_inv, null, null);             -- gestionnaire
  assert n1 = n2, 'émission non idempotente';
  raise notice 'OK  D.1 émission : locataire ou membre de l''organisation, idempotente, refusée aux tiers';
end $$;
reset role;
do $$
declare
  n public.notices := (select x from public.notices x limit 1);
  v record;
begin
  select * into v from public.verify_notice(n.id, left(n.signature, 16));
  assert v.verdict = 'authentique', 'verdict attendu authentique : ' || v.verdict;
  assert v.tenant_masked = 'Ko***** J.-M.', 'nom non masqué : ' || coalesce(v.tenant_masked, '');
  assert v.amount_due = 450000 and v.payment_reference like 'LOYER-2026-09-VCR01-%', 'contenu';
  select * into v from public.verify_notice(n.id, '0000000000000000');
  assert v.verdict = 'invalide' and v.landlord_name is null, 'code faux accepté';
  select * into v from public.verify_receipt(n.id, left(n.signature, 16));
  assert v.verdict = 'invalide', 'un avis passe pour une quittance';
  begin
    update public.notices set amount_due = 45000 where id = n.id;
    raise exception 'ÉCHEC : avis modifiable';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.notices where id = n.id;
    raise exception 'ÉCHEC : avis supprimable';
  exception when insufficient_privilege then null;
  end;
end $$;
alter table public.notices disable trigger notices_immutable;
update public.notices set landlord_name = 'ESCROC SARL';
alter table public.notices enable trigger notices_immutable;
do $$
declare n public.notices := (select x from public.notices x limit 1); v record;
begin
  select * into v from public.verify_notice(n.id, left(n.signature, 16));
  assert v.verdict = 'alteree', 'altération de l''avis non détectée : ' || v.verdict;
end $$;
alter table public.notices disable trigger notices_immutable;
update public.notices set landlord_name = 'Akwaba Immobilier';
alter table public.notices enable trigger notices_immutable;
update public.invoices set status = 'annule' where id = (select invoice_id from public.notices limit 1);
do $$
declare n public.notices := (select x from public.notices x limit 1); v record;
begin
  select * into v from public.verify_notice(n.id, left(n.signature, 16));
  assert v.verdict = 'annulee', 'avis annulé non signalé : ' || v.verdict;
  assert not has_function_privilege('anon', 'public.verify_notice(uuid, text)', 'execute'), 'verify_notice exposé à anon';
  assert not has_function_privilege('authenticated', 'public.issue_notice(uuid, uuid, inet, text)', 'execute'), 'issue_notice exposé';
  raise notice 'OK  D.1 vérification : authentique, code faux refusé, altération détectée, annulation signalée, immuable, distinct des quittances';
end $$;
update public.invoices set status = 'a_payer' where id = (select invoice_id from public.notices limit 1);
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000004';
do $$ begin
  assert (select count(*) from public.notices) = 0, 'un locataire lit l''avis d''un autre';
end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.notices) = 1, 'le locataire doit lire son avis';
  raise notice 'OK  D.1 RLS : le locataire ne lit que ses avis';
end $$;
reset role;


-- =============================================================================
-- D.2 — Suivi des envois de documents
-- =============================================================================
set role service_role;
do $$
declare
  v_inv uuid := (select invoice_id from public.notices limit 1);
  v_paid uuid := (select invoice_id from public.receipts where status = 'valide' limit 1);
  v_nonotice uuid := (select id from public.invoices i where not exists (select 1 from public.notices n where n.invoice_id = i.id)
                        and i.org_id = 'c0000000-0000-4000-8000-000000000001' limit 1);
begin
  begin -- locataire : jamais
    perform public.mark_document_sent('a0000000-0000-4000-8000-000000000003', v_inv, 'avis', 'whatsapp', null, null);
    raise exception 'ÉCHEC : un locataire enregistre un envoi';
  exception when insufficient_privilege then null;
  end;
  begin -- autre organisation
    perform public.mark_document_sent('b0000000-0000-4000-8000-000000000001', v_inv, 'avis', 'whatsapp', null, null);
    raise exception 'ÉCHEC : envoi enregistré par une autre organisation';
  exception when insufficient_privilege then null;
  end;
  begin -- document non émis
    perform public.mark_document_sent('a0000000-0000-4000-8000-000000000001', v_nonotice, 'avis', 'partage', null, null);
    raise exception 'ÉCHEC : envoi d''un avis non émis';
  exception when raise_exception then null;
  end;
  perform public.mark_document_sent('a0000000-0000-4000-8000-000000000002', v_inv, 'avis', 'whatsapp', '41.202.10.7', 'Android'); -- gestionnaire
  perform public.mark_document_sent('a0000000-0000-4000-8000-000000000005', v_paid, 'quittance', 'partage', null, null);      -- comptable
  raise notice 'OK  D.2 envois : membres de l''organisation seulement, document émis requis, avis et quittance';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.document_deliveries) = 2, 'deux envois attendus';
  assert exists (select 1 from public.audit_logs where action = 'document_envoye' and metadata ->> 'canal' = 'whatsapp'), 'envoi non tracé';
  begin
    delete from public.document_deliveries;
    raise exception 'ÉCHEC : trace d''envoi supprimable';
  exception when insufficient_privilege then null;
  end;
end $$;
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.document_deliveries) = 0, 'un locataire lit le suivi des envois';
  raise notice 'OK  D.2 suivi : trace en ajout seul, auditée, invisible des locataires';
end $$;
reset role;


-- =============================================================================
-- D.4 — Sortie du parc : avis de départ, rappel, suppression du compte à M+3
-- =============================================================================
-- Locataire dédié au test : un bail terminé il y a 50 jours.
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-0000000000d4', 'ancien.locataire@example.ci');
insert into public.tenants (id, org_id, user_id, full_name, phone) values
  ('e0000000-0000-4000-8000-0000000000d4', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000d4', 'Ancien Locataire', '2250707777666');
insert into public.properties (id, org_id, code, label, type, commune) values
  ('d0000000-0000-4000-8000-0000000000d4', 'c0000000-0000-4000-8000-000000000001', 'OLD01', 'Studio', 'studio', 'Treichville');
insert into public.leases (id, org_id, property_id, tenant_id, rent_amount, start_date) values
  ('f0000000-0000-4000-8000-0000000000d4', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000d4', 'e0000000-0000-4000-8000-0000000000d4', 60000, '2025-01-01');
set role service_role;
select public.generate_monthly_invoices('2026-10-01') \g /dev/null
reset role;
-- Une déclaration du locataire (ne doit pas bloquer la suppression du compte)
set role service_role;
select public.submit_transfer_proof('a0000000-0000-4000-8000-0000000000d4',
  (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-0000000000d4' and period = '2026-10-01'), 60000, null,
  'c0000000-0000-4000-8000-000000000001/' || (select id from public.invoices where lease_id = 'f0000000-0000-4000-8000-0000000000d4' and period = '2026-10-01') || '/' || gen_random_uuid() || '.pdf',
  'VIR-' || gen_random_uuid(), null, null) \g /dev/null
reset role;
do $$
declare r record;
begin
  -- Bail encore actif : rien
  select * into r from public.process_tenant_retention();
  assert not exists (select 1 from private.outbox where payload ->> 'user_id' = 'a0000000-0000-4000-8000-0000000000d4'), 'bail actif : aucune action attendue';

  update public.leases set status = 'termine' where id = 'f0000000-0000-4000-8000-0000000000d4';
  assert (select ended_at from public.leases where id = 'f0000000-0000-4000-8000-0000000000d4') is not null, 'ended_at non posé';
  -- J0 : avis de départ, une seule fois
  perform public.process_tenant_retention();
  perform public.process_tenant_retention();
  assert (select count(*) from private.outbox where kind = 'depart_locataire' and payload ->> 'user_id' = 'a0000000-0000-4000-8000-0000000000d4') = 1, 'avis de départ unique attendu';
  -- M+2 : rappel
  perform public.process_tenant_retention(now() + interval '2 months 1 day');
  assert (select count(*) from private.outbox where kind = 'rappel_suppression_compte' and payload ->> 'user_id' = 'a0000000-0000-4000-8000-0000000000d4') = 1, 'rappel attendu';
  -- M+3 : suppression du compte, documents conservés
  select * into r from public.process_tenant_retention(now() + interval '3 months 1 day');
  assert r.suppressions >= 1, 'suppression attendue';
  assert not exists (select 1 from auth.users where id = 'a0000000-0000-4000-8000-0000000000d4'), 'compte non supprimé';
  assert (select user_id from public.tenants where id = 'e0000000-0000-4000-8000-0000000000d4') is null, 'lien du locataire non retiré';
  assert exists (select 1 from public.invoices where tenant_id = 'e0000000-0000-4000-8000-0000000000d4'), 'avis supprimés';
  assert exists (select 1 from public.payments p join public.invoices i on i.id = p.invoice_id
                  where i.tenant_id = 'e0000000-0000-4000-8000-0000000000d4' and p.declared_by is null), 'déclaration perdue';
  assert exists (select 1 from public.audit_logs where action = 'compte_locataire_supprime'
                  and entity_id = 'a0000000-0000-4000-8000-0000000000d4' and actor_kind = 'system'), 'suppression non tracée';
  -- Un membre d'organisation n'est jamais supprimé ; les locataires en cours non plus
  assert exists (select 1 from auth.users where id = 'a0000000-0000-4000-8000-000000000001'), 'propriétaire supprimé !';
  assert exists (select 1 from auth.users where id = 'a0000000-0000-4000-8000-000000000003'), 'locataire en cours supprimé !';
  raise notice 'OK  D.4 sortie du parc : avis de départ unique, rappel M+2, compte supprimé à M+3, documents et paiements conservés, membres épargnés';
end $$;
do $$ begin
  assert not has_function_privilege('authenticated', 'public.process_tenant_retention(timestamptz)', 'execute'), 'rétention exposée';
end $$;


-- =============================================================================
-- D.5 — Comptage des envois, plafonds anti-abus, récapitulatif de facturation
-- =============================================================================
do $$ begin
  assert (select count(*) from public.message_events where source = 'manuel' and not billable) >= 2, 'envois manuels non comptés';
end $$;
insert into public.org_message_quotas (org_id, sms_daily) values ('c0000000-0000-4000-8000-000000000001', 2)
  on conflict (org_id) do update set sms_daily = 2;
set role service_role;
do $$ begin
  perform public.reserve_automated_message('c0000000-0000-4000-8000-000000000001', 'sms');
  perform public.reserve_automated_message('c0000000-0000-4000-8000-000000000001', 'sms');
  begin
    perform public.reserve_automated_message('c0000000-0000-4000-8000-000000000001', 'sms');
    raise exception 'ÉCHEC : plafond quotidien SMS dépassé';
  exception when raise_exception then
    assert sqlerrm like '%Plafond quotidien%', 'message inattendu : ' || sqlerrm;
  end;
  perform public.reserve_automated_message('c0000000-0000-4000-8000-000000000001', 'otp'); -- autre plafond
  perform public.reserve_automated_message('c0000000-0000-4000-8000-000000000002', 'sms'); -- autre organisation
  begin
    perform public.reserve_automated_message('c0000000-0000-4000-8000-000000000001', 'whatsapp');
    raise exception 'ÉCHEC : envoi manuel réservé comme automatique';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  D.5 plafonds : quotidien par organisation et par type, appliqué en base';
end $$;
reset role;
do $$ begin
  begin
    insert into public.message_events (org_id, kind, source, billable) values ('c0000000-0000-4000-8000-000000000001', 'whatsapp', 'manuel', true);
    raise exception 'ÉCHEC : envoi manuel facturable';
  exception when check_violation then null;
  end;
  begin
    delete from public.message_events;
    raise exception 'ÉCHEC : registre des envois modifiable';
  exception when insufficient_privilege then null;
  end;
end $$;
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
do $$
declare v bigint;
begin
  select total into v from public.message_usage_summary('c0000000-0000-4000-8000-000000000001', current_date)
   where kind = 'sms' and billable;
  assert v = 2, 'récapitulatif SMS facturables : ' || coalesce(v, -1);
end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';
do $$ begin
  perform public.message_usage_summary('c0000000-0000-4000-8000-000000000001', current_date);
  raise exception 'ÉCHEC : un gestionnaire lit la consommation';
exception when insufficient_privilege then null;
end $$;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
do $$ begin
  assert (select count(*) from public.message_events) = 0, 'un locataire lit le registre';
  raise notice 'OK  D.5 registre : ajout seul, manuel jamais facturable, récapitulatif owner/comptable, invisible des autres';
end $$;
reset role;


-- =============================================================================
-- P2.1 — Biens
-- =============================================================================
set role service_role;
do $$
declare v uuid;
begin
  begin
    perform public.create_property('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001',
      'APT40', 'Appartement', 'appartement', 'Abidjan', 'Koumassi', null, null, null, null);
    raise exception 'ÉCHEC : un comptable crée un bien';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_property('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'APT40', 'Appartement', 'appartement', 'Abidjan', 'Koumassi', null, null, null, null);
    raise exception 'ÉCHEC : création dans une autre organisation';
  exception when insufficient_privilege then null;
  end;
  v := public.create_property('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
    ' apt40 ', 'Appartement 2 pièces', 'appartement', '', 'Koumassi', 'Remblais', null, '41.202.10.8', 'Chrome');
  assert (select code || '|' || city from public.properties where id = v) = 'APT40|Abidjan', 'normalisation';
  begin
    perform public.create_property('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'APT40', 'Doublon', 'appartement', 'Abidjan', 'Koumassi', null, null, null, null);
    raise exception 'ÉCHEC : code de bien en double';
  exception when raise_exception then null;
  end;
  begin
    perform public.create_property('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
      'A B', 'Code invalide', 'appartement', 'Abidjan', 'Koumassi', null, null, null, null);
    raise exception 'ÉCHEC : code de bien invalide';
  exception when check_violation then null;
  end;
  perform public.update_property('a0000000-0000-4000-8000-000000000001', v, 'APT40', 'Appartement 3 pièces', 'appartement',
    'Abidjan', 'Koumassi', 'Remblais', 'Rue 12', null, null);
  begin
    perform public.update_property('a0000000-0000-4000-8000-000000000005', v, 'APT40', 'X', 'appartement', 'Abidjan', 'Koumassi', null, null, null, null);
    raise exception 'ÉCHEC : un comptable modifie un bien';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  P2.1 biens : owner/manager seulement, normalisation, code unique et valide';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.audit_logs where action = 'bien_modifie'
                  and metadata -> 'avant' ->> 'libelle' = 'Appartement 2 pièces' and metadata -> 'apres' ->> 'libelle' = 'Appartement 3 pièces'),
    'modification de bien non tracée (avant/après)';
  assert exists (select 1 from public.audit_logs where action = 'bien_cree' and host(ip) = '41.202.10.8'), 'création non tracée';
end $$;

\echo '=== TOUS LES SCÉNARIOS DE SÉCURITÉ SONT PASSÉS ==='
