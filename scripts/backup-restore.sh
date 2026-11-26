#!/usr/bin/env bash
# P4.6 — Restauration d'une sauvegarde déchiffrée (lue sur l'entrée standard) dans une base
# dont le schéma est à jour (migrations appliquées) et les tables vidées.
# Déclencheurs désactivés le temps de la restauration (session_replication_role = replica) :
# le journal d'audit et les quittances sont réinsérés TELS QUELS (empreintes et chaîne
# d'origine), sans recalcul ni contrôle d'immuabilité.
# Usage : age -d -i cle.txt sauvegarde.sql.age | scripts/backup-restore.sh psql "<url>"
set -euo pipefail
{ echo "begin;"; echo "set session_replication_role = replica;"; cat; echo "commit;"; } | "$@"
