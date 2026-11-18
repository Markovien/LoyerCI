import "server-only";
import { z } from "zod";
import { hmacSha256Hex, safeEqualHex } from "@/lib/security/crypto";
import type { InitPaymentInput, PaymentProvider, VerifiedTransaction } from "./types";
import { ProviderError } from "./types";
import type { MobileOperator } from "@/lib/validation/schemas";

const API = "https://api-checkout.cinetpay.com/v2";

/**
 * Ordre officiel de concaténation des champs pour le jeton HMAC « x-token »
 * (docs.cinetpay.com › Checkout › X-TOKEN HMAC).
 */
export const CINETPAY_HMAC_FIELDS = [
  "cpm_site_id",
  "cpm_trans_id",
  "cpm_trans_date",
  "cpm_amount",
  "cpm_currency",
  "signature",
  "payment_method",
  "cel_phone_num",
  "cpm_phone_prefixe",
  "cpm_language",
  "cpm_version",
  "cpm_payment_config",
  "cpm_page_action",
  "cpm_custom",
  "cpm_designation",
  "cpm_error_message",
] as const;

export function cinetpayToken(form: URLSearchParams, secret: string): string {
  const data = CINETPAY_HMAC_FIELDS.map((f) => form.get(f) ?? "").join("");
  return hmacSha256Hex(secret, data);
}

const notificationSchema = z.object({
  cpm_site_id: z.string().regex(/^\d{4,12}$/),
  cpm_trans_id: z.string().regex(/^[A-Z0-9]{8,64}$/i),
});

const checkResponseSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  data: z
    .object({
      amount: z.coerce.number(),
      currency: z.string(),
      status: z.string(),
      payment_method: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
});

function operatorFromMethod(method: string | null | undefined): MobileOperator | null {
  const m = (method ?? "").toUpperCase();
  if (m.includes("OM") || m.includes("ORANGE")) return "orange";
  if (m.includes("MOMO") || m.includes("MTN")) return "mtn";
  if (m.includes("FLOOZ") || m.includes("MOOV")) return "moov";
  if (m.includes("WAVE")) return "wave";
  return null;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status >= 500) throw new ProviderError(`CinetPay indisponible (${res.status})`, true);
  return res.json();
}

export function createCinetPay(cfg: { apiKey: string; siteId: string; secretKey: string }): PaymentProvider {
  return {
    name: "cinetpay",
    checkoutHosts: ["checkout.cinetpay.com", "secure.cinetpay.com"],

    async initPayment(input: InitPaymentInput) {
      // Contrainte CinetPay : le montant doit être un multiple de 5.
      if (input.amount % 5 !== 0) {
        throw new ProviderError("Montant non multiple de 5 FCFA : contactez votre bailleur");
      }
      const json = (await postJson(`${API}/payment`, {
        apikey: cfg.apiKey,
        site_id: cfg.siteId,
        transaction_id: input.transactionId,
        amount: input.amount,
        currency: "XOF",
        description: input.description.replace(/[^\p{L}\p{N} .,'-]/gu, "").slice(0, 120),
        notify_url: input.notifyUrl,
        return_url: input.returnUrl,
        channels: "MOBILE_MONEY",
        lang: "fr",
        // L'opérateur est confirmé sur la page CinetPay ; on le transmet pour le suivi.
        metadata: `${input.invoiceId}:${input.operator}`,
        customer_name: input.customerName.slice(0, 60),
        customer_phone_number: input.customerPhone,
      })) as { code?: string; message?: string; data?: { payment_url?: string } };

      const url = json.data?.payment_url;
      if (json.code !== "201" || !url) {
        throw new ProviderError(`Initialisation refusée par CinetPay : ${json.message ?? "réponse inattendue"}`);
      }
      return { checkoutUrl: url };
    },

    verifySignature(rawBody, headers) {
      const received = headers.get("x-token") ?? "";
      const expected = cinetpayToken(new URLSearchParams(rawBody), cfg.secretKey);
      return safeEqualHex(expected, received);
    },

    parseWebhook(rawBody) {
      const form = Object.fromEntries(new URLSearchParams(rawBody));
      const n = notificationSchema.parse(form);
      if (n.cpm_site_id !== cfg.siteId) throw new ProviderError("site_id inattendu");
      return { transactionId: n.cpm_trans_id };
    },

    async verifyTransaction(transactionId): Promise<VerifiedTransaction> {
      const json = checkResponseSchema.parse(
        await postJson(`${API}/payment/check`, { apikey: cfg.apiKey, site_id: cfg.siteId, transaction_id: transactionId }),
      );
      const d = json.data;
      if (!d) throw new ProviderError(`Vérification impossible : ${json.message ?? json.code}`, true);
      const status = d.status === "ACCEPTED" ? "accepted" : d.status === "REFUSED" ? "refused" : "pending";
      return {
        transactionId,
        status,
        amount: Math.round(d.amount),
        currency: d.currency,
        operator: operatorFromMethod(d.payment_method),
        raw: { code: json.code, status: d.status, payment_method: d.payment_method ?? null },
      };
    },
  };
}
