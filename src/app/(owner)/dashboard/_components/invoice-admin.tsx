"use client";
import { useState, useTransition } from "react";
import { FilePlus2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { cancelInvoice, cancelReceipt, generateInvoices } from "../actions";

/** P2.4 — Génération manuelle des avis du mois (propriétaire, gestionnaire). */
export function GenerateInvoicesButton({ period }: { period: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await generateInvoices(period);
            setMsg({ ok: r.ok, text: r.message });
          })
        }
      >
        <FilePlus2 />
        {pending ? "Génération…" : "Générer les avis du mois"}
      </Button>
      {msg && (
        <p role="status" className={cn("text-xs", msg.ok ? "text-success" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/** P2.4 — Annulation motivée d'un avis non réglé (owner/manager) ou d'une quittance (owner). */
export function InvoiceAdmin({
  invoiceId,
  receiptId,
  canCancelInvoice,
  canCancelReceipt,
}: {
  invoiceId: string;
  receiptId: string | null;
  canCancelInvoice: boolean;
  canCancelReceipt: boolean;
}) {
  const [open, setOpen] = useState<"avis" | "quittance" | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!canCancelInvoice && !(canCancelReceipt && receiptId)) return null;

  const confirm = () =>
    start(async () => {
      const r = open === "avis" ? await cancelInvoice({ invoiceId, reason }) : await cancelReceipt({ receiptId, reason });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setOpen(null);
    });

  return (
    <div className="grid gap-2 lg:col-span-3">
      {!open && (
        <div className="flex flex-wrap gap-2">
          {canCancelInvoice && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen("avis")}>
              <XCircle />
              Annuler l&apos;avis
            </Button>
          )}
          {canCancelReceipt && receiptId && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen("quittance")}>
              <XCircle />
              Annuler la quittance
            </Button>
          )}
        </div>
      )}
      {open && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={open === "avis" ? "Annuler l'avis" : "Annuler la quittance"}
        >
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Motif (obligatoire)"
            aria-label="Motif"
            className="h-9 flex-1"
          />
          <Button size="sm" variant="danger" onClick={confirm} disabled={pending || reason.trim().length < 5}>
            Confirmer l&apos;annulation
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
            Retour
          </Button>
        </div>
      )}
      {msg && (
        <p role="status" className={cn("text-xs", msg.ok ? "text-success" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
