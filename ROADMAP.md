# ROADMAP — Suite du développement de LoyerCI (pour Claude Code)

> Lire d'abord `CLAUDE.md` (invariants et commandes), `docs/ANALYSE.md` et `docs/ETUDE-PAIEMENT-DIRECT.md`.
> Exécuter les tâches **dans l'ordre**. Chaque tâche = un commit `Px.y: …`. Une tâche n'est terminée que si
> `npm run typecheck && npm test && npm run test:db && npm run build` passent et que ses critères d'acceptation sont vérifiés.
> En cas de doute métier ou réglementaire, **s'arrêter et poser la question** plutôt qu'inventer une règle.

## État actuel (point de départ)

| Fait ✅ | À faire ⏳ |
|---|---|
| Schéma, RLS, fonctions métier, audit chaîné, quittances signées (34 scénarios SQL) | Jamais exécuté sur un vrai Supabase (`supabase start`) |
| Tableau de bord propriétaire (KPIs, avis, partage WhatsApp/SMS/e-mail, virements à valider, espèces, temps réel) | CRUD biens / locataires / baux, paramètres, membres |
| Paiement locataire : Mobile Money via CinetPay, virement + preuve | **Paiement direct sans agrégateur** (nouvelle stratégie) |
| Webhook HMAC + revérification + idempotence ; page `/verify` ; PDF de quittance | OTP SMS, notifications, durcissement production, PI-SPI API Business |

Décision produit du 18/11/2026 : **CinetPay devient optionnel et désactivé par défaut** ; le paiement direct vers les comptes du bailleur devient le mode Mobile Money par défaut.

---

## Phase 0 — Mise en route et filet de sécurité (prérequis)

### P0.1 Démarrer le projet sur Supabase local
- `supabase init` (si besoin), `supabase start`, `supabase db reset`, `cp .env.example .env.local`, `npm run seed`, `npm run dev`.
- Corriger tout ce qui casse : migration `*_platform.sql` (bucket, publication `supabase_realtime`, `pg_cron`), `scripts/seed.ts`, embeddings PostgREST (`tenants(...)`, `leases(properties(...))`, `organizations(name)`, `payments(...)`).
- **Acceptation** : connexion par lien magique (Mailpit sur `:54324`) comme propriétaire, puis comme locataire. Le tableau de bord affiche les KPIs du seed. Kouassi peut télécharger sa quittance PDF, dont le QR mène à `/verify` en vert. Un événement Realtime (validation d'un virement depuis un 2e onglet) rafraîchit le tableau de bord.

### P0.2 Types générés
- `npx supabase gen types typescript --local > src/types/supabase.ts` ; typer les trois clients (`createServerClient<Database>`, etc.) ; supprimer les `overrideTypes` devenus inutiles.
- **Acceptation** : `typecheck` passe sans `any` implicite sur les requêtes.

### P0.3 Lint et format
- ESLint (`eslint-config-next`, règles `@typescript-eslint/no-floating-promises`, `no-restricted-imports` interdisant `@/lib/supabase/admin` dans les fichiers `"use client"`) et Prettier. Script `npm run lint`.

### P0.4 Tests de bout en bout (Playwright)
- `tests/e2e/` contre l'environnement local seedé. Parcours : connexion propriétaire, KPIs, clic WhatsApp (vérifier l'URL `wa.me` et l'**absence** d'IBAN ou de numéro dans le texte), validation d'un virement → quittance ; locataire : déclaration de virement avec fichier ; `/verify` avec un code correct puis faux.
- Captures mobiles (390 px) et desktop jointes aux artefacts CI.

### P0.5 Intégration continue
- GitHub Actions : `lint`, `typecheck`, `test`, `test:db` (service PostgreSQL ou `initdb` dans le job), `build`, puis e2e dans un job séparé avec `supabase start`. `npm audit --omit=dev` en avertissement.

---

