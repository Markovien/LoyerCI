"use client";
import { useState, useTransition } from "react";
import { Ban, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { recordAdvance, terminateLease } from "./actions";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** Actions sur un bail actif : avance (propriétaire) et résiliation (propriétaire, gestionnaire). */
export function LeaseActions({
  leaseId,
  canAdvance,
  advanceMonths,
  canTerminate,
}: {
  leaseId: string;
  canAdvance: boolean;
  advanceMonths: number;
  canTerminate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {canAdvance && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await recordAdvance(leaseId);
                setMsg({ ok: r.ok, text: r.message });
              })
            }
          >
            <Wallet />
            Avance reçue ({advanceMonths} mois)
          </Button>
        )}
        {canTerminate && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen((o) => !o)}>
            <Ban />
            Résilier
          </Button>
        )}
      </div>
      {open && (
        <form
          aria-label="Résilier le bail"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await terminateLease({ leaseId, endDate: text(f.get("endDate")), reason: text(f.get("reason")) });
              setMsg({ ok: r.ok, text: r.message });
              if (r.ok) setOpen(false);
            });
          }}
        >
          <Input name="endDate" type="date" required aria-label="Date de fin" className="h-9 w-40" />
          <Input name="reason" required minLength={3} maxLength={300} placeholder="Motif" aria-label="Motif" className="h-9 flex-1" />
          <Button size="sm" variant="danger" type="submit" disabled={pending}>
            Confirmer
          </Button>
        </form>
      )}
      {msg && (
        <p role="status" className={cn("text-xs", msg.ok ? "text-success" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
