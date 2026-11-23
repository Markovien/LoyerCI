import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/security/crypto";
import { clientIpFrom } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { invitationTokenSchema } from "@/lib/validation/schemas";
import { EmailStep } from "./forms";

export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  invalide: "Ce lien d'invitation n'est pas reconnu.",
  expiree: "Cette invitation a expiré. Demandez-en une nouvelle à votre bailleur.",
  utilisee: "Cette invitation a déjà été utilisée.",
  revoquee: "Cette invitation a été remplacée par une plus récente. Utilisez le dernier lien reçu.",
};

/** Page publique d'invitation (P2.2). Données affichées masquées ; rien n'est rattaché ici. */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!invitationTokenSchema.safeParse(token).success) notFound();
  const env = serverEnv();
  const ip = clientIpFrom(await headers(), env.CLIENT_IP_HEADER, env.TRUSTED_PROXY_HOPS);
  if (!limit(`invitation-view:${ip ?? "?"}`, 30, 60_000).ok) {
    return <main className="mx-auto max-w-md p-6 text-sm">Trop de requêtes. Réessayez dans une minute.</main>;
  }
  const { data: inv } = await supabaseAdmin()
    .rpc("get_invitation", { p_token_hash: sha256Hex(token) })
    .maybeSingle();
  const status = inv?.status ?? "invalide";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <Brand />
      <Card>
        <CardContent className="grid gap-4 p-5">
          {status === "valide" && inv ? (
            <>
              <h1 className="text-xl font-semibold">Votre espace locataire</h1>
              <p className="text-sm">
                <strong>{inv.landlord_name}</strong> vous invite à retrouver tous vos avis d&apos;échéance et quittances de loyer.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted p-3 text-sm">
                <dt className="text-muted-foreground">Locataire</dt>
                <dd>{inv.tenant_masked}</dd>
                <dt className="text-muted-foreground">Téléphone</dt>
                <dd className="font-mono">{inv.phone_hint}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">Ce n&apos;est pas vous ? Fermez cette page et prévenez votre bailleur.</p>
              <EmailStep token={token} />
              <p className="text-xs text-muted-foreground">
                L&apos;espace est facultatif : votre bailleur continue de vous envoyer vos documents par WhatsApp ou e-mail.
              </p>
            </>
          ) : (
            <p className="text-sm">{STATUS_TEXT[status] ?? STATUS_TEXT.invalide}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
