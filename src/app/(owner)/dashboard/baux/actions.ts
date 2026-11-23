"use server";
import { revalidatePath } from "next/cache";
import { getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { leaseSchema, terminateLeaseSchema, uuid } from "@/lib/validation/schemas";

export type LeaseResult = { ok: boolean; message: string };

async function ctxFor(bucket: string) {
  const { user } = await getActionUser();
  if (!user) return { error: { ok: false, message: "Session expirée, reconnectez-vous." } as LeaseResult };
  if (!limit(`${bucket}:${user.id}`, 20, 60_000).ok)
    return { error: { ok: false, message: "Trop de requêtes, patientez une minute." } as LeaseResult };
  return { user, ctx: await requestContext() };
}

/** P2.3 — Création du bail (owner, manager) puis consentement WhatsApp éventuel. */
export async function createLease(input: unknown): Promise<LeaseResult> {
  const g = await ctxFor("lease");
  if ("error" in g) return g.error!;
  const parsed = leaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  const v = parsed.data;
  const admin = supabaseAdmin();
  const { error } = await admin.rpc("create_lease", {
    p_actor: g.user.id,
    p_org: v.orgId,
    p_property: v.propertyId,
    p_tenant: v.tenantId,
    p_usage: v.usage,
    p_rent: v.rent,
    p_charges: v.charges,
    p_deposit_months: v.depositMonths,
    p_advance_months: v.advanceMonths,
    p_due_day: v.dueDay,
    p_start: v.startDate,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (v.whatsappConsent) {
    await admin.rpc("set_whatsapp_consent", {
      p_actor: g.user.id,
      p_tenant: v.tenantId,
      p_consent: true,
      p_ip: g.ctx.ip,
      p_ua: g.ctx.userAgent,
    });
  }
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message:
      v.advanceMonths > 0
        ? "Bail créé. Enregistrez l'avance dès qu'elle est reçue : les quittances des mois couverts seront émises."
        : "Bail créé.",
  };
}

/** P2.3 — Avance reçue à la signature (propriétaire uniquement, une seule fois par bail). */
export async function recordAdvance(leaseId: unknown): Promise<LeaseResult> {
  const g = await ctxFor("advance");
  if ("error" in g) return g.error!;
  const id = uuid.safeParse(leaseId);
  if (!id.success) return { ok: false, message: "Bail invalide." };
  const { data, error } = await supabaseAdmin().rpc("record_advance", {
    p_actor: g.user.id,
    p_lease: id.data,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Avance enregistrée : ${data} mois soldé(s), quittances émises.` };
}

/** P2.3 — Résiliation (immédiate ou planifiée). */
export async function terminateLease(input: unknown): Promise<LeaseResult> {
  const g = await ctxFor("terminate");
  if ("error" in g) return g.error!;
  const parsed = terminateLeaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  const { data, error } = await supabaseAdmin().rpc("terminate_lease", {
    p_actor: g.user.id,
    p_lease: parsed.data.leaseId,
    p_end_date: parsed.data.endDate,
    p_reason: parsed.data.reason,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: data === "planifie" ? "Fin de bail planifiée : le bail reste actif jusqu'à cette date." : "Bail résilié." };
}
