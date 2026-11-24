# LoyerCI — Gestion locative sécurisée pour la Côte d'Ivoire

PWA Next.js 16 + Supabase, pensée d'abord pour le **bailleur** (propriétaire, agence, gestionnaire, comptable) :
parc, locataires, baux, avis d'échéance signés, encaissements, quittances signées vérifiables, équipe et
journal d'audit. Le locataire, souvent peu à l'aise avec le numérique, **reçoit** ses avis et quittances
(e-mail, WhatsApp) et peut en vérifier l'authenticité ; un compte locataire est facultatif.
Devise : franc CFA (XOF), montants entiers. Interface en français (fr-CI), mobile d'abord (390 px).

**Les fonds ne transitent jamais par LoyerCI** : le locataire paie directement sur les comptes du bailleur
(Mobile Money, virement, alias PI-SPI, espèces), puis le bailleur confirme la réception. CinetPay reste une
option.

👉 Lire d'abord **[ROADMAP.md](ROADMAP.md)** (avancement et décisions), **[docs/ANALYSE.md](docs/ANALYSE.md)**
(modèle de sécurité), **[docs/AUDIT-SECURITE.md](docs/AUDIT-SECURITE.md)** (failles corrigées, risques ouverts),
**[docs/ETUDE-PAIEMENT-DIRECT.md](docs/ETUDE-PAIEMENT-DIRECT.md)** (stratégie de paiement) et
**[CLAUDE.md](CLAUDE.md)** (invariants de sécurité à ne jamais enfreindre).

## Démarrage local

```bash
npm install
supabase start                       # Docker requis
supabase db reset                    # migrations + secret Vault de dev (supabase/seed.sql)
cp .env.example .env.local           # renseigner les clés affichées par `supabase status`
npm run seed                         # données de démonstration (Cocody, Marcory, Yopougon, Bouaké…)
npm run dev
```

