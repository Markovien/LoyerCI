# Audit de sécurité et d'architecture — LoyerCI

> Date : 18 novembre 2026 · Périmètre : `loyerci-v0.zip` et `loyerci.zip` (code, migrations SQL, tests, documentation)
> Méthode : lecture intégrale du code, exécution de la batterie de tests, **preuves d'exploitation (PoC) rejouées sur un PostgreSQL 16 éphémère**, correctifs accompagnés de scénarios de non-régression.

---

## 0. Synthèse

| | |
|---|---|
| **Différence entre les deux archives** | Code applicatif **identique**. `loyerci.zip` ajoute `CLAUDE.md`, `ROADMAP.md`, `docs/ETUDE-PAIEMENT-DIRECT.md`, met à jour `README.md` et `docs/ANALYSE.md` §2.1-4 (PI-SPI), et généralise `scripts/test-db.sh` (toutes les migrations sauf `*_platform*`). `loyerci.zip` est donc la base retenue. |
| **Niveau général** | Très au-dessus de la moyenne : modèle « aucune écriture client », fonctions `SECURITY DEFINER` à `search_path` figé, montant calculé en base, webhook signé **et** revérifié, idempotence testée en concurrence, quittances signées HMAC, audit chaîné. |
| **Failles confirmées par exploitation** | **1 critique, 2 élevées, 4 moyennes, 6 faibles.** Toutes **corrigées** dans ce lot (migration `20261118000500_security_hardening.sql` + code TS), sauf celles qui relèvent de phases ultérieures de la feuille de route ou d'une décision du porteur de projet (§3). |
| **Tests** | Avant : 34 scénarios SQL + 20 tests unitaires, tous verts (ils ne couvraient pas les failles ci-dessous). Après : **43 scénarios SQL** (dont un garde-fou générique sur les privilèges) + test de concurrence + **23 tests unitaires** ; `typecheck` et `build` verts. `npm audit` : 0 vulnérabilité. |

---

## 1. Failles corrigées dans ce lot

Chaque faille a été **démontrée** avant correction, puis le PoC a été rejoué pour constater qu'il échoue.

### 🔴 C1 — Délai de carence de 48 h contournable (détournement des loyers)
- **Où :** `public.add_payout_account` (migration 3).
- **Problème :** la carence ne s'appliquait que s'il existait un compte **actif du même type**. Un attaquant qui prend le contrôle du compte du bailleur révoque le RIB actif (`cancel_payout_account`, effet immédiat), puis ajoute le sien : **actif immédiatement**. Même effet en ajoutant un premier compte d'un **autre type** (Mobile Money après un RIB). C'est exactement le « vecteur n°1 de fraude » identifié dans `ANALYSE.md`.
- **PoC :** `nouveau RIB actif dans 00:00:00 (attendu >= 48 h)`.
- **Correctif :** activation immédiate **uniquement** pour la toute première coordonnée de l'organisation (aucune ligne, même révoquée, tous types confondus), avec verrou consultatif contre deux « premiers » ajouts concurrents. Conforme à `ETUDE-PAIEMENT-DIRECT.md` §5.1 (« la carence s'applique à tous les types »).
- **Tests :** `S1` (révocation préalable, changement de type, organisation vierge, aucun RIB pirate servi au locataire).

### 🟠 E1 — Privilèges par défaut : toute future table ou fonction exposée à `anon`
- **Où :** migration 1, lignes 16-17, et défauts Supabase.
- **Problème :** Supabase accorde par défaut `ALL` sur les tables et `EXECUTE` sur les fonctions créées dans `public` à `anon` et `authenticated`. Les migrations existantes révoquaient ces droits **objet par objet** ; rien ne protégeait les objets **futurs**. Or la Phase 1 ajoute `submit_direct_payment(p_actor, …)` : un oubli de `REVOKE` aurait permis à n'importe qui, avec la clé `anon` publique, d'appeler la fonction via PostgREST **en se faisant passer pour n'importe quel locataire**. De plus, `alter default privileges in schema … revoke execute … from public` est **sans effet** en PostgreSQL (les ACL par schéma ne font qu'ajouter aux ACL globales).
- **PoC :** `future_fn EXECUTE anon=true ; future_tbl INSERT anon=true`.
- **Correctif :** révocation des privilèges par défaut (globale pour `PUBLIC`, par schéma pour `anon`/`authenticated`).
- **Tests :** `S2` + **garde-fou générique** : liste blanche exhaustive des fonctions exécutables par `anon`/`authenticated`, RLS active sur toutes les tables, aucune écriture client, `search_path` figé sur toute fonction `SECURITY DEFINER`. Toute nouvelle fonction exposée fera échouer `npm run test:db` tant qu'elle n'est pas ajoutée consciemment à la liste.

