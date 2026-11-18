# LoyerCI — Analyse critique du cahier des charges

> Rôle : architecte logiciel / sécurité FinTech, marché ivoirien (XOF).
> Objet : forces, faiblesses et renforcements du projet, puis choix d'architecture retenus dans le code livré.

---

## 1. Forces du projet

| Force | Pourquoi c'est juste |
|---|---|
| **Problème réel et massif** | Une large majorité des ménages ivoiriens sont locataires ; les reçus manuscrits et les paiements en main propre génèrent litiges et impayés. |
| **Mobile Money au centre** | Orange Money, MTN MoMo, Wave et Moov Money sont les moyens de paiement dominants ; un agrégateur (CinetPay) couvre les quatre avec une seule intégration. |
| **WhatsApp comme canal** | Canal de communication n°1 ; un lien `wa.me` pré-rempli ne coûte rien (contrairement au SMS) et ne demande aucune API. |
| **Quittance vérifiable par QR** | Répond à un besoin concret : dossiers de location, visas, prêts bancaires exigent des quittances, et les faux circulent. |
| **Référence unique de virement** | Indispensable pour le rapprochement bancaire, souvent négligé. |
| **Exigences de sécurité explicites** | HMAC, idempotence, RLS, audit : le cahier des charges pose d'emblée le bon niveau. |
| **Stack moderne et cohérente** | Next.js + Supabase permet la RLS native, l'auth, le temps réel et le stockage sans multiplier les briques. |

## 2. Faiblesses et angles morts

### 2.1 Risques réglementaires (les plus graves)
1. **Encaissement pour compte de tiers.** Si la plateforme reçoit l'argent des locataires puis le reverse aux propriétaires, elle exerce une activité de **service de paiement** réglementée par la BCEAO (agrément d'établissement de paiement, obligations LBC/FT). ➜ *Renforcement :* l'argent doit aller **directement** sur le compte marchand du propriétaire ou de l'agence (sous-compte agrégateur, ou RIB du bailleur pour les virements). LoyerCI reste un **logiciel**, jamais détenteur des fonds. Le code livré respecte ce principe : aucun portefeuille interne, le RIB affiché est celui du bailleur.
2. **Plafonds légaux du bail d'habitation.** La loi n° 2019-576 (Code de la construction et de l'habitat) limite à **2 mois de caution et 2 mois d'avance**. Un logiciel qui laisse saisir 6 mois d'avance devient complice d'une infraction. ➜ *Renforcement :* contrainte SQL `leases_plafond_legal_habitation` (testée), avec exception pour les baux professionnels.
3. **Données personnelles.** La loi n° 2013-450 impose une déclaration/autorisation auprès de l'**ARTCI**, la minimisation et la sécurité des données. ➜ *Renforcement :* pas de numéro de CNI stocké, noms masqués sur la page publique, preuves de virement en stockage privé, politique de rétention à définir (ex. purge des `webhook_events` à 90 jours).
4. **PI-SPI.** Lancée le 30 septembre 2025 ; au 30 septembre 2026, Orange Money, MTN Money, Moov Money et Wave sont participants en Côte d'Ivoire, et depuis le 2 novembre 2026 tout transfert entre réseaux passe obligatoirement par PI-SPI. L'**API Business** (confirmation automatique) reste conditionnée à un établissement participant, et le **QR PI-SPI est interdit pour les paiements à distance**. ➜ *Renforcement :* voir `docs/ETUDE-PAIEMENT-DIRECT.md` : paiement direct vers les comptes du bailleur, CinetPay devenu optionnel, adaptateur PI-SPI API Business en phase 5 de `ROADMAP.md`.

