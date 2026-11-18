import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { formatDate, formatPeriod, formatXOF } from "@/lib/format";
import type { InvoiceRow } from "@/types/database";
import { ShareActions } from "./share-actions";

const ORDER = { en_retard: 0, partiel: 1, a_payer: 2, paye: 3, annule: 4 } as const;

export function InvoiceList({ rows, period, appUrl, landlordName, canRecordCash }: {
  rows: InvoiceRow[]; period: string; appUrl: string; landlordName: string; canRecordCash: boolean;
}) {
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.due_date.localeCompare(b.due_date));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Avis d&apos;échéance — {formatPeriod(period)}</CardTitle>
        <CardDescription>Retards des mois précédents inclus. Partagez l&apos;avis en un clic ; le lien de paiement est personnel.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        {sorted.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Aucun avis pour cette période.</p>
        ) : (
          <ul className="divide-y">
            {sorted.map((inv) => {
              const p = inv.leases?.properties;
              const t = inv.tenants;
              const payable = inv.status !== "paye" && inv.status !== "annule";
              return (
                <li key={inv.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_14rem_27rem] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{t?.full_name}</p>
                      <InvoiceStatusBadge status={inv.status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {p?.label} · {[p?.quartier, p?.commune].filter(Boolean).join(", ")}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">{inv.payment_reference}</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold">{formatXOF(inv.amount_due)}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.amount_paid > 0 && inv.status !== "paye" ? `${formatXOF(inv.amount_paid)} reçus · ` : ""}
                      {inv.status === "paye" ? "Soldé" : `Échéance ${formatDate(inv.due_date)}`}
                      {inv.period !== period ? ` · ${formatPeriod(inv.period)}` : ""}
                    </p>
                  </div>
                  {t && (
                    <ShareActions
                      invoiceId={inv.id}
                      phone={t.phone}
                      email={t.email}
                      payable={payable}
                      canRecordCash={canRecordCash}
                      notice={{
                        tenantName: t.full_name,
                        landlordName,
                        propertyLabel: p?.label ?? "",
                        period: inv.period,
                        amountDue: inv.amount_due,
                        amountPaid: inv.amount_paid,
                        dueDate: inv.due_date,
                        reference: inv.payment_reference,
                        payUrl: `${appUrl}/pay/${inv.id}`,
                        overdue: inv.status === "en_retard",
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
