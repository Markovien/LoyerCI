# Sauvegarde et restauration (P4.6, décision du 26/11/2026 : option gratuite)

## Principe

| | |
|---|---|
| **Quoi** | Les données de la base : schémas `public` et `private`, comptes (`auth.users`, `auth.identities`). Le schéma lui-même vient des migrations. |
| **Quand** | Chaque jour à 02:15 (UTC = heure d'Abidjan), par GitHub Actions (`.github/workflows/backup.yml`), gratuit. |
| **Où** | Artefact GitHub du dépôt, conservé **30 jours**. |
| **Protection** | Chiffré avec la **clé publique age** de l'équipe. La clé privée reste **hors ligne** : ni GitHub ni un attaquant qui volerait l'artefact ne peut le lire. |
| **Perte maximale (RPO)** | 24 heures. |
| **Durée de reprise (RTO)** | Environ 1 heure (nouveau projet, migrations, restauration, contrôles). |
| **Vérifié** | À chaque livraison, la CI sauvegarde, vide puis restaure la base locale, et contrôle volumes, chaîne d'audit et signature d'une quittance (`scripts/backup-restore-test.sh`). |

### Ce que la sauvegarde ne contient pas (à savoir)

1. **Le secret de signature des quittances et des avis** (`receipt_signing_key`, dans Vault). Il est lié au projet : sans lui, après une restauration dans un nouveau projet, **toutes les quittances apparaîtraient « altérées »** sur `/verify`. Il se conserve **à part, hors ligne**, avec la clé privée age.
2. **Les fichiers** du stockage (preuves de virement, bucket `transfer-proofs`). Les PDF des avis et quittances, eux, sont régénérés à l'identique depuis la base. Les preuves perdues ne bloquent rien (le paiement validé reste en base) ; une copie des fichiers pourra être ajoutée plus tard.
3. **Les sessions et jetons de connexion** : après restauration, chacun se reconnecte (lien magique). C'est voulu.
4. Les compteurs du limiteur de débit (sans valeur).

## Mise en place (une fois)

1. **Clé de chiffrement**, sur un poste de confiance (pas sur un serveur) :
   ```bash
   age-keygen -o loyerci-sauvegarde.key     # affiche « Public key: age1… »
   ```
   Conserver `loyerci-sauvegarde.key` **hors ligne, en deux exemplaires** (ex. deux clés USB dans deux lieux sûrs). Qui perd cette clé perd l'accès aux sauvegardes.
2. **Secret de signature** : dans l'éditeur SQL de Supabase, lire la valeur et la ranger avec la clé privée (même support, même précautions) :
   ```sql
   select decrypted_secret from vault.decrypted_secrets where name = 'receipt_signing_key';
   ```
3. **GitHub** → *Settings* → *Environments* → créer `production` (éventuellement avec relecteurs obligatoires), puis ses secrets :
   - `BACKUP_AGE_RECIPIENT` : la clé publique `age1…` ;
   - `BACKUP_DATABASE_URL` : chaîne de connexion **Session pooler** de Supabase (*Project Settings* → *Database*), compatible IPv4.
   Ce secret donne accès à toute la base : seuls les administrateurs du dépôt doivent pouvoir modifier les workflows ; changer le mot de passe de la base en cas de doute.
4. Lancer une première fois le workflow à la main (*Actions* → *Sauvegarde quotidienne* → *Run workflow*) et vérifier qu'un artefact apparaît.

## Restauration (incident)

1. **Nouveau projet Supabase** (région UE), puis appliquer les migrations : `supabase link --project-ref <ref> && supabase db push`.
2. **Recréer le secret de signature avec la valeur conservée** (pas une nouvelle !) :
   ```sql
   select vault.create_secret('<valeur conservée>', 'receipt_signing_key');
   ```
3. **Télécharger la dernière sauvegarde** (*Actions* → exécution → artefact), puis restaurer :
   ```bash
   age -d -i loyerci-sauvegarde.key loyerci-AAAA-MM-JJ.sql.age \
     | scripts/backup-restore.sh psql "<chaîne de connexion du nouveau projet>" -v ON_ERROR_STOP=1 -q
   ```
   La restauration se fait en une transaction, déclencheurs désactivés : le journal d'audit et les quittances sont réinsérés tels quels, avec leurs empreintes d'origine.
4. **Contrôles** avant de rouvrir :
   ```sql
   select count(*) from private.verify_audit_chain();   -- doit valoir 0
   select count(*) from public.receipts;                -- comparer à la veille
   ```
   puis vérifier une quittance sur `/verify` : elle doit être « authentique ».
5. Mettre à jour les variables d'environnement de l'application (URL et clés du nouveau projet), redéployer, rétablir les tâches planifiées (`supabase/migrations/*_platform*.sql`).
6. Consigner l'incident (date, cause, perte éventuelle) ; prévenir l'ARTCI si des données personnelles ont été compromises.

## Plus tard

- Restauration à la seconde près (PITR, payante) quand le volume de paiements le justifiera.
- Copie des fichiers du stockage et copie inaltérable (WORM) du journal d'audit (P4.4, reportée).
