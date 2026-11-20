"use client";
import { useActionState, useState, useTransition } from "react";
import { Building, Lock, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatXOF, groupIban } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MobileOperator } from "@/lib/validation/schemas";
import { initiateMobileMoneyPayment, submitTransferProof, type ProofState } from "./actions";
import { CopyField } from "./copy-field";
import { DirectPayment, type DirectInfo } from "./direct-payment";
import { OPERATORS } from "./operators";

export interface TransferInfo {
  accountHolder: string;
  bankName: string;
  iban: string;
  reference: string;
}

export interface PanelProps {
  invoiceId: string;
  remaining: number;
  /** null : virement désactivé par le bailleur. undefined : activé mais aucun RIB effectif. */
  transfer: TransferInfo | null | undefined;
  /** null : paiement direct désactivé ou aucun compte de réception effectif. */
  direct: DirectInfo | null;
  /** Bouton CinetPay rendu UNIQUEMENT si le bailleur l'a activé et que le serveur est configuré. */
  cinetpay: boolean;
  ussd: Partial<Record<MobileOperator, string>>;
  refExamples: Partial<Record<MobileOperator, string>>;
}

export function PaymentPanel(props: PanelProps) {
  const { invoiceId, remaining, transfer, direct, cinetpay } = props;
  const tabs = [
    ...(direct || cinetpay ? [{ id: "mobile" as const, label: "Mobile Money", icon: Smartphone }] : []),
    ...(transfer !== null ? [{ id: "virement" as const, label: "Virement bancaire", icon: Building }] : []),
  ];
  const [tab, setTab] = useState<"mobile" | "virement">(tabs[0]?.id ?? "mobile");

  if (tabs.length === 0) {
    return (
      <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        Aucun mode de paiement en ligne n&apos;est encore configuré par votre bailleur.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Mode de paiement" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition",
                tab === id ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "mobile" ? (
        <div className="grid gap-4">
          {direct && (
            <DirectPayment invoiceId={invoiceId} remaining={remaining} info={direct} ussd={props.ussd} refExamples={props.refExamples} />
          )}
          {cinetpay &&
            (direct ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Ou payer en ligne via CinetPay (confirmation immédiate)</summary>
                <div className="mt-3">
                  <MobileMoney invoiceId={invoiceId} remaining={remaining} />
                </div>
              </details>
            ) : (
              <MobileMoney invoiceId={invoiceId} remaining={remaining} />
            ))}
        </div>
      ) : (
        <BankTransfer invoiceId={invoiceId} remaining={remaining} transfer={transfer ?? null} />
      )}
    </div>
  );
}

/** Paiement via l'agrégateur CinetPay (module optionnel, désactivé par défaut). */
function MobileMoney({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const [operator, setOperator] = useState<MobileOperator | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pay = () => {
    if (!operator) return;
    setError(null);
    start(async () => {
      const r = await initiateMobileMoneyPayment({ invoiceId, operator });
      if (r.ok && r.redirectUrl) window.location.assign(r.redirectUrl);
      else setError(r.message);
    });
  };

  return (
    <div className="grid gap-4" role="tabpanel">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-medium">Choisissez votre opérateur</legend>
        {OPERATORS.map((o) => (
          <label
            key={o.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
              operator === o.id && "border-primary ring-1 ring-primary",
            )}
          >
            <input
              type="radio"
              name="operator"
              value={o.id}
              className="sr-only"
              checked={operator === o.id}
              onChange={() => setOperator(o.id)}
            />
            <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-md text-xs font-bold", o.swatch)}>
              {o.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{o.name}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button size="lg" variant="accent" onClick={pay} disabled={!operator || pending} className="w-full">
        <Lock />
        {pending ? "Connexion sécurisée…" : `Payer ${formatXOF(remaining)}`}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Vous confirmerez avec votre code secret sur la page sécurisée de l&apos;opérateur. LoyerCI ne voit jamais votre code.
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function BankTransfer({ invoiceId, remaining, transfer }: { invoiceId: string; remaining: number; transfer: TransferInfo | null }) {
  const [state, action, pending] = useActionState<ProofState, FormData>(submitTransferProof, null);

  if (!transfer) {
    return (
      <p role="tabpanel" className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        Votre bailleur n&apos;a pas encore configuré de compte bancaire. Utilisez le Mobile Money.
      </p>
    );
  }

  return (
    <div className="grid gap-4" role="tabpanel">
      <ol className="grid gap-2 text-sm">
        <li className="grid gap-2">
          <p className="font-medium">1. Effectuez le virement depuis votre banque</p>
          <CopyField label="Bénéficiaire" value={transfer.accountHolder} />
          <CopyField label={`IBAN · ${transfer.bankName}`} value={transfer.iban} display={groupIban(transfer.iban)} />
          <CopyField label="Montant" value={String(remaining)} display={formatXOF(remaining)} />
          <CopyField label="Référence OBLIGATOIRE (motif du virement)" value={transfer.reference} emphasize />
          <p className="text-xs text-muted-foreground">Sans cette référence exacte, votre paiement ne pourra pas être rapproché.</p>
        </li>
      </ol>
      <form action={action} className="grid gap-3 rounded-lg border p-3">
        <p className="text-sm font-medium">2. Envoyez la preuve de virement</p>
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div className="grid gap-1.5">
          <Label htmlFor="amount">Montant viré (FCFA)</Label>
          <Input id="amount" name="amount" type="number" inputMode="numeric" min={100} max={remaining} defaultValue={remaining} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bankReference">Référence de l&apos;opération bancaire (facultatif)</Label>
          <Input id="bankReference" name="bankReference" maxLength={80} placeholder="ex. VIR-SGCI-20260503-7781" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="proof">Reçu ou capture (PDF, JPG, PNG · 5 Mo max.)</Label>
          <Input id="proof" name="proof" type="file" accept="application/pdf,image/jpeg,image/png" required />
        </div>
        <Button type="submit" disabled={pending}>
          <Upload />
          {pending ? "Envoi sécurisé…" : "Envoyer la preuve"}
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
