"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getActionUser } from "@/lib/auth/session";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { newTransactionId } from "@/lib/security/crypto";
import { MAX_PROOF_BYTES, pdfLooksActive, sniffProof } from "@/lib/security/files";
import { getProvider, isAllowedCheckoutUrl, isProviderConfigured } from "@/lib/payments/registry";
import { ProviderError } from "@/lib/payments/types";
import { initiateMobileMoneySchema, transferProofSchema } from "@/lib/validation/schemas";
import { serverEnv } from "@/lib/env";

export type PayResult = { ok: boolean; message: string; redirectUrl?: string };

const OPERATOR_LABEL = { orange: "Orange Money", mtn: "MTN MoMo", moov: "Moov Money", wave: "Wave" } as const;

/**
 * Mobile Money. Le client n'envoie QUE l'avis et l'opérateur : le montant est
 * recalculé en base (amount_due - amount_paid) dans create_payment_intent.
 */
export async function initiateMobileMoneyPayment(input: unknown): Promise<PayResult> {
  const { supabase, user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!limit(`pay:${user.id}`, 5, 60_000).ok) return { ok: false, message: "Trop de tentatives. Patientez une minute." };

  const parsed = initiateMobileMoneySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Requête invalide." };
  const { invoiceId, operator } = parsed.data;
  if (!isProviderConfigured("cinetpay")) return { ok: false, message: "Le paiement en ligne via agrégateur n'est pas activé." };

  // Lecture RLS : l'avis doit être visible par CE locataire.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, period, payment_reference, tenants(full_name, phone)")
    .eq("id", invoiceId)
    .maybeSingle<{ id: string; period: string; payment_reference: string; tenants: { full_name: string; phone: string } | null }>();
  if (!invoice) return { ok: false, message: "Avis introuvable." };

  const ctx = await requestContext();
  const admin = supabaseAdmin();
  const provider = getProvider("cinetpay");

  const { data: intent, error } = await admin
    .rpc("create_payment_intent", {
      p_actor: user.id, p_invoice: invoiceId, p_provider: provider.name, p_operator: operator,
      p_tx_id: newTransactionId(), p_ip: ctx.ip, p_ua: ctx.userAgent,
    })
    .single<{ payment_id: string; transaction_id: string; amount: number; reused: boolean; checkout_url: string | null }>();
  if (error || !intent) return { ok: false, message: dbErrorMessage(error) };

  // Double clic / retour arrière : on renvoie vers la même session de paiement.
  if (intent.reused) {
    return intent.checkout_url && isAllowedCheckoutUrl(intent.checkout_url, provider)
      ? { ok: true, message: "Reprise de votre paiement en cours…", redirectUrl: intent.checkout_url }
      : { ok: false, message: "Un paiement est déjà en cours. Validez-le sur votre téléphone ou réessayez dans 15 minutes." };
  }

  const env = serverEnv();
  try {
    const { checkoutUrl } = await provider.initPayment({
      transactionId: intent.transaction_id,
      amount: intent.amount,
      description: `Loyer ${invoice.payment_reference}`,
      operator,
      customerName: invoice.tenants?.full_name ?? "Locataire",
      customerPhone: invoice.tenants?.phone,
      invoiceId,
      returnUrl: `${env.NEXT_PUBLIC_APP_URL}/pay/${invoiceId}/retour`,
      notifyUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/payment?provider=${provider.name}`,
    });
    if (!isAllowedCheckoutUrl(checkoutUrl, provider)) throw new ProviderError("URL de paiement non autorisée");
    await admin.rpc("set_checkout_url", { p_payment: intent.payment_id, p_url: checkoutUrl });
    return { ok: true, message: `Redirection vers ${OPERATOR_LABEL[operator]}…`, redirectUrl: checkoutUrl };
  } catch (e) {
    await admin.rpc("fail_provider_payment", {
      p_provider: provider.name, p_tx_id: intent.transaction_id,
      p_reason: e instanceof Error ? e.message.slice(0, 200) : "init_echec", p_ip: ctx.ip,
    });
    console.warn(`[paiement] initialisation échouée · tx=${intent.transaction_id} · ${e instanceof Error ? e.message : "inconnu"}`);
    return { ok: false, message: "Service de paiement momentanément indisponible. Réessayez ou payez par virement." };
  }
}

export type ProofState = { ok: boolean; message: string } | null;

/** Virement : dépôt de la preuve (bucket privé) + déclaration soumise à validation du bailleur. */
export async function submitTransferProof(_: ProofState, formData: FormData): Promise<ProofState> {
  const { supabase, user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!limit(`proof:${user.id}`, 3, 10 * 60_000).ok) return { ok: false, message: "Trop d'envois. Réessayez plus tard." };

  const parsed = transferProofSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    bankReference: formData.get("bankReference") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Joignez le reçu de virement (PDF, JPG ou PNG)." };
  if (file.size > MAX_PROOF_BYTES) return { ok: false, message: "Fichier trop volumineux (5 Mo maximum)." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffProof(bytes);
  if (!kind) return { ok: false, message: "Format non reconnu. Envoyez un PDF, JPG ou PNG." };
  if (kind.ext === "pdf" && pdfLooksActive(bytes)) return { ok: false, message: "PDF refusé (contenu actif). Exportez un PDF simple ou une photo." };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, org_id")
    .eq("id", parsed.data.invoiceId)
    .maybeSingle<{ id: string; org_id: string }>();
  if (!invoice) return { ok: false, message: "Avis introuvable." };

  // Nom de fichier généré côté serveur : jamais le nom fourni par l'utilisateur.
  const path = `${invoice.org_id}/${invoice.id}/${randomUUID()}.${kind.ext}`;
  const admin = supabaseAdmin();
  const { error: upErr } = await admin.storage.from("transfer-proofs").upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (upErr) return { ok: false, message: "Échec de l'envoi du fichier. Réessayez." };

  const ctx = await requestContext();
  const { error } = await admin.rpc("submit_transfer_proof", {
    p_actor: user.id, p_invoice: invoice.id, p_amount: parsed.data.amount,
    p_bank_reference: parsed.data.bankReference ?? null, p_proof_path: path,
    p_tx_id: `VIR-${randomUUID()}`, p_ip: ctx.ip, p_ua: ctx.userAgent,
  });
  if (error) {
    await admin.storage.from("transfer-proofs").remove([path]); // pas de fichier orphelin
    return { ok: false, message: dbErrorMessage(error) };
  }

  revalidatePath(`/pay/${invoice.id}`);
  return { ok: true, message: "Preuve envoyée. Votre bailleur va la vérifier ; vous recevrez la quittance dès validation." };
}
