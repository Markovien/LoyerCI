"use server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/schemas";
import { limit } from "@/lib/security/rate-limit";
import { requestContext } from "@/lib/security/request-context";

export type LoginState = { ok: boolean; message: string } | null;

/** Connexion sans mot de passe (lien magique). En production : ajouter l'OTP SMS. */
export async function sendMagicLink(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide" };

  const { ip } = await requestContext();
  if (!limit(`login:${ip ?? "?"}`, 5, 10 * 60_000).ok || !limit(`login:${parsed.data.email}`, 3, 10 * 60_000).ok) {
    return { ok: false, message: "Trop de tentatives. Réessayez dans quelques minutes." };
  }

  const supabase = await createSupabaseServer();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(parsed.data.next)}`;
  await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
  // Réponse identique que le compte existe ou non (pas d'énumération des comptes).
  return { ok: true, message: "Si un compte existe pour cette adresse, un lien de connexion vient d'être envoyé." };
}
