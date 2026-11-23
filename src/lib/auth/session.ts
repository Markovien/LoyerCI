import "server-only";
import { cookies } from "next/headers";
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

export const ACTIVE_ORG_COOKIE = "loyerci_org";

export interface OrgMembership {
  org_id: string;
  role: MemberRole;
  organizations: { name: string; kind: string } | null;
}

/** Organisation active du bailleur + rôle (lecture RLS). */
export async function requireOrgMember() {
  const { supabase, user } = await requireUser("/dashboard");
  const { data } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(name, kind)")
    .eq("user_id", user.id)
    .order("created_at");

  const memberships = data ?? [];
  // Organisation active : cookie (P2.5), seule source de vérité partagée par les pages ET les
  // actions (jamais un paramètre d'URL, qui ferait agir sur une organisation non affichée).
  // Toujours revérifiée contre les adhésions réelles : un cookie forgé ne donne accès à rien.
  const fromCookie = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const current = memberships.find((m) => m.org_id === fromCookie) ?? memberships[0];
  if (!current) redirect("/pay"); // compte locataire uniquement
  return { supabase, user, membership: current, memberships };
}

/**
 * Organisation active pour une action ou une route (cookie revérifié contre les adhésions
 * réelles). `roles` restreint aux rôles autorisés ; null si aucune adhésion ne convient.
 */
export async function activeMembership(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  userId: string,
  roles?: MemberRole[],
): Promise<{ org_id: string; role: MemberRole } | null> {
  const { data } = await supabase.from("memberships").select("org_id, role").eq("user_id", userId).order("created_at");
  const all = data ?? [];
  const fromCookie = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  // On agit TOUJOURS sur l'organisation affichée : pas de repli silencieux sur une autre
  // organisation où le rôle conviendrait (l'action porterait sur des données non vues).
  const current = all.find((m) => m.org_id === fromCookie) ?? all[0];
  if (!current || (roles && !roles.includes(current.role))) return null;
  return current;
}
