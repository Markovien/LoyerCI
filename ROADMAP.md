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

**Recentrage produit du 21/11/2026 (à lire avant toute tâche).** LoyerCI est avant tout un **outil de gestion intégré pour le bailleur** (propriétaire, gestionnaire, comptable). Une large part des locataires est peu à l'aise avec l'outil informatique (environ 48 % de la population est analphabète) : **l'effort repose sur le bailleur**. Pour le locataire, l'essentiel est de **recevoir et retrouver ses avis d'échéance et ses quittances**. Il ne doit jamais être bloqué par un formulaire. Conséquences : seul le bailleur atteste la réception des fonds (le locataire peut prévenir, sans obligation) ; le rapprochement automatique viendra plus tard (phase 5) ; nouvelle phase D « Documents » ; ordre d'exécution révisé ci-dessous.

**Ordre d'exécution révisé :** P1.5 (révisé) → P1.6 → Phase D → Phase 2 → P1.7 → P1.8 → Phase 3 (allégée) → Phase 4 → Phase 5 → Phase 6.

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

### P1.5 (révisé le 21/11/2026) « Encaissement reçu » côté bailleur
> L'ancien « assistant de collage de SMS » est **reporté** au chantier d'automatisation (phase 5) : le bailleur confirme lui-même la réception, en consultant son propre compte.
- Fonction `record_received_payment` (`owner` ou `accountant`) : le bailleur enregistre un loyer reçu en **Mobile Money** (opérateur, n° de transaction **facultatif**, lu dans SON historique) ou par **virement** (référence bancaire facultative), **sans déclaration préalable du locataire**. Imputation **immédiate**, y compris par un comptable (décision du 21/11 : traçable chez l'opérateur ou la banque, contrairement aux espèces). L'unicité du n° de transaction s'applique : on ne peut pas enregistrer deux fois le même transfert, ni enregistrer un transfert déjà déclaré par le locataire (le confirmer plutôt).
- Refus si des déclarations du locataire sont en attente sur l'avis (les confirmer ou les rejeter d'abord) ; refus de confirmer une déclaration sur un avis déjà soldé.
- Locataire : le **n° de transaction devient facultatif** dans « J'ai payé » (décision du 21/11, option a) ; s'il est saisi, il reste unique.
- Interface : sur chaque avis du tableau de bord, bouton « Encaissement » (Espèces / Mobile Money / Virement) remplaçant « Espèces ».
- La confirmation reste réservée à `owner` et `accountant` ; le gestionnaire (`manager`) n'atteste jamais un encaissement (décision du 21/11).

### P1.6 Paramètres de réception des fonds
- Page `src/app/(owner)/dashboard/parametres/paiements/page.tsx` (`owner`) : liste des comptes (RIB, Wave, OM, MoMo, Moov, alias PI-SPI, liens marchands) avec statut « actif / effectif le … / révoqué », ajout et révocation via les fonctions existantes, interrupteurs `direct` / `cinetpay` / `virement`, texte d'information sur les frais.
- **Ré-authentification** avant tout ajout (OTP e-mail ou SMS de moins de 5 minutes, vérifié côté serveur) ; e-mail et SMS d'alerte « Nouveau compte de réception, actif le … » ; lien d'annulation en un clic.
- Validation Zod : IBAN (clé mod 97, déjà présente), numéros CI, SHID UUID v4, URL de lien marchand en liste blanche.

