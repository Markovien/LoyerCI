"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActionUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/security/crypto";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { invitationTokenSchema } from "@/lib/validation/schemas";

export type InvitationState = { ok: boolean; message: string } | null;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Adresse e-mail invalide" }).max(200));

/**
 * Étape 1 (public) : le locataire saisit son e-mail ; il reçoit un lien de connexion qui le
 * ramène sur la page d'acceptation. RIEN n'est rattaché ici : la propriété de l'adresse
 * doit d'abord être prouvée par le clic sur le lien.
 */
export async function requestInvitationLogin(_: InvitationState, formData: FormData): Promise<InvitationState> {
  const token = invitationTokenSchema.safeParse(formData.get("token"));
  const email = emailSchema.safeParse(formData.get("email"));
  if (!token.success) return { ok: false, message: "Lien d'invitation invalide." };
  if (!email.success) return { ok: false, message: email.error.issues[0]?.message ?? "Adresse e-mail invalide" };

  const { ip } = await requestContext();
  if (!(await limit(`invite-login:${ip ?? "?"}`, 5, 10 * 60_000)).ok || !(await limit(`invite-login:${token.data}`, 3, 10 * 60_000)).ok) {
    return { ok: false, message: "Trop de tentatives. Réessayez dans quelques minutes." };
  }
  const admin = supabaseAdmin();
  const { data: inv } = await admin.rpc("get_invitation", { p_token_hash: sha256Hex(token.data) }).maybeSingle();
  if (inv?.status !== "valide")
    return { ok: false, message: "Cette invitation n'est plus valable. Demandez-en une nouvelle à votre bailleur." };

  // Inscription publique fermée (décision D1) : le compte est créé côté serveur, et seulement
  // pour un porteur d'invitation valide. Il ne donne accès à rien tant qu'il n'est pas rattaché.
  const { error: cErr } = await admin.auth.admin.createUser({ email: email.data, email_confirm: true });
  if (cErr && cErr.code !== "email_exists") {
    console.warn(`[invitation] création de compte impossible · code=${cErr.code ?? "inconnu"}`);
    return { ok: false, message: "Création du compte impossible. Réessayez dans un instant." };
  }
  const supabase = await createSupabaseServer();
  const next = `/invitation/${token.data}/accepter`;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${serverEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "over_email_send_rate_limit"
          ? "Un lien vient d'être envoyé : patientez une minute."
          : "Envoi impossible. Réessayez dans un instant.",
    };
  }
  return { ok: true, message: `Un lien de connexion a été envoyé à ${email.data}. Ouvrez-le sur ce téléphone pour terminer.` };
}

/** Étape 2 (connecté) : confirmation explicite du rattachement (clic, jamais au simple affichage). */
export async function acceptInvitation(_: InvitationState, formData: FormData): Promise<InvitationState> {
  const token = invitationTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { ok: false, message: "Lien d'invitation invalide." };
  const { user } = await getActionUser();
  if (!user) return { ok: false, message: "Session expirée : rouvrez le lien reçu par e-mail." };
  if (!(await limit(`invite-accept:${user.id}`, 5, 10 * 60_000)).ok) return { ok: false, message: "Trop de tentatives." };
  const ctx = await requestContext();
  const { error } = await supabaseAdmin().rpc("accept_invitation", {
    p_token_hash: sha256Hex(token.data),
    p_user: user.id,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  redirect("/pay");
}
