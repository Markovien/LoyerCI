"use client";
import { useActionState, useState } from "react";
import { ArrowLeft, ExternalLink, Phone, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatXOF } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MobileOperator } from "@/lib/validation/schemas";
import { submitDirectPayment, type ProofState } from "./actions";
import { CopyField } from "./copy-field";
import { groupNumber, localNumber, OPERATORS, operatorName } from "./operators";

export interface DirectAccount {
  kind: "mobile_money" | "pispi_alias" | "payment_link";
  operator: MobileOperator | null;
  msisdn: string | null;
  pispiAlias: string | null;
  linkUrl: string | null;
  displayName: string;
}

export interface DirectInfo {
  accounts: DirectAccount[];
  reference: string;
  feesNotice: string | null;
}

/** Texte par défaut : honnête, jamais « sans frais » (ETUDE-PAIEMENT-DIRECT.md §2). */
const DEFAULT_FEES =
  "Les frais de transfert éventuels sont facturés par votre opérateur selon sa grille en vigueur et restent à votre charge.";

type Target = { mode: "reseau" | "pispi"; copy: string; display: string; displayName: string };

function resolveTarget(accounts: DirectAccount[], op: MobileOperator): Target | null {
  const same = accounts.find((a) => a.kind === "mobile_money" && a.operator === op && a.msisdn);
  if (same?.msisdn) {
    const local = localNumber(same.msisdn);
    return { mode: "reseau", copy: local, display: groupNumber(local), displayName: same.displayName };
  }
  // Pas de compte du bailleur sur ce réseau : transfert interopérable PI-SPI vers son alias.
  const alias = accounts.find((a) => a.kind === "pispi_alias" && a.pispiAlias);
  if (alias?.pispiAlias) {
    const isPhone = alias.pispiAlias.startsWith("+225");
    const copy = isPhone ? localNumber(alias.pispiAlias) : alias.pispiAlias;
    return { mode: "pispi", copy, display: isPhone ? groupNumber(copy) : copy, displayName: alias.displayName };
  }
  return null;
}

/** tel: avec « # » encodé (sinon tronqué par de nombreux navigateurs). */
const ussdHref = (code: string) => `tel:${code.replace(/#/g, "%23")}`;

export function DirectPayment({
  invoiceId,
  remaining,
  info,
  ussd,
  refExamples,
}: {
  invoiceId: string;
  remaining: number;
  info: DirectInfo;
  ussd: Partial<Record<MobileOperator, string>>;
  refExamples: Partial<Record<MobileOperator, string>>;
}) {
  const [operator, setOperator] = useState<MobileOperator | null>(null);
  const [state, action, pending] = useActionState<ProofState, FormData>(submitDirectPayment, null);

  if (!operator) {
    return (
      <fieldset className="grid grid-cols-2 gap-2" role="tabpanel">
        <legend className="mb-2 text-sm font-medium">1. Avec quelle application payez-vous ?</legend>
        {OPERATORS.map((o) => {
          const available = resolveTarget(info.accounts, o.id) !== null;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOperator(o.id)}
              disabled={!available}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition enabled:active:scale-[0.99] disabled:opacity-45"
            >
              <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-md text-xs font-bold", o.swatch)}>
                {o.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{o.name}</span>
                <span className="block text-xs text-muted-foreground">{available ? o.hint : "Indisponible"}</span>
              </span>
            </button>
          );
        })}
      </fieldset>
    );
  }

  const target = resolveTarget(info.accounts, operator)!;
  const link = info.accounts.find((a) => a.kind === "payment_link" && a.operator === operator && a.linkUrl?.startsWith("https://"));
  const code = ussd[operator];

  return (
    <div className="grid gap-4" role="tabpanel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">2. Envoyez depuis {operatorName(operator)}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOperator(null)}>
          <ArrowLeft />
          Changer
        </Button>
      </div>

      <div className="grid gap-2">
        {target.mode === "pispi" && (
          <p className="rounded-md bg-info/10 p-2 text-xs">
            Votre bailleur n&apos;a pas de compte {operatorName(operator)} : faites un <strong>transfert interopérable (PI-SPI)</strong>{" "}
            vers l&apos;adresse ci-dessous depuis votre application.
          </p>
        )}
        <CopyField
          label={target.mode === "pispi" ? "Adresse de paiement PI-SPI" : "Numéro du bénéficiaire"}
          value={target.copy}
          display={target.display}
        />
        <div className="rounded-lg border-2 border-primary bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <ShieldAlert className="size-4" aria-hidden />
            Vérifiez que votre application affiche ce nom avant de valider
          </p>
          <p className="mt-1 text-xl font-bold tracking-tight">{target.displayName}</p>
          <p className="mt-1 text-xs text-muted-foreground">Un autre nom ? N&apos;envoyez rien et prévenez votre bailleur.</p>
        </div>
        <CopyField label="Motif / référence (à indiquer dans le transfert)" value={info.reference} display={info.reference} emphasize />
        <CopyField label="Montant" value={String(remaining)} display={formatXOF(remaining)} />
        <p className="text-xs text-muted-foreground">{info.feesNotice ?? DEFAULT_FEES}</p>
      </div>

      {(link || code) && (
        <div className="flex flex-wrap gap-2">
          {link?.linkUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={link.linkUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Ouvrir le lien de paiement {operatorName(operator)}
              </a>
            </Button>
          )}
          {code && (
            <Button asChild variant="outline" size="sm">
              <a href={ussdHref(code)}>
                <Phone />
                Ouvrir le menu {operatorName(operator)}
              </a>
            </Button>
          )}
        </div>
      )}

      <form action={action} className="grid gap-3 rounded-lg border p-3">
        <p className="text-sm font-medium">3. J&apos;ai payé : je déclare mon paiement</p>
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="operator" value={operator} />
        <div className="grid gap-1.5">
          <Label htmlFor="txnRef">N° de transaction (facultatif)</Label>
          <Input
            id="txnRef"
            name="txnRef"
            minLength={4}
            maxLength={60}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            pattern="[A-Za-z0-9._\-]+"
            placeholder={refExamples[operator] ? `ex. ${refExamples[operator]}` : "Si vous l'avez, depuis le SMS reçu"}
            className="font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="amount">Montant (FCFA)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              inputMode="numeric"
              min={100}
              max={remaining}
              defaultValue={remaining}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payerPhone">Votre numéro</Label>
            <Input
              id="payerPhone"
              name="payerPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="07 …"
              maxLength={20}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="directProof">Capture du reçu (facultatif, recommandé)</Label>
          <Input id="directProof" name="proof" type="file" accept="image/jpeg,image/png,application/pdf" />
        </div>
        <Button type="submit" disabled={pending}>
          <Send />
          {pending ? "Envoi sécurisé…" : "Déclarer mon paiement"}
        </Button>
        {state && (
          <p role="status" className={cn("rounded-md p-3 text-sm", state.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
