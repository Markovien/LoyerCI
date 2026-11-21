"use server";
import { revalidatePath } from "next/cache";
import { getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { cashPaymentSchema, receivedPaymentSchema, reviewManualPaymentSchema, uuid } from "@/lib/validation/schemas";

export type ActionResult = { ok: boolean; message: string; url?: string };

/**
 * Chaque Server Action est un endpoint HTTP public : on revalide TOUT
 * (session, entrée, débit), puis on délègue à une fonction SQL qui revérifie le rôle.
 * L'acteur transmis (p_actor) provient de getUser() — jamais du formulaire.
 */
async function guard(bucket: string, max = 20) {
  const { user } = await getActionUser();
  if (!user) return { error: { ok: false, message: "Session expirée, reconnectez-vous." } as ActionResult };
  if (!limit(`${bucket}:${user.id}`, max, 60_000).ok) {
    return { error: { ok: false, message: "Trop de requêtes, patientez une minute." } as ActionResult };
  }
  return { user, ctx: await requestContext() };
}

export async function reviewManualPayment(input: unknown): Promise<ActionResult> {
  const g = await guard("review");
  if ("error" in g) return g.error!;
  const parsed = reviewManualPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };

  // Fonction unifiée (P1.2) : virements, paiements directs et espèces en attente.
  // Le rôle requis est revérifié en base (espèces : propriétaire uniquement).
  const { data, error } = await supabaseAdmin().rpc("review_manual_payment", {
    p_actor: g.user.id,
    p_payment: parsed.data.paymentId,
    p_approve: parsed.data.decision === "valider",
    p_reason: parsed.data.reason ?? null,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/dashboard");
  const messages: Record<string, string> = {
    valide: "Paiement confirmé. La quittance est générée si l'avis est soldé.",
    rejete: "Paiement rejeté. Le locataire verra le motif.",
    deja_traite: "Ce paiement a déjà été traité.",
  };
  return { ok: data !== "deja_traite", message: messages[data as string] ?? "Opération effectuée." };
}

/** URL signée valable 60 s, délivrée après contrôle de rôle ET journalisation de l'accès. */
export async function getProofUrl(paymentId: unknown): Promise<ActionResult> {
  const g = await guard("proof", 30);
  if ("error" in g) return g.error!;
  const id = uuid.safeParse(paymentId);
  if (!id.success) return { ok: false, message: "Identifiant invalide" };

  const admin = supabaseAdmin();
  const { data: path, error } = await admin.rpc("log_proof_access", {
    p_actor: g.user.id,
    p_payment: id.data,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error || typeof path !== "string") return { ok: false, message: dbErrorMessage(error) };

  const { data: signed, error: sErr } = await admin.storage.from("transfer-proofs").createSignedUrl(path, 60);
  if (sErr || !signed) return { ok: false, message: "Preuve indisponible." };
  return { ok: true, message: "Lien temporaire (60 s).", url: signed.signedUrl };
}

export async function recordCashPayment(input: unknown): Promise<ActionResult> {
  const g = await guard("cash");
  if ("error" in g) return g.error!;
  const parsed = cashPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };

  const { data, error } = await supabaseAdmin()
    .rpc("record_cash_payment", {
      p_actor: g.user.id,
      p_invoice: parsed.data.invoiceId,
      p_amount: parsed.data.amount,
      p_ip: g.ctx.ip,
      p_ua: g.ctx.userAgent,
    })
    .single();
  if (error || !data) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard");
  // Décision D2 : au-delà du seuil, un encaissement saisi par un comptable attend le propriétaire.
  return data.status === "en_attente_validation"
    ? { ok: true, message: "Encaissement enregistré, en attente de confirmation par le propriétaire (au-delà du seuil)." }
    : { ok: true, message: "Encaissement en espèces enregistré." };
}

/**
 * « Encaissement reçu » : le bailleur (propriétaire ou comptable) constate sur SON compte
 * un loyer reçu en Mobile Money ou par virement. Imputation immédiate ; la règle d'accès
 * et l'unicité du n° de transaction sont revérifiées en base.
 */
export async function recordReceivedPayment(input: unknown): Promise<ActionResult> {
  const g = await guard("received");
  if ("error" in g) return g.error!;
  const parsed = receivedPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };

  const { error } = await supabaseAdmin().rpc("record_received_payment", {
    p_actor: g.user.id,
    p_invoice: parsed.data.invoiceId,
    p_method: parsed.data.method,
    p_operator: parsed.data.method === "mobile_money" ? (parsed.data.operator ?? null) : null,
    p_amount: parsed.data.amount,
    p_txn_ref: parsed.data.method === "mobile_money" ? (parsed.data.txnRef ?? null) : null,
    p_bank_reference: parsed.data.method === "virement" ? (parsed.data.bankReference ?? null) : null,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard");
  return { ok: true, message: "Encaissement enregistré. La quittance est générée si l'avis est soldé." };
}
