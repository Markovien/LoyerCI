# Étude — Paiement direct vers les comptes Mobile Money du bailleur (sans agrégateur)

> Date : 18 novembre 2026 · Statut : recommandation à valider en phase pilote
> Question posée : remplacer CinetPay (frais) par des QR codes / paiements directs vers les comptes Orange Money, Wave, MTN MoMo du bailleur.

---

## 0. Résumé exécutif

**Recommandation : oui au paiement direct, mais pas sous la forme « QR affiché dans l'application ».**

1. **Le contexte a changé depuis le cahier des charges.** Au 30 septembre 2026, les quatre portefeuilles ivoiriens (Orange Money, MTN Money, Moov Money, Wave) sont participants PI-SPI. Depuis le 2 novembre 2026, tout transfert entre deux réseaux passe obligatoirement par PI-SPI. Les clients Wave y ont accès directement dans leur application. PI-SPI n'est donc plus « inaccessible » côté particuliers. Ce qui reste peu accessible, c'est **l'API Business** pour les entreprises (confirmation automatique), qui dépend de l'établissement du bailleur.
2. **Obstacle réglementaire décisif.** Le centre d'aide officiel PI-SPI de la BCEAO indique qu'il est *strictement interdit* d'utiliser le QR code pour les paiements en ligne ou à distance. Il est réservé au paiement au **point de présence physique**. Un QR PI-SPI affiché dans l'application ou envoyé par WhatsApp à un locataire chez lui est donc **non conforme**.
3. **Obstacle ergonomique.** Le locataire paie avec le téléphone qui affiche la page : il ne peut pas scanner son propre écran. Pour le paiement à distance, le bon geste est **le numéro (ou l'alias) à copier**, pas le QR.
4. **Le vrai problème n'est pas le QR, c'est la confirmation.** Sans agrégateur, il n'y a ni webhook ni API : la plateforme ne sait pas que l'argent est arrivé. Il faut un **flux « déclaration du locataire → confirmation du bailleur »**, assisté pour rester rapide.

**Architecture retenue (3 étapes) :**

| Étape | Mode | Frais pour la plateforme | Confirmation |
|---|---|---|---|
| **1 — maintenant** | Paiement direct : numéros Wave / OM / MoMo / Moov et alias PI-SPI du bailleur, référence obligatoire, déclaration du locataire avec n° de transaction | **0** | Bailleur, avec rapprochement assisté (collage du SMS de l'opérateur, import de relevé) |
| 1 bis (option) | Liens de paiement marchands du bailleur (Wave Business, OM Business) | 0 (le bailleur paie la commission de son opérateur) | Bailleur (assisté) |
| 1 ter (agences) | QR PI-SPI **statique imprimé au guichet** de l'agence (présence physique, conforme) | 0 | Bailleur (assisté) |
| **2 — dès qu'un établissement l'ouvre** | PI-SPI API Business : *demande de paiement* poussée sur le téléphone du locataire + webhook signé | 0 (frais fixés par l'établissement du bailleur) | **Automatique** |
| Option payante | CinetPay conservé comme module désactivable par organisation | Commission agrégateur | Automatique |

L'adaptateur CinetPay existant reste dans le code, mais il devient **optionnel et désactivé par défaut**.

---

## 1. Ce qui existe en Côte d'Ivoire (novembre 2026)

| Mécanisme | Ce que voit le locataire | Payable à distance ? | Confirmation automatique ? | Prérequis côté bailleur |
|---|---|---|---|---|
| **A. Transfert vers un numéro** (même réseau) | Numéro + nom du bénéficiaire avant validation | Oui | Non | Un compte sur le réseau |
| **B. Transfert interopérable PI-SPI** (alias : téléphone ou adresse de paiement) | Alias / numéro | Oui | Non (sans API Business) | Alias PI-SPI créé dans son appli (ex. Max it) |
| **C. QR personnel / marchand d'un opérateur** (Wave, OM) | QR à scanner | Usage prévu en caisse ; QR Wave payable seulement par les clients Wave | Non (hors API) | Compte (Business pour le QR marchand) |
| **D. QR interopérable PI-SPI** (format EMV, `int.bceao.pi`) | QR scannable par toutes les applis participantes | **Non : interdit à distance** | Non (sans API Business) | Adresse de paiement (SHID, 36 caractères) |
| **E. Lien de paiement marchand** (Wave Business, OM Business) | Lien ouvert dans l'appli de l'opérateur, montant pré-rempli | Oui (prévu pour WhatsApp/SMS) | Via tableau de bord ou API de l'opérateur | Compte marchand de l'opérateur |
| **F. PI-SPI API Business** (demande de paiement + webhooks) | Notification « payer » dans sa propre appli | Oui (parcours en ligne prévu) | **Oui** | Établissement participant offrant l'API Business, certificat |
| **G. Agrégateur** (CinetPay — existant) | Page de paiement hébergée | Oui | Oui | Contrat marchand agrégateur |

### Le format QR PI-SPI, pour mémoire
Spécification publique (EMV *Merchant-Presented Mode*), bibliothèque JavaScript `@pi-spi/qrcode` (MIT) utilisée par la démo du bac à sable BCEAO. Champs utiles : schéma `int.bceao.pi` et adresse de paiement (champ 36), montant optionnel (54), pays (58), référence / TxID (62-05), canal (62-11), CRC16 (63). **Seule l'adresse de paiement de 36 caractères peut figurer dans un QR**, jamais le numéro de téléphone. Générer le QR est donc techniquement trivial : la contrainte est réglementaire (présence physique), pas technique.

---

## 2. Coûts : ordres de grandeur sur un loyer de 450 000 FCFA

> Les grilles ci-dessous viennent de sources secondaires (blogs, presse) et **divergent parfois**. À confirmer sur les grilles officielles en vigueur avant toute communication commerciale.

| Mode | Qui paie | Ordre de grandeur |
|---|---|---|
| Agrégateur (CinetPay & co.) | Bailleur | ~2,5 à 3,5 % ≈ 11 000 à 16 000 FCFA |
| Wave Business (lien / QR marchand) | Bailleur | 20 000 premiers FCFA gratuits par jour, puis 1 % ≈ 4 300 FCFA |
| OM Business | Bailleur | 2 % sous 1 M FCFA de volume, 1,5 % puis 1 % par paliers ≈ 4 500 à 9 000 FCFA |
| Transfert Wave → Wave | Locataire | 1 % avec plafond, **plafond contradictoire selon les sources (500 ou 5 000 FCFA)** |
| Transfert interopérable PI-SPI (ex. Wave → Orange) | Locataire | Gratuit jusqu'à 8 000 FCFA cumulés par jour, puis 0 à 0,8 % HT |
| PI-SPI API Business | Bailleur | Fixé par chaque établissement : « interopérable » ne veut pas dire gratuit pour le marchand |

**Conséquence produit :** en paiement direct, la plateforme ne paie rien. Selon le canal, le coût est soit supporté par le locataire (frais de transfert), soit par le bailleur (commission marchande), à un niveau généralement inférieur à celui d'un agrégateur. L'application doit **afficher honnêtement** qui paie quoi, opérateur par opérateur, et ne jamais promettre « sans frais ».

---

## 3. Le problème central : confirmer sans webhook

Sans API, la plateforme ne voit pas l'argent. Les options, de la plus simple à la plus automatisée :

| Solution | Effort bailleur | Fiabilité | Décision |
|---|---|---|---|
| **Déclaration du locataire** : opérateur, n° de transaction, numéro payeur, montant, capture facultative | Le bailleur vérifie dans son historique | Bonne si le n° de transaction est **unique en base** | ✅ Socle de l'étape 1 |
| **Collage du SMS / de la notification de l'opérateur** par le bailleur → extraction automatique (montant, payeur, n° de transaction) → rapprochement avec les déclarations en attente | 10 secondes par paiement | Très bonne | ✅ Étape 1 (assistant) |
| **Import de relevé** (export CSV/Excel de Wave Business, OM Business, banque) → rapprochement par lot | Mensuel | Excellente pour les agences | ✅ Étape 1, après le collage SMS |
| Lecture automatique des SMS sur le téléphone Android du bailleur (appli compagnon) | Nul | Bonne | ❌ Rejeté : permissions SMS restreintes par les stores, accès à des messages privés, téléphone qui devient un point de défaillance |
| « Montant unique » (450 003 FCFA) pour identifier le payeur | Nul | Moyenne | ❌ Rejeté : déroutant, source d'erreurs, inutile si le n° de transaction est exigé |
| **PI-SPI API Business** : demande de paiement et webhook | Nul | Excellente | ✅ Étape 2 |

**Règle d'or conservée :** une déclaration du locataire ne génère **jamais** de quittance seule. La quittance n'est émise qu'après confirmation du bailleur (étape 1) ou d'un webhook signé et revérifié (étape 2 / agrégateur).

---

## 4. Risques spécifiques et parades

| Risque | Scénario | Parade |
|---|---|---|
| **Fausse capture d'écran** | Le locataire déclare un paiement inexistant | Confirmation obligatoire par le bailleur, qui consulte son historique. Le collage du SMS opérateur sert de preuve côté bailleur. |
| **Réutilisation d'un n° de transaction** | Une même transaction présentée pour deux mois ou par deux locataires | Contrainte `UNIQUE (opérateur, n° de transaction)` en base, avec format validé par opérateur |
| **Substitution de numéro** | Faux message WhatsApp avec le numéro d'un escroc | Les numéros ne figurent **jamais** dans les messages (déjà le cas) et ne s'affichent que dans la page authentifiée. Affichage du **nom attendu** du bénéficiaire, que l'appli de l'opérateur montre avant validation : « Vérifiez que le nom affiché est AKWABA IMMOBILIER » |
| **Changement de numéro du bailleur** (prise de contrôle) | Le pirate remplace le numéro Wave du bailleur | Même régime que le RIB : délai de carence de 48 h, rôle `owner`, ré-authentification, alerte SMS et e-mail, audit (déjà dans la base pour `payout_accounts`) |
| **Faux lien de paiement** | Lien Wave Business d'un tiers enregistré | Liste blanche des domaines par opérateur, aperçu du nom marchand, régime de carence |
| **QR PI-SPI utilisé à distance** | Non-conformité BCEAO | Le QR n'est généré que sous forme d'**affiche PDF pour guichet physique**, jamais dans la page de paiement ni dans un message |
| **Plafonds de portefeuille** | Agence qui encaisse des dizaines de loyers | Avoirs plafonnés à 4 M FCFA depuis le 2 novembre 2026 ; Wave : réception plafonnée à 15 M FCFA par mois. Alerte au bailleur quand l'encaissement prévisionnel du mois approche le plafond, et recommandation d'un compte bancaire ou marchand pour les agences. |
| **Compte personnel utilisé à titre commercial** | Conditions générales d'opérateur non respectées | Informer le bailleur ; recommander un compte marchand dès qu'il y a du volume (agences) |
| **Litige « j'ai payé »** | Le bailleur ne confirme pas | Délai de réponse affiché, relance automatique du bailleur à 48 h, historique horodaté et audité de la déclaration (preuve pour le locataire) |

**Effet de bord positif :** la plateforme ne touche jamais les fonds, ce qui supprime le risque réglementaire de « service de paiement » identifié dans `ANALYSE.md`.

---

## 5. Conception cible (étape 1)

### 5.1 Données (nouvelles migrations, pas de modification des anciennes)
- `payout_accounts` : ajouter les types `pispi_alias` et `payment_link`, ainsi que les colonnes `pispi_alias` (téléphone `+225…` ou SHID UUID), `payment_link_url` (domaines en liste blanche) et `display_name_expected`. Le régime de carence de 48 h s'applique à tous les types. Plusieurs comptes actifs autorisés (un par opérateur).
- Nouveau fournisseur `payment_provider = 'direct'`.
- `payments` : colonnes `operator_txn_ref` et `payer_msisdn`, et index unique `(operator, upper(operator_txn_ref))` quand `provider = 'direct'`. Pour ce mode, la preuve (capture) est facultative mais recommandée.
- Table `org_payment_settings` : canaux activés (`direct`, `cinetpay`, `virement`, `especes`), texte d'information sur les frais.
- Table `operator_ref_formats` (configurable) : expression régulière du n° de transaction par opérateur, à **relever sur de vrais reçus pendant le pilote** (aucun format n'est figé à l'aveugle).

### 5.2 Fonctions SQL
- `submit_direct_payment(p_actor, p_invoice, p_operator, p_amount, p_txn_ref, p_payer_msisdn, p_proof_path, p_ip, p_ua)` : mêmes garde-fous que `submit_transfer_proof` (appartenance, montant ≤ reste dû, limite de déclarations en attente, unicité de la référence).
- Généraliser `review_transfer` en **`review_manual_payment`**, valable pour virement et direct, avec la même séparation des tâches et le même motif de rejet obligatoire.
- `match_operator_notification(p_actor, p_org, p_parsed jsonb)` : propose les déclarations correspondantes (même opérateur, même montant, même référence ou même payeur, fenêtre de 72 h) **sans valider automatiquement**. La validation reste un clic du bailleur.

### 5.3 Parcours locataire (`/pay/[invoiceId]`, onglet « Mobile Money »)
1. Choix de l'opérateur **du locataire**. Si le bailleur n'a pas de compte sur ce réseau, l'application propose le transfert interopérable PI-SPI vers l'alias du bailleur et affiche le barème de frais correspondant.
2. Affichage : numéro ou alias à copier, **nom attendu du bénéficiaire**, montant, référence, rappel des frais à la charge du locataire.
3. Raccourcis : bouton « Ouvrir le menu Orange Money / MoMo » (lien `tel:` vers le code USSD, à valider sur les appareils du pilote), ou lien de paiement marchand Wave / OM Business s'il est configuré.
4. Formulaire « J'ai payé » : opérateur, n° de transaction (format contrôlé), numéro payeur, montant, capture facultative. Statut « En attente de confirmation du bailleur », visible dans l'historique.

### 5.4 Parcours bailleur (tableau de bord)
- La carte « Virements à valider » devient **« Paiements à confirmer »** (virements et paiements directs).
- **Assistant de rapprochement** : zone « Collez le SMS de l'opérateur ». Les analyseurs, un par opérateur, sont testés sur des échantillons anonymisés collectés pendant le pilote. La déclaration correspondante est surlignée, puis le bailleur clique sur « Confirmer ». Le texte collé est conservé en empreinte (SHA-256), pas en clair.
- Import de relevé CSV (phase suivante) pour un rapprochement par lot.
- Paramètres : comptes de réception par opérateur, alias PI-SPI, liens marchands, avec carence de 48 h et alertes.

### 5.5 QR PI-SPI : uniquement en présentiel
- Bouton « Imprimer l'affiche de guichet » : PDF A5 contenant le QR statique (adresse de paiement SHID du bailleur, sans montant, référence = code agence), le nom du bénéficiaire et la consigne « indiquez la référence de votre avis ». Généré avec `@pi-spi/qrcode`.
- **Interdit** dans la page de paiement, dans les avis d'échéance, dans les messages WhatsApp/SMS/e-mail. Un test automatisé vérifie qu'aucune page locataire ne rend de payload `int.bceao.pi`.

---

## 6. Plan de validation terrain (avant développement complet)

1. **Juridique / conformité** : faire confirmer par l'établissement participant d'un bailleur pilote (a) l'interdiction QR à distance et son périmètre exact (une affiche dans le hall d'un immeuble est-elle une « présence physique » ?), (b) la tolérance d'usage d'un compte personnel pour encaisser des loyers.
2. **Relevé des formats** : collecter 5 reçus et SMS anonymisés par opérateur (Orange, MTN, Moov, Wave, PI-SPI entrant) pour fixer les expressions régulières de n° de transaction et les analyseurs de SMS.
3. **Frais réels** : vérifier sur les grilles officielles à jour (Wave, Orange, MTN, Moov, transferts PI-SPI).
4. **USSD** : tester les liens `tel:` sur Android et iOS (les codes contenant `#` sont souvent bloqués ou exigent un encodage).
5. **API Business** : identifier quels établissements ivoiriens ouvrent l'API Business PI-SPI à leurs clients entreprises, et à quelles conditions (certificat, mTLS, frais).
6. **Pilote** : 1 agence et 10 baux pendant 2 cycles de loyer. Indicateurs : délai médian entre déclaration et confirmation, taux de rejet, taux d'erreurs de référence.

---

## 7. Sources

- PI-SPI, Centre d'aide développeurs BCEAO (interdiction du QR à distance) : https://developer.pispi.bceao.int/centre-aide
- PI-SPI, Vue d'ensemble et génération du QR : https://developer.pispi.bceao.int/guides/qr-overview · https://developer.pispi.bceao.int/guides/qr-generation · démo : https://developer.pispi.bceao.int/demos/qrcode
- Format EMV du QR PI-SPI (implémentation de référence) : https://github.com/dofbi/caabi · https://root.packagist.org/packages/catidegla/pi-spi-qr
- Wave rejoint PI-SPI (participants CI, 30/09/2026) : https://dabafinance.com/fr/nouvelles/wave-rejoint-le-reseau-de-paiement-instantane-pi-spi-de-la-bceao-2026-10-02 · https://allafrica.com/stories/202610050727.html
- Accès PI-SPI dans l'appli Wave, plafond de réception : https://www.financialafrik.com/2026/11/06/wave-rejoint-le-systeme-dinteroperabilite-pi-spi/
- Orange Côte d'Ivoire, PI-SPI dans Max it : https://www.orange.ci/fr/max-it/orange-money/interoperabilite-paiement-mobile-universel.html
- Règles au 2 novembre 2026 (plafond 4 M, transferts interopérables via PI-SPI) : https://www.seneweb.com/fr/news/Economie/mobile-money-la-bceao-change-les-regles-ce-que-vous-devez-savoir_n_999002504.html
- Comparatif des QR (Wave, OM, PI-SPI) et frais : https://tech-toolsafrique.com/encaisser-qr-code-wave-orange-money-pi-spi/
- Wave Business (QR statique/dynamique, lien de paiement) : https://kolonell.com/fr/blog/wave-cote-ivoire-integration-marchand-abidjan-2026
- OM Business (QR, lien de paiement) : https://apps.apple.com/us/app/-/id6746136599
- Retour d'expérience d'un projet immobilier ivoirien sur PI-SPI : https://github.com/bkourouma/immotopia/pull/200