## Phase 1 — Paiement direct sans agrégateur (priorité produit)

Référence : `docs/ETUDE-PAIEMENT-DIRECT.md` §5. **Aucune modification des migrations existantes** : tout passe par de nouvelles migrations.

### P1.1 Migration « paiement direct »
- Enum `payment_provider` : ajouter `direct`. Enum `payout_kind` : ajouter `pispi_alias` et `payment_link`.
- `payout_accounts` : colonnes `pispi_alias` (téléphone `+225XXXXXXXXXX` ou SHID UUID v4), `payment_link_url` (https, hôtes en liste blanche à définir dans une table `allowed_payment_link_hosts`), `display_name_expected`. Remplacer la contrainte `CHECK` par type. Le régime de carence et la règle « ajout seul » restent inchangés.
- `payments` : `operator_txn_ref text`, `payer_msisdn text` (format CI). Index unique partiel `(operator, upper(operator_txn_ref)) where provider = 'direct'`. Adapter les `CHECK` (preuve facultative pour `direct`).
- Table `operator_ref_formats(operator, pattern, example, updated_at)`, en lecture pour `authenticated` et écriture `service_role`. Valeurs initiales **permissives** (`^[A-Za-z0-9._-]{6,40}$`) avec un `TODO` : à resserrer avec les formats relevés au pilote.
- Table `org_payment_settings(org_id PK, direct_enabled bool default true, cinetpay_enabled bool default false, transfer_enabled bool default true, fees_notice text)` : RLS en lecture pour les membres et locataires de l'organisation, écriture via fonction (`owner`).
- Nouvelles actions d'audit : `paiement_direct_declare`, `paiement_direct_confirme`, `paiement_direct_rejete`, `parametres_paiement_modifies`, `affiche_guichet_generee`.
- **Tests SQL** : référence de transaction réutilisée → violation ; un locataire ne lit que les comptes effectifs de **son** bailleur via une fonction dédiée ; un alias PI-SPI au mauvais format est refusé.

### P1.2 Fonctions SQL
- `get_direct_payment_instructions(p_invoice)` (`authenticated`, définie comme `get_transfer_instructions`) : comptes effectifs par opérateur, alias PI-SPI, liens marchands, nom attendu, reste dû, référence, `fees_notice`.
- `submit_direct_payment(p_actor, p_invoice, p_operator, p_amount, p_txn_ref, p_payer_msisdn, p_proof_path, p_ip, p_ua)` (`service_role`) : appartenance, avis payable, montant ≤ reste dû, au plus 3 déclarations en attente, format de référence contrôlé par `operator_ref_formats`, statut `en_attente_validation`, audit.
- Renommer fonctionnellement `review_transfer` en **`review_manual_payment`** (nouvelle fonction ; l'ancienne devient un simple appel à la nouvelle pour compatibilité), qui couvre `virement` et `direct`, avec les mêmes règles (séparation des tâches, motif de rejet ≥ 5 caractères, idempotence).
- `set_payment_settings(p_actor, p_org, …)` (`owner`).
- **Tests SQL** : double validation → `deja_traite` ; un gestionnaire ne peut pas valider ; un paiement direct confirmé solde l'avis et émet **une** quittance ; un rejet n'émet rien.

### P1.3 Paiement direct côté locataire
- `src/app/(tenant)/pay/[invoiceId]/payment-panel.tsx` : l'onglet « Mobile Money » propose le **paiement direct** si `direct_enabled`, et CinetPay seulement si `cinetpay_enabled` (sinon le bouton CinetPay n'est pas rendu).
- Étapes : 1) choix de l'opérateur du locataire ; 2) carte « Envoyez à » : numéro ou alias à copier, **nom attendu en gros caractères** (« Vérifiez que votre application affiche ce nom avant de valider »), montant, référence, frais à la charge du locataire selon `fees_notice` ; si le bailleur n'a pas de compte sur ce réseau, proposer l'alias PI-SPI (transfert interopérable) ; 3) raccourcis : lien marchand s'il existe, sinon bouton `tel:` vers le menu USSD de l'opérateur **derrière un drapeau de fonctionnalité** désactivé tant que le pilote ne l'a pas validé ; 4) formulaire « J'ai payé » (Server Action `submitDirectPayment`, Zod, débit 3 / 10 min, capture facultative passée par `sniffProof`).
- **Aucun QR** dans cette page (invariant n°8). Ajouter un test unitaire ou e2e qui échoue si le HTML de `/pay/*` contient `int.bceao.pi`.
- **Acceptation** : sur mobile 390 px, le parcours complet tient en 2 écrans ; numéro et référence se copient en un tap ; après envoi, l'historique affiche « En attente de confirmation du bailleur ».