### 🟠 E2 — Impossible d'enregistrer un compte Mobile Money (bug bloquant la Phase 1)
- **Où :** `private.iban_ok`, utilisée dans le `CHECK` de `payout_accounts.iban`.
- **Problème :** `iban_ok(NULL)` levait `FOREACH expression must not be null`. PostgreSQL ne garantit pas l'ordre d'évaluation d'un `AND` dans un `CHECK` : tout ajout d'un compte `mobile_money` (IBAN nul) échouait. Découvert par le nouveau test `S1`.
- **Correctif :** fonction totale (`NULL` → `NULL`, caractère invalide → `false`).

### 🟡 M1 — Webhook bloqué en boucle sur un avis annulé (encaissement non tracé)
- **Où :** `confirm_provider_payment` → `apply_payment` ; `src/app/api/webhooks/payment/route.ts`.
- **Problème :** si l'avis est annulé entre l'initiation et la confirmation, `apply_payment` lève une exception ; la route la traitait comme temporaire (503) → réémissions sans fin, alors que l'argent est arrivé chez le bailleur et n'apparaît nulle part.
- **PoC :** `EXCEPTION « Avis annulé : encaissement refusé » -> 503`.
- **Correctif :** paiement marqué `reussi` + anomalie `avis_annule` dans l'audit, ni imputation ni quittance, issue `anomalie_avis_annule`. La route classe désormais les erreurs SQL métier (SQLSTATE 22/23/42/P0) comme **définitives** et les journalise.
- **Tests :** `S3`.

### 🟡 M2 — Quittance : champs affichés non couverts par la signature
- **Où :** `private.receipt_payload` (v1).
- **Problème :** la signature ne couvrait ni le **bailleur**, ni l'**adresse**, ni le détail loyer/charges, ni le **mode de règlement**, pourtant imprimés sur la quittance et affichés sur `/verify`. Une altération directe en base restait « Authentique ». Le séparateur `|` rendait en outre la sérialisation ambiguë pour les champs libres.
- **PoC :** `verdict après falsification du bailleur : authentique / ESCROC SARL`.
- **Correctif :** quittances **v2** signées sur une sérialisation **JSON canonique** de tous les champs (y compris `issued_at`) ; colonne `signature_version` ; les quittances v1 restent vérifiables.
- **Tests :** `S4`.

### 🟡 M3 — `verify_receipt` appelable directement par `anon` (contourne le limiteur)
- **Problème :** la page `/verify` limitait le débit, mais la fonction était exécutable par `anon` via `/rest/v1/rpc/verify_receipt` avec la clé publique, sans aucune limite.
- **Correctif :** fonction réservée à `service_role`, appelée par la page côté serveur derrière le limiteur.

### 🟡 M4 — Application inutilisable si CinetPay est désactivé
- **Où :** `src/lib/env.ts`.
- **Problème :** les trois clés CinetPay étaient obligatoires dans la validation de l'environnement serveur, lue par **toutes** les Server Actions (`requestContext`). Avec la décision du 18/11/2026 (CinetPay désactivé par défaut), toute action aurait échoué : indisponibilité totale.
- **Correctif :** clés optionnelles en « tout ou rien », variable vide = absente, `getProvider` échoue proprement (fail closed), action Mobile Money refusée si CinetPay n'est pas configuré.

### 🟡 M5 — Temps réel inopérant (constaté en P0.1 sur un vrai Supabase)
- **Problème :** le canal Realtime du tableau de bord s'abonnait avant le chargement de la session, donc avec le rôle `anon` : la RLS filtrait tous les événements alors que l'indicateur affichait « En direct ». Le bailleur croyait voir les paiements en direct et ne voyait rien.
- **Correctif :** jeton de session transmis à Realtime (`realtime.setAuth`) avant l'abonnement et à chaque renouvellement. Vérifié : rafraîchissement d'un 2e onglet en < 1 s.

### 🟡 M6 — Connexion impossible si l'on ferme l'inscription par la configuration e-mail (constaté en P0.1)
- **Problème :** dans `config.toml`, `[auth.email] enable_signup` désactive le **fournisseur e-mail** entier (« Email logins are disabled »), pas seulement les inscriptions ; et l'action de connexion ignorait silencieusement l'erreur.
- **Correctif :** inscription fermée par `[auth] enable_signup = false` ; fournisseur e-mail conservé ; erreurs d'Auth journalisées côté serveur (sans e-mail).

