import "server-only";
import { z } from "zod";

/**
 * Variables d'environnement SERVEUR, validées au premier accès (et non au build).
 * Toute variable manquante fait échouer bruyamment au lieu de dégrader la sécurité.
 */
const ussdCodes = z.partialRecord(z.enum(["orange", "mtn", "moov", "wave"]), z.string().regex(/^[*#0-9]{3,20}$/));
export type UssdCodes = z.infer<typeof ussdCodes>;

function safeJson(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const serverSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    NEXT_PUBLIC_APP_URL: z.url(),
    CLIENT_IP_HEADER: z.enum(["x-real-ip", "cf-connecting-ip", "x-forwarded-for"]).default("x-real-ip"),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
    // CinetPay est optionnel (décision produit du 18/11/2026) : soit les trois clés, soit aucune.
    CINETPAY_API_KEY: z.string().min(10).optional(),
    CINETPAY_SITE_ID: z
      .string()
      .regex(/^\d{4,12}$/)
      .optional(),
    CINETPAY_SECRET_KEY: z.string().min(16).optional(),
    // Notifications e-mail (P3.2) : SMTP de l'adresse unique LoyerCI. Absent = file conservée,
    // rien n'est envoyé (la route d'expédition répond 503).
    SMTP_URL: z
      .string()
      .regex(/^smtps?:\/\/[^\s]+$/, "SMTP_URL : smtp://… ou smtps://…")
      .optional(),
    MAIL_FROM: z.string().min(5).max(200).optional(),
    // Secret de l'ordonnanceur (Vercel Cron : en-tête « Authorization: Bearer … »).
    CRON_SECRET: z.string().min(32).optional(),
    // Raccourcis USSD (P1.3) : désactivés tant que le pilote ne les a pas validés sur de
    // vrais appareils. Ex. {"orange":"#144#"} ; aucun code n'est figé dans le code source.
    USSD_CODES_JSON: z
      .string()
      .optional()
      .transform((v, ctx): UssdCodes => {
        if (!v) return {};
        const parsed = ussdCodes.safeParse(safeJson(v));
        if (parsed.success) return parsed.data;
        ctx.addIssue({ code: "custom", message: "USSD_CODES_JSON invalide" });
        return z.NEVER;
      }),
  })
  .refine((e) => !e.SMTP_URL || !!e.MAIL_FROM, { message: "MAIL_FROM requis avec SMTP_URL", path: ["MAIL_FROM"] })
  .refine(
    (e) =>
      [e.CINETPAY_API_KEY, e.CINETPAY_SITE_ID, e.CINETPAY_SECRET_KEY].every((v) => v === undefined) ||
      [e.CINETPAY_API_KEY, e.CINETPAY_SITE_ID, e.CINETPAY_SECRET_KEY].every((v) => v !== undefined),
    { message: "CinetPay : renseigner les trois clés ou aucune", path: ["CINETPAY_API_KEY"] },
  );

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    // Une variable vide (« CINETPAY_API_KEY= ») vaut « absente ».
    const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    const parsed = serverSchema.safeParse(env);
    if (!parsed.success) {
      const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Configuration serveur invalide : ${keys}`);
    }
    cached = parsed.data;
  }
  return cached;
}
