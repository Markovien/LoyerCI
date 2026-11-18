import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatPeriod, formatXOF } from "@/lib/format";
import type { InvoiceStatus } from "@/types/database";

export const metadata: Metadata = { title: "Mes avis d'échéance", robots: { index: false } };

export default async function TenantHome() {
  const { supabase } = await requireUser("/pay");
  const { data } = await supabase
    .from("invoices")
    .select("id, period, amount_due, amount_paid, due_date, status, leases(properties(label, commune))")
    .order("period", { ascending: false })
    .limit(24)
    .overrideTypes<{ id: string; period: string; amount_due: number; amount_paid: number; due_date: string; status: InvoiceStatus; leases: { properties: { label: string; commune: string } | null } | null }[], { merge: false }>();

  const rows = data ?? [];
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">
      <Brand href="/pay" />
      <h1 className="text-xl font-semibold">Mes avis d&apos;échéance</h1>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun avis pour le moment.</p>}
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/pay/${r.id}`}>
              <Card className="flex items-center justify-between gap-3 p-4 transition hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="font-medium capitalize">{formatPeriod(r.period)}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.leases?.properties?.label} · {r.leases?.properties?.commune} · éch. {formatDate(r.due_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatXOF(r.amount_due - (r.status === "paye" ? 0 : r.amount_paid))}</p>
                    <InvoiceStatusBadge status={r.status} />
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
