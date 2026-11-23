"use server";
import { revalidatePath } from "next/cache";
import { getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { newInvitationToken } from "@/lib/security/crypto";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { tenantSchema, uuid } from "@/lib/validation/schemas";
import { whatsappLink } from "@/lib/whatsapp";

export type TenantResult = { ok: boolean; message: string; id?: string };

/** P2.2 — Création / modification d'une fiche locataire (owner, manager ; revérifié en base). */
export async function saveTenant(input: unknown): Promise<TenantResult> {
  const { user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!limit(`tenant:${user.id}`, 30, 60_000).ok) return { ok: false, message: "Trop de requêtes, patientez une minute." };
  const raw = (input ?? {}) as { orgId?: unknown; tenantId?: unknown; values?: unknown };
  const org = uuid.safeParse(raw.orgId);
  const v = tenantSchema.safeParse(raw.values);
  if (!org.success) return { ok: false, message: "Organisation invalide." };
  if (!v.success) return { ok: false, message: v.error.issues[0]?.message ?? "Saisie invalide" };
  const ctx = await requestContext();
  const admin = supabaseAdmin();
  const common = {
    p_actor: user.id,
    p_full_name: v.data.fullName,
    p_phone: v.data.phone,
    p_email: v.data.email ?? null,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  };
  if (raw.tenantId) {
    const tid = uuid.safeParse(raw.tenantId);
    if (!tid.success) return { ok: false, message: "Locataire invalide." };
    const { error } = await admin.rpc("update_tenant", { ...common, p_tenant: tid.data });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Fiche modifiée.", id: tid.data };
  }
  const { data, error } = await admin.rpc("create_tenant", { ...common, p_org: org.data });
  if (error || !data) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Locataire ajouté.", id: data };
}

export type InviteResult =
  { ok: true; link: string; whatsappUrl: string | null; expiresAt: string; message: string } | { ok: false; message: string };

/**
 * P2.2 — Invitation à créer un compte (facultatif) : lien à usage unique, 7 jours.
 * Le jeton n'est montré qu'une fois ; seule son empreinte est stockée.
 */
export async function inviteTenant(tenantId: unknown): Promise<InviteResult> {
  const { supabase, user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!limit(`invite:${user.id}`, 20, 60_000).ok) return { ok: false, message: "Trop de requêtes, patientez une minute." };
  const tid = uuid.safeParse(tenantId);
  if (!tid.success) return { ok: false, message: "Locataire invalide." };
  const { data: t } = await supabase.from("tenants").select("id, full_name, phone, organizations(name)").eq("id", tid.data).maybeSingle();
  if (!t) return { ok: false, message: "Locataire introuvable." };

  const { token, hash } = newInvitationToken();
  const ctx = await requestContext();
  const { data: exp, error } = await supabaseAdmin().rpc("create_tenant_invitation", {
    p_actor: user.id,
    p_tenant: t.id,
    p_token_hash: hash,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error || !exp) return { ok: false, message: dbErrorMessage(error) };
  const link = `${serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/invitation/${token}`;
  const text = [
    `Bonjour ${t.full_name},`,
    "",
    `${t.organizations?.name ?? "Votre bailleur"} vous invite à créer votre espace LoyerCI (facultatif) pour retrouver tous vos avis et quittances :`,
    link,
    "",
    "Ce lien est personnel et valable 7 jours. LoyerCI ne vous demandera jamais votre code Mobile Money.",
  ].join("\n");
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    link,
    whatsappUrl: /^225\d{10}$/.test(t.phone) ? whatsappLink(t.phone, text) : null,
    expiresAt: exp,
    message: "Invitation créée. Envoyez le lien au locataire : il ne sera plus affiché.",
  };
}

export async function unlinkTenant(tenantId: unknown): Promise<TenantResult> {
  const { user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!limit(`unlink:${user.id}`, 10, 60_000).ok) return { ok: false, message: "Trop de requêtes." };
  const tid = uuid.safeParse(tenantId);
  if (!tid.success) return { ok: false, message: "Locataire invalide." };
  const ctx = await requestContext();
  const { error } = await supabaseAdmin().rpc("unlink_tenant_account", {
    p_actor: user.id,
    p_tenant: tid.data,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Compte délié : le locataire n'a plus accès à cet espace." };
}
