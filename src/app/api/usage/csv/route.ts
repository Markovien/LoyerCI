import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { limit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Neutralise l'injection de formules à l'ouverture dans un tableur. */
const cell = (v: string | number | boolean | null) => {
  const s = v === null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** D.5 : export mensuel des envois (propriétaire ou comptable ; filtrage par la RLS). */
export async function GET(req: NextRequest) {
  const mois = req.nextUrl.searchParams.get("mois") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return new NextResponse("Mois invalide", { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Non authentifié", { status: 401 });
  if (!limit(`usage-csv:${auth.user.id}`, 10, 60_000).ok) return new NextResponse("Trop de requêtes", { status: 429 });

  const { data: m } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", auth.user.id)
    .in("role", ["owner", "accountant"])
    .order("created_at")
    .limit(1)
    .maybeSingle();
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

  const lines = [
    ["date", "canal", "source", "facturable", "document"].map(cell).join(";"),
    ...(rows ?? []).map((r) => [r.created_at, r.kind, r.source, r.billable ? "oui" : "non", r.document_id ?? ""].map(cell).join(";")),
  ];
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="envois-${mois}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
