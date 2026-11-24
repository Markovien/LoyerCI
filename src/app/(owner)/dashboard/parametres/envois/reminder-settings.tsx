"use client";
import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveReminderSettings, type SettingsResult } from "./actions";

export function ReminderSettingsForm({ offsets, email, canEdit }: { offsets: string; email: boolean; canEdit: boolean }) {
  const [msg, setMsg] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Réglage des relances"
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const raw = f.get("offsets");
        const input = { offsets: typeof raw === "string" ? raw : "", email: f.get("email") === "on" };
        start(async () => setMsg(await saveReminderSettings(input)));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="offsets">Échéances de relance</Label>
        <Input id="offsets" name="offsets" defaultValue={offsets} maxLength={60} disabled={!canEdit} inputMode="text" />
        <p className="text-xs text-muted-foreground">
          Jours avant (J-3) ou après (J+3) l&apos;échéance de l&apos;avis : 1 à 5 valeurs. Aucune pénalité n&apos;est appliquée ni annoncée.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="email" defaultChecked={email} disabled={!canEdit} className="mt-1 size-4" />
        <span>Envoyer aussi un rappel automatique par e-mail aux locataires qui ont une adresse e-mail (sans coordonnée de paiement).</span>
      </label>
      {canEdit && (
        <Button type="submit" disabled={pending} className="justify-self-start">
          <Save />
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      )}
      {msg && (
        <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.message}
        </p>
      )}
    </form>
  );
}
