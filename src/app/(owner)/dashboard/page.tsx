import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Send, Settings, ShieldCheck, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { DashboardNav } from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import { requireOrgMember } from "@/lib/auth/session";
import { currentPeriod, formatPeriod } from "@/lib/format";
import type { DashboardKpis } from "@/types/database";
import { KpiGrid } from "./_components/kpi-grid";
import { InvoiceList } from "./_components/invoice-list";
import { PendingPayments, type PendingPaymentView } from "./_components/pending-payments";
import { PendingAccountsBanner } from "./_components/pending-accounts-banner";
import { DocumentsToSend, type DocumentItem } from "./_components/documents-to-send";
import { toAccountView } from "./parametres/paiements/types";
import { RealtimeRefresh } from "./_components/realtime-refresh";
import { OrgSwitcher } from "./_components/org-switcher";

export const metadata: Metadata = { title: "Tableau de bord" };

const EMPTY_KPIS: DashboardKpis = {
  collected: 0,
  expected: 0,
  pending: 0,
  overdue_count: 0,
  overdue_amount: 0,
  properties_total: 0,
  properties_occupied: 0,
  transfers_pending: 0,
};

function shiftMonth(period: string, delta: number) {
  const d = new Date(`${period}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership, memberships } = await requireOrgMember();
  const orgId = membership.org_id;
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mois ?? "") ? `${sp.mois}-01` : currentPeriod();
  const canValidate = membership.role === "owner" || membership.role === "accountant";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Lectures avec le JWT de l'utilisateur : la RLS garantit le cloisonnement.
  const [kpis, invoices, pending, carence, docs] = await Promise.all([
    supabase.rpc("dashboard_kpis", { p_org: orgId, p_month: period }).single(),
    supabase
      .from("invoices")
      .select(
        "id, period, amount_due, amount_paid, due_date, status, payment_reference, tenants(full_name, phone, email), leases(properties(code, label, commune, quartier, type)), receipts(id, status)",
      )
      .eq("org_id", orgId)
      .or(`period.eq.${period},status.eq.en_retard`)
      .order("due_date"),
    canValidate
      ? supabase
          .from("payments")
          .select(
            "id, method, provider, operator, amount, bank_reference, operator_txn_ref, payer_msisdn_hint, proof_path, declared_by, created_at, invoices(payment_reference, period, tenants(full_name))",
          )
          .eq("org_id", orgId)
          .eq("status", "en_attente_validation")
          .order("created_at")
      : Promise.resolve({ data: [] }),
    // Comptes de réception en carence (RLS : owner/accountant seulement).
    canValidate
      ? supabase
          .from("payout_accounts")
          .select(
            "id, kind, operator, bank_name, iban, msisdn, pispi_alias, payment_link_url, account_holder, display_name_expected, activates_at, revoked_at, created_by",
          )
          .eq("org_id", orgId)
          .is("revoked_at", null)
          .gt("activates_at", new Date().toISOString())
      : Promise.resolve({ data: [] }),
    // D.2 : documents du mois (avis, quittances) et suivi des envois.
    supabase
      .from("invoices")
      .select(
        "id, period, status, tenants(full_name), receipts(id, receipt_number, status), document_deliveries(doc_type, channel, sent_at)",
      )
      .eq("org_id", orgId)
      .eq("period", period)
      .neq("status", "annule")
      .order("due_date"),
  ]);

  // Vue minimale pour le composant client : aucun chemin de fichier, aucun numéro complet.
  const rawPending = pending.data ?? [];
  const memberIds = [...new Set(rawPending.filter((p) => p.method === "especes" && p.declared_by).map((p) => p.declared_by!))];
  const { data: members } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] as { id: string; full_name: string }[] };
  const now = Date.now();
  const pendingRows: PendingPaymentView[] = rawPending.map((p) => ({
    id: p.id,
    kind: p.method === "virement" ? "virement" : p.method === "especes" ? "especes" : "direct",
    operator: p.operator,
    amount: p.amount,
    createdAt: p.created_at,
    overdue: now - new Date(p.created_at).getTime() > 48 * 3600_000,
    hasProof: p.proof_path !== null,
    bankReference: p.bank_reference,
    operatorTxnRef: p.operator_txn_ref,
    payerHint: p.payer_msisdn_hint,
    declaredByMember: p.method === "especes" ? (members?.find((m) => m.id === p.declared_by)?.full_name ?? "Membre de l'agence") : null,
    tenantName: p.invoices?.tenants?.full_name ?? "Locataire",
    invoiceReference: p.invoices?.payment_reference ?? "",
    period: p.invoices?.period ?? "",
  }));

  const carenceRaw = carence.data ?? [];
  const creatorIds = [...new Set(carenceRaw.map((a) => a.created_by))];
  const { data: creators } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const carenceViews = carenceRaw.map((a) => toAccountView(a, new Map((creators ?? []).map((c) => [c.id, c.full_name]))));

  const docItems: DocumentItem[] = (docs.data ?? []).flatMap((d) => {
    const tenantName = d.tenants?.full_name ?? "Locataire";
    const sentOf = (t: "avis" | "quittance") =>
      (d.document_deliveries ?? []).filter((x) => x.doc_type === t).map((x) => ({ channel: x.channel, sentAt: x.sent_at }));
    const receipt = Array.isArray(d.receipts) ? d.receipts[0] : d.receipts;
    const list: DocumentItem[] = [
      { invoiceId: d.id, docType: "avis", tenantName, label: `Avis d'échéance de ${formatPeriod(d.period)}`, sent: sentOf("avis") },
    ];
    if (receipt && receipt.status === "valide") {
      list.push({
        invoiceId: d.id,
        docType: "quittance",
        tenantName,
        label: `Quittance ${receipt.receipt_number}`,
        sent: sentOf("quittance"),
      });
    }
    return list;
  });

  const orgName = membership.organizations?.name ?? "Mon organisation";
  const roleLabel = { owner: "Propriétaire", manager: "Gestionnaire", accountant: "Comptable" }[membership.role];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <div className="flex items-center gap-3 text-sm">
          <RealtimeRefresh orgId={orgId} />
          {canValidate && (
            <Link href="/dashboard/parametres/envois" className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
              <Send className="size-4" aria-hidden />
              <span className="hidden sm:inline">Envois</span>
            </Link>
          )}
          {membership.role === "owner" && (
            <Link href="/dashboard/parametres/paiements" className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
              <Settings className="size-4" aria-hidden />
              <span className="hidden sm:inline">Réception des fonds</span>
            </Link>
          )}
          {membership.role === "owner" && (
            <Link href="/dashboard/parametres/membres" className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
              <Users className="size-4" aria-hidden />
              <span className="hidden sm:inline">Équipe</span>
            </Link>
          )}
          {memberships.length > 1 ? (
            <OrgSwitcher
              current={orgId}
              orgs={memberships.map((m) => ({ id: m.org_id, label: m.organizations?.name ?? "Organisation" }))}
            />
          ) : (
            <span className="hidden text-muted-foreground sm:inline">
              {orgName} · {roleLabel}
            </span>
          )}
        </div>
      </header>
      <DashboardNav current="/dashboard" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">
            Situation de {formatPeriod(period)} · {orgName}
          </p>
        </div>
        <nav aria-label="Changer de mois" className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon">
            <Link href={`/dashboard?mois=${shiftMonth(period, -1)}`} aria-label="Mois précédent">
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-28 text-center text-sm font-medium capitalize">{formatPeriod(period)}</span>
          <Button asChild variant="outline" size="icon">
            <Link href={`/dashboard?mois=${shiftMonth(period, 1)}`} aria-label="Mois suivant">
              <ChevronRight />
            </Link>
          </Button>
        </nav>
      </div>

      <KpiGrid k={kpis.data ?? EMPTY_KPIS} />

      <PendingAccountsBanner accounts={carenceViews} canCancel={membership.role === "owner"} />

      {canValidate && <PendingPayments rows={pendingRows} role={membership.role} />}

      <DocumentsToSend items={docItems} periodLabel={formatPeriod(period)} />

      <InvoiceList
        rows={(invoices.data ?? []).map((i) => ({
          ...i,
          receipts: i.receipts ? (Array.isArray(i.receipts) ? i.receipts : [i.receipts]) : null,
        }))}
        period={period}
        appUrl={appUrl}
        landlordName={orgName}
        canRecordCash={canValidate}
        role={membership.role}
      />

      <footer className="flex items-center gap-2 pb-6 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        Toutes les actions sensibles sont horodatées et tracées dans un journal d&apos;audit infalsifiable.
      </footer>
    </div>
  );
}
