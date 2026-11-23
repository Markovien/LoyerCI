"use server";
import { revalidatePath } from "next/cache";
import { getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { propertySchema, uuid } from "@/lib/validation/schemas";

export type PropertyResult = { ok: boolean; message: string; id?: string };

/** P2.1 — Création / modification d'un bien. Rôle (owner/manager) revérifié en base. */
export async function saveProperty(input: unknown): Promise<PropertyResult> {
  const { user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!limit(`property:${user.id}`, 30, 60_000).ok) return { ok: false, message: "Trop de requêtes, patientez une minute." };

  const raw = (input ?? {}) as { orgId?: unknown; propertyId?: unknown; values?: unknown };
  const org = uuid.safeParse(raw.orgId);
  const values = propertySchema.safeParse(raw.values);
  if (!org.success) return { ok: false, message: "Organisation invalide." };
  if (!values.success) return { ok: false, message: values.error.issues[0]?.message ?? "Saisie invalide" };
  const v = values.data;
  const ctx = await requestContext();
  const admin = supabaseAdmin();
  const common = {
    p_actor: user.id,
    p_code: v.code,
    p_label: v.label,
    p_type: v.type,
    p_city: v.city,
    p_commune: v.commune,
    p_quartier: v.quartier ?? null,
    p_address: v.address ?? null,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  };

  if (raw.propertyId) {
    const pid = uuid.safeParse(raw.propertyId);
    if (!pid.success) return { ok: false, message: "Bien invalide." };
    const { error } = await admin.rpc("update_property", { ...common, p_property: pid.data });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Bien modifié.", id: pid.data };
  }
  const { data, error } = await admin.rpc("create_property", { ...common, p_org: org.data });
  if (error || !data) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Bien créé.", id: data };
}