### P1.4 « Paiements à confirmer » côté bailleur
- `pending-transfers.tsx` devient `pending-payments.tsx` : virements et paiements directs (icône opérateur, n° de transaction, numéro payeur masqué sauf les 4 derniers chiffres, capture si fournie).
- Action `reviewManualPayment` remplaçant `reviewTransfer`.
- Relance : si une déclaration reste en attente plus de 48 h, un badge rouge apparaît et une notification est envoyée (Phase 3).

### P1.5 Assistant de rapprochement « Collez le SMS »
- `src/lib/reconciliation/parsers/{orange,mtn,moov,wave,pispi}.ts` : fonctions pures `parse(text) → { amount, payerMsisdn?, txnRef?, date? } | null`.
- **Ne pas inventer de format** : livrer des analyseurs génériques (montant en FCFA, numéro à 10 chiffres, jeton alphanumérique ressemblant à une référence) et une structure de tests `tests/fixtures/sms/<operateur>/*.txt` **vide**, avec un README demandant des échantillons anonymisés réels. Les analyseurs spécifiques seront ajoutés quand les échantillons seront fournis.
- Fonction SQL `match_manual_payments(p_actor, p_org, p_amount, p_txn_ref, p_payer_msisdn)` : renvoie les candidats classés, **sans rien valider**.
- Interface : zone de collage dans « Paiements à confirmer » → surligne le candidat → bouton « Confirmer ». Seule l'empreinte SHA-256 du texte collé est conservée (dans les métadonnées d'audit), jamais le texte.

### P1.6 Paramètres de réception des fonds
- Page `src/app/(owner)/dashboard/parametres/paiements/page.tsx` (`owner`) : liste des comptes (RIB, Wave, OM, MoMo, Moov, alias PI-SPI, liens marchands) avec statut « actif / effectif le … / révoqué », ajout et révocation via les fonctions existantes, interrupteurs `direct` / `cinetpay` / `virement`, texte d'information sur les frais.
- **Ré-authentification** avant tout ajout (OTP e-mail ou SMS de moins de 5 minutes, vérifié côté serveur) ; e-mail et SMS d'alerte « Nouveau compte de réception, actif le … » ; lien d'annulation en un clic.
- Validation Zod : IBAN (clé mod 97, déjà présente), numéros CI, SHID UUID v4, URL de lien marchand en liste blanche.

