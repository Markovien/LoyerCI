import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Brand } from "@/components/brand";
import { DashboardNav } from "@/components/dashboard-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { formatPhoneCI } from "@/lib/format";
import { TenantForm } from "./tenant-form";

export const metadata: Metadata = { title: "Locataires", robots: { index: false } };

/** P2.2 — Locataires de l'organisation (lecture RLS ; écriture owner/manager). */
export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireOrgMember(sp.org);
  const canEdit = membership.role === "owner" || membership.role === "manager";
  const { data } = await supabase
    .from("tenants")
    .select("id, full_name, phone, email, user_id, leases(status, properties(label))")
    .eq("org_id", membership.org_id)
    .order("full_name");
  const rows = data ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
      </header>
      <DashboardNav current="/dashboard/locataires" />
      <h1 className="text-2xl font-semibold tracking-tight">Locataires ({rows.length})</h1>
      <ul className="grid gap-2">
        {rows.map((t) => {
          const lease = t.leases?.find((l) => l.status === "actif");
          return (
            <li key={t.id} className="min-w-0">
              <Link href={`/dashboard/locataires/${t.id}`}>
                <Card data-testid="tenant" className="flex min-w-0 items-center justify-between gap-3 p-4 transition hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatPhoneCI(t.phone)}
                      {t.email ? ` · ${t.email}` : ""}
                    </p>
                    <p className="truncate text-xs">{lease ? `Bail en cours : ${lease.properties?.label ?? ""}` : "Aucun bail en cours"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.user_id && <Badge className="bg-success/15 text-success">Compte</Badge>}
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
              Ajouter un locataire
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TenantForm orgId={membership.org_id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
