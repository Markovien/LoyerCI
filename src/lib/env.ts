import "server-only";
import { z } from "zod";

/**
 * Variables d'environnement SERVEUR, validées au premier accès (et non au build).
 * Toute variable manquante fait échouer bruyamment au lieu de dégrader la sécurité.
 */
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
  })
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
