"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import {
  cashPaymentSchema,
  documentRefSchema,
  documentSentSchema,
  receivedPaymentSchema,
  reviewManualPaymentSchema,
  uuid,
} from "@/lib/validation/schemas";
import { createSupabaseServer } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { avisMessage, quittanceMessage } from "@/lib/documents/messages";
import { noticeVerifyUrl } from "@/lib/documents/notice-pdf";
import { verifyUrl as receiptVerifyUrl } from "@/lib/receipts/pdf";
import { mailtoLink, whatsappLink } from "@/lib/whatsapp";

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

export type PreparedDocument =
  | {
      ok: true;
      message: string;
      fileName: string;
      pdfPath: string;
      text: string;
      whatsappUrl: string | null;
      mailtoUrl: string | null;
    }
  | { ok: false; message: string };

/**
 * D.2 — Prépare l'envoi d'un document par le bailleur depuis SES comptes : émet l'avis
 * signé si besoin, puis renvoie le message (sans coordonnée de paiement, avec le lien de
 * vérification), les liens WhatsApp / e-mail et le chemin du PDF. Rien n'est envoyé ici.
 */
export async function prepareDocument(input: unknown): Promise<PreparedDocument> {
  const g = await guard("doc-prepare", 60);
  if ("error" in g) return g.error! as PreparedDocument;
  const parsed = documentRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Requête invalide." };
  const { invoiceId, docType } = parsed.data;

  // Lectures RLS : l'avis et le locataire doivent être visibles par ce membre.
  const supabase = await createSupabaseServer();
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, period, amount_due, due_date, payment_reference, organizations(name), tenants(full_name, phone, email)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv?.tenants) return { ok: false, message: "Avis introuvable." };
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL;
  const tenant = inv.tenants;
  const landlord = inv.organizations?.name ?? "Votre bailleur";

  let text: string;
  let fileName: string;
  let pdfPath: string;
  let subject: string;
  if (docType === "avis") {
    const { data: noticeId, error } = await supabaseAdmin().rpc("issue_notice", {
      p_actor: g.user.id,
      p_invoice: inv.id,
      p_ip: g.ctx.ip,
      p_ua: g.ctx.userAgent,
    });
    if (error || !noticeId) return { ok: false, message: dbErrorMessage(error) };
    const { data: n } = await supabase.from("notices").select("id, signature").eq("id", noticeId).maybeSingle();
    if (!n) return { ok: false, message: "Avis indisponible." };
    text = avisMessage({
      tenantName: tenant.full_name,
      landlordName: landlord,
      period: inv.period,
      amountDue: inv.amount_due,
      dueDate: inv.due_date,
      reference: inv.payment_reference,
      verifyUrl: noticeVerifyUrl(appUrl, n),
    });
    fileName = `avis-${inv.payment_reference}.pdf`;
    pdfPath = `/api/notices/${inv.id}/pdf`;
    subject = `Avis d'échéance — ${inv.payment_reference}`;
  } else {
    const { data: r } = await supabase
      .from("receipts")
      .select("id, signature, receipt_number, amount, status")
      .eq("invoice_id", inv.id)
      .maybeSingle();
    if (!r || r.status !== "valide") return { ok: false, message: "Aucune quittance valide pour cet avis." };
    text = quittanceMessage({
      tenantName: tenant.full_name,
      landlordName: landlord,
      period: inv.period,
      amount: r.amount,
      receiptNumber: r.receipt_number,
      verifyUrl: receiptVerifyUrl(appUrl, r),
    });
    fileName = `quittance-${r.receipt_number}.pdf`;
    pdfPath = `/api/receipts/${r.id}/pdf`;
    subject = `Quittance de loyer — ${r.receipt_number}`;
  }

  return {
    ok: true,
    message: "Document prêt.",
    text,
    fileName,
    pdfPath,
    whatsappUrl: /^225\d{10}$/.test(tenant.phone) ? whatsappLink(tenant.phone, text) : null,
    mailtoUrl: tenant.email ? mailtoLink(tenant.email, subject, text) : null,
  };
}

/** D.2 — Trace l'envoi (canal choisi par le bailleur). */
export async function markDocumentSent(input: unknown): Promise<ActionResult> {
  const g = await guard("doc-sent", 60);
  if ("error" in g) return g.error!;
  const parsed = documentSentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Requête invalide." };
  const { error } = await supabaseAdmin().rpc("mark_document_sent", {
    p_actor: g.user.id,
    p_invoice: parsed.data.invoiceId,
    p_doc_type: parsed.data.docType,
    p_channel: parsed.data.channel,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard");
  return { ok: true, message: "Envoi enregistré." };
}

/** P2.4 — Génération manuelle des avis du mois pour l'organisation (owner, manager). */
export async function generateInvoices(period: unknown): Promise<ActionResult> {
  const g = await guard("generate", 10);
  if ("error" in g) return g.error!;
  const p = typeof period === "string" && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(period) ? period : null;
  if (!p) return { ok: false, message: "Période invalide." };
  const supabase = await createSupabaseServer();
  const { data: m } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", g.user.id)
    .in("role", ["owner", "manager"])
    .limit(1)
    .maybeSingle();
  if (!m) return { ok: false, message: "Accès refusé." };
  const { data, error } = await supabaseAdmin().rpc("generate_invoices_for_org", {
    p_actor: g.user.id,
    p_org: m.org_id,
    p_period: p,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard");
  return { ok: true, message: data ? `${data} avis générés.` : "Tous les avis du mois existent déjà." };
}

const cancelSchema = z.object({ id: uuid, reason: z.string().trim().min(5, "Motif obligatoire (5 caractères minimum)").max(300) });

/** P2.4 — Annulation motivée d'un avis non réglé (owner, manager). */
export async function cancelInvoice(input: unknown): Promise<ActionResult> {
  const g = await guard("cancel-invoice", 20);
  if ("error" in g) return g.error!;
  const raw = (input ?? {}) as { invoiceId?: unknown; reason?: unknown };
  const parsed = cancelSchema.safeParse({ id: raw.invoiceId, reason: raw.reason });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  const { error } = await supabaseAdmin().rpc("cancel_invoice", {
    p_actor: g.user.id,
    p_invoice: parsed.data.id,
    p_reason: parsed.data.reason,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard");
  return { ok: true, message: "Avis annulé." };
}

/** P2.4 — Annulation motivée d'une quittance (propriétaire seul) ; /verify la signale annulée. */
export async function cancelReceipt(input: unknown): Promise<ActionResult> {
  const g = await guard("cancel-receipt", 10);
  if ("error" in g) return g.error!;
  const raw = (input ?? {}) as { receiptId?: unknown; reason?: unknown };
  const parsed = cancelSchema.safeParse({ id: raw.receiptId, reason: raw.reason });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  const { error } = await supabaseAdmin().rpc("cancel_receipt", {
    p_actor: g.user.id,
    p_receipt: parsed.data.id,
    p_reason: parsed.data.reason,
    p_ip: g.ctx.ip,
    p_ua: g.ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/dashboard");
  return { ok: true, message: "Quittance annulée : elle est désormais signalée « annulée » à la vérification." };
}
