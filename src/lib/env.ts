import "server-only";
import { z } from "zod";

/**
 * Variables d'environnement SERVEUR, validées au premier accès (et non au build).
 * Toute variable manquante fait échouer bruyamment au lieu de dégrader la sécurité.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
  CLIENT_IP_HEADER: z.enum(["x-real-ip", "cf-connecting-ip", "x-forwarded-for"]).default("x-real-ip"),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
  CINETPAY_API_KEY: z.string().min(10),
  CINETPAY_SITE_ID: z.string().regex(/^\d{4,12}$/),
  CINETPAY_SECRET_KEY: z.string().min(16),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Configuration serveur invalide : ${keys}`);
    }
    cached = parsed.data;
  }
  return cached;
}
