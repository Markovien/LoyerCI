"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatXOF } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createLease } from "./actions";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function LeaseForm({
  orgId,
  properties,
  tenants,
}: {
  orgId: string;
  properties: { id: string; label: string }[];
  tenants: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [usage, setUsage] = useState<"habitation" | "professionnel">("habitation");
  const [rent, setRent] = useState(0);
  const [advance, setAdvance] = useState(2);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const maxMonths = usage === "habitation" ? 2 : 12;

  if (properties.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun bien vacant : ajoutez un bien ou terminez un bail.</p>;
  if (tenants.length === 0) return <p className="text-sm text-muted-foreground">Ajoutez d&apos;abord un locataire.</p>;

  return (
    <form
      aria-label="Nouveau bail"
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const input = {
          orgId,
          propertyId: text(f.get("propertyId")),
          tenantId: text(f.get("tenantId")),
          usage,
          rent: text(f.get("rent")),
          charges: text(f.get("charges")) || "0",
          depositMonths: text(f.get("depositMonths")),
          advanceMonths: text(f.get("advanceMonths")),
          dueDay: text(f.get("dueDay")),
          startDate: text(f.get("startDate")),
          whatsappConsent: f.get("whatsappConsent") === "on",
        };
        start(async () => {
          const r = await createLease(input);
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
        <div className="grid gap-1.5">
          <Label htmlFor="propertyId">Bien (vacant)</Label>
          <select id="propertyId" name="propertyId" required className="h-10 w-full min-w-0 rounded-md border bg-card px-2 text-sm">
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tenantId">Locataire</Label>
          <select id="tenantId" name="tenantId" required className="h-10 w-full min-w-0 rounded-md border bg-card px-2 text-sm">
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div role="radiogroup" aria-label="Usage" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {(["habitation", "professionnel"] as const).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={usage === u}
            onClick={() => setUsage(u)}
            className={cn("h-9 rounded text-sm", usage === u ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
          >
            {u === "habitation" ? "Habitation" : "Professionnel"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
        <div className="grid gap-1.5">
          <Label htmlFor="rent">Loyer mensuel (FCFA)</Label>
          <Input
            id="rent"
            name="rent"
            type="number"
            inputMode="numeric"
            min={1000}
            required
            onChange={(e) => setRent(Number(e.target.value))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="charges">Charges (FCFA)</Label>
          <Input id="charges" name="charges" type="number" inputMode="numeric" min={0} defaultValue={0} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 [&>*]:min-w-0">
        <div className="grid gap-1.5">
          <Label htmlFor="depositMonths">Caution (mois)</Label>
          <Input id="depositMonths" name="depositMonths" type="number" min={0} max={maxMonths} defaultValue={2} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="advanceMonths">Avance (mois)</Label>
          <Input
            id="advanceMonths"
            name="advanceMonths"
            type="number"
            min={0}
            max={maxMonths}
            value={advance}
            onChange={(e) => setAdvance(Number(e.target.value))}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dueDay">Jour d&apos;échéance</Label>
          <Input id="dueDay" name="dueDay" type="number" min={1} max={28} defaultValue={5} required />
        </div>
      </div>
      {usage === "habitation" && (
        <p className="text-xs text-muted-foreground">Loi n° 2019-576 : au plus 2 mois de caution et 2 mois d&apos;avance.</p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="startDate">Date d&apos;entrée</Label>
        <Input id="startDate" name="startDate" type="date" required className="w-48" />
        <p className="text-xs text-muted-foreground">Le mois d&apos;entrée est facturé en entier.</p>
      </div>
      {advance > 0 && rent > 0 && <p className="text-xs">Avance attendue : {formatXOF(advance * rent)} (hors charges).</p>}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="whatsappConsent" className="mt-1 size-4" />
        <span>Le locataire accepte de recevoir ses avis et quittances par WhatsApp.</span>
      </label>
      <Button type="submit" disabled={pending} className="justify-self-start">
        <Save />
        {pending ? "Enregistrement…" : "Créer le bail"}
      </Button>
      {msg && (
        <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