### P1.7 Affiche de guichet PI-SPI (présentiel uniquement) (fait le 24/11/2026)
- `npm i @pi-spi/qrcode` (MIT, utilisé par la démo officielle BCEAO). Vérifier l'API réelle du paquet avant usage ; à défaut, implémenter la payload EMV dans `src/lib/payments/pispi-qr.ts` (champ 36 avec `int.bceao.pi` et SHID, 52 = `0000`, 53 = `952`, 58 = `CI`, 62-05 = référence, 62-11 = canal statique marchand, CRC16-CCITT `0x1021` / `0xFFFF`) et la tester sur l'exemple officiel (CRC attendu `9618` pour la payload d'exemple de la BCEAO).
- Route `GET /api/pispi-poster` (`owner`/`manager`) : PDF A5 avec QR statique **sans montant**, nom du bénéficiaire, consigne « indiquez la référence de votre avis », mention « usage au guichet uniquement ». Audit `affiche_guichet_generee`.
- **Acceptation** : la payload générée est validée par le validateur de la démo BCEAO (contrôle manuel documenté dans la PR).
- Réalisé : paquet officiel `@pi-spi/qrcode` 1.0.0 (publié par la BCEAO, code relu : aucun accès réseau ni fichier), version figée. API réelle : `buildPayloadString` / `isValidPispiQrPayload` ; l'alias doit être une **adresse de paiement UUID v4**. Fonction `pispi_poster_data` (owner/gestionnaire, adresse active uniquement : ni carence, ni révocation, ni numéro de téléphone ; audit `affiche_guichet_generee` avec alias tronqué), route `GET /api/pispi-poster?account=…`, PDF A5 (étapes numérotées, nom du bénéficiaire à comparer, mention « guichet uniquement »), bouton dans Réception des fonds. Garde-fous : test statique (seule la route de l'affiche produit un QR PI-SPI, jamais un composant client) et e2e (aucune page locataire ni avis ne contient `int.bceao.pi`).
- **Écart sur l'acceptation :** les pages de la démo BCEAO ne sont pas lisibles sans navigateur (rendu JavaScript) et l'exemple officiel au CRC `9618` n'a pas pu être récupéré. Remplacé par : validation par le validateur officiel du paquet BCEAO, recalcul indépendant du CRC et valeur de contrôle normalisée CRC-16/CCITT-FALSE (`123456789` → `29B1`). **Reste à faire à la main** : scanner une affiche imprimée avec l'application d'un établissement participant (liste de contrôle de mise en production).

### P1.8 Documentation et nettoyage (fait le 24/11/2026)
- Mettre à jour `README.md`, `docs/ANALYSE.md` §2.1-4 (état PI-SPI de novembre 2026) et le seed (comptes Wave/OM du bailleur, une déclaration directe en attente, une confirmée).
- Réalisé : README réécrit (positionnement bailleur, comptes de démo par rôle, commandes et nombres de tests, arborescence, liste de contrôle de mise en production à jour) ; ANALYSE §2.1-4 complétée par la mise en œuvre de P1.7 ; seed : adresse de paiement PI-SPI, déclaration directe Wave en attente (Kouassi) et Orange confirmée par la propriétaire (Traoré), sur les avis du mois suivant.

---

## Phase D — Documents du locataire (décisions du 21/11/2026)

Objectif : chaque locataire reçoit ses avis et quittances sans effort et peut en vérifier l'authenticité, même s'il est peu lettré.

