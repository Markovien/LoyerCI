import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { DashboardNav } from "@/components/dashboard-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { formatLongDate } from "@/lib/format";
import { uuid } from "@/lib/validation/schemas";
import { TenantForm } from "../tenant-form";
import { AccountPanel } from "./account-panel";

export const metadata: Metadata = { title: "Fiche locataire", robots: { index: false } };

export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!uuid.safeParse(tenantId).success) notFound();
  const { supabase, membership } = await requireOrgMember();
  const [{ data: t }, { data: invitations }] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, org_id, full_name, phone, email, user_id")
      .eq("id", tenantId)
      .eq("org_id", membership.org_id)
      .maybeSingle(),
    supabase
      .from("tenant_invitations")
      .select("created_at, expires_at, consumed_at, revoked_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (!t) notFound();
  const canEdit = membership.role === "owner" || membership.role === "manager";
  const last = invitations?.[0];
  const lastText = last
    ? `${formatLongDate(last.created_at)} (${last.consumed_at ? "utilisée" : last.revoked_at ? "remplacée" : new Date(last.expires_at) < new Date() ? "expirée" : "en attente"})`
    : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <Link href="/dashboard/locataires" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Locataires
        </Link>
      </header>
      <DashboardNav current="/dashboard/locataires" />
      <h1 className="text-2xl font-semibold tracking-tight">{t.full_name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Espace locataire</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <AccountPanel tenantId={t.id} linked={!!t.user_id} lastInvitation={lastText} />
          ) : (
            <p className="text-sm">{t.user_id ? "Compte rattaché." : "Pas de compte."}</p>
          )}
        </CardContent>
      </Card>
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Modifier la fiche</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantForm
              orgId={t.org_id}
              tenantId={t.id}
              initial={{ fullName: t.full_name, phone: t.phone.replace(/^225/, ""), email: t.email ?? "" }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
