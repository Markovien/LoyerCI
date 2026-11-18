import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Download, Home, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatPeriod, formatXOF } from "@/lib/format";
import { uuid } from "@/lib/validation/schemas";
import { PaymentPanel, type TransferInfo } from "./payment-panel";

export const metadata: Metadata = { title: "Payer mon loyer", robots: { index: false } };

const PAYMENT_STATUS: Record<string, string> = {
  initie: "En cours",
  en_attente_validation: "En attente de validation",
  reussi: "Reçu",
  echoue: "Échoué",
  rejete: "Rejeté",
};
const METHOD: Record<string, string> = { mobile_money: "Mobile Money", virement: "Virement", especes: "Espèces" };

export default async function PayPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  if (!uuid.safeParse(invoiceId).success) notFound();
  const { supabase } = await requireUser(`/pay/${invoiceId}`);

  // RLS : si l'avis n'appartient pas à l'utilisateur, la requête ne renvoie rien → 404.
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, org_id, period, amount_due, amount_paid, due_date, status, payment_reference, organizations(name), tenants(full_name, phone), leases(properties(label, commune, quartier, city)), payments(id, method, status, amount, created_at, failure_reason)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) notFound();

  const remaining = inv.amount_due - inv.amount_paid;
  const payable = inv.status !== "paye" && inv.status !== "annule" && remaining > 0;

  const [{ data: receipt }, { data: tr }] = await Promise.all([
    supabase.from("receipts").select("id, receipt_number").eq("invoice_id", inv.id).maybeSingle(),
    payable ? supabase.rpc("get_transfer_instructions", { p_invoice: inv.id }).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const transfer: TransferInfo | null = tr
    ? { accountHolder: tr.account_holder, bankName: tr.bank_name, iban: tr.iban, reference: tr.payment_reference }
    : null;
  const p = inv.leases?.properties;
  const history = [...inv.payments].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((x) => x.status !== "initie");

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between">
        <Brand href="/pay" />
        <Link href="/pay" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Mes avis
        </Link>
      </header>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Avis d&apos;échéance · <span className="capitalize">{formatPeriod(inv.period)}</span>
            </p>
            <InvoiceStatusBadge status={inv.status} />
          </div>
          <div>
            <p className="text-3xl font-semibold tracking-tight">{formatXOF(payable ? remaining : inv.amount_due)}</p>
            {inv.amount_paid > 0 && payable && (
              <p className="text-sm text-muted-foreground">
                sur {formatXOF(inv.amount_due)} · {formatXOF(inv.amount_paid)} déjà reçus
              </p>
            )}
          </div>
          <div className="grid gap-1.5 text-sm">
            <p className="flex items-center gap-2">
              <Home className="size-4 text-muted-foreground" aria-hidden />
              {p?.label} — {[p?.quartier, p?.commune, p?.city].filter(Boolean).join(", ")}
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
              Échéance le {formatDate(inv.due_date)} · Bailleur : {inv.organizations?.name}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {payable ? (
            <PaymentPanel invoiceId={inv.id} remaining={remaining} transfer={transfer} />
          ) : receipt ? (
            <div className="grid gap-3 rounded-lg bg-success/8 p-4">
              <p className="flex items-center gap-2 font-medium text-success">
                <ShieldCheck className="size-5" aria-hidden />
                Loyer réglé — quittance {receipt.receipt_number}
              </p>
              <Button asChild>
                <a href={`/api/receipts/${receipt.id}/pdf`}>
                  <Download />
                  Télécharger la quittance (PDF)
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Cet avis n&apos;est plus payable en ligne.</p>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Historique des règlements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p>
                      {METHOD[h.method]} · {formatDate(h.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {PAYMENT_STATUS[h.status]}
                      {h.failure_reason && h.status === "rejete" ? ` — ${h.failure_reason}` : ""}
                    </p>
                  </div>
                  <p className="font-medium">{formatXOF(h.amount)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Payez uniquement depuis cette page ({process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "")}). Votre bailleur ne vous
        demandera jamais de payer sur un autre numéro.
      </p>
    </main>
  );
}
