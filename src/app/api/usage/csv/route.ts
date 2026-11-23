import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { activeMembership } from "@/lib/auth/session";
import { limit } from "@/lib/security/rate-limit";
import { csvDocument } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** D.5 : export mensuel des envois (propriétaire ou comptable ; filtrage par la RLS). */
export async function GET(req: NextRequest) {
  const mois = req.nextUrl.searchParams.get("mois") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return new NextResponse("Mois invalide", { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Non authentifié", { status: 401 });
  if (!limit(`usage-csv:${auth.user.id}`, 10, 60_000).ok) return new NextResponse("Trop de requêtes", { status: 429 });

  const m = await activeMembership(supabase, auth.user.id, ["owner", "accountant"]);
  if (!m) return new NextResponse("Accès refusé", { status: 403 });

  const start = new Date(`${mois}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const { data: rows } = await supabase
    .from("message_events")
    .select("created_at, kind, source, billable, document_id")
    .eq("org_id", m.org_id)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at");

  const body = csvDocument([
    ["date", "canal", "source", "facturable", "document"],
    ...(rows ?? []).map((r) => [r.created_at, r.kind, r.source, r.billable ? "oui" : "non", r.document_id ?? ""]),
  ]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="envois-${mois}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
