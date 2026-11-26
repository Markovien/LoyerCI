"use server";
import { revalidatePath } from "next/cache";
import { getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { paymentSettingsSchema, reauthCodeSchema, receivingAccountSchema, uuid } from "@/lib/validation/schemas";
import { log } from "@/lib/log";

export type SettingsResult = { ok: boolean; message: string };

const maskEmail = (email: string) => email.replace(/^(.{2}).*(@.*)$/, "$1•••$2");

/**
 * Étape 1 de la ré-authentification : un code à usage unique est envoyé à l'adresse
 * e-mail du compte CONNECTÉ (jamais à une adresse saisie).
 */
export async function requestReauthCode(): Promise<SettingsResult> {
  const { supabase, user } = await getActionUser();
  if (!user?.email) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!(await limit(`reauth-code:${user.id}`, 3, 10 * 60_000)).ok) {
    return { ok: false, message: "Trop de demandes de code. Réessayez dans quelques minutes." };
  }
  const { error } = await supabase.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
  if (error) {
    log.warn("reauthentification_envoi_code_impossible", { code: error.code ?? "inconnu" });
    return {
      ok: false,
      message:
        error.code === "over_email_send_rate_limit"
          ? "Un code vient d'être envoyé : patientez une minute avant d'en demander un autre."
          : "Envoi du code impossible. Réessayez dans un instant.",
    };
  }
  return { ok: true, message: `Code envoyé à ${maskEmail(user.email)}. Il est valable 10 minutes.` };
}

/**
 * Étape 2 : vérification du code PUIS ajout. La base exige une autorisation de moins de
 * 5 minutes, à usage unique, délivrée par grant_reauth après cette vérification.
 */
export async function addReceivingAccount(input: unknown): Promise<SettingsResult> {
  const { supabase, user } = await getActionUser();
  if (!user?.email) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!(await limit(`reauth-verify:${user.id}`, 5, 10 * 60_000)).ok) {
    return { ok: false, message: "Trop de tentatives. Réessayez dans quelques minutes." };
  }

  const raw = (input ?? {}) as { orgId?: unknown; code?: unknown; account?: unknown };
  const org = uuid.safeParse(raw.orgId);
  const code = reauthCodeSchema.safeParse(raw.code);
  const account = receivingAccountSchema.safeParse(raw.account);
  if (!org.success) return { ok: false, message: "Organisation invalide." };
  if (!account.success) return { ok: false, message: account.error.issues[0]?.message ?? "Saisie invalide" };
  if (!code.success) return { ok: false, message: code.error.issues[0]?.message ?? "Code invalide" };

  const { data: verified, error: vErr } = await supabase.auth.verifyOtp({ email: user.email, token: code.data, type: "email" });
  if (vErr || verified.user?.id !== user.id) {
    return { ok: false, message: "Code incorrect ou expiré. Demandez un nouveau code." };
  }

  const ctx = await requestContext();
  const admin = supabaseAdmin();
  const { error: gErr } = await admin.rpc("grant_reauth", { p_actor: user.id, p_ip: ctx.ip, p_ua: ctx.userAgent });
  if (gErr) return { ok: false, message: dbErrorMessage(gErr) };

  const a = account.data;
  const { data, error } = await admin
    .rpc("add_receiving_account", {
      p_actor: user.id,
      p_org: org.data,
      p_kind: a.kind,
      p_holder: a.holder,
      p_display_name: a.displayName ?? null,
      p_bank: a.kind === "banque" ? a.bank : null,
      p_iban: a.kind === "banque" ? a.iban : null,
      p_operator: a.kind === "mobile_money" || a.kind === "payment_link" ? a.operator : null,
      p_msisdn: a.kind === "mobile_money" ? a.msisdn : null,
      p_pispi_alias: a.kind === "pispi_alias" ? a.alias : null,
      p_link_url: a.kind === "payment_link" ? a.url : null,
      p_ip: ctx.ip,
      p_ua: ctx.userAgent,
    })
    .single();
  if (error || !data) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/dashboard", "layout");
  const when = new Date(data.activates_at);
  return when.getTime() <= Date.now() + 60_000
    ? { ok: true, message: "Compte de réception ajouté et actif." }
    : {
        ok: true,
        message: `Compte ajouté. Par sécurité, il sera actif le ${when.toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", dateStyle: "long", timeStyle: "short" })}. L'ancien compte reste utilisé d'ici là.`,
      };
}

/** Révocation immédiate (sens protecteur : aucune ré-authentification exigée). */
export async function cancelReceivingAccount(accountId: unknown): Promise<SettingsResult> {
  const { user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!(await limit(`payout-cancel:${user.id}`, 10, 60_000)).ok) return { ok: false, message: "Trop de requêtes." };
  const id = uuid.safeParse(accountId);
  if (!id.success) return { ok: false, message: "Identifiant invalide" };
  const ctx = await requestContext();
  const { error } = await supabaseAdmin().rpc("cancel_payout_account", {
    p_actor: user.id,
    p_account: id.data,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Compte révoqué : il n'est plus proposé aux locataires." };
}

export async function savePaymentSettings(input: unknown): Promise<SettingsResult> {
  const { user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!(await limit(`settings:${user.id}`, 10, 60_000)).ok) return { ok: false, message: "Trop de requêtes." };
  const parsed = paymentSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  const ctx = await requestContext();
  const v = parsed.data;
  const { error } = await supabaseAdmin().rpc("set_payment_settings", {
    p_actor: user.id,
    p_org: v.orgId,
    p_direct: v.direct,
    p_cinetpay: v.cinetpay,
    p_transfer: v.transfer,
    p_fees_notice: v.feesNotice ?? null,
    p_cash_threshold: v.cashThreshold,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Paramètres enregistrés." };
}
