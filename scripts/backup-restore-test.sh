#!/usr/bin/env bash
# =============================================================================
# LoyerCI — P4.6 : test de sauvegarde ET de restauration (environnement LOCAL uniquement).
#   1. sauvegarde des données (mêmes options que la sauvegarde quotidienne), chiffrée avec age ;
#   2. déchiffrement, puis restauration dans la base (tables vidées au préalable) ;
#   3. contrôles : volumes identiques, chaîne d'audit intacte, quittance toujours authentique.
# Usage : supabase start && supabase db reset && npm run seed && ./scripts/backup-restore-test.sh
# =============================================================================
set -euo pipefail
DB_CONTAINER="${DB_CONTAINER:-supabase_db_loyerci}"
PSQL=(docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -At)
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

counts() {
  "${PSQL[@]}" -c "select concat_ws('/', (select count(*) from public.organizations), (select count(*) from public.invoices),
    (select count(*) from public.payments), (select count(*) from public.receipts), (select count(*) from public.notices),
    (select count(*) from public.audit_logs), (select count(*) from auth.users))"
}

echo "→ clé de test (en production : clé publique de l'équipe, clé privée hors ligne)"
age-keygen -o "$WORK/cle.txt" 2>/dev/null
RECIPIENT="$(age-keygen -y "$WORK/cle.txt")"

BEFORE="$(counts)"
RECEIPT="$("${PSQL[@]}" -c "select id || ' ' || left(signature, 16) from public.receipts where status = 'valide' limit 1")"
echo "→ sauvegarde chiffrée (volumes : $BEFORE)"
docker exec -i "$DB_CONTAINER" bash /dev/stdin < scripts/backup-dump.sh | age -r "$RECIPIENT" > "$WORK/sauvegarde.sql.age"
if head -c 200 "$WORK/sauvegarde.sql.age" | grep -q "COPY\|INSERT"; then echo "  ÉCHEC : sauvegarde non chiffrée"; exit 1; fi
echo "  $(du -h "$WORK/sauvegarde.sql.age" | cut -f1) chiffrés"

echo "→ base vidée, puis restauration"
# (Simulation d'une base neuve : en vrai, on restaure dans un projet vide. Les déclencheurs
# qui interdisent de vider le journal d'audit sont contournés pour ce seul test.)
"${PSQL[@]}" -c "set client_min_messages = warning; set session_replication_role = replica; do \$\$ declare t text; begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ') into t from pg_tables where schemaname in ('public', 'private');
  execute 'truncate ' || t || ', auth.users, auth.identities restart identity cascade';
end \$\$;"
[[ "$(counts)" == "0/0/0/0/0/0/0" ]] || { echo "  ÉCHEC : base non vidée"; exit 1; }
age -d -i "$WORK/cle.txt" "$WORK/sauvegarde.sql.age" | scripts/backup-restore.sh "${PSQL[@]}" >/dev/null

AFTER="$(counts)"
CHAIN="$("${PSQL[@]}" -c "select count(*) from private.verify_audit_chain()")"
VERDICT="$("${PSQL[@]}" -c "set role service_role; select verdict from public.verify_receipt('${RECEIPT%% *}', '${RECEIPT##* }')" | tail -1)"
if [[ "$AFTER" == "$BEFORE" && "$CHAIN" == "0" && "$VERDICT" == "authentique" ]]; then
  echo "  OK  restauration : volumes identiques ($AFTER), chaîne d'audit intacte, quittance authentique"
else
  echo "  ÉCHEC restauration : avant=$BEFORE après=$AFTER ruptures=$CHAIN quittance=$VERDICT"; exit 1
fi
