import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, FileCheck2, FileText } from "lucide-react";
import { Brand } from "@/components/brand";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatLongDate, formatPeriod, formatXOF } from "@/lib/format";

export const metadata: Metadata = { title: "Mes documents", robots: { index: false } };

/**
 * Espace locataire (compte facultatif, D.4) : historique complet des avis et quittances.
 * Après la sortie du parc, le compte est supprimé à M+3 : le locataire est invité à
 * télécharger ses documents (les archives du bailleur, elles, sont conservées).
 */
export default async function TenantHome() {
  const { supabase } = await requireUser("/pay");
  const [{ data }, { data: deletion }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, period, amount_due, amount_paid, due_date, status, leases(properties(label, commune)), receipts(id, receipt_number, status)",
      )
      .order("period", { ascending: false })
      .limit(60),
    supabase.rpc("my_account_deletion").maybeSingle(),
  ]);

  const rows = data ?? [];
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">
      <Brand href="/pay" />
      <h1 className="text-xl font-semibold">Mes avis et quittances</h1>

      {deletion?.deletion_at && (
        <section
          role="alert"
          aria-label="Suppression du compte"
          className="grid gap-1 rounded-xl border-2 border-warning bg-warning/10 p-4 text-sm"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            Votre compte sera supprimé le {formatLongDate(deletion.deletion_at)}
          </p>
          <p>
            Vous n&apos;avez plus de bail en cours. Téléchargez dès maintenant vos quittances et avis ci-dessous et conservez-les : ils
            prouvent vos paiements (dossier de location, visa, prêt). Ils resteront vérifiables en ligne.
          </p>
        </section>
      )}

      {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun document pour le moment.</p>}
      <ul className="grid gap-2">
        {rows.map((r) => {
          const receipt = Array.isArray(r.receipts) ? r.receipts[0] : r.receipts;
          return (
            <li key={r.id} className="min-w-0">
              <Card className="grid min-w-0 gap-3 p-4">
                <Link href={`/pay/${r.id}`} className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{formatPeriod(r.period)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.leases?.properties?.label} · {r.leases?.properties?.commune} · éch. {formatDate(r.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatXOF(r.amount_due - (r.status === "paye" ? 0 : r.amount_paid))}</p>
                      <InvoiceStatusBadge status={r.status} />
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                </Link>
                <div className="flex flex-wrap gap-2 text-sm">
                  <a href={`/api/notices/${r.id}/pdf`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2">
                    <FileText className="size-4" aria-hidden />
                    Avis (PDF)
                  </a>
                  {receipt?.status === "valide" && (
                    <a
                      href={`/api/receipts/${receipt.id}/pdf`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-success/40 px-3 py-2 text-success"
                    >
                      <FileCheck2 className="size-4" aria-hidden />
                      Quittance (PDF)
                    </a>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
