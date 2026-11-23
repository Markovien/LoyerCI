import "server-only";
import type { createSupabaseServer } from "@/lib/supabase/server";
import { auditRange, type AuditFilters } from "@/lib/audit";

type Client = Awaited<ReturnType<typeof createSupabaseServer>>;

/**
 * Lecture du journal avec le JWT de l'utilisateur : la RLS (audit_select) ne renvoie
 * que les lignes des organisations dont il est PROPRIÉTAIRE. Le filtre org_id est explicite.
 */
export function queryAudit(supabase: Client, orgId: string, f: AuditFilters, offset: number, size: number) {
  let q = supabase
    .from("audit_logs")
    .select("chain_seq, created_at, actor_id, actor_kind, action, entity_type, entity_id, ip, user_agent, metadata, hash", {
      count: "exact",
    })
    .eq("org_id", orgId);
  const { from, to } = auditRange(f);
  if (f.action) q = q.eq("action", f.action);
  if (f.acteur) q = q.eq("actor_id", f.acteur);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lt("created_at", to);
  return q.order("chain_seq", { ascending: false }).range(offset, offset + size - 1);
}

/** Noms des membres (profils lisibles par la RLS) pour afficher les acteurs. */
export async function memberNames(supabase: Client, orgId: string) {
  const { data: ms } = await supabase.from("memberships").select("user_id").eq("org_id", orgId);
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

const KIND: Record<string, string> = { system: "Système", provider: "Opérateur de paiement", user: "Utilisateur" };
export function actorLabel(names: Map<string, string>, actorId: string | null, kind: string) {
  if (actorId && names.has(actorId)) return names.get(actorId)!;
  if (kind === "user" && actorId) return "Utilisateur hors équipe (locataire ou ancien membre)";
  return KIND[kind] ?? kind;
}
