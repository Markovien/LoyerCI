import { AlertTriangle, BadgeCheck, Ban, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatLongDate, formatPeriod, formatXOF } from "@/lib/format";
import type { VerifyReceiptResult } from "@/types/database";

export function Verdict({ r }: { r: VerifyReceiptResult }) {
  if (r.verdict === "authentique" || r.verdict === "annulee") {
    const ok = r.verdict === "authentique";
    return (
      <Card className={ok ? "border-success/40" : "border-warning"}>
        <CardContent className="grid gap-5 p-5">
          <div className={ok ? "flex items-center gap-3 rounded-lg bg-success p-4 text-white" : "flex items-center gap-3 rounded-lg bg-warning p-4 text-[oklch(0.25_0.05_70)]"}>
            {ok ? <BadgeCheck className="size-8 shrink-0" aria-hidden /> : <Ban className="size-8 shrink-0" aria-hidden />}
            <div>
              <p className="text-lg font-semibold">{ok ? "Quittance Authentique" : "Quittance annulée"}</p>
              <p className="text-sm opacity-90">
                {ok ? "Émise et signée par LoyerCI, non modifiée." : `Annulée le ${r.revoked_at ? formatLongDate(r.revoked_at) : "—"} : ne pas l'accepter.`}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">N° de quittance</dt><dd className="font-mono font-medium">{r.receipt_number}</dd>
            <dt className="text-muted-foreground">Locataire</dt><dd className="font-medium">{r.tenant_masked}</dd>
            <dt className="text-muted-foreground">Bailleur</dt><dd className="font-medium">{r.landlord_name}</dd>
            <dt className="text-muted-foreground">Localisation</dt><dd>{r.property_location}</dd>
            <dt className="text-muted-foreground">Période</dt><dd className="capitalize">{r.period ? formatPeriod(r.period) : "—"}</dd>
            <dt className="text-muted-foreground">Montant payé</dt><dd className="font-semibold">{r.amount != null ? formatXOF(r.amount) : "—"}</dd>
            <dt className="text-muted-foreground">Date de paiement</dt><dd>{r.paid_at ? formatLongDate(r.paid_at) : "—"}</dd>
            <dt className="text-muted-foreground">Empreinte</dt><dd className="font-mono text-xs">{r.fingerprint}</dd>
          </dl>
        </CardContent>
      </Card>
    );
  }

  const tampered = r.verdict === "alteree";
  return (
    <Card className="border-danger/50">
      <CardContent className="grid gap-3 p-5">
        <div className="flex items-center gap-3 rounded-lg bg-danger p-4 text-white">
          {tampered ? <ShieldAlert className="size-8 shrink-0" aria-hidden /> : <AlertTriangle className="size-8 shrink-0" aria-hidden />}
          <div>
            <p className="text-lg font-semibold">Quittance non reconnue</p>
            <p className="text-sm opacity-90">Ce document n&apos;a pas pu être authentifié.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Vérifiez le code saisi. Si vous avez scanné le QR code d&apos;un document qu&apos;on vous présente, considérez-le comme suspect et demandez une nouvelle quittance au bailleur.
        </p>
      </CardContent>
    </Card>
  );
}
