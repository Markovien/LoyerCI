"use client";
import { useState, useTransition } from "react";
import { Check, FileSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatPeriod, formatXOF } from "@/lib/format";
import type { PendingTransferRow } from "@/types/database";
import { getProofUrl, reviewTransfer } from "../actions";

export function PendingTransfers({ rows }: { rows: PendingTransferRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="border-warning/50">
      <CardHeader>
        <CardTitle>Virements à valider ({rows.length})</CardTitle>
        <CardDescription>Contrôlez le reçu ET le relevé bancaire : la référence doit figurer sur l&apos;opération.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.map((r) => <TransferRow key={r.id} row={r} />)}
      </CardContent>
    </Card>
  );
}

function TransferRow({ row }: { row: PendingTransferRow }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inv = row.invoices;

  const act = (decision: "valider" | "rejeter") =>
    start(async () => {
      const r = await reviewTransfer({ paymentId: row.id, decision, reason: decision === "rejeter" ? reason : undefined });
      setMessage({ ok: r.ok, text: r.message });
    });

  const openProof = () =>
    start(async () => {
      const r = await getProofUrl(row.id);
      if (r.ok && r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else setMessage({ ok: false, text: r.message });
    });

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{inv?.tenants?.full_name ?? "Locataire"}</p>
          <p className="text-xs text-muted-foreground">
            {inv ? formatPeriod(inv.period) : ""} · déclaré le {formatDate(row.created_at)}
            {row.bank_reference ? ` · réf. banque ${row.bank_reference}` : ""}
          </p>
          <p className="mt-1 font-mono text-xs">{inv?.payment_reference}</p>
        </div>
        <p className="text-base font-semibold">{formatXOF(row.amount)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={openProof} disabled={pending}><FileSearch />Voir la preuve</Button>
        <Button size="sm" onClick={() => act("valider")} disabled={pending}><Check />Valider</Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting((v) => !v)} disabled={pending}><X />Rejeter</Button>
      </div>
      {rejecting && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Motif (ex. montant absent du relevé)" className="h-9 flex-1" aria-label="Motif du rejet" />
          <Button size="sm" variant="danger" onClick={() => act("rejeter")} disabled={pending || reason.trim().length < 5}>Confirmer le rejet</Button>
        </div>
      )}
      {message && <p role="status" className={message.ok ? "mt-2 text-xs text-success" : "mt-2 text-xs text-danger"}>{message.text}</p>}
    </div>
  );
}
