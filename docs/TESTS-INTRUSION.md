# Cahier des charges du test d'intrusion externe (P4.7)

> À confier à un prestataire indépendant **avant l'ouverture au public**, sur un environnement de
> préproduction identique à la production (mêmes réglages Supabase, Vercel et en-têtes), avec des
> données fictives. La revue interne automatisée (garde-fous SQL, en-têtes, dépendances) ne remplace
> pas ce regard extérieur.

## Périmètre

| Inclus | Exclu |
|---|---|
| Application web (toutes les pages, Server Actions, routes `/api/*`) | Infrastructure de Supabase et de Vercel (hors configuration du projet) |
| API PostgREST et Realtime du projet Supabase, avec les clés publiques | Attaques par déni de service, ingénierie sociale |
| Comptes de test : propriétaire, gestionnaire, comptable, locataire, et deux organisations | Envois réels de SMS, CinetPay en production, adresses e-mail réelles |

## Ce que nous voulons savoir en priorité

1. **Cloisonnement** : un membre ou un locataire d'une organisation peut-il lire ou modifier quoi que ce soit d'une autre (RLS, fonctions, PDF, fichiers, Realtime, journaux) ?
2. **Rôles** : un gestionnaire peut-il confirmer un encaissement, ajouter des coordonnées de réception, exporter le journal ? Un comptable peut-il gérer l'équipe ?
3. **Argent** : peut-on obtenir une quittance sans paiement confirmé (webhook forgé ou rejoué, montant modifié, double imputation, course entre deux confirmations) ?
4. **Coordonnées de réception** : contournement de la carence de 48 h, de la ré-authentification par code, ou de l'alerte ?
5. **Faux documents** : forger ou modifier une quittance ou un avis qui passerait `/verify` ; énumérer des documents (y compris purgés).
6. **Comptes** : inscription sans invitation, prise de contrôle par lien magique ou par lien d'invitation, fixation de session, redirection ouverte (`next=`).
7. **Données personnelles** : fuite de numéros, d'e-mails ou de noms complets (pages publiques, messages, journaux, rapports CSP, exports).
8. **Fichiers** : dépôt de fichier actif (HTML, SVG, PDF avec JavaScript), lecture d'une preuve d'une autre organisation, URL signée réutilisable.
9. **Tâches planifiées** (`/api/cron/*`) et limiteur de débit (contournement, saturation).
10. **En-têtes et CSP** : injection de script malgré la CSP à nonce.

## Attendus

- Rapport avec preuves, gravité (CVSS) et recommandations ; contre-test après correction.
- Chaque faille confirmée donne lieu à un correctif **et** à un test de non-régression (scénario SQL ou e2e), puis est consignée dans `docs/AUDIT-SECURITE.md`.
