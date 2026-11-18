"use client";
import { useState, useTransition } from "react";
import { Banknote, Mail, MessageCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildDueNoticeText, mailtoLink, smsLink, whatsappLink, type DueNotice } from "@/lib/whatsapp";
import { formatPeriod } from "@/lib/format";
import { recordCashPayment } from "../actions";

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
            <Banknote />
            Espèces
          </Button>
        )}
      </div>
      {cashOpen && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const amount = Number(new FormData(e.currentTarget).get("amount"));
            start(async () => {
              const r = await recordCashPayment({ invoiceId, amount });
              setMsg(r.message);
              if (r.ok) setCashOpen(false);
            });
          }}
        >
          <Input
            name="amount"
            type="number"
            inputMode="numeric"
            min={100}
            max={remaining}
            step={5}
            defaultValue={remaining}
            className="h-9 w-36"
            aria-label="Montant reçu en espèces"
          />
          <Button size="sm" type="submit" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
        </form>
      )}
      {msg && (
        <p role="status" className="text-xs text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}