### D.1 Avis d'échéance en PDF, signés et vérifiables
- PDF d'avis (montant, échéance, période, bien, bailleur, référence) **sans aucune coordonnée de paiement** (invariant n° 9) : « payez à votre bailleur comme d'habitude ou au guichet de l'agence ».
- Avis signés comme les quittances (signature versionnée), code de vérification et QR vers `/verify` (notre domaine, jamais un QR PI-SPI). `/verify` étendu aux avis. Résultat visuel compréhensible sans lire (grand ✓ vert / ✗ rouge).
### D.2 Envoi des documents par e-mail ET WhatsApp (manuel au départ)
- **Décision du 22/11/2026 : chaque bailleur (ou son agence) envoie depuis SES propres comptes** (e-mail et WhatsApp gratuits, idéalement l'application WhatsApp Business), en un geste depuis le tableau de bord. LoyerCI prépare le message et le document ; aucune équipe LoyerCI n'a accès aux documents des bailleurs (pas de rôle « opérateur » transversal).
- Pièce jointe : bouton « Partager » natif du téléphone (Web Share API avec fichier : PDF joint dans WhatsApp, à valider sur appareils du pilote) ; repli : message pré-rempli avec lien de téléchargement, et téléchargement du PDF pour le joindre à la main.
- File « à envoyer ce mois-ci » : un bouton par document et par canal, envoi coché et tracé.
- L'authenticité repose sur le document (signature, `/verify`), puisque l'expéditeur varie d'un bailleur à l'autre.
- L'automatisation centralisée (e-mail transactionnel, WhatsApp Business API) viendra avec la croissance et remplacera le geste du bailleur sans changer le reste.
- Consentement du locataire au canal WhatsApp recueilli et tracé à la création du bail : **reporté à P2.3** (le formulaire de bail n'existe pas encore).
- Chaque message rappelle la règle fixe : jamais de numéro de paiement, jamais de demande de code Mobile Money.
### D.3 SMS de disponibilité + téléchargement après code à usage unique
- SMS court **sans accents** (encodage GSM-7, 160 caractères) contenant l'essentiel (montant, période, n° de document, code de vérification) et un **lien de téléchargement**.
- Le lien ouvre une page affichant le nom du bailleur et le numéro masqué ; un **code à usage unique est envoyé au numéro enregistré par le bailleur** (jamais à un numéro saisi), saisi par le locataire, puis le PDF est servi. Codes et renvois plafonnés ; chaque téléchargement journalisé.
- Nécessite un fournisseur SMS (question ouverte).
### D.4 Compte locataire facultatif (historique complet)
- Création réservée aux numéros déjà connus d'un bailleur (pas d'inscription ouverte, décision D1), connexion par code SMS.
- **Sortie du parc** (plus aucun bail actif chez aucun bailleur) : le locataire est invité à télécharger ses documents, rappel avant échéance, puis **suppression du compte et de son accès à M+3**. Les documents restent dans les archives du bailleur **2 ans au plus après leur émission** (décision du 24/11/2026, P3.4) et `/verify` continue de répondre (données masquées).
### D.5 Comptage des envois et facturation
- Tous les envois (SMS, codes, e-mails, WhatsApp) sont **à la charge du bailleur** et inclus dans son abonnement : compteur par organisation, plafonds anti-abus, export pour la facturation.

---

## Phase 2 — Gestion courante (CRUD)

### P2.1 Biens
- `dashboard/biens` : liste, fiche, création, modification (`owner`/`manager`) via des fonctions SQL `create_property` / `update_property` (audit `bien_cree`/`bien_modifie` à ajouter). Champs : type, code (unique par organisation), commune/quartier (liste des communes d'Abidjan + saisie libre pour l'intérieur), adresse.
### P2.2 Locataires et invitation
- Fiche locataire (sans pièce d'identité stockée). **Invitation** : lien à usage unique (jeton aléatoire haché en base, expiration 7 jours) envoyé par WhatsApp/SMS. À l'ouverture, création ou liaison du compte → `tenants.user_id`. Audit `locataire_invite`, `locataire_lie`.
### P2.3 Baux (fait le 23/11/2026)
- Décisions du 23/11/2026 : **mois d'entrée facturé entier** (pas de prorata) ; **avance** enregistrée par le propriétaire -> avis soldés et quittances signées « Avance versée à la signature » pour les N premiers mois (une fois par bail).
- Consentement du locataire au canal WhatsApp recueilli et tracé à la création du bail (reporté de D.2).
- Résiliation immédiate ou planifiée (clôture automatique quotidienne), messages légaux explicites (loi n° 2019-576).

### P2.4 Avis d'échéance (fait le 23/11/2026)
- Génération manuelle « Générer les avis du mois » (`owner`/`manager`), annulation d'un avis avec motif (nouvelle fonction ; statut `annule` ; jamais de suppression).
- Annulation d'une quittance (`owner` uniquement, motif obligatoire) : le trigger d'immuabilité l'autorise déjà ; ajouter la fonction et l'audit.
### P2.5 Membres et rôles (fait le 23/11/2026)
- Invitation de gestionnaires et comptables, changement de rôle, retrait (au moins un `owner` doit rester). Sélecteur d'organisation si l'utilisateur en a plusieurs.
- Réalisé : `dashboard/parametres/membres` (propriétaire). Ajout par e-mail (compte créé si besoin, lien de connexion envoyé ; aucune inscription publique, D1). Lignes `owner` verrouillées (`FOR UPDATE`) : deux rétrogradations simultanées ne peuvent pas vider l'organisation de ses propriétaires (test de concurrence). Organisation active portée par un cookie `httpOnly` revérifié à chaque requête, **seule** source pour les pages comme pour les actions (le paramètre d'URL `?org=` est abandonné).
### P2.6 Journal d'audit consultable (fait le 23/11/2026)
- `dashboard/audit` (`owner`) : filtrage par action, période et acteur ; export CSV ; indicateur d'intégrité de la chaîne (`private.verify_audit_chain()` via une fonction exposée au rôle `owner`).
- Réalisé : lecture par la RLS existante ; filtres validés par Zod (valeurs invalides ignorées à l'affichage, refusées à l'export) ; export CSV de 5 000 lignes maximum, **journalisé avant remise** (`audit_exporte` : filtres, nombre de lignes, IP, user-agent), avec n° de chaîne et empreinte SHA-256 de chaque ligne ; formules neutralisées. Intégrité : `audit_integrity` exécutée **par le serveur** (`service_role`, rôle `owner` revérifié en base) plutôt qu'exposée à `authenticated` : la liste blanche du garde-fou reste inchangée. Le verdict porte sur la chaîne entière (toutes organisations) sans en révéler le détail. Limite connue : la suppression des derniers maillons reste indétectable sans l'export externe de la tête de chaîne (P4.4).

---

## Phase 3 — Authentification et notifications

### P3.1 OTP SMS (périmètre réduit par la phase D) — en suspens (24/11/2026)
- Benchmark des fournisseurs fait : `docs/BENCHMARK-SMS.md` (recommandation : Orange SMS API CI et un agrégateur local, test réel sur les trois réseaux avant choix ; branchement par le crochet d'envoi de SMS de Supabase Auth).
- Utilisé pour le compte locataire facultatif (D.4) et le téléchargement par code (D.3). Supabase Phone Auth avec un fournisseur SMS couvrant la Côte d'Ivoire (choix à faire valider : coût et délivrabilité). Connexion par numéro pour les locataires (cas majoritaire), lien magique conservé pour l'e-mail.
### P3.2 Notifications transactionnelles (fait le 24/11/2026)
- File `notifications` (table + Edge Function ou tâche planifiée) : avis disponible, paiement déclaré (vers le bailleur), paiement confirmé ou rejeté (vers le locataire), quittance disponible, changement de compte de réception (alerte), déclaration en attente depuis plus de 48 h.
- Canaux : e-mail (Resend ou SMTP), SMS. WhatsApp Business API en option (coût par conversation à évaluer). Les liens `wa.me` existants restent l'option gratuite et manuelle.
- Réalisé (e-mail, décision du 24/11) : file `private.outbox` alimentée par un **déclencheur sur le journal d'audit** (déclaration, confirmation, rejet : même transaction que l'événement, sans doublon) et par une tâche quotidienne (déclarations en attente depuis 48 h) ; destinataires résolus en base (propriétaires et comptables, jamais le gestionnaire ; le locataire seulement pour ses propres déclarations) ; route `GET /api/cron/notifications` protégée par `CRON_SECRET` (comparaison à temps constant), appelée toutes les 5 min (`vercel.json`) ; réservation par lots `FOR UPDATE SKIP LOCKED`, 5 tentatives, plafond quotidien appliqué en base (D.5) sauf pour les alertes de sécurité ; un e-mail par destinataire (aucune copie). Contenu : phrases simples, montant, période, lien vers la page authentifiée, mention « LoyerCI ne vous demandera jamais de payer sur un numéro… » ; **jamais** de coordonnée de paiement ni de motif de rejet saisi librement (affiché seulement dans l'espace). Les alertes de compte de réception (P1.6) et de départ du parc (D.4), déjà en file, sont désormais expédiées.
- Non retenu : « avis disponible » et « quittance disponible » automatiques (les documents restent envoyés par le bailleur depuis ses comptes, D.2) ; SMS (en suspens).
### P3.3 Relances automatiques (fait le 24/11/2026)
- J-3, J+3, J+10 (configurables par organisation), via `pg_cron` et la file de notifications. Contenu sans aucune coordonnée de paiement (invariant n°9).
- Réalisé (décision du 24/11) : tableau de bord « Relances du jour » (dernière échéance atteinte de chaque avis non soldé, pas encore traitée), envoi WhatsApp ou SMS en un geste depuis le téléphone du bailleur, relance tracée (`record_reminder` : registre en ajout seul, une fois par avis, étape et canal ; journal `relance_envoyee` ; compteur D.5 non facturé) ; réglages par organisation (`set_reminder_settings`, propriétaire, 1 à 5 échéances entre J-15 et J+60) sur la page Envois ; rappel automatique par e-mail **désactivé par défaut**, chaque jour à 08:10, seulement pour les étapes atteintes depuis 2 jours au plus (activer l'option ne déclenche pas d'avalanche), jamais pour un avis soldé entre-temps. Textes sans pénalité ni coordonnée ; lien vers l'espace seulement si le locataire a un compte (sinon aucun lien).
### P3.4 Conservation des documents : 2 ans après émission (décision du 24/11/2026) (fait le 24/11/2026)
- Purge quotidienne des avis, quittances et preuves de virement émis il y a plus de 2 ans (fichiers du stockage compris) ; jamais du journal d'audit.
- Alerte au bailleur 30 jours avant (tableau de bord et e-mail) et export complet de ses documents (archive) avant la purge.
- `/verify` d'un document purgé : « document plus conservé par LoyerCI » (ni « faux », ni « authentique »).
- Historique du locataire : il est invité à télécharger ses documents ; rien n'est conservé au-delà.
- Réalisé : purge quotidienne en base (`purge_expired_documents`, 03:30) ; pierre tombale minimale (n°, date, 16 premiers caractères du code) pour que `/verify` réponde « Document plus conservé » au bon code seulement ; déclencheurs d'immuabilité ne permettant la suppression que pendant la purge **et** après 2 ans ; preuves de virement détachées (`proof_purged_at`) et fichiers retirés par l'API Storage (`/api/cron/retention`, file `private.storage_deletions`) ; alerte e-mail J-30 aux propriétaires et comptables (une par mois de purge) et bandeau du tableau de bord ; export ZIP des PDF signés (`/api/export/documents`, 300 documents au plus, journalisé `documents_exportes`) ; mention dans l'espace locataire. Journal `documents_purges` par organisation.

---

## Phase 4 — Durcissement avant production

1. **P4.1 Limiteur de débit distribué** : remplacer le stockage de `src/lib/security/rate-limit.ts` par Redis (ex. Upstash), sans changer l'interface `limit()`.
2. **P4.2 Réconciliation de secours** (si CinetPay est activé) : tâche horaire qui interroge `/v2/payment/check` pour les intentions `initie` de plus de 30 minutes.
3. **P4.3 Rétention** : purge des `webhook_events` après 90 jours (les documents et preuves de paiement : 2 ans après émission, traité en P3.4).
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

## Décisions arbitrées (21/11/2026)

- **Confirmation des encaissements** par le bailleur seulement (`owner`, `accountant`), jamais par le gestionnaire ; « Encaissement reçu » imputé immédiatement en Mobile Money et virement, même saisi par un comptable ; le seuil D2 reste propre aux espèces.
- **Locataire** : « J'ai payé » conservé, n° de transaction facultatif. L'assistant de collage de SMS est reporté (phase 5).
- **Documents** : envoi par e-mail ET WhatsApp (comptes gratuits, envoi manuel depuis le back-office au départ), SMS de disponibilité avec lien de téléchargement protégé par code à usage unique, compte locataire facultatif pour l'historique. Le lien « carnet sans compte » est abandonné.
- **Avis** : jamais de coordonnée de paiement ; avis signés et vérifiables sur `/verify`.
- **Sortie du parc** : suppression du compte locataire à M+3 ; documents conservés par le bailleur 2 ans au plus après émission (révisé le 24/11/2026).
- **Frais d'envoi** à la charge du bailleur, inclus dans son abonnement.
- **Envoi des documents (22/11)** : par chaque bailleur depuis ses propres comptes, en un geste depuis le tableau de bord (voir D.2).

## Décisions arbitrées (24/11/2026)

- **Conservation des documents : 2 ans au plus après leur émission** (avis, quittances, preuves de virement). Le bailleur est alerté et invité à exporter ses documents **30 jours avant** la purge ; il reste seul responsable de ses propres obligations comptables. Le journal d'audit (qui ne contient pas les documents) est conservé ; après purge, `/verify` répond « document plus conservé » (P3.4). Remplace la « durée légale » mentionnée en D.4.
- **Aucune pénalité de retard** : l'application n'en calcule ni n'en affiche.
- **SMS (D.3, P3.1) en suspens** jusqu'au choix du fournisseur : connexion par **lien magique envoyé par e-mail uniquement** (aucun lien de connexion par WhatsApp : il passerait par le compte du bailleur). Benchmark : `docs/BENCHMARK-SMS.md`.
- **Notifications automatiques (P3.2)** envoyées par LoyerCI depuis une **adresse e-mail unique** (fournisseur SMTP choisi plus tard ; Mailpit en local), coût inclus dans l'abonnement. Les documents restent envoyés par le bailleur depuis ses propres comptes (D.2).
- **Relances (P3.3)** : liste du jour dans le tableau de bord avec envoi WhatsApp en un geste depuis le compte du bailleur, plus un rappel automatique par e-mail aux locataires qui en ont un, si l'organisation l'active. Échéances par défaut J-3, J+3, J+10, réglables.

## Questions ouvertes (à trancher par le porteur de projet)

1. Périmètre exact de l'interdiction du QR PI-SPI à distance : une affiche dans le hall d'un immeuble compte-t-elle comme « présence physique » ? (à confirmer auprès de la BCEAO ou d'un participant)
2. Formats réels des n° de transaction et des SMS par opérateur (utiles au rapprochement automatique de la phase 5, plus à P1.5).
3. Fournisseur SMS (D.3, P3.1) : benchmark fait (`docs/BENCHMARK-SMS.md`) ; reste le test réel de délivrabilité et le choix.
5. Modèle économique de LoyerCI (abonnement bailleur ?), qui ne doit **jamais** reposer sur la détention des loyers.
