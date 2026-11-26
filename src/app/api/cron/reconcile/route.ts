import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/security/cron";
import { getProvider, isProviderConfigured } from "@/lib/payments/registry";
import { reconcileIntents } from "@/lib/payments/settle";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P4.2 — Réconciliation horaire de secours (webhook perdu) : uniquement si CinetPay est
 * activé (désactivé par défaut depuis le 18/11/2026). Revérification serveur-à-serveur,
 * imputation idempotente en base.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new NextResponse("Non autorisé", { status: 401 });
  if (!isProviderConfigured("cinetpay")) return NextResponse.json({ skipped: "CinetPay non activé" });
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("stale_provider_intents", { p_provider: "cinetpay", p_limit: 50 });
  if (error) return NextResponse.json({ error: "lecture impossible" }, { status: 500 });
  const counts = await reconcileIntents(admin, getProvider("cinetpay"), data ?? []);
  log.info("reconciliation", { fournisseur: "cinetpay", ...counts });
  return NextResponse.json(counts);
}
