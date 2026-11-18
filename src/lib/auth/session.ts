import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

/** Utilisateur authentifié (JWT vérifié auprès de Supabase Auth, pas seulement décodé). */
export async function requireUser(nextPath = "/dashboard") {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return { supabase, user: data.user };
}

/** Pour les Server Actions : pas de redirection, une erreur explicite. */
export async function getActionUser() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null };
}

export interface OrgMembership {
  org_id: string;
  role: MemberRole;
  organizations: { name: string; kind: string } | null;
}

/** Organisation active du bailleur + rôle (lecture RLS). */
export async function requireOrgMember(preferredOrgId?: string) {
  const { supabase, user } = await requireUser("/dashboard");
  const { data } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(name, kind)")
    .eq("user_id", user.id)
    .order("created_at")
    .overrideTypes<OrgMembership[], { merge: false }>();

  const memberships = data ?? [];
  const current = memberships.find((m) => m.org_id === preferredOrgId) ?? memberships[0];
  if (!current) redirect("/pay"); // compte locataire uniquement
  return { supabase, user, membership: current, memberships };
}
