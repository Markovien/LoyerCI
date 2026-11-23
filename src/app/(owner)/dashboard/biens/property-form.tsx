"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ABIDJAN_COMMUNES, PROPERTY_TYPES } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { saveProperty } from "./actions";

export interface PropertyValues {
  code: string;
  label: string;
  type: string;
  city: string;
  commune: string;
  quartier: string;
  address: string;
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function PropertyForm({ orgId, propertyId, initial }: { orgId: string; propertyId?: string; initial?: PropertyValues }) {
  const router = useRouter();
  const [city, setCity] = useState(initial?.city ?? "Abidjan");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const inAbidjan = city.trim().toLowerCase() === "abidjan";

  return (
    <form
      aria-label={propertyId ? "Modifier le bien" : "Nouveau bien"}
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget; // capturé avant l'attente : currentTarget vaut null ensuite
        const f = new FormData(form);
        const values = {
          code: text(f.get("code")),
          label: text(f.get("label")),
          type: text(f.get("type")),
          city: text(f.get("city")),
          commune: text(f.get("commune")),
          quartier: text(f.get("quartier")),
          address: text(f.get("address")),
        };
        start(async () => {
          const r = await saveProperty({ orgId, propertyId, values });
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok && !propertyId) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            required
            maxLength={10}
            defaultValue={initial?.code}
            placeholder="VCR01"
            className="font-mono uppercase"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            defaultValue={initial?.type ?? "appartement"}
            className="h-10 rounded-md border bg-card px-2 text-sm"
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="label">Libellé</Label>
        <Input id="label" name="label" required maxLength={120} defaultValue={initial?.label} placeholder="Villa Duplex 5 pièces" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" name="city" required maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="commune">Commune</Label>
          {inAbidjan ? (
            <select
              id="commune"
              name="commune"
              required
              defaultValue={initial?.commune ?? ""}
              className="h-10 rounded-md border bg-card px-2 text-sm"
            >
              <option value="" disabled>
                Choisir…
              </option>
              {ABIDJAN_COMMUNES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <Input id="commune" name="commune" required maxLength={60} defaultValue={initial?.commune} placeholder="ex. Bouaké" />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="quartier">Quartier</Label>
          <Input id="quartier" name="quartier" maxLength={80} defaultValue={initial?.quartier} placeholder="ex. Riviera 3" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="address">Repère / adresse</Label>
          <Input id="address" name="address" maxLength={200} defaultValue={initial?.address} placeholder="ex. près de la pharmacie" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        <Save />
        {pending ? "Enregistrement…" : propertyId ? "Enregistrer les modifications" : "Créer le bien"}
      </Button>
      {msg && (
        <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
