import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Brand } from "@/components/brand";
import { DashboardNav } from "@/components/dashboard-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { formatDate, formatXOF } from "@/lib/format";
import { LeaseActions } from "./lease-actions";
import { LeaseForm } from "./lease-form";

export const metadata: Metadata = { title: "Baux", robots: { index: false } };

/** P2.3 — Baux : création, avance, résiliation. */
export default async function LeasesPage() {
  const { supabase, membership } = await requireOrgMember();
  const role = membership.role;
  const canEdit = role === "owner" || role === "manager";
  const [{ data: leases }, { data: properties }, { data: tenants }] = await Promise.all([
    supabase
      .from("leases")
      .select(
        "id, status, usage, rent_amount, charges_amount, advance_months, advance_recorded_at, start_date, end_date, properties(code, label), tenants(full_name)",
      )
      .eq("org_id", membership.org_id)
      .order("start_date", { ascending: false }),
    supabase.from("properties").select("id, code, label, leases(status)").eq("org_id", membership.org_id).order("code"),
    supabase.from("tenants").select("id, full_name").eq("org_id", membership.org_id).order("full_name"),
  ]);
  // L'avance se saisit à la signature : bouton proposé pour un bail récent (moins de 3 mois) ou à venir,
  // pour ne pas créer après coup des quittances sur les premiers mois d'un bail ancien.
  const recentLimit = new Date(Date.now() - 92 * 86400_000).toISOString().slice(0, 10);
  const rows = [...(leases ?? [])].sort((a, b) => Number(b.status === "actif") - Number(a.status === "actif"));
  const vacant = (properties ?? [])
    .filter((p) => !p.leases?.some((l) => l.status === "actif"))
    .map((p) => ({ id: p.id, label: `${p.code} · ${p.label}` }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
      </header>
      <DashboardNav current="/dashboard/baux" />
      <h1 className="text-2xl font-semibold tracking-tight">Baux</h1>
      <ul className="grid gap-2">
        {rows.map((l) => (
          <li key={l.id} className="min-w-0">
            <Card data-testid="lease" className="grid min-w-0 gap-2 p-4 [&>*]:min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {l.tenants?.full_name} · <span className="text-muted-foreground">{l.properties?.label}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatXOF(l.rent_amount + l.charges_amount)}/mois · depuis le {formatDate(l.start_date)}
                    {l.end_date ? ` · fin le ${formatDate(l.end_date)}` : ""}
                    {l.usage === "professionnel" ? " · professionnel" : ""}
                  </p>
                </div>
                {l.status === "actif" ? (
                  <Badge className={l.end_date ? "bg-warning/20" : "bg-success/15 text-success"}>
                    {l.end_date ? "Fin planifiée" : "En cours"}
                  </Badge>
                ) : (
                  <Badge className="bg-muted">{l.status === "resilie" ? "Résilié" : "Terminé"}</Badge>
                )}
              </div>
              {l.status === "actif" && (
                <LeaseActions
                  leaseId={l.id}
                  advanceMonths={l.advance_months}
                  canAdvance={role === "owner" && l.advance_months > 0 && !l.advance_recorded_at && l.start_date >= recentLimit}
                  canTerminate={canEdit && !l.end_date}
                />
              )}
              {l.advance_recorded_at && <p className="text-xs text-success">Avance enregistrée le {formatDate(l.advance_recorded_at)}.</p>}
            </Card>
          </li>
        ))}
      </ul>
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-5" aria-hidden />
              Nouveau bail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeaseForm
              orgId={membership.org_id}
              properties={vacant}
              tenants={(tenants ?? []).map((t) => ({ id: t.id, label: t.full_name }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
