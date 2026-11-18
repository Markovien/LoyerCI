import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { requireOrgMember } from "@/lib/auth/session";
import { currentPeriod, formatPeriod } from "@/lib/format";
import type { DashboardKpis, PendingTransferRow } from "@/types/database";
import { KpiGrid } from "./_components/kpi-grid";
import { InvoiceList } from "./_components/invoice-list";
import { PendingTransfers } from "./_components/pending-transfers";
import { RealtimeRefresh } from "./_components/realtime-refresh";

export const metadata: Metadata = { title: "Tableau de bord" };

const EMPTY_KPIS: DashboardKpis = {
  collected: 0, expected: 0, pending: 0, overdue_count: 0, overdue_amount: 0,
  properties_total: 0, properties_occupied: 0, transfers_pending: 0,
};

function shiftMonth(period: string, delta: number) {
  const d = new Date(`${period}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ org?: string; mois?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireOrgMember(sp.org);
  const orgId = membership.org_id;
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mois ?? "") ? `${sp.mois}-01` : currentPeriod();
  const canValidate = membership.role === "owner" || membership.role === "accountant";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Lectures avec le JWT de l'utilisateur : la RLS garantit le cloisonnement.
  const [kpis, invoices, transfers] = await Promise.all([
    supabase.rpc("dashboard_kpis", { p_org: orgId, p_month: period }).single(),
    supabase
      .from("invoices")
      .select("id, period, amount_due, amount_paid, due_date, status, payment_reference, tenants(full_name, phone, email), leases(properties(code, label, commune, quartier, type))")
      .eq("org_id", orgId)
      .or(`period.eq.${period},status.eq.en_retard`)
      .order("due_date"),
    canValidate
      ? supabase
          .from("payments")
          .select("id, amount, bank_reference, created_at, invoices(payment_reference, period, amount_due, amount_paid, tenants(full_name))")
          .eq("org_id", orgId)
          .eq("status", "en_attente_validation")
          .order("created_at")
      : Promise.resolve({ data: [] as PendingTransferRow[] }),
  ]);

  const orgName = membership.organizations?.name ?? "Mon organisation";
  const roleLabel = { owner: "Propriétaire", manager: "Gestionnaire", accountant: "Comptable" }[membership.role];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <div className="flex items-center gap-3 text-sm">
          <RealtimeRefresh orgId={orgId} />
          <span className="hidden text-muted-foreground sm:inline">{orgName} · {roleLabel}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">Situation de {formatPeriod(period)} · {orgName}</p>
        </div>
        <nav aria-label="Changer de mois" className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon"><Link href={`/dashboard?mois=${shiftMonth(period, -1)}`} aria-label="Mois précédent"><ChevronLeft /></Link></Button>
          <span className="min-w-28 text-center text-sm font-medium capitalize">{formatPeriod(period)}</span>
          <Button asChild variant="outline" size="icon"><Link href={`/dashboard?mois=${shiftMonth(period, 1)}`} aria-label="Mois suivant"><ChevronRight /></Link></Button>
        </nav>
      </div>

      <KpiGrid k={kpis.data ?? EMPTY_KPIS} />

      {canValidate && <PendingTransfers rows={transfers.data ?? []} />}

      <InvoiceList
        rows={invoices.data ?? []}
        period={period}
        appUrl={appUrl}
        landlordName={orgName}
        canRecordCash={canValidate}
      />

      <footer className="flex items-center gap-2 pb-6 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        Toutes les actions sensibles sont horodatées et tracées dans un journal d&apos;audit infalsifiable.
      </footer>
    </div>
  );
}
