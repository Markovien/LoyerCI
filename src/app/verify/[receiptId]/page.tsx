import type { Metadata } from "next";
import { headers } from "next/headers";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIpFrom } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { z } from "zod";
import { uuid, verifyParamsSchema } from "@/lib/validation/schemas";
import { INVALID, Verdict, type DocumentVerdict } from "./verdict";

export const metadata: Metadata = {
  title: "Vérification de document",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const verdictSchema = z.enum(["authentique", "annulee", "invalide", "alteree", "plus_conserve"]);

type View = { kind: "form"; error?: string } | { kind: "throttled" } | { kind: "result"; r: DocumentVerdict };

/**
 * Page publique (sans connexion), cible du QR code : /verify/<id>?c=<code>.
 * - aucune lecture de table : uniquement la fonction verify_receipt(), appelée côté serveur ;
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
  if (!(await limit(`verify:${ip ?? "?"}`, 20, 60_000)).ok) return { kind: "throttled" };

  // verify_receipt / verify_notice ne sont exécutables que par service_role (pas d'appel
  // PostgREST direct qui contournerait ce limiteur) ; elles ne renvoient que des données masquées.
  const admin = supabaseAdmin();
  const { data: rc } = await admin.rpc("verify_receipt", { p_id: parsed.data.receiptId, p_code: parsed.data.code }).single();
  const rv = verdictSchema.safeParse(rc?.verdict);
  if (rc && rv.success && rv.data !== "invalide") {
    return {
      kind: "result",
      r: {
        verdict: rv.data,
        docType: "quittance",
        number: rc.receipt_number,
        landlordName: rc.landlord_name,
        tenantMasked: rc.tenant_masked,
        location: rc.property_location,
        period: rc.period,
        amount: rc.amount,
        date: rv.data === "plus_conserve" ? rc.issued_at : rc.paid_at,
        fingerprint: rc.fingerprint,
        revokedAt: rc.revoked_at,
      },
    };
  }
  // Même identifiant possible pour un avis d'échéance signé.
  const { data: nc } = await admin.rpc("verify_notice", { p_id: parsed.data.receiptId, p_code: parsed.data.code }).single();
  const nv = verdictSchema.safeParse(nc?.verdict);
  if (!nc || !nv.success) return { kind: "result", r: INVALID };
  return {
    kind: "result",
    r: {
      verdict: nv.data,
      docType: nv.data === "invalide" ? null : "avis",
      number: nc.payment_reference,
      landlordName: nc.landlord_name,
      tenantMasked: nc.tenant_masked,
      location: nc.property_location,
      period: nc.period,
      amount: nc.amount_due,
      date: nv.data === "plus_conserve" ? nc.issued_at : nc.due_date,
      fingerprint: nc.fingerprint,
      revokedAt: null,
    },
  };
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const [{ receiptId }, { c }] = await Promise.all([params, searchParams]);
  const validId = uuid.safeParse(receiptId).success;
  const view: View = validId ? await resolve(receiptId, c) : { kind: "result", r: INVALID };
  const host = new URL(serverEnv().NEXT_PUBLIC_APP_URL).host;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <Brand />
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
        Vérifiez que l&apos;adresse affichée par votre navigateur est exactement <strong className="font-mono">https://{host}</strong>. Une
        autre adresse = page frauduleuse.
      </div>

      {view.kind === "form" && (
        <Card>
          <CardContent className="grid gap-4 p-5">
            <h1 className="text-lg font-semibold">Vérifier une quittance ou un avis</h1>
            <form method="get" className="grid gap-3">
              <Label htmlFor="c">Code de vérification imprimé sur le document</Label>
              <Input
                id="c"
                name="c"
                required
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                maxLength={24}
                className="font-mono uppercase tracking-wider"
              />
              {view.error && <p className="text-sm text-danger">{view.error}</p>}
              <Button type="submit">Vérifier</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {view.kind === "throttled" && (
        <Card>
          <CardContent className="p-5 text-sm">Trop de vérifications depuis votre connexion. Réessayez dans une minute.</CardContent>
        </Card>
      )}

      {view.kind === "result" && <Verdict r={view.r} />}

      <p className="text-center text-xs text-muted-foreground">
        Par confidentialité, le nom du locataire est partiellement masqué. Comparez les autres informations avec le document présenté.
      </p>
    </main>
  );
}