### 🟡 M7 — N° de transaction réutilisable en changeant d'opérateur (constaté en P1.3 par un test e2e)
- **Problème :** l'unicité prévue par la feuille de route portait sur le couple (opérateur, n° de transaction). Une transaction déjà déclarée pour Orange Money était acceptée si on la redéclarait pour Wave.
- **Correctif :** unicité **globale** sur les paiements directs, insensible à la casse (migration `20261120000100`). Plus strict que la spécification initiale. Faux positifs jugés négligeables.

### 🟡 M8 — Numéro du payeur lisible en clair par tout membre via l'API (anticipé en P1.4)
- **Problème :** masquer le numéro à l'affichage ne suffisait pas : la RLS laisse tout membre de l'organisation, gestionnaire compris, lire `payments` avec son jeton, donc le numéro complet.
- **Correctif :** privilège de colonne. `payer_msisdn` est illisible pour `authenticated` ; seul `payer_msisdn_hint` (4 derniers chiffres) l'est. Vérifié aussi sur Realtime, qui retire la colonne des événements. Toute future colonne de `payments` est illisible par défaut.

### 🟡 M9 — Action exécutée sur une autre organisation que celle affichée (constaté en P2.5)
- **Problème :** les pages choisissaient l'organisation par `?org=` puis la première adhésion, tandis que certaines actions (`generateInvoices`, export des envois) prenaient la première adhésion ayant le bon rôle. Un membre de deux organisations pouvait générer les avis d'une organisation qu'il ne regardait pas.
- **Correctif :** organisation active unique (cookie `httpOnly`, revérifié contre les adhésions réelles), partagée par les pages et les actions ; `activeMembership` refuse au lieu de se rabattre sur une autre organisation quand le rôle ne convient pas. Test e2e de bascule.

### 🟢 Faibles (corrigées)
| # | Constat | Correctif |
|---|---|---|
| F1 | `user_agent` hors du chaînage d'audit : modifiable sans détection (PoC : 0 rupture détectée) | Chaînage **v2** incluant le `user_agent` (colonne `hash_version`, lignes v1 toujours vérifiées). Test `S5` |
| F2 | Limiteur : `buckets.clear()` au-delà de 50 000 clés, donc remise à zéro **globale** des compteurs provoquable par inondation | Éviction des clés les plus anciennes (LRU). Test unitaire |
| F3 | Filtre de PDF actifs contournable par échappement de nom (`/J#61vaScript`) | Décodage des `#xx` et liste de mots-clés élargie (`XFA`, `RichMedia`, `SubmitForm`…). Test unitaire |
| F4 | Garde-fou du seed non ancré (`https://prod.example.com/?localhost` passait) | Contrôle exact du nom d'hôte |
| F5 | Limiteur par e-mail contournable par la casse | E-mail normalisé (trim + minuscules). Test unitaire |
| F6 | Messages bruts de l'agrégateur affichés au locataire | Message générique, détail journalisé côté serveur |

---

## 2. Points forts confirmés (à préserver)

- **Zéro écriture client** : `anon`/`authenticated` n'ont que `SELECT` filtré par RLS ; mutations via fonctions `SECURITY DEFINER` réservées à `service_role` avec revérification du rôle de `p_actor`.
- **FK composites `(id, org_id)`** : mélange inter-organisations impossible au niveau du schéma.
- **Montant toujours calculé en base** ; webhook : HMAC à temps constant → dédoublonnage → **revérification serveur-à-serveur** → contrôle montant/devise → imputation verrouillée (`FOR UPDATE`), testée avec deux webhooks simultanés.
- **Quittance** émise uniquement par `apply_payment` quand l'avis est soldé ; immuable (trigger) ; vérification sans oracle d'énumération ; nom masqué en base.
- **CSP à nonce**, HSTS, `frame-ancestors 'none'`, anti open-redirect, `server-only` sur les secrets, IP lue depuis l'en-tête fiable de l'hébergeur uniquement.
- **Minimisation** : pas de pièce d'identité, preuves en bucket privé, URL signées de 60 s après journalisation, aucune donnée financière en cache du service worker.
- Contrainte légale **loi n° 2019-576** (caution/avance) en base.

---

## 3. Risques ouverts

