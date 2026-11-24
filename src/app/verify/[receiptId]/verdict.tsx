import { Archive, Ban, CircleCheckBig, CircleX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatLongDate, formatPeriod, formatXOF } from "@/lib/format";

/** Résultat de vérification d'un document (quittance ou avis d'échéance), données déjà masquées en base. */
export interface DocumentVerdict {
  verdict: "authentique" | "annulee" | "invalide" | "alteree" | "plus_conserve";
  docType: "quittance" | "avis" | null;
  number: string | null;
  landlordName: string | null;
  tenantMasked: string | null;
  location: string | null;
  period: string | null;
  amount: number | null;
  /** Quittance : date de paiement. Avis : date d'échéance. Document plus conservé : date d'émission. */
  date: string | null;
  fingerprint: string | null;
  revokedAt: string | null;
}

export const INVALID: DocumentVerdict = {
  verdict: "invalide",
  docType: null,
  number: null,
  landlordName: null,
  tenantMasked: null,
  location: null,
  period: null,
  amount: null,
  date: null,
  fingerprint: null,
  revokedAt: null,
};

/**
 * Verdict compréhensible SANS savoir lire : très grand pictogramme et couleur
 * (✓ vert = authentique, ✗ rouge = refusé, ⊘ orange = annulé).
 */
export function Verdict({ r }: { r: DocumentVerdict }) {
  const label = r.docType === "avis" ? "Avis d'échéance" : "Quittance";
  if (r.verdict === "plus_conserve") {
    // Ni « authentique » ni « faux » : LoyerCI ne conserve les documents que 2 ans (P3.4).
    return (
      <Card className="border-muted-foreground/30">
        <CardContent className="grid gap-4 p-5">
          <div data-verdict="plus_conserve" className="grid justify-items-center gap-2 rounded-xl bg-muted p-6 text-foreground">
            <Archive className="size-24" strokeWidth={2.5} aria-hidden />
            <p className="text-center text-2xl font-bold">Document plus conservé</p>
            <p className="text-center text-sm text-muted-foreground">
              {label} n° {r.number}
              {r.date ? `, émis${r.docType === "avis" ? "" : "e"} le ${formatLongDate(r.date)}` : ""}.
            </p>
          </div>
          <p className="text-sm">
            LoyerCI ne conserve les documents que 2 ans après leur émission. Ce document a bien existé, mais son contenu ne peut plus être
            vérifié en ligne. Pour une preuve récente, demandez une attestation au bailleur.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (r.verdict === "authentique" || r.verdict === "annulee") {
    const ok = r.verdict === "authentique";
    return (
      <Card className={ok ? "border-success/40" : "border-warning"}>
        <CardContent className="grid gap-5 p-5">
          <div
            data-verdict={r.verdict}
            className={
              ok
                ? "grid justify-items-center gap-2 rounded-xl bg-success p-6 text-white"
                : "grid justify-items-center gap-2 rounded-xl bg-warning p-6 text-[oklch(0.25_0.05_70)]"
            }
          >
            {ok ? (
              <CircleCheckBig className="size-24" strokeWidth={2.5} aria-hidden />
            ) : (
              <Ban className="size-24" strokeWidth={2.5} aria-hidden />
            )}
            <p className="text-center text-2xl font-bold">
              {ok ? `${label} authentique` : `${label} annulé${r.docType === "avis" ? "" : "e"}`}
            </p>
            <p className="text-center text-sm opacity-90">
              {ok
                ? "Émis et signé par LoyerCI, non modifié."
                : r.revokedAt
                  ? `Annulée le ${formatLongDate(r.revokedAt)} : ne pas l'accepter.`
                  : "Ce document n'est plus valable : ne pas l'accepter."}
            </p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">{r.docType === "avis" ? "Référence" : "N° de quittance"}</dt>
            <dd className="font-mono font-medium">{r.number}</dd>
            <dt className="text-muted-foreground">Locataire</dt>
            <dd className="font-medium">{r.tenantMasked}</dd>
            <dt className="text-muted-foreground">Bailleur</dt>
            <dd className="font-medium">{r.landlordName}</dd>
            <dt className="text-muted-foreground">Localisation</dt>
            <dd>{r.location}</dd>
            <dt className="text-muted-foreground">Période</dt>
            <dd className="capitalize">{r.period ? formatPeriod(r.period) : "—"}</dd>
            <dt className="text-muted-foreground">{r.docType === "avis" ? "Montant à payer" : "Montant payé"}</dt>
            <dd className="font-semibold">{r.amount != null ? formatXOF(r.amount) : "—"}</dd>
            <dt className="text-muted-foreground">{r.docType === "avis" ? "Échéance" : "Date de paiement"}</dt>
            <dd>{r.date ? formatLongDate(r.date) : "—"}</dd>
            <dt className="text-muted-foreground">Empreinte</dt>
            <dd className="font-mono text-xs">{r.fingerprint}</dd>
          </dl>
          {r.docType === "avis" && (
            <p className="rounded-md bg-muted p-3 text-xs">
              Un avis authentique ne contient jamais de numéro de paiement. Si l&apos;on vous demande de payer sur un numéro reçu par
              message, c&apos;est une arnaque.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-danger/50">
      <CardContent className="grid gap-3 p-5">
        <div data-verdict={r.verdict} className="grid justify-items-center gap-2 rounded-xl bg-danger p-6 text-white">
          <CircleX className="size-24" strokeWidth={2.5} aria-hidden />
          <p className="text-center text-2xl font-bold">Document non reconnu</p>
          <p className="text-center text-sm opacity-90">Ce document n&apos;a pas pu être authentifié.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Vérifiez le code saisi. Si vous avez scanné le QR code d&apos;un document qu&apos;on vous présente, considérez-le comme suspect et
          demandez un nouveau document au bailleur.
        </p>
      </CardContent>
    </Card>
  );
}
