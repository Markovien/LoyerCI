import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { activeMembership } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { limit } from "@/lib/security/rate-limit";
import { requestContext } from "@/lib/security/request-context";
import { renderReceiptPdf } from "@/lib/receipts/pdf";
import { renderNoticePdf } from "@/lib/documents/notice-pdf";
import { retentionCutoff } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_DOCS = 300;

/**
 * P3.4 — Export (archive ZIP de PDF signés) des avis et quittances qui seront purgés dans
 * les 60 jours. Propriétaire ou comptable de l'organisation active ; lecture RLS ;
 * export journalisé en base AVANT la remise du fichier.
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Non authentifié", { status: 401 });
  if (!limit(`docs-export:${auth.user.id}`, 3, 60_000).ok) return new NextResponse("Trop de requêtes", { status: 429 });
  const m = await activeMembership(supabase, auth.user.id, ["owner", "accountant"]);
  if (!m) return new NextResponse("Accès refusé", { status: 403 });

  const before = retentionCutoff(new Date(), 60).toISOString();
  const [{ data: receipts }, { data: notices }] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "id, receipt_number, landlord_name, tenant_name, property_label, property_location, period, rent_amount, charges_amount, amount, payment_methods, paid_at, content_hash, signature, status, issued_at",
      )
      .eq("org_id", m.org_id)
      .lt("issued_at", before)
      .order("issued_at")
      .limit(MAX_DOCS),
    supabase
      .from("notices")
      .select(
        "id, landlord_name, tenant_name, property_label, property_location, period, rent_amount, charges_amount, amount_due, due_date, payment_reference, issued_at, content_hash, signature",
      )
      .eq("org_id", m.org_id)
      .lt("issued_at", before)
      .order("issued_at")
      .limit(MAX_DOCS),
  ]);
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL;
  const files: Record<string, Uint8Array> = {};
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
  for (const r of (receipts ?? []).slice(0, MAX_DOCS)) {
    files[`quittances/${r.period.slice(0, 7)}_${safe(r.receipt_number)}${r.status === "annulee" ? "_ANNULEE" : ""}.pdf`] =
      await renderReceiptPdf(r, appUrl);
  }
  for (const n of (notices ?? []).slice(0, Math.max(0, MAX_DOCS - Object.keys(files).length))) {
    files[`avis/${n.period.slice(0, 7)}_${safe(n.payment_reference)}.pdf`] = await renderNoticePdf(n, appUrl);
  }
  const count = Object.keys(files).length;
  if (count === 0) return new NextResponse("Aucun document à exporter", { status: 404 });

  const ctx = await requestContext();
  const { error } = await supabaseAdmin().rpc("log_documents_export", {
    p_actor: auth.user.id,
    p_org: m.org_id,
    p_count: count,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error) return new NextResponse("Export impossible", { status: 500 });

  const zip = zipSync(files, { level: 0 }); // PDF déjà compressés
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documents-loyerci-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
