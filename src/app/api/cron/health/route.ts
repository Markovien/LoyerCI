import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/security/cron";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P4.5 — Contrôle de santé quotidien : intégrité de la chaîne d'audit, file d'envoi,
 * fichiers à retirer. Résultat écrit dans les journaux structurés (niveau « error » si une
 * anomalie demande une intervention : une alerte de l'hébergeur peut s'y brancher).
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new NextResponse("Non autorisé", { status: 401 });
  const { data, error } = await supabaseAdmin().rpc("system_health").single();
  if (error || !data) {
    log.error("sante_indisponible", { code: error?.code ?? "vide" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const problems = [
    !data.audit_ok && "chaine_audit_rompue",
    data.outbox_oldest_minutes > 60 && "file_envoi_bloquee",
    data.outbox_failed_24h > 0 && "envois_abandonnes",
    data.storage_pending > 100 && "fichiers_en_attente",
  ].filter((p): p is string => typeof p === "string");
  const fields = {
    audit_ok: data.audit_ok,
    audit_rompu_au: data.audit_broken_at,
    audit_lignes: data.audit_rows,
    file_en_attente: data.outbox_pending,
    file_plus_ancien_min: data.outbox_oldest_minutes,
    file_abandons_24h: data.outbox_failed_24h,
    fichiers_a_retirer: data.storage_pending,
    paiements_en_attente_48h: data.payments_waiting_48h,
    problemes: problems.join(",") || null,
  };
  if (problems.length) log.error("sante_anomalie", fields);
  else log.info("sante_ok", fields);
  return NextResponse.json({ ok: problems.length === 0, problems });
}