### P1.7 Affiche de guichet PI-SPI (présentiel uniquement)
- `npm i @pi-spi/qrcode` (MIT, utilisé par la démo officielle BCEAO). Vérifier l'API réelle du paquet avant usage ; à défaut, implémenter la payload EMV dans `src/lib/payments/pispi-qr.ts` (champ 36 avec `int.bceao.pi` et SHID, 52 = `0000`, 53 = `952`, 58 = `CI`, 62-05 = référence, 62-11 = canal statique marchand, CRC16-CCITT `0x1021` / `0xFFFF`) et la tester sur l'exemple officiel (CRC attendu `9618` pour la payload d'exemple de la BCEAO).
- Route `GET /api/pispi-poster` (`owner`/`manager`) : PDF A5 avec QR statique **sans montant**, nom du bénéficiaire, consigne « indiquez la référence de votre avis », mention « usage au guichet uniquement ». Audit `affiche_guichet_generee`.
- **Acceptation** : la payload générée est validée par le validateur de la démo BCEAO (contrôle manuel documenté dans la PR).

### P1.8 Documentation et nettoyage
- Mettre à jour `README.md`, `docs/ANALYSE.md` §2.1-4 (état PI-SPI de novembre 2026) et le seed (comptes Wave/OM du bailleur, une déclaration directe en attente, une confirmée).

---

## Phase 2 — Gestion courante (CRUD)

### P2.1 Biens
- `dashboard/biens` : liste, fiche, création, modification (`owner`/`manager`) via des fonctions SQL `create_property` / `update_property` (audit `bien_cree`/`bien_modifie` à ajouter). Champs : type, code (unique par organisation), commune/quartier (liste des communes d'Abidjan + saisie libre pour l'intérieur), adresse.
### P2.2 Locataires et invitation
- Fiche locataire (sans pièce d'identité stockée). **Invitation** : lien à usage unique (jeton aléatoire haché en base, expiration 7 jours) envoyé par WhatsApp/SMS. À l'ouverture, création ou liaison du compte → `tenants.user_id`. Audit `locataire_invite`, `locataire_lie`.
### P2.3 Baux
- Formulaire utilisant `create_lease` (plafonds légaux déjà en base : afficher le message de la loi n° 2019-576 en cas de refus). Résiliation (`bail_resilie`), fin de bail, prorata du premier mois (règle à faire **valider par le porteur de projet** avant implémentation).
### P2.4 Avis d'échéance
- Génération manuelle « Générer les avis du mois » (`owner`/`manager`), annulation d'un avis avec motif (nouvelle fonction ; statut `annule` ; jamais de suppression).
- Annulation d'une quittance (`owner` uniquement, motif obligatoire) : le trigger d'immuabilité l'autorise déjà ; ajouter la fonction et l'audit.
### P2.5 Membres et rôles
- Invitation de gestionnaires et comptables, changement de rôle, retrait (au moins un `owner` doit rester). Sélecteur d'organisation si l'utilisateur en a plusieurs.
### P2.6 Journal d'audit consultable
- `dashboard/audit` (`owner`) : filtrage par action, période et acteur ; export CSV ; indicateur d'intégrité de la chaîne (`private.verify_audit_chain()` via une fonction exposée au rôle `owner`).

---

## Phase 3 — Authentification et notifications

### P3.1 OTP SMS
- Supabase Phone Auth avec un fournisseur SMS couvrant la Côte d'Ivoire (choix à faire valider : coût et délivrabilité). Connexion par numéro pour les locataires (cas majoritaire), lien magique conservé pour l'e-mail.
### P3.2 Notifications transactionnelles
- File `notifications` (table + Edge Function ou tâche planifiée) : avis disponible, paiement déclaré (vers le bailleur), paiement confirmé ou rejeté (vers le locataire), quittance disponible, changement de compte de réception (alerte), déclaration en attente depuis plus de 48 h.
- Canaux : e-mail (Resend ou SMTP), SMS. WhatsApp Business API en option (coût par conversation à évaluer). Les liens `wa.me` existants restent l'option gratuite et manuelle.
### P3.3 Relances automatiques
- J-3, J+3, J+10 (configurables par organisation), via `pg_cron` et la file de notifications. Contenu sans aucune coordonnée de paiement (invariant n°9).

---

## Phase 4 — Durcissement avant production

1. **P4.1 Limiteur de débit distribué** : remplacer le stockage de `src/lib/security/rate-limit.ts` par Redis (ex. Upstash), sans changer l'interface `limit()`.
2. **P4.2 Réconciliation de secours** (si CinetPay est activé) : tâche horaire qui interroge `/v2/payment/check` pour les intentions `initie` de plus de 30 minutes.
3. **P4.3 Rétention** : purge des `webhook_events` après 90 jours ; preuves de paiement après N années (durée à valider avec le porteur de projet pour la conformité ARTCI et comptable).
4. **P4.4 Audit hors base** : export quotidien signé de `audit_logs` vers un stockage WORM externe ; alerte si `verify_audit_chain()` renvoie une ligne.
5. **P4.5 Observabilité** : Sentry (en filtrant toute donnée personnelle), journaux structurés, `report-to` pour la CSP.
6. **P4.6 Sauvegardes et reprise** : PITR Supabase, procédure de restauration testée.
7. **P4.7 Revue de sécurité** : `npm audit`, en-têtes (securityheaders.com), tests d'intrusion externes ; checklist RLS (chaque table a RLS et aucune politique d'écriture).
8. **P4.8 Conformité** : dossier ARTCI (loi n° 2013-450), mentions légales, politique de confidentialité, CGU bailleur et locataire (y compris « LoyerCI ne détient jamais les fonds »).

---

## Phase 5 — Confirmation automatique sans agrégateur

### P5.1 Adaptateur PI-SPI API Business
- **Prérequis externe** : un établissement participant qui ouvre l'API Business au bailleur (certificat, éventuellement mTLS). Ne pas commencer sans ces accès ; développer d'abord contre le **bac à sable** `developer.pispi.bceao.int`.
- Implémenter `PaymentProvider` (`src/lib/payments/pispi.ts`) : *demande de paiement* (le locataire saisit son alias, il reçoit la demande dans son application), webhooks signés (vérification de signature, rejeu, idempotence comme pour CinetPay), revérification par l'API avant `confirm_provider_payment`.
- Rappel : pas de prélèvement automatique, pas de QR à distance.
### P5.2 Adaptateur Wave Business (option)
- Uniquement si un bailleur dispose de l'API Wave Business ; même contrat `PaymentProvider`.

---

## Phase 6 — Fonctionnalités produit

- **P6.1** Quittance annuelle récapitulative (PDF, mêmes garanties de signature).
- **P6.2** Gestion de la caution : encaissement initial, restitution en fin de bail, retenues motivées.
- **P6.3** Exports comptables (CSV mensuel par bailleur), revenus fonciers annuels.
- **P6.4** Vue multi-bailleurs pour les agences (mandats de gestion, commission d'agence, reversements **effectués hors plateforme**).
- **P6.5** Mode hors ligne amélioré : file de déclarations différées (sans stocker de donnée financière en cache).

---

## Décisions arbitrées (18/11/2026)

- **Inscription** : invitation seule, inscription publique désactivée dans Supabase Auth.
- **Espèces** : au-delà d'un seuil par organisation (défaut 100 000 FCFA), un encaissement déclaré par un comptable attend la confirmation d'un `owner` avant la quittance (à intégrer à `review_manual_payment` en P1.2) ; notification au locataire (P3.2).
- **Hébergement** : Supabase en région UE (Francfort ou Paris) et Vercel, avec dossier de transfert ARTCI (P4.8).

## Questions ouvertes (à trancher par le porteur de projet)

1. Périmètre exact de l'interdiction du QR PI-SPI à distance : une affiche dans le hall d'un immeuble compte-t-elle comme « présence physique » ? (à confirmer auprès de la BCEAO ou d'un participant)
2. Formats réels des n° de transaction et des SMS par opérateur (échantillons anonymisés nécessaires pour P1.5).
3. Fournisseur SMS (P3.1) et budget des notifications.
4. Politique de prorata, de pénalités de retard (attention au cadre légal) et durées de conservation.
5. Modèle économique de LoyerCI (abonnement bailleur ?), qui ne doit **jamais** reposer sur la détention des loyers.