Connexion par lien magique (boîte mail locale : http://127.0.0.1:54324). Comptes de démonstration :

| Rôle | E-mail | Ce qu'on y voit |
|---|---|---|
| Propriétaire | `adjoua.coulibaly@akwaba-immo.ci` | Tout : encaissements à confirmer, réception des fonds, équipe, journal |
| Comptable | `compta@akwaba-immo.ci` | Encaissements, envois ; espèces au-delà du seuil soumises à la propriétaire |
| Locataire | `jm.kouassi@exemple.ci` | Villa Duplex 5 pièces, Cocody Riviera 3, 450 000 FCFA |

Le seed contient notamment les comptes Orange Money et Wave du bailleur, une adresse de paiement PI-SPI
(affiche de guichet), un virement à valider, des espèces au-delà du seuil à confirmer, une déclaration de
paiement direct **en attente** et une **confirmée** (quittance émise).

## Tests

Une tâche n'est terminée que si tout passe :

```bash
npm run lint && npm run typecheck
npm test            # 47 tests unitaires (signatures, Zod, références, fichiers, CSV, payload PI-SPI, garde-fous)
npm run test:db     # 76 scénarios de sécurité + 3 tests de concurrence sur un PostgreSQL éphémère
npm run build
npm run e2e         # 47 tests Playwright (16 suites) contre l'environnement local seedé, à 390 px
```

`test:db` nécessite `initdb`/`pg_ctl` (PostgreSQL 15+) et un utilisateur non-root.

## Arborescence

```
loyerci/
├── ROADMAP.md, CLAUDE.md               Feuille de route + invariants de sécurité
├── docs/                               Analyse, audit de sécurité, étude du paiement direct
├── supabase/
│   ├── migrations/                     Schéma, RLS, fonctions SECURITY DEFINER (jamais modifiées : on en ajoute)
│   │   └── *_platform*.sql             Storage, Realtime, pg_cron (propres à Supabase, hors test:db)
│   └── tests/                          Émulation Supabase + scénarios de sécurité SQL
├── scripts/                            Seed (local uniquement), lanceur test:db, garde-fou d'imports
├── src/
│   ├── proxy.ts                        CSP à nonce, session Supabase, garde de routes
│   ├── app/
│   │   ├── (owner)/dashboard/          ★ Espace bailleur
│   │   │   ├── page.tsx                  KPIs, encaissements à confirmer, documents à envoyer, avis du mois
│   │   │   ├── biens/, locataires/, baux/  Parc, fiches et invitations, baux (avance, résiliation)
│   │   │   ├── audit/                    Journal d'audit, filtres, export CSV, intégrité
│   │   │   └── parametres/               Réception des fonds (carence 48 h), envois, équipe
│   │   ├── (tenant)/pay/               ★ Espace locataire : avis, quittances, « J'ai payé »
│   │   ├── verify/                     ★ Vérification publique des quittances et avis
│   │   ├── invitation/[token]/         Rattachement d'un compte locataire (usage unique)
│   │   └── api/                        PDF (avis, quittances, affiche PI-SPI), exports CSV, webhook signé
│   ├── lib/
│   │   ├── payments/                   Références, CinetPay (option), payload QR PI-SPI (affiche seule)
│   │   ├── documents/, receipts/       PDF signés (pdf-lib, polices standard)
│   │   ├── security/                   HMAC temps constant, IP fiable, débit, fichiers (octets magiques)
│   │   ├── auth/session.ts             Utilisateur vérifié, organisation active
│   │   └── validation/schemas.ts       Schémas Zod (téléphones CI, IBAN, montants XOF…)
│   └── components/                     UI (style shadcn/ui)
└── tests/                              Unitaires (Vitest) et e2e (Playwright)
```

## Affiche de guichet PI-SPI

La BCEAO interdit le QR PI-SPI pour les paiements à distance. LoyerCI ne le produit donc **que** sous forme
d'affiche A5 imprimable, à poser au guichet (Réception des fonds → « Imprimer l'affiche de guichet ») :
QR statique **sans montant**, nom du bénéficiaire à vérifier, consigne « indiquez la référence de votre
avis ». Payload générée et revalidée par la bibliothèque officielle de la BCEAO `@pi-spi/qrcode`. Seule
l'adresse de paiement PI-SPI (36 caractères) peut y figurer, jamais un numéro de téléphone ; pas d'affiche
pendant la carence de 48 h. Un test vérifie qu'aucune page locataire ne contient de payload PI-SPI.

## Mise en production — liste de contrôle

- [ ] Supabase en région UE (décision D3) et dossier ARTCI déposé ; durée légale de conservation des documents arrêtée
- [ ] Secret Vault `receipt_signing_key` aléatoire (64 hex) : `select vault.create_secret(encode(gen_random_bytes(32),'hex'),'receipt_signing_key');`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (et, si CinetPay est utilisé, ses trois clés) uniquement côté serveur, jamais en `NEXT_PUBLIC_`
- [ ] `CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` adaptés à l'hébergeur (Vercel : `x-real-ip`)
- [ ] Inscription publique fermée sur le projet hébergé comme en local : `[auth] enable_signup = false`, **pas** celui de `[auth.email]`, qui couperait la connexion (M6) ; invitation seule (D1)
- [ ] Limiteur de débit partagé (Redis)
- [ ] Notifications : `SMTP_URL` et `MAIL_FROM` (adresse LoyerCI avec SPF, DKIM et DMARC), `CRON_SECRET` aléatoire ; ordonnanceur toutes les 5 min sur `/api/cron/notifications` (`vercel.json` : offre Vercel permettant cette fréquence, sinon ordonnanceur externe)
- [ ] Export externe régulier de la tête de chaîne d'audit (`private.audit_chain_head()`)
- [ ] Contrôle manuel d'une affiche PI-SPI imprimée avec l'application d'un établissement participant
- [ ] Tests d'intrusion
- [ ] Types à jour : `npm run gen:types`
