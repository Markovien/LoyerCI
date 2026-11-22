import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { isProviderConfigured } from "@/lib/payments/registry";
import { AccountsList } from "./accounts-list";
import { AddAccountForm } from "./add-account-form";
import { SettingsForm } from "./settings-form";
import { toAccountView } from "./types";

export const metadata: Metadata = { title: "Réception des fonds", robots: { index: false } };

/** Paramètres de réception des fonds : propriétaire uniquement (invariant n° 7). */
export default async function PaymentSettingsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireOrgMember(sp.org);
  if (membership.role !== "owner") redirect("/dashboard");
  const orgId = membership.org_id;

  // Lectures RLS (payout_accounts : owner/accountant de l'organisation uniquement).
  const [{ data: accounts }, { data: settings }] = await Promise.all([
    supabase
      .from("payout_accounts")
      .select(
        "id, kind, operator, bank_name, iban, msisdn, pispi_alias, payment_link_url, account_holder, display_name_expected, activates_at, revoked_at, created_by",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("org_payment_settings")
      .select("direct_enabled, cinetpay_enabled, transfer_enabled, fees_notice, cash_validation_threshold")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);
  const creatorIds = [...new Set((accounts ?? []).map((a) => a.created_by))];
  const { data: profiles } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const views = (accounts ?? []).map((a) => toAccountView(a, names));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Tableau de bord
        </Link>
      </header>
      <h1 className="text-2xl font-semibold tracking-tight">Réception des fonds</h1>

      <Card>
        <CardHeader>
          <CardTitle>Comptes de réception</CardTitle>
          <CardDescription>
            Les loyers arrivent directement sur ces comptes : LoyerCI ne détient jamais les fonds. Tout nouveau compte n&apos;est actif
            qu&apos;après 48 h (sauf le tout premier) ; chaque ajout exige un code envoyé par e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AccountsList accounts={views} canCancel />
          <AddAccountForm orgId={orgId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modes de paiement proposés aux locataires</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            orgId={orgId}
            cinetpayAvailable={isProviderConfigured("cinetpay")}
            initial={{
              direct: settings?.direct_enabled ?? true,
              cinetpay: settings?.cinetpay_enabled ?? false,
              transfer: settings?.transfer_enabled ?? true,
              feesNotice: settings?.fees_notice ?? "",
              cashThreshold: settings?.cash_validation_threshold ?? 100000,
            }}
          />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 pb-6 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Toute modification est tracée dans le journal d&apos;audit. En cas d&apos;ajout que vous n&apos;avez pas fait, annulez-le
        immédiatement et changez l&apos;accès à votre messagerie.
      </p>
    </div>
  );
}
