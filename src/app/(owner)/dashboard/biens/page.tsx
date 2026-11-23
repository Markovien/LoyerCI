import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Brand } from "@/components/brand";
import { DashboardNav } from "@/components/dashboard-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { formatXOF } from "@/lib/format";
import { PROPERTY_TYPES } from "@/lib/geo";
import { PropertyForm } from "./property-form";

export const metadata: Metadata = { title: "Biens", robots: { index: false } };

/** P2.1 — Parc immobilier de l'organisation (lecture RLS ; écriture owner/manager). */
export default async function PropertiesPage() {
  const { supabase, membership } = await requireOrgMember();
  const canEdit = membership.role === "owner" || membership.role === "manager";
  const { data } = await supabase
    .from("properties")
    .select("id, code, label, type, city, commune, quartier, leases(status, rent_amount, charges_amount, tenants(full_name))")
    .eq("org_id", membership.org_id)
    .order("code");
  const rows = data ?? [];
  const typeLabel = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.id, t.label]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
      </header>
      <DashboardNav current="/dashboard/biens" />
      <h1 className="text-2xl font-semibold tracking-tight">Biens ({rows.length})</h1>

      <ul className="grid gap-2">
        {rows.map((p) => {
          const lease = p.leases?.find((l) => l.status === "actif");
          return (
            <li key={p.id} className="min-w-0">
              <Link href={`/dashboard/biens/${p.id}`}>
                <Card data-testid="property" className="flex min-w-0 items-center justify-between gap-3 p-4 transition hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{p.code}</span> · {p.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {typeLabel[p.type]} · {[p.quartier, p.commune, p.city].filter(Boolean).join(", ")}
                    </p>
                    <p className="truncate text-xs">
                      {lease
                        ? `Loué à ${lease.tenants?.full_name ?? "—"} · ${formatXOF(lease.rent_amount + lease.charges_amount)}/mois`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {lease ? <Badge className="bg-success/15 text-success">Loué</Badge> : <Badge className="bg-warning/20">Vacant</Badge>}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-5" aria-hidden />
              Ajouter un bien
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PropertyForm orgId={membership.org_id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
