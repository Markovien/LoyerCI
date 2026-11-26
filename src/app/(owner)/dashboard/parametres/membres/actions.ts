"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTIVE_ORG_COOKIE, getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { memberSchema, uuid } from "@/lib/validation/schemas";

export type MemberResult = { ok: boolean; message: string };
const role = z.enum(["owner", "manager", "accountant"]);

async function guard(bucket: string) {
  const { supabase, user } = await getActionUser();
  if (!user) return { error: { ok: false, message: "Session expirée, reconnectez-vous." } as MemberResult };
  if (!(await limit(`${bucket}:${user.id}`, 20, 60_000)).ok)
    return { error: { ok: false, message: "Trop de requêtes, patientez une minute." } as MemberResult };
  return { supabase, user, ctx: await requestContext() };
}

/** P2.5 — Ajout d'un membre (propriétaire seul, revérifié en base) ; compte créé si besoin. */
export async function addMember(input: unknown): Promise<MemberResult> {
  const g = await guard("member-add");
  if ("error" in g) return g.error!;
  const v = memberSchema.safeParse(input);
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? "Saisie invalide" };
  const admin = supabaseAdmin();
  // Le droit d'ajouter est vérifié AVANT toute création de compte.
  const { data: me } = await g.supabase
    .from("memberships")
    .select("role")
    .eq("org_id", v.data.orgId)
    .eq("user_id", g.user.id)
    .maybeSingle();
  if (me?.role !== "owner") return { ok: false, message: "Accès refusé." };

  let userId = (await admin.rpc("find_user_id_by_email", { p_email: v.data.email })).data;
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({ email: v.data.email, email_confirm: true });
    if (error || !created.user) return { ok: false, message: "Création du compte impossible. Réessayez." };
    userId = created.user.id;
  }
  const { error } = await admin.rpc("add_member", {
    p_actor: g.user.id,
    p_org: v.data.orgId,
    p_user: userId,
    p_full_name: v.data.fullName,
    p_role: v.data.role,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  // Lien de connexion envoyé au nouveau membre (lien magique, aucune inscription publique).
  await g.supabase.auth.signInWithOtp({
    email: v.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${serverEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard` },
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Membre ajouté. Un lien de connexion a été envoyé à ${v.data.email}.` };
}

export async function changeMemberRole(input: unknown): Promise<MemberResult> {
  const g = await guard("member-role");
  if ("error" in g) return g.error!;
  const raw = (input ?? {}) as { orgId?: unknown; userId?: unknown; role?: unknown };
  const org = uuid.safeParse(raw.orgId);
  const u = uuid.safeParse(raw.userId);
  const r = role.safeParse(raw.role);
  if (!org.success || !u.success || !r.success) return { ok: false, message: "Requête invalide." };
  const { error } = await supabaseAdmin().rpc("change_member_role", {
    p_actor: g.user.id,
    p_org: org.data,
    p_user: u.data,
    p_role: r.data,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Rôle modifié." };
}

export async function removeMember(input: unknown): Promise<MemberResult> {
  const g = await guard("member-remove");
  if ("error" in g) return g.error!;
  const raw = (input ?? {}) as { orgId?: unknown; userId?: unknown };
  const org = uuid.safeParse(raw.orgId);
  const u = uuid.safeParse(raw.userId);
  if (!org.success || !u.success) return { ok: false, message: "Requête invalide." };
  const { error } = await supabaseAdmin().rpc("remove_member", {
    p_actor: g.user.id,
    p_org: org.data,
    p_user: u.data,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Membre retiré : il n'a plus accès à l'organisation." };
}

/** Organisation active (cookie httpOnly) ; l'appartenance est revérifiée à chaque requête. */
export async function setActiveOrg(orgId: unknown): Promise<MemberResult> {
  const { supabase, user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  const org = uuid.safeParse(orgId);
  if (!org.success) return { ok: false, message: "Organisation invalide." };
  const { data: m } = await supabase.from("memberships").select("org_id").eq("org_id", org.data).eq("user_id", user.id).maybeSingle();
  if (!m) return { ok: false, message: "Accès refusé." };
  (await cookies()).set(ACTIVE_ORG_COOKIE, org.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Organisation sélectionnée." };
}
