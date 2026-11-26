#!/usr/bin/env bash
# P4.6 — Contenu de la sauvegarde (données seulement : le schéma vient des migrations).
# Utilise DATABASE_URL (production) ou, dans le conteneur local, le rôle supabase_admin.
# Exclus : sessions et jetons de connexion (reconnexion exigée après restauration, plus sûr),
# compteurs du limiteur (sans valeur). Le secret de signature (Vault) n'est PAS dans la
# sauvegarde : il se conserve à part (voir docs/SAUVEGARDE-RESTAURATION.md).
set -euo pipefail
OPTS=(--data-only --no-owner --no-privileges)
if [[ -n "${DATABASE_URL:-}" ]]; then OPTS+=(-d "$DATABASE_URL"); else OPTS+=(-U supabase_admin -d postgres); fi
pg_dump "${OPTS[@]}" --schema=public --schema=private --exclude-table=private.rate_limits
pg_dump "${OPTS[@]}" --table=auth.users --table=auth.identities