### 2.2 Angles morts fonctionnels
| Manque | Réalité du terrain | Ce que fait le code livré |
|---|---|---|
| Seulement 3 statuts (`À payer`, `En retard`, `Payé`) | Les **paiements partiels** sont fréquents | Statut `partiel` + cumul `amount_paid`, quittance **uniquement** quand l'avis est soldé (un paiement partiel n'est pas une quittance) |
| Pas de paiement en espèces | Encore très répandu, surtout à l'intérieur du pays | `record_cash_payment` (propriétaire/comptable), tracé dans l'audit |
| Trop-perçu non prévu | Double paiement Mobile Money possible | `credit_amount` + alerte `paiement_anomalie` |
| Multi-propriétaires / agences | Les agences gèrent pour plusieurs bailleurs avec plusieurs employés | Modèle `organizations` + `memberships` avec rôles `owner` / `manager` / `accountant` |
| Montants non multiples de 5 | Contrainte CinetPay | Contrôle explicite dans l'adaptateur |
| Accès hors ligne | Connexion instable | PWA avec page hors-ligne, mais **aucune donnée financière en cache** (appareils partagés) |

### 2.3 Failles de sécurité implicites du cahier des charges
1. **« HMAC sur le webhook » ne suffit pas.** Une signature valide prouve l'origine, pas que l'argent est arrivé. CinetPay recommande lui-même de **revérifier la transaction** via son API `/v2/payment/check`. ➜ Le webhook livré : signature HMAC (temps constant) → dédoublonnage → **revérification serveur-à-serveur** → comparaison montant/devise avec le montant attendu en base → imputation.
2. **Le montant ne doit jamais venir du navigateur.** ➜ Le client n'envoie que `invoiceId` + opérateur ; le montant est recalculé dans PostgreSQL.
3. **Modification de RIB = vecteur n°1 de fraude** (prise de contrôle du compte du bailleur, redirection des loyers). Le cahier des charges ne prévoit qu'un log. ➜ **Délai de carence de 48 h** sur tout changement, ancien RIB actif pendant ce délai, IBAN validé par clé ISO 13616 en base, réservé au rôle `owner`. À ajouter en production : ré-authentification + alerte SMS/e-mail.
4. **Preuve de virement = faux reçu facile.** Une capture d'écran se falsifie en deux minutes. ➜ La validation reste **humaine** (contrôle du relevé), avec séparation des tâches (le déclarant ne peut pas valider), motif de rejet obligatoire, consultation de la preuve elle-même journalisée, fichiers filtrés par octets magiques et PDF actifs refusés.
5. **QR code ≠ authenticité.** Un faussaire peut imprimer un QR pointant vers **son propre site** imitant la page de vérification, ou réutiliser le QR d'une vraie quittance sur un faux document. ➜ Domaine officiel imprimé sur la quittance et rappelé sur la page, code de vérification lisible (16 caractères hex) à saisir manuellement, données affichées (période, montant, localisation, nom masqué) à **comparer** avec le document présenté.
6. **Page de vérification = oracle d'énumération.** ➜ UUID v4 non devinable + code issu de la signature HMAC, réponse identique pour « inconnu » et « code faux », débit limité, `noindex`, nom masqué **en base** (le nom complet ne quitte jamais PostgreSQL).
7. **Journal d'audit modifiable.** Une simple table peut être effacée par un admin malveillant. ➜ Table en ajout seul (triggers + révocation des droits, même pour `service_role`) **et chaînage SHA-256** : toute altération, même par un superutilisateur qui désactive les triggers, est détectée (testé).
8. **IP falsifiable.** `X-Forwarded-For` est contrôlé par le client. ➜ Lecture du seul en-tête fiable de l'hébergeur, en comptant les sauts de proxy depuis la droite.
9. **RLS seule = surface d'écriture large.** Avec Supabase, un utilisateur peut appeler l'API REST directement avec son JWT. ➜ Aucune écriture client autorisée : toutes les mutations passent par des fonctions SQL exécutables **uniquement** par le serveur, qui revérifient le rôle de l'acteur.

## 3. Architecture de sécurité retenue

