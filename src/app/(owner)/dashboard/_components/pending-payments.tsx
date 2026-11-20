"use client";
import { useEffect, useState, useTransition } from "react";
import { AlarmClock, Banknote, Building, Check, FileSearch, Smartphone, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatPeriod, formatXOF } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/types/database";
import { getProofUrl, reviewManualPayment } from "../actions";

/** Vue préparée côté serveur : ni chemin de fichier, ni numéro complet (minimisation). */
export interface PendingPaymentView {
  id: string;
  kind: "virement" | "direct" | "especes";
  operator: "orange" | "mtn" | "moov" | "wave" | null;
  amount: number;
  createdAt: string;
  overdue: boolean; // en attente depuis plus de 48 h
  hasProof: boolean;
  bankReference: string | null;
  operatorTxnRef: string | null;
  payerHint: string | null;
  declaredByMember: string | null; // espèces : membre qui a saisi
  tenantName: string;
  invoiceReference: string;
  period: string;
}

const OPERATOR: Record<string, { name: string; swatch: string }> = {
  orange: { name: "Orange Money", swatch: "bg-[#ff7900] text-white" },
  mtn: { name: "MTN MoMo", swatch: "bg-[#ffcc00] text-[#1d1d1b]" },
  wave: { name: "Wave", swatch: "bg-[#1dc8ff] text-[#0b1b4d]" },
  moov: { name: "Moov Money", swatch: "bg-[#0055a4] text-white" },
};

const HINT: Record<PendingPaymentView["kind"], string> = {
  virement: "Vérifiez le relevé bancaire : la référence doit figurer sur l'opération.",
  direct: "Vérifiez l'historique de votre compte Mobile Money : n° de transaction, montant et payeur.",
  especes: "Encaissement saisi par un comptable au-delà du seuil : confirmez avoir reçu les espèces.",
};

type Flash = { ok: boolean; text: string };

export function PendingPayments({ rows, role }: { rows: PendingPaymentView[]; role: MemberRole }) {
  // Message conservé au niveau de la carte : la ligne traitée disparaît dès que le
  // temps réel rafraîchit la page, le message doit rester lisible.
  const [flash, setFlash] = useState<Flash | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(t);
  }, [flash]);

  if (rows.length === 0 && !flash) return null;
  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <Card className={cn("border-warning/50", overdue > 0 && "border-danger/60")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Paiements à confirmer ({rows.length})
          {overdue > 0 && (
            <Badge className="bg-danger text-white">
              <AlarmClock className="size-3.5" aria-hidden />
              {overdue} en attente depuis plus de 48 h
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Ne confirmez qu&apos;après avoir vu l&apos;argent sur VOTRE compte. Une capture d&apos;écran ne prouve rien.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {flash && (
          <p role="status" className={cn("rounded-md p-3 text-sm", flash.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
            {flash.text}
          </p>
        )}
        {rows.map((r) => (
          <PaymentRow key={r.id} row={r} role={role} onDone={setFlash} />
        ))}
      </CardContent>
    </Card>
  );
}

function KindIcon({ row }: { row: PendingPaymentView }) {
  if (row.kind === "direct" && row.operator) {
    const o = OPERATOR[row.operator]!;
    return (
      <span
        aria-label={o.name}
        title={o.name}
        className={cn("grid size-9 shrink-0 place-items-center rounded-md text-xs font-bold", o.swatch)}
      >
        {o.name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  const Icon = row.kind === "virement" ? Building : row.kind === "especes" ? Banknote : Smartphone;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted" aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

function PaymentRow({ row, role, onDone }: { row: PendingPaymentView; role: MemberRole; onDone: (f: Flash) => void }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Espèces : confirmation réservée au propriétaire (décision D2), revérifiée en base.
  const canReview = row.kind !== "especes" || role === "owner";
  const label =
    row.kind === "virement"
      ? "Virement"
      : row.kind === "especes"
        ? "Espèces"
        : (row.operator && OPERATOR[row.operator]?.name) || "Mobile Money";

  const act = (decision: "valider" | "rejeter") =>
    start(async () => {
      setError(null);
      const r = await reviewManualPayment({ paymentId: row.id, decision, reason: decision === "rejeter" ? reason : undefined });
      if (r.ok) onDone({ ok: true, text: `${row.tenantName} · ${formatXOF(row.amount)} : ${r.message}` });
      else setError(r.message);
    });

  const openProof = () =>
    start(async () => {
      const r = await getProofUrl(row.id);
      if (r.ok && r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else setError(r.message);
    });

  return (
    <div data-testid="pending-payment" className={cn("rounded-lg border p-3", row.overdue && "border-danger/50 bg-danger/5")}>
      <div className="flex items-start gap-3">
        <KindIcon row={row} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{row.tenantName}</p>
            <p className="text-base font-semibold">{formatXOF(row.amount)}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {label} · {formatPeriod(row.period)} · déclaré le {formatDate(row.createdAt)}
            {row.overdue && <span className="font-medium text-danger"> · plus de 48 h</span>}
          </p>
          <dl className="mt-1 grid gap-0.5 text-xs">
            {row.operatorTxnRef && (
              <div className="flex gap-1">
                <dt className="text-muted-foreground">N° de transaction :</dt>
                <dd className="font-mono font-medium">{row.operatorTxnRef}</dd>
              </div>
            )}
            {row.payerHint && (
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Payeur :</dt>
                <dd className="font-mono">{row.payerHint}</dd>
              </div>
            )}
            {row.bankReference && (
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Réf. banque :</dt>
                <dd className="font-mono">{row.bankReference}</dd>
              </div>
            )}
            {row.declaredByMember && (
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Saisi par :</dt>
                <dd>{row.declaredByMember}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Référence de l&apos;avis :</dt>
              <dd className="font-mono">{row.invoiceReference}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-muted-foreground">{HINT[row.kind]}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {row.hasProof && (
          <Button size="sm" variant="outline" onClick={openProof} disabled={pending}>
            <FileSearch />
            {row.kind === "virement" ? "Voir la preuve" : "Voir la capture"}
          </Button>
        )}
        {canReview ? (
          <>
            <Button size="sm" onClick={() => act("valider")} disabled={pending}>
              <Check />
              Confirmer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting((v) => !v)} disabled={pending}>
              <X />
              Rejeter
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Confirmation réservée au propriétaire.</p>
        )}
      </div>
      {rejecting && canReview && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Motif (ex. montant absent de l'historique)"
            className="h-9 flex-1"
            aria-label="Motif du rejet"
          />
          <Button size="sm" variant="danger" onClick={() => act("rejeter")} disabled={pending || reason.trim().length < 5}>
            Confirmer le rejet
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
