import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { currentPeriod, formatPeriod } from "@/lib/format";

export const metadata: Metadata = { title: "Envois", robots: { index: false } };

const KIND: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  otp: "Codes de vérification",
  partage: "Partage depuis le téléphone",
  telechargement: "Téléchargement",
};

/** D.5 : consommation des envois de l'organisation (propriétaire, comptable). */
export default async function UsagePage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireOrgMember();
  if (membership.role !== "owner" && membership.role !== "accountant") redirect("/dashboard");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mois ?? "") ? `${sp.mois}-01` : currentPeriod();

  const [{ data: rows }, { data: quota }] = await Promise.all([
    supabase.rpc("message_usage_summary", { p_org: membership.org_id, p_month: month }),
    supabase.from("org_message_quotas").select("sms_daily, otp_daily, email_daily").eq("org_id", membership.org_id).maybeSingle(),
  ]);
  const lines = rows ?? [];
  const billable = lines.filter((l) => l.billable).reduce((n, l) => n + Number(l.total), 0);
  const manual = lines.filter((l) => !l.billable).reduce((n, l) => n + Number(l.total), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Tableau de bord
        </Link>
      </header>
      <h1 className="text-2xl font-semibold tracking-tight">Envois — {formatPeriod(month)}</h1>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Envois automatiques facturés</p>
          <p className="text-2xl font-semibold" data-testid="billable-total">
            {billable}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Envois depuis vos comptes (gratuits)</p>
          <p className="text-2xl font-semibold" data-testid="manual-total">
            {manual}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Détail</CardTitle>
          <CardDescription>
            Les envois automatiques (SMS, codes, e-mails transactionnels) sont inclus dans votre abonnement. Ceux que vous faites depuis
            votre téléphone ou votre messagerie ne vous sont jamais facturés.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun envoi ce mois-ci.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-normal">Canal</th>
                  <th className="py-1 font-normal">Type</th>
                  <th className="py-1 text-right font-normal">Nombre</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={`${l.kind}-${l.source}`} className="border-t">
                    <td className="py-2">{KIND[l.kind] ?? l.kind}</td>
                    <td className="py-2 text-muted-foreground">{l.billable ? "Automatique, facturé" : "Depuis vos comptes"}</td>
                    <td className="py-2 text-right font-medium">{l.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Button asChild variant="outline" className="justify-self-start">
            <a href={`/api/usage/csv?mois=${month.slice(0, 7)}`}>
              <Download />
              Exporter le mois (CSV)
            </a>
          </Button>
          {quota && (
            <p className="text-xs text-muted-foreground">
              Plafonds quotidiens anti-abus : {quota.sms_daily} SMS, {quota.otp_daily} codes, {quota.email_daily} e-mails automatiques.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
