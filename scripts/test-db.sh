#!/usr/bin/env bash
# Teste les migrations + scénarios de sécurité sur un PostgreSQL éphémère (sans Supabase).
# Usage : ./scripts/test-db.sh   (requiert initdb/pg_ctl/psql dans le PATH ou PG_BIN)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
SOCK="$DATA"

cleanup() { "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" -w start >/dev/null

PSQL=("$PG_BIN/psql" -h "$SOCK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stubs.sql"
# Toutes les migrations dans l'ordre, sauf celles propres à la plateforme Supabase
# (storage, realtime, pg_cron) nommées *_platform*.sql.
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  case "$(basename "$f")" in *_platform*.sql) continue ;; esac
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/01_security_scenarios.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'

# --- Concurrence : deux notifications identiques traitées en parallèle -------------
echo "→ test de concurrence (2 webhooks simultanés)"
"${PSQL[@]}" -c "set role service_role; select * from public.create_payment_intent('a0000000-0000-4000-8000-000000000004', (select id from public.invoices where lease_id='f0000000-0000-4000-8000-000000000002'), 'cinetpay', 'orange', 'TX-CONC-00000001', null, null);" >/dev/null
CONFIRM="set role service_role; select public.confirm_provider_payment('cinetpay','TX-CONC-00000001',165000,'XOF','orange',null,'{}');"
"${PSQL[@]}" -At -c "$CONFIRM" > "$DATA/r1" &
"${PSQL[@]}" -At -c "$CONFIRM" > "$DATA/r2" &
wait
RESULTS="$(cat "$DATA/r1" "$DATA/r2" | sort | tr '\n' ' ')"
PAID="$("${PSQL[@]}" -At -c "select amount_paid || '/' || status from public.invoices where lease_id='f0000000-0000-4000-8000-000000000002'")"
RECEIPTS="$("${PSQL[@]}" -At -c "select count(*) from public.receipts where invoice_id=(select id from public.invoices where lease_id='f0000000-0000-4000-8000-000000000002')")"
if [[ "$RESULTS" == "confirme deja_traite " && "$PAID" == "265000/paye" && "$RECEIPTS" == "1" ]]; then
  echo "  OK  concurrence : [$RESULTS] → avis $PAID, $RECEIPTS quittance"
else
  echo "  ÉCHEC concurrence : [$RESULTS] avis=$PAID quittances=$RECEIPTS"; exit 1
fi
