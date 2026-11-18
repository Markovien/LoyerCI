import type { Metadata } from "next";
import { headers } from "next/headers";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseAnon } from "@/lib/supabase/admin";
import { clientIpFrom } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { uuid, verifyParamsSchema } from "@/lib/validation/schemas";
import type { VerifyReceiptResult } from "@/types/database";
import { Verdict } from "./verdict";

export const metadata: Metadata = {
  title: "Vérification de quittance",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

type View = { kind: "form"; error?: string } | { kind: "throttled" } | { kind: "result"; r: VerifyReceiptResult };

/**
 * Page publique (sans connexion), cible du QR code : /verify/<id>?c=<code>.
 * - aucune lecture de table : uniquement la fonction verify_receipt() exposée à « anon » ;
 * - données renvoyées déjà masquées par la base (le nom complet ne quitte jamais le serveur SQL) ;
 * - même réponse pour « inconnu » et « code faux » (aucun oracle d'énumération) ;
 * - débit limité par IP.
 */
async function resolve(receiptId: string, code: string | undefined): Promise<View> {
  if (!code) return { kind: "form" };
  const parsed = verifyParamsSchema.safeParse({ receiptId, code });
  if (!parsed.success) return { kind: "form", error: "Code de vérification incomplet (16 caractères)." };

  const env = serverEnv();
  const ip = clientIpFrom(await headers(), env.CLIENT_IP_HEADER, env.TRUSTED_PROXY_HOPS);
  if (!limit(`verify:${ip ?? "?"}`, 20, 60_000).ok) return { kind: "throttled" };

  const { data, error } = await supabaseAnon()
    .rpc("verify_receipt", { p_id: parsed.data.receiptId, p_code: parsed.data.code })
    .single<VerifyReceiptResult>();
  if (error || !data) return { kind: "result", r: { verdict: "invalide" } as VerifyReceiptResult };
  return { kind: "result", r: data };
}

export default async function VerifyPage({ params, searchParams }: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const [{ receiptId }, { c }] = await Promise.all([params, searchParams]);
  const validId = uuid.safeParse(receiptId).success;
  const view: View = validId ? await resolve(receiptId, c) : { kind: "result", r: { verdict: "invalide" } as VerifyReceiptResult };
  const host = new URL(serverEnv().NEXT_PUBLIC_APP_URL).host;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <Brand />
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
        Vérifiez que l&apos;adresse affichée par votre navigateur est exactement <strong className="font-mono">https://{host}</strong>. Une autre adresse = page frauduleuse.
      </div>

      {view.kind === "form" && (
        <Card>
          <CardContent className="grid gap-4 p-5">
            <h1 className="text-lg font-semibold">Vérifier une quittance</h1>
            <form method="get" className="grid gap-3">
              <Label htmlFor="c">Code de vérification imprimé sur la quittance</Label>
              <Input id="c" name="c" required autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX" maxLength={24} className="font-mono uppercase tracking-wider" />
              {view.error && <p className="text-sm text-danger">{view.error}</p>}
              <Button type="submit">Vérifier</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {view.kind === "throttled" && (
        <Card><CardContent className="p-5 text-sm">Trop de vérifications depuis votre connexion. Réessayez dans une minute.</CardContent></Card>
      )}

      {view.kind === "result" && <Verdict r={view.r} />}

      <p className="text-center text-xs text-muted-foreground">
        Par confidentialité, le nom du locataire est partiellement masqué. Comparez les autres informations avec le document présenté.
      </p>
    </main>
  );
}
