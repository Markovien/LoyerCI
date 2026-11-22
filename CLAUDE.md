# CLAUDE.md — Instructions permanentes pour Claude Code

Projet : **LoyerCI**, une PWA de gestion locative pour la Côte d'Ivoire (devise XOF, montants entiers).
Stack : Next.js 16 (App Router, `src/proxy.ts` remplace `middleware.ts`), TypeScript strict, Tailwind v4, composants de style shadcn/ui, Supabase (PostgreSQL, Auth, Storage, Realtime) et Zod 4.

**À lire avant toute tâche :** `ROADMAP.md` (quoi faire, dans quel ordre), `docs/ANALYSE.md` (modèle de sécurité), `docs/AUDIT-SECURITE.md` (failles corrigées et risques ouverts) et `docs/ETUDE-PAIEMENT-DIRECT.md` (stratégie de paiement).

## Commandes

```bash
npm run typecheck     # tsc strict — doit passer
npm test              # Vitest (tests/)
npm run test:db       # migrations + scénarios SQL sur un PostgreSQL éphémère (utilisateur non-root)
npm run build         # build de production
supabase start && supabase db reset && npm run seed   # environnement local complet
```

Une tâche n'est **terminée** que si ces quatre commandes passent. Chaque nouvelle règle de sécurité SQL est accompagnée d'un scénario dans `supabase/tests/01_security_scenarios.sql`.

## Invariants de sécurité — ne jamais enfreindre

1. **Aucune écriture client directe.** `anon` et `authenticated` n'ont que `SELECT` (filtré par la RLS). Toute mutation passe par une fonction SQL `SECURITY DEFINER`, avec `set search_path = ''` et des noms entièrement qualifiés, et `GRANT EXECUTE` **uniquement** à `service_role`. Elle reçoit `p_actor` et revérifie le rôle (`private.assert_role` / `private.assert_tenant`).
2. **`p_actor` vient toujours de `supabase.auth.getUser()` côté serveur**, jamais d'un champ de formulaire.
3. **Le montant d'un paiement en ligne est calculé en base**, jamais reçu du navigateur.
4. **Une quittance n'est émise que par `private.apply_payment`**, quand l'avis est soldé, après une confirmation fiable (webhook signé **et** revérifié, ou validation humaine d'un bailleur). Une déclaration du locataire seule ne suffit jamais.
5. **Idempotence** : toute référence externe (transaction fournisseur, n° de transaction opérateur) est protégée par une contrainte `UNIQUE` et par `SELECT … FOR UPDATE`.
6. **Journal d'audit** : toute action sensible appelle `private.log(...)` avec l'IP et l'user-agent. Ne jamais accorder `UPDATE`/`DELETE` sur `audit_logs`. Ajouter les nouvelles actions à la contrainte `CHECK` de `audit_logs.action` par une nouvelle migration.
7. **Coordonnées de réception des fonds** (RIB, numéros Mobile Money, alias PI-SPI, liens marchands) : on ajoute, on ne modifie jamais ; la carence de 48 h s'applique ; rôle `owner` uniquement ; **ré-authentification vérifiée en base** (autorisation `grant_reauth` à usage unique, 5 min, délivrée après vérification d'un code) consommée par tout ajout ; alerte en file `private.outbox` et bandeau pendant la carence.
8. **Jamais de QR PI-SPI dans une page de paiement, un avis ou un message** (interdiction BCEAO du QR à distance). Seule l'affiche de guichet imprimable est autorisée.
9. **Jamais de numéro de compte, de RIB ni de numéro Mobile Money dans un message WhatsApp/SMS/e-mail** : uniquement le lien vers la page authentifiée.
10. **La clé `service_role` et les secrets ne quittent pas le serveur** : modules marqués `import "server-only"`, jamais de préfixe `NEXT_PUBLIC_`.
11. **Validation Zod** de toute entrée (Server Actions, routes, paramètres d'URL). Les Server Actions sont des endpoints publics : vérifier session, débit et entrée dans chacune.
12. **Fichiers téléversés** : type déterminé par les octets magiques (`src/lib/security/files.ts`), nom généré par le serveur, bucket privé, lecture par URL signée de 60 s après journalisation.
13. **Rien n'est exposé implicitement** : depuis la migration `…0500_security_hardening`, les nouvelles tables et fonctions ne sont accessibles à `anon`/`authenticated` que par `GRANT` explicite. Toute fonction exécutable par `authenticated` doit être ajoutée **consciemment** à la liste blanche du garde-fou de `01_security_scenarios.sql` ; `anon` n'exécute **aucune** fonction (même `verify_receipt` passe par le serveur).
14. **Signatures versionnées** : quittances (`signature_version`) et audit (`hash_version`). Toute évolution du contenu signé crée une nouvelle version ; les anciennes restent vérifiables. La signature couvre **tous** les champs affichés ou imprimés.

## Conventions

- **Migrations** : **ne jamais modifier** un fichier de `supabase/migrations/` existant. Créer `supabase/migrations/<AAAAMMJJHHMMSS>_<sujet>.sql`. `scripts/test-db.sh` les rejoue toutes, sauf celles nommées `*_platform*.sql` (Storage, Realtime, pg_cron : propres à Supabase).
- **Types** : après toute migration, régénérer `src/types/supabase.ts` (`npx supabase gen types typescript --local`). Garder `src/types/database.ts` pour les formes de requêtes imbriquées.
- **Lectures** : client utilisateur (`createSupabaseServer`), qui applique la RLS. **Écritures** : `supabaseAdmin().rpc(...)` exclusivement. Erreurs SQL converties via `dbErrorMessage`.
- **Interface en français** (fr-CI), mobile d'abord (largeur de référence 390 px), montants via `formatXOF`, dates via `src/lib/format.ts` (fuseau `Africa/Abidjan`).
- **PDF** : polices standard pdf-lib, donc texte passé par `clean()` (pas d'espaces Unicode exotiques).
- **Données de démo** : Abidjan (Cocody, Marcory, Yopougon, Plateau…) et intérieur (Bouaké, Bingerville…) ; locataire de référence : Kouassi Jean-Marc, Villa Duplex Cocody Riviera 3, 450 000 FCFA.
- Petits commits ciblés, un par tâche de la feuille de route, avec l'identifiant de la tâche dans le message (ex. `P1.3: …`).