### 3.1 À traiter dans les phases déjà prévues de la feuille de route
| Gravité | Risque | Où le traiter |
|---|---|---|
| 🟠 Élevée (avant production) | **Limiteur de débit en mémoire** : sans effet en serverless ou multi-instances (chaque instance a son compteur) | P4.1 (Redis) |
| ✅ Traité en P1.6 | ~~Ajout de coordonnées de réception sans ré-authentification ni alerte~~ : ré-authentification par code **vérifiée en base** (usage unique, 5 min), bandeau d'alerte pendant la carence, annulation en un clic | Reste : **expédition** des alertes e-mail/SMS (file `private.outbox` prête), phase D |
| 🟡 Moyenne | **Suppression des derniers maillons d'audit** indétectable depuis la base (PoC 6) | P4.4 : export de `private.audit_chain_head()` (ajoutée) vers un stockage WORM externe |
| 🟡 Moyenne | **Vérification quotidienne de la chaîne sans alerte** : le résultat de `pg_cron` n'est lu par personne. | P4.4 / P4.5 |
| 🟢 Faible (résiduel) | **Preuves de paiement** : filtre PDF heuristique. ~~Métadonnées EXIF/GPS conservées~~ → **corrigé en P1.3** (retrait des blocs EXIF/XMP/IPTC des JPEG et des blocs texte des PNG, sans décodage) | Rendu des PDF hors du contexte applicatif (P4.7) |
| 🟢 Faible | `webhook_events.payload` conserve le numéro de téléphone payeur | P4.3 (purge à 90 jours) |
| 🟢 Faible | Le locataire peut lire les UUID `declared_by`/`validated_by` de ses paiements | P0.2 (vue dédiée) |
| 🟢 Faible | Verrou consultatif global sur l'audit : sérialise toutes les écritures sensibles | Acceptable au volume du pilote ; à mesurer en P4.5 |
| 🟢 Faible | `CLIENT_IP_HEADER` mal réglé = IP falsifiable (audit et limiteur) | Liste de contrôle de mise en production |

### 3.2 Décisions du porteur de projet (arbitrées le 18/11/2026)
> **D1 → invitation seule** : inscription publique désactivée (`supabase/config.toml`, P0.1) ; bailleurs créés par l'équipe LoyerCI, locataires et membres par lien d'invitation à usage unique (P2.2, P2.5).
> **D2 → seuil + validation du propriétaire** : un encaissement en espèces déclaré par un comptable au-delà d'un seuil par organisation (défaut 100 000 FCFA) n'émet la quittance qu'après confirmation d'un `owner` ; le locataire est notifié (P3.2). Mis en œuvre avec `review_manual_payment` (P1.2).
> **D3 → Supabase en région UE + dossier ARTCI** : Supabase géré (Francfort ou Paris) et hébergement applicatif Vercel (`CLIENT_IP_HEADER=x-real-ip`), avec demande d'autorisation de transfert à l'ARTCI et clauses contractuelles, à faire valider par un juriste (P4.8).

Contexte des décisions :
| # | Sujet | Enjeu |
|---|---|---|
| D1 | **Inscription ouverte dans Supabase Auth** : aucun `supabase/config.toml` n'existe ; par défaut, n'importe qui peut créer un compte via l'API Auth avec la clé publique | Désactiver l'inscription (comptes créés par invitation) ou ouvrir l'inscription aux bailleurs |
| D2 | **Espèces : pas de séparation des tâches**. Un comptable enregistre seul un encaissement et **génère une quittance** | Validation par le propriétaire au-delà d'un seuil, notification au locataire, ou statu quo |
| D3 | **Hébergement et résidence des données** (loi n° 2013-450 : transfert de données personnelles hors de Côte d'Ivoire soumis à l'ARTCI) | Région Supabase et hébergeur applicatif, à arbitrer avant la déclaration ARTCI |

---

## 4. Fichiers modifiés par ce lot

- `supabase/migrations/20261118000500_security_hardening.sql` (nouveau ; les migrations 1 à 4 sont inchangées)
- `supabase/tests/01_security_scenarios.sql` (scénarios S1 à S5, garde-fou générique, mise à jour de la liste blanche)
- `src/lib/env.ts`, `src/lib/payments/registry.ts`, `src/app/(tenant)/pay/[invoiceId]/actions.ts`, `src/app/api/webhooks/payment/route.ts`, `src/app/verify/[receiptId]/page.tsx`, `src/lib/supabase/admin.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/files.ts`, `src/lib/validation/schemas.ts`, `scripts/seed.ts`, `tests/payments.test.ts`
- `CLAUDE.md` (invariants n° 13 et 14), `README.md`
