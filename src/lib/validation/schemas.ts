import { z } from "zod";

/**
 * Schémas Zod partagés. Toute donnée venant du client (formulaires, paramètres d'URL,
 * corps de webhook) est validée ici AVANT d'atteindre la base. Les montants ne sont
 * JAMAIS acceptés du client pour un paiement Mobile Money : ils sont recalculés en base.
 */

export const uuid = z.uuid({ error: "Identifiant invalide" });

export const mobileOperator = z.enum(["orange", "mtn", "moov", "wave"]);
export type MobileOperator = z.infer<typeof mobileOperator>;

/** Numéros ivoiriens à 10 chiffres (depuis 2021) : 01 Moov, 05 MTN, 07 Orange, 21/25/27 fixes. */
export const phoneCI = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s.\-()]/g, ""))
  .transform((v) => v.replace(/^(\+|00)/, ""))
  .transform((v) => (v.length === 10 ? `225${v}` : v))
  .pipe(z.string().regex(/^225(01|05|07|21|25|27)\d{8}$/, "Numéro ivoirien invalide (ex. 07 07 12 34 56)"));

export const amountXOF = z.coerce
  .number({ error: "Montant invalide" })
  .int("Le franc CFA n'a pas de centimes")
  .min(100, "Montant minimum : 100 FCFA")
  .max(100_000_000, "Montant trop élevé");

/** Texte libre : longueur bornée, caractères de contrôle et chevrons retirés (défense XSS en profondeur ;
 *  React échappe déjà tout rendu). */
export const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.replace(/[\u0000-\u001f\u007f<>]/g, ""));

export const initiateMobileMoneySchema = z.object({
  invoiceId: uuid,
  operator: mobileOperator,
});

export const transferProofSchema = z.object({
  invoiceId: uuid,
  amount: amountXOF,
  bankReference: safeText(80).optional().transform((v) => (v ? v : undefined)),
});

export const reviewTransferSchema = z
  .object({
    paymentId: uuid,
    decision: z.enum(["valider", "rejeter"]),
    reason: safeText(300).optional(),
  })
  .refine((v) => v.decision === "valider" || (v.reason?.length ?? 0) >= 5, {
    message: "Indiquez un motif de rejet (5 caractères minimum)",
    path: ["reason"],
  });

export const cashPaymentSchema = z.object({ invoiceId: uuid, amount: amountXOF });

/** IBAN ivoirien : CI + 2 chiffres de contrôle + 24 caractères (28 au total), contrôle ISO 7064 mod 97. */
export const ibanCI = z
  .string()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^CI\d{2}[A-Z0-9]{24}$/, "IBAN ivoirien invalide (28 caractères, commence par CI)"))
  .refine(ibanChecksumOk, "Clé de contrôle IBAN incorrecte");

export function ibanChecksumOk(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export const verifyParamsSchema = z.object({
  receiptId: uuid,
  code: z
    .string()
    .transform((v) => v.replace(/[^0-9a-fA-F]/g, "").toLowerCase())
    .pipe(z.string().min(16).max(64)),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Adresse e-mail invalide" }).max(200)),
  next: z
    .string()
    .optional()
    .transform((v) => (v && /^\/(?!\/)[\w\-/]*$/.test(v) ? v : "/dashboard")), // anti open-redirect
});
