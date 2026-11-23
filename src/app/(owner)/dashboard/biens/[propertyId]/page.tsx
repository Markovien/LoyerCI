import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { DashboardNav } from "@/components/dashboard-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { formatDate, formatXOF } from "@/lib/format";
import { uuid } from "@/lib/validation/schemas";
import { PropertyForm } from "../property-form";

export const metadata: Metadata = { title: "Fiche du bien", robots: { index: false } };

export default async function PropertyPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  if (!uuid.safeParse(propertyId).success) notFound();
  const { supabase, membership } = await requireOrgMember();
  const { data: p } = await supabase
    .from("properties")
    .select(
      "id, org_id, code, label, type, city, commune, quartier, address_details, leases(id, status, rent_amount, charges_amount, start_date, ended_at, tenants(full_name))",
    )
    .eq("id", propertyId)
    .eq("org_id", membership.org_id)
    .maybeSingle();
  if (!p) notFound();
  const canEdit = membership.role === "owner" || membership.role === "manager";
  const leases = [...(p.leases ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <Link href="/dashboard/biens" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Biens
        </Link>
      </header>
      <DashboardNav current="/dashboard/biens" />
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="font-mono text-base text-muted-foreground">{p.code}</span> {p.label}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Baux</CardTitle>
        </CardHeader>
        <CardContent>
          {leases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun bail pour ce bien.</p>
          ) : (
            <ul className="divide-y text-sm">
              {leases.map((l) => (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {l.tenants?.full_name} · depuis le {formatDate(l.start_date)}
                    {l.ended_at ? ` · terminé le ${formatDate(l.ended_at)}` : ""}
                  </span>
                  <span className="font-medium">
                    {formatXOF(l.rent_amount + l.charges_amount)}/mois · {l.status === "actif" ? "en cours" : l.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{canEdit ? "Modifier le bien" : "Informations"}</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <PropertyForm
              orgId={p.org_id}
              propertyId={p.id}
              initial={{
                code: p.code,
                label: p.label,
                type: p.type,
                city: p.city,
                commune: p.commune,
                quartier: p.quartier ?? "",
                address: p.address_details ?? "",
              }}
            />
          ) : (
            <p className="text-sm">
              {[p.quartier, p.commune, p.city].filter(Boolean).join(", ")}
              {p.address_details ? ` · ${p.address_details}` : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
