"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveTenant } from "./actions";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function TenantForm({
  orgId,
  tenantId,
  initial,
}: {
  orgId: string;
  tenantId?: string;
  initial?: { fullName: string; phone: string; email: string };
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label={tenantId ? "Modifier le locataire" : "Nouveau locataire"}
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const values = { fullName: text(f.get("fullName")), phone: text(f.get("phone")), email: text(f.get("email")) };
        start(async () => {
          const r = await saveTenant({ orgId, tenantId, values });
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok && !tenantId) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="fullName">Nom et prénoms</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          maxLength={120}
          defaultValue={initial?.fullName}
          placeholder="ex. Kouassi Jean-Marc"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            maxLength={20}
            defaultValue={initial?.phone}
            placeholder="07 …"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">E-mail (facultatif)</Label>
          <Input id="email" name="email" type="email" maxLength={200} defaultValue={initial?.email} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Aucune pièce d&apos;identité n&apos;est demandée ni conservée.</p>
      <Button type="submit" disabled={pending} className="justify-self-start">
        <Save />
        {pending ? "Enregistrement…" : tenantId ? "Enregistrer" : "Ajouter le locataire"}
      </Button>
      {msg && (
        <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
