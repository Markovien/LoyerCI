import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatXOF } from "@/lib/format";
import { uuid } from "@/lib/validation/schemas";
import { AutoRefresh } from "./auto-refresh";

export const metadata: Metadata = { title: "Suivi du paiement", robots: { index: false } };

/**
 * Page de retour après l'opérateur. On n'accorde AUCUNE confiance aux paramètres de
 * l'URL de retour (falsifiables) : seul le statut en base, mis à jour par le webhook
 * signé et revérifié, fait foi.
 */
export default async function ReturnPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  if (!uuid.safeParse(invoiceId).success) notFound();
  const { supabase } = await requireUser(`/pay/${invoiceId}`);

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, status, amount_due, payments(status, method, amount, created_at)")
    .eq("id", invoiceId)
    .maybeSingle<{ id: string; status: string; amount_due: number; payments: { status: string; method: string; amount: number; created_at: string }[] }>();
  if (!inv) notFound();

  const last = inv.payments.filter((p) => p.method === "mobile_money").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const state = inv.status === "paye" || last?.status === "reussi" ? "ok" : last?.status === "echoue" ? "ko" : "wait";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <Brand />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center sm:p-8">
          {state === "ok" && <CheckCircle2 className="size-12 text-success" aria-hidden />}
          {state === "ko" && <XCircle className="size-12 text-danger" aria-hidden />}
          {state === "wait" && <Clock className="size-12 animate-pulse text-warning" aria-hidden />}
          <h1 className="text-xl font-semibold">
            {state === "ok" ? "Paiement confirmé" : state === "ko" ? "Paiement non abouti" : "Confirmation en cours…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {state === "ok" && `${formatXOF(last?.amount ?? inv.amount_due)} reçus. Votre quittance est disponible.`}
            {state === "ko" && "Aucun montant n'a été débité ou l'opération a été refusée. Vous pouvez réessayer."}
            {state === "wait" && "Validez la transaction sur votre téléphone si ce n'est pas déjà fait. Cette page se met à jour automatiquement."}
          </p>
          <Button asChild className="mt-2"><Link href={`/pay/${invoiceId}`}>{state === "ko" ? "Réessayer" : "Retour à mon avis"}</Link></Button>
        </CardContent>
      </Card>
      {state === "wait" && <AutoRefresh everyMs={4000} maxTries={45} />}
    </main>
  );
}
