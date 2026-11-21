"use client";
import { useState, useTransition } from "react";
import { Banknote, Mail, MessageCircle, MessageSquareText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildDueNoticeText, mailtoLink, smsLink, whatsappLink, type DueNotice } from "@/lib/whatsapp";
import { formatPeriod } from "@/lib/format";
import { recordCashPayment, recordReceivedPayment } from "../actions";
import { cn } from "@/lib/utils";

export function ShareActions({
  notice,
  phone,
  email,
  invoiceId,
  canRecordCash,
  payable,
}: {
  notice: DueNotice;
  phone: string;
  email: string | null;
  invoiceId: string;
  canRecordCash: boolean;
  payable: boolean;
}) {
  const text = buildDueNoticeText(notice);
  const [cashOpen, setCashOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const remaining = notice.amountDue - notice.amountPaid;

  if (!payable) return null;

  return (
    <div className="flex flex-col gap-2 lg:items-end">
      <div className="flex flex-wrap gap-1.5 lg:justify-end">
        <Button asChild size="sm" variant="whatsapp">
          <a
            href={whatsappLink(phone, text)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Envoyer l'avis par WhatsApp à ${notice.tenantName}`}
          >
            <MessageCircle />
            WhatsApp
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={smsLink(phone, text)} aria-label="Envoyer par SMS">
            <MessageSquareText />
            SMS
          </a>
        </Button>
        {email && (
          <Button asChild size="sm" variant="outline">
            <a href={mailtoLink(email, `Avis d'échéance — ${formatPeriod(notice.period)}`, text)} aria-label="Envoyer par e-mail">
              <Mail />
              E-mail
            </a>
          </Button>
        )}
        {canRecordCash && (
          <Button size="sm" variant="ghost" onClick={() => setCashOpen((o) => !o)} aria-expanded={cashOpen}>
            <Wallet />
            Encaissement
          </Button>
        )}
      </div>
      {cashOpen && (
        <ReceiptForm
          invoiceId={invoiceId}
          remaining={remaining}
          pending={pending}
          onSubmit={(fn) =>
            start(async () => {
              const r = await fn();
              setMsg(r.message);
              if (r.ok) setCashOpen(false);
            })
          }
        />
      )}
      {msg && (
        <p role="status" className="text-xs text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}

type Mode = "especes" | "mobile_money" | "virement";

/** Valeur texte d'un champ de formulaire (un champ fichier renverrait un File). */
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
type Result = { ok: boolean; message: string };

const MODES: { id: Mode; label: string }[] = [
  { id: "especes", label: "Espèces" },
  { id: "mobile_money", label: "Mobile Money" },
  { id: "virement", label: "Virement" },
];
const OPERATORS = [
  { id: "orange", label: "Orange" },
  { id: "mtn", label: "MTN" },
  { id: "wave", label: "Wave" },
  { id: "moov", label: "Moov" },
] as const;

/**
 * Le bailleur constate un loyer reçu sur SON compte (ou en main propre) et l'enregistre,
 * sans attendre de déclaration du locataire. Espèces : règle D2 (seuil) côté serveur.
 */
function ReceiptForm({
  invoiceId,
  remaining,
  pending,
  onSubmit,
}: {
  invoiceId: string;
  remaining: number;
  pending: boolean;
  onSubmit: (fn: () => Promise<Result>) => void;
}) {
  const [mode, setMode] = useState<Mode>("especes");
  const [operator, setOperator] = useState<(typeof OPERATORS)[number]["id"] | null>(null);

  return (
    <form
      aria-label="Enregistrer un encaissement"
      className="grid w-full gap-2 rounded-lg border p-3 lg:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const amount = Number(f.get("amount"));
        if (mode === "especes") return onSubmit(() => recordCashPayment({ invoiceId, amount }));
        onSubmit(() =>
          recordReceivedPayment({
            invoiceId,
            method: mode,
            operator: operator ?? undefined,
            amount,
            txnRef: text(f.get("txnRef")),
            bankReference: text(f.get("bankReference")),
          }),
        );
      }}
    >
      <div role="radiogroup" aria-label="Mode de règlement" className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn("h-9 rounded text-xs font-medium", mode === m.id ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "mobile_money" && (
        <div role="radiogroup" aria-label="Opérateur" className="grid grid-cols-4 gap-1">
          {OPERATORS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={operator === o.id}
              onClick={() => setOperator(o.id)}
              className={cn("h-9 rounded-md border text-xs font-medium", operator === o.id && "border-primary ring-1 ring-primary")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="amount"
          type="number"
          inputMode="numeric"
          min={100}
          max={remaining}
          defaultValue={remaining}
          className="h-9 w-36"
          aria-label="Montant reçu"
        />
        {mode === "mobile_money" && (
          <Input
            name="txnRef"
            maxLength={60}
            className="h-9 flex-1 font-mono"
            placeholder="N° de transaction (facultatif)"
            aria-label="N° de transaction"
          />
        )}
        {mode === "virement" && (
          <Input
            name="bankReference"
            maxLength={80}
            className="h-9 flex-1"
            placeholder="Réf. bancaire (facultatif)"
            aria-label="Référence bancaire"
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "especes"
          ? "Espèces remises en main propre."
          : "Enregistrez seulement après avoir vu l'argent sur votre compte. Le n° de transaction évite d'enregistrer deux fois le même transfert."}
      </p>
      <Button size="sm" type="submit" disabled={pending || (mode === "mobile_money" && !operator)}>
        <Banknote />
        {pending ? "…" : "Enregistrer l'encaissement"}
      </Button>
    </form>
  );
}