```
Navigateur ──(JWT session)──► Next.js (Server Components / Server Actions)
   │                               │  lectures : client utilisateur → RLS PostgreSQL
   │                               │  écritures : client service_role → fonctions SQL
   │                               │              (p_actor vérifié, rôle revérifié en base)
   │                               ▼
   └── jamais d'accès direct ──► PostgreSQL (Supabase)
                                   ├─ RLS sur 12 tables, aucune politique d'écriture
                                   ├─ fonctions SECURITY DEFINER, liste blanche EXECUTE
                                   ├─ verrous FOR UPDATE + UNIQUE (provider, transaction)
                                   ├─ quittances signées HMAC (clé dans Vault), immuables
                                   └─ audit_logs chaîné SHA-256, ajout seul
CinetPay ──(x-token HMAC)──► /api/webhooks/payment ──► /v2/payment/check ──► confirm_provider_payment()
```

**Défense en profondeur, couche par couche**

| Couche | Mesures |
|---|---|
| HTTP | CSP stricte avec nonce par requête, HSTS, `frame-ancestors 'none'`, `nosniff`, protection CSRF native des Server Actions (contrôle d'Origin) |
| Application | Zod sur toute entrée, limitation de débit, anti open-redirect, `server-only` empêche la fuite de la clé `service_role` dans le bundle client |
| Base | RLS, FK composites anti-mélange entre organisations, contraintes métier (plafonds légaux, IBAN, téléphones CI, montants entiers), immuabilité |
| Paiement | Montant serveur, revérification fournisseur, idempotence (contrainte unique + verrou + statut), anti double-clic (réutilisation de l'intention < 15 min) |
| Preuve | Quittance = instantané figé + empreinte SHA-256 + signature HMAC recalculée à chaque vérification |
| Traçabilité | 15 actions sensibles journalisées avec acteur, IP, user-agent, horodatage ; vérification de chaîne quotidienne (pg_cron) |

## 4. Ce qui a été testé

- **34 scénarios SQL** exécutés sur un vrai PostgreSQL 16 (`npm run test:db`) : cloisonnement RLS propriétaire/locataire/gestionnaire, écritures directes refusées, liste blanche des fonctions, rejeu de webhook, montant falsifié, transaction inconnue, **deux webhooks simultanés** (une seule imputation), quittance immuable, altération SQL détectée, chaîne d'audit altérée détectée, plafond légal, IBAN à clé fausse, délai de carence RIB.
- **20 tests unitaires** (`npm test`) : HMAC CinetPay (dont notification altérée), signature horodatée anti-rejeu, référence de virement identique en TS et en SQL, validation Zod, lien WhatsApp, IP falsifiée, détection du type réel des fichiers.
- `tsc` strict et `next build` de production sans erreur ; rendu mobile/desktop contrôlé visuellement ; PDF de quittance généré et vérifié.

**Non testé ici** (aucun service externe accessible) : appel réel à l'API CinetPay, Supabase Auth/Storage/Realtime de bout en bout, script `npm run seed`. À valider en sandbox CinetPay et sur `supabase start` avant mise en production.

## 5. Feuille de route de renforcement (priorisée)

1. **Avant lancement** : déclaration ARTCI ; contrat d'agrégateur au nom de chaque bailleur (fonds jamais détenus) ; OTP SMS en connexion locataire ; ré-authentification + alerte sur changement de RIB ; limiteur de débit Redis (Upstash) ; tests d'intrusion externes.
2. **Fiabilité** : tâche de réconciliation horaire qui interroge `/payment/check` pour les intentions `initie` > 30 min (filet de sécurité si un webhook est perdu) ; export quotidien de `audit_logs` vers un stockage WORM externe.
3. **Produit** : quittances annuelles récapitulatives ; relances automatiques J+3/J+10 ; reversement de la caution en fin de bail ; contrat de bail sécurisé (modèle officiel) ; tableau de bord par bailleur pour les agences.
4. **Paiement** : adaptateur PI-SPI (virement instantané interopérable, QR code) et Wave Business direct (frais réduits).
