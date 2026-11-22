"use client";
import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { savePaymentSettings } from "./actions";

export interface SettingsView {
  direct: boolean;
  cinetpay: boolean;
  transfer: boolean;
  feesNotice: string;
  cashThreshold: number;
}

export function SettingsForm({ orgId, initial, cinetpayAvailable }: { orgId: string; initial: SettingsView; cinetpayAvailable: boolean }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (key: "direct" | "cinetpay" | "transfer", label: string, hint: string, disabled = false) => (
    <label className={cn("flex items-start gap-3 rounded-lg border p-3", disabled && "opacity-50")}>
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={v[key]}
        disabled={disabled}
        onChange={(e) => setV({ ...v, [key]: e.target.checked })}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  return (
    <form
      aria-label="Modes de paiement"
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await savePaymentSettings({ orgId, ...v });
          setMsg({ ok: r.ok, text: r.message });
        });
      }}
    >
      {toggle("direct", "Mobile Money direct", "Le locataire envoie sur vos comptes ; vous confirmez la réception. Aucun frais LoyerCI.")}
      {toggle("transfer", "Virement bancaire", "Le locataire vire sur votre RIB avec la référence de l'avis.")}
      {toggle(
        "cinetpay",
        "Paiement en ligne via CinetPay",
        cinetpayAvailable
          ? "Confirmation automatique ; commission de l'agrégateur à votre charge."
          : "Non disponible : non configuré sur ce serveur.",
        !cinetpayAvailable && !v.cinetpay,
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="feesNotice">Information sur les frais affichée au locataire</Label>
        <textarea
          id="feesNotice"
          className="min-h-20 rounded-md border bg-card p-2 text-sm"
          maxLength={600}
          value={v.feesNotice}
          onChange={(e) => setV({ ...v, feesNotice: e.target.value })}
          placeholder="ex. Les frais de transfert éventuels sont à votre charge, selon la grille de votre opérateur."
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cashThreshold">Espèces saisies par un comptable : confirmation du propriétaire au-delà de (FCFA)</Label>
        <Input
          id="cashThreshold"
          type="number"
          inputMode="numeric"
          min={0}
          className="w-44"
          value={v.cashThreshold}
          onChange={(e) => setV({ ...v, cashThreshold: Number(e.target.value) })}
        />
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        <Save />
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
      {msg && (
        <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
