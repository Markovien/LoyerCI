# LoyerCI — Gestion locative sécurisée pour la Côte d'Ivoire

PWA Next.js 16 + Supabase : avis d'échéance partagés par WhatsApp, paiement Mobile Money
(Orange Money, MTN MoMo, Wave, Moov Money via CinetPay) ou virement avec référence unique,
quittances signées vérifiables par QR code. Devise : franc CFA (XOF), montants entiers.

👉 Lire d'abord **[docs/ANALYSE.md](docs/ANALYSE.md)** (modèle de sécurité), **[docs/ETUDE-PAIEMENT-DIRECT.md](docs/ETUDE-PAIEMENT-DIRECT.md)** (paiement sans agrégateur) et **[ROADMAP.md](ROADMAP.md)** (suite du développement, à donner à Claude Code avec `CLAUDE.md`).

## Démarrage local

```bash
npm install
supabase start                       # Docker requis
supabase db reset                    # migrations + secret Vault de dev (supabase/seed.sql)
cp .env.example .env.local           # renseigner les clés affichées par `supabase status`
npm run seed                         # données de démonstration (Cocody, Marcory, Bouaké…)
npm run dev
```

Comptes de démonstration (connexion par lien magique, boîte mail locale sur http://127.0.0.1:54324) :
propriétaire `adjoua.coulibaly@akwaba-immo.ci`, locataire `jm.kouassi@exemple.ci`
(Villa Duplex 5 pièces, Cocody Riviera 3, loyer 450 000 FCFA).

## Tests

```bash
npm run test:db     # 34 scénarios de sécurité sur un PostgreSQL éphémère (RLS, idempotence, audit…)
npm test            # tests unitaires (HMAC, Zod, références, formats)
npm run typecheck && npm run build
```

`test:db` nécessite `initdb`/`pg_ctl` (PostgreSQL 15+) et un utilisateur non-root.

## Arborescence

```
loyerci/
├── docs/ANALYSE.md                     Analyse critique + modèle de menace
├── supabase/
│   ├── migrations/
│   │   ├── …0100_schema.sql            Tables, contraintes métier/légales, audit chaîné, immuabilité
│   │   ├── …0200_rls.sql               RLS sur toutes les tables, privilèges en lecture seule
│   │   ├── …0300_business_functions.sql Fonctions métier transactionnelles (paiement, quittance, RIB…)
│   │   └── …0400_platform.sql          Bucket privé, Realtime, planification pg_cron
│   ├── seed.sql                        Secret Vault de développement
│   └── tests/                          Émulation Supabase + scénarios de sécurité SQL
├── scripts/
│   ├── seed.ts                         Données de démo réalistes (local uniquement)
│   └── test-db.sh                      Lanceur des tests SQL (+ test de concurrence)
├── src/
│   ├── proxy.ts                        CSP à nonce, session Supabase, garde de routes
│   ├── app/
│   │   ├── (owner)/dashboard/          ★ Tableau de bord propriétaire
│   │   │   ├── page.tsx                  KPIs, virements à valider, avis du mois
│   │   │   ├── actions.ts                Valider/rejeter virement, voir preuve, espèces
│   │   │   └── _components/              KPI, liste d'avis, partage WhatsApp/SMS/e-mail, temps réel
│   │   ├── (tenant)/pay/               ★ Module de paiement locataire
│   │   │   ├── page.tsx                  Mes avis
│   │   │   └── [invoiceId]/              Mobile Money (Orange/MTN/Wave/Moov) + virement & preuve, retour
│   │   ├── verify/[receiptId]/         ★ Vérification publique de quittance (QR code)
│   │   ├── api/webhooks/payment/       Webhook signé HMAC, revérifié, idempotent
│   │   ├── api/receipts/[id]/pdf/      Quittance PDF avec QR (accès RLS)
│   │   ├── login/, auth/callback/      Connexion par lien magique
│   │   └── manifest.ts                 PWA
│   ├── lib/
│   │   ├── payments/                   Interface fournisseur, adaptateur CinetPay, référence
│   │   ├── security/                   HMAC temps constant, IP fiable, débit, fichiers
│   │   ├── supabase/                   Clients utilisateur / service_role / navigateur
│   │   ├── validation/schemas.ts       Schémas Zod (téléphones CI, IBAN, montants XOF…)
│   │   ├── receipts/pdf.ts             Génération de quittance (pdf-lib + QR)
│   │   └── whatsapp.ts, format.ts      Avis d'échéance, formats FCFA/dates
│   └── components/                     UI (style shadcn/ui), badges de statut
└── tests/                              Tests unitaires Vitest
```

## Mise en production — liste de contrôle

- [ ] Secret Vault `receipt_signing_key` aléatoire (64 hex) : `select vault.create_secret(encode(gen_random_bytes(32),'hex'),'receipt_signing_key');`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` et `CINETPAY_SECRET_KEY` uniquement côté serveur
- [ ] `CLIENT_IP_HEADER` adapté à l'hébergeur (Vercel : `x-real-ip`)
- [ ] URL de notification CinetPay : `https://<domaine>/api/webhooks/payment?provider=cinetpay`
- [ ] Limiteur de débit Redis, OTP SMS, alertes de changement de RIB
- [ ] Déclaration ARTCI, politique de rétention, tests d'intrusion
- [ ] Types générés : `npx supabase gen types typescript --local > src/types/supabase.ts`
