"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { activeMembership, getActionUser } from "@/lib/auth/session";
import { parseOffsets } from "@/lib/reminders";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";

export type SettingsResult = { ok: boolean; message: string };
const schema = z.object({ offsets: z.string().max(60), email: z.boolean() });

/** P3.3 — Réglage des relances (propriétaire de l'organisation active, revérifié en base). */
export async function saveReminderSettings(input: unknown): Promise<SettingsResult> {
  const { supabase, user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!(await limit(`reminder-settings:${user.id}`, 10, 60_000)).ok)
    return { ok: false, message: "Trop de requêtes, patientez une minute." };
  const v = schema.safeParse(input);
  const offsets = v.success ? parseOffsets(v.data.offsets) : null;
  if (!v.success || !offsets) return { ok: false, message: "Échéances : de 1 à 5 valeurs entre J-15 et J+60 (ex. J-3, J+3, J+10)." };
  const m = await activeMembership(supabase, user.id, ["owner"]);
  if (!m) return { ok: false, message: "Accès refusé." };
  const ctx = await requestContext();
  const { error } = await supabaseAdmin().rpc("set_reminder_settings", {
    p_actor: user.id,
    p_org: m.org_id,
    p_offsets: offsets,
    p_email: v.data.email,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Relances enregistrées." };
}
