import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/security/crypto";
import { invitationTokenSchema } from "@/lib/validation/schemas";
import { AcceptStep } from "../forms";

export const metadata: Metadata = { title: "Confirmer l'invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Étape connectée : le rattachement exige un clic explicite (jamais au simple affichage). */
export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!invitationTokenSchema.safeParse(token).success) notFound();
  const { user } = await requireUser(`/invitation/${token}/accepter`);
  const { data: inv } = await supabaseAdmin()
    .rpc("get_invitation", { p_token_hash: sha256Hex(token) })
    .maybeSingle();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <Brand />
      <Card>
        <CardContent className="grid gap-4 p-5">
          {inv?.status === "valide" ? (
            <>
              <h1 className="text-xl font-semibold">Dernière étape</h1>
              <p className="text-sm">
                Connecté avec <strong>{user.email}</strong>. Rattacher ce compte à l&apos;espace locataire proposé par{" "}
                <strong>{inv.landlord_name}</strong> ({inv.tenant_masked}) ?
              </p>
              <AcceptStep token={token} landlord={inv.landlord_name ?? "votre bailleur"} />
            </>
          ) : (
            <p className="text-sm">Cette invitation n&apos;est plus valable. Demandez-en une nouvelle à votre bailleur.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
