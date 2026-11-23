import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { activeMembership } from "@/lib/auth/session";
import { limit } from "@/lib/security/rate-limit";
import { requestContext } from "@/lib/security/request-context";
import { auditActionLabel, auditFilterSchema, ipText } from "@/lib/audit";
import { actorLabel, memberNames, queryAudit } from "@/lib/audit-query";
import { csvDocument } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ROWS = 5000;

/**
 * P2.6 : export CSV du journal (propriétaire de l'organisation active). L'export est
 * lui-même journalisé (filtres, nombre de lignes, IP, user-agent) AVANT la remise du
 * fichier : sans trace, pas d'export.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = auditFilterSchema.safeParse({
    action: sp.get("action"),
    du: sp.get("du"),
    au: sp.get("au"),
    acteur: sp.get("acteur"),
    page: null,
  });
  if (!parsed.success) return new NextResponse("Filtres invalides", { status: 400 });
  const f = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Non authentifié", { status: 401 });
  if (!limit(`audit-csv:${auth.user.id}`, 5, 60_000).ok) return new NextResponse("Trop de requêtes", { status: 429 });
  const m = await activeMembership(supabase, auth.user.id, ["owner"]);
  if (!m) return new NextResponse("Accès refusé", { status: 403 });

  const [{ data, error }, names] = await Promise.all([queryAudit(supabase, m.org_id, f, 0, MAX_ROWS), memberNames(supabase, m.org_id)]);
  if (error) return new NextResponse("Lecture impossible", { status: 500 });
  const rows = data ?? [];

  const ctx = await requestContext();
  const filters = Object.fromEntries(Object.entries({ action: f.action, du: f.du, au: f.au, acteur: f.acteur }).filter(([, v]) => v));
  const { error: logError } = await supabaseAdmin().rpc("log_audit_export", {
    p_actor: auth.user.id,
    p_org: m.org_id,
    p_filters: filters,
    p_rows: rows.length,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (logError) return new NextResponse("Export impossible", { status: 500 });

  const body = csvDocument([
    [
      "n_chaine",
      "date_utc",
      "action",
      "libelle",
      "acteur",
      "type_acteur",
      "entite",
      "id_entite",
      "ip",
      "user_agent",
      "details",
      "empreinte_sha256",
    ],
    ...rows.map((r) => [
      r.chain_seq,
      r.created_at,
      r.action,
      auditActionLabel(r.action),
      actorLabel(names, r.actor_id, r.actor_kind),
      r.actor_kind,
      r.entity_type,
      r.entity_id,
      ipText(r.ip),
      r.user_agent,
      JSON.stringify(r.metadata ?? {}),
      r.hash,
    ]),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-audit-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Rows-Truncated": rows.length >= MAX_ROWS ? "1" : "0",
    },
  });
}
