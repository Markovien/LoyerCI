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
    // oxlint-disable-next-line no-control-regex -- retrait volontaire des caractères de contrôle
    .transform((v) => v.replace(/[\u0000-\u001f\u007f<>]/g, ""));

export const initiateMobileMoneySchema = z.object({
  invoiceId: uuid,
  operator: mobileOperator,
});

export const transferProofSchema = z.object({
  invoiceId: uuid,
  amount: amountXOF,
  bankReference: safeText(80)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/** Confirmation ou rejet d'un paiement manuel (virement, paiement direct, espèces). */
export const reviewManualPaymentSchema = z
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
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Adresse e-mail invalide" }).max(200)),
  next: z
    .string()
    .optional()
    .transform((v) => (v && /^\/(?!\/)[\w\-/]*$/.test(v) ? v : "/dashboard")), // anti open-redirect
});

/** N° de transaction opérateur facultatif : vide -> undefined ; format exact vérifié en base. */
export const optionalTxnRef = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(
    z
      .string()
      .min(4, "Numéro de transaction trop court")
      .max(60)
      .regex(/^[A-Za-z0-9._-]+$/, "Numéro de transaction invalide (lettres, chiffres, . _ -)")
      .optional(),
  );

/** Déclaration d'un paiement direct (Mobile Money vers le compte du bailleur). */
export const directPaymentSchema = z.object({
  invoiceId: uuid,
  operator: mobileOperator,
  amount: amountXOF,
  // Contrôle de forme seulement : le format exact par opérateur est vérifié en base.
  // Facultatif depuis le 21/11/2026 : le bailleur confirme en consultant son compte.
  txnRef: optionalTxnRef,
  payerPhone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(phoneCI.optional())
    .refine((v) => !v || /^225(01|05|07)/.test(v), "Indiquez un numéro mobile (01, 05 ou 07)"),
});

/** « Encaissement reçu » saisi par le bailleur (Mobile Money ou virement constaté sur son compte). */
export const receivedPaymentSchema = z
  .object({
    invoiceId: uuid,
    method: z.enum(["mobile_money", "virement"]),
    operator: mobileOperator.optional(),
    amount: amountXOF,
    txnRef: optionalTxnRef,
    bankReference: safeText(80)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => v.method !== "mobile_money" || v.operator !== undefined, { message: "Choisissez l'opérateur", path: ["operator"] });

/** Code à usage unique reçu par e-mail (ré-authentification, P1.6). */
export const reauthCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Le code comporte 6 chiffres"));

const holder = safeText(120).pipe(z.string().min(2, "Indiquez le titulaire du compte"));
const displayName = safeText(120)
  .optional()
  .transform((v) => (v ? v : undefined));

/** Coordonnée de réception des fonds (P1.6). Formats revérifiés par les contraintes en base. */
export const receivingAccountSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("banque"),
    holder,
    displayName,
    bank: safeText(80).pipe(z.string().min(2, "Indiquez la banque")),
    iban: ibanCI,
  }),
  z.object({
    kind: z.literal("mobile_money"),
    holder,
    displayName,
    operator: mobileOperator,
    msisdn: phoneCI.refine((v) => /^225(01|05|07)/.test(v), "Indiquez un numéro mobile (01, 05 ou 07)"),
  }),
  z.object({
    kind: z.literal("pispi_alias"),
    holder,
    displayName,
    alias: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s.\-()]/g, ""))
      .transform((v) => (/^(\+?225)?0[157]\d{8}$/.test(v) ? `+225${v.replace(/^\+?225/, "")}` : v.toLowerCase()))
      .pipe(
        z
          .string()
          .regex(
            /^(\+2250[157]\d{8}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/,
            "Alias PI-SPI : numéro mobile ou adresse de paiement (UUID)",
          ),
      ),
  }),
  z.object({
    kind: z.literal("payment_link"),
    holder,
    displayName,
    operator: mobileOperator,
    url: z
      .string()
      .trim()
      .max(300)
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password && !u.port;
        } catch {
          return false;
        }
      }, "Lien https:// valide requis"),
  }),
]);

export const paymentSettingsSchema = z
  .object({
    orgId: uuid,
    direct: z.boolean(),
    cinetpay: z.boolean(),
    transfer: z.boolean(),
    feesNotice: safeText(600).optional(),
    cashThreshold: z.coerce.number().int().min(0).max(100_000_000),
  })
  .refine((v) => v.direct || v.cinetpay || v.transfer, { message: "Gardez au moins un mode de paiement actif", path: ["direct"] });

/** Document à envoyer par le bailleur (D.2). */
export const documentRefSchema = z.object({ invoiceId: uuid, docType: z.enum(["avis", "quittance"]) });
export const documentSentSchema = documentRefSchema.extend({ channel: z.enum(["partage", "whatsapp", "email", "telechargement"]) });

/** Bien immobilier (P2.1). Contraintes revérifiées en base. */
export const propertySchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,10}$/, "Code : 2 à 10 lettres ou chiffres, sans espace (ex. VCR01)")),
  label: safeText(120).pipe(z.string().min(2, "Indiquez un libellé (ex. Villa Duplex 5 pièces)")),
  type: z.enum(["appartement", "villa", "studio", "magasin", "bureau", "entrepot"]),
  city: safeText(60).pipe(z.string().min(2, "Indiquez la ville")),
  commune: safeText(60).pipe(z.string().min(2, "Indiquez la commune")),
  quartier: safeText(80).optional(),
  address: safeText(200).optional(),
});

/** Fiche locataire (P2.2). Aucune pièce d'identité. */
export const tenantSchema = z.object({
  fullName: safeText(120).pipe(z.string().min(2, "Indiquez le nom du locataire")),
  phone: phoneCI,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.email({ error: "Adresse e-mail invalide" }).optional()),
});

/** Jeton d'invitation (base64url, 32 octets). */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Lien d'invitation invalide");
