"use client";
import { useState, useTransition } from "react";
import { KeyRound, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addReceivingAccount, requestReauthCode } from "./actions";

type Kind = "mobile_money" | "banque" | "pispi_alias" | "payment_link";
const KINDS: { id: Kind; label: string }[] = [
  { id: "mobile_money", label: "Mobile Money" },
  { id: "banque", label: "Compte bancaire" },
  { id: "pispi_alias", label: "Alias PI-SPI" },
  { id: "payment_link", label: "Lien marchand" },
];
const OPERATORS = [
  { id: "orange", label: "Orange" },
  { id: "mtn", label: "MTN" },
  { id: "wave", label: "Wave" },
  { id: "moov", label: "Moov" },
] as const;

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/**
 * Ajout d'une coordonnée de réception en deux temps : saisie puis code à usage unique
 * envoyé par e-mail au propriétaire connecté. Rien n'est enregistré avant la vérification.
 */
export function AddAccountForm({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("mobile_money");
  const [operator, setOperator] = useState<(typeof OPERATORS)[number]["id"] | null>(null);
  const [account, setAccount] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const status = msg && (
    <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
      {msg.text}
    </p>
  );

  // Formulaire refermé : le dernier message (ex. « actif le … ») reste lisible.
  if (!open) {
    return (
      <div className="grid gap-2">
        {status}
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => {
            setMsg(null);
            setOpen(true);
          }}
        >
          <Plus />
          Ajouter un compte de réception
        </Button>
      </div>
    );
  }

  // Étape 2 : code de ré-authentification
  if (account) {
    return (
      <form
        aria-label="Code de confirmation"
        className="grid gap-3 rounded-lg border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const code = text(new FormData(e.currentTarget).get("code"));
          start(async () => {
            const r = await addReceivingAccount({ orgId, code, account });
            setMsg({ ok: r.ok, text: r.message });
            if (r.ok) {
              setAccount(null);
              setOpen(false);
            }
          });
        }}
      >
        <p className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4" aria-hidden />
          Confirmez votre identité
        </p>
        <p className="text-xs text-muted-foreground">
          Par sécurité, tout ajout de compte exige le code à 6 chiffres envoyé à votre adresse e-mail. Le nouveau compte sera actif après un
          délai de 48 h, pendant lequel l&apos;ancien reste utilisé.
        </p>
        <Label htmlFor="code">Code reçu par e-mail</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          required
          className="w-40 font-mono text-lg tracking-widest"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Vérification…" : "Confirmer l'ajout"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await requestReauthCode();
                setMsg({ ok: r.ok, text: r.message });
              })
            }
          >
            Renvoyer le code
          </Button>
        </div>
        {status}
      </form>
    );
  }

  // Étape 1 : saisie
  return (
    <form
      aria-label="Nouveau compte de réception"
      className="grid gap-3 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const draft: Record<string, string> = { kind, holder: text(f.get("holder")), displayName: text(f.get("displayName")) };
        if (kind === "banque") Object.assign(draft, { bank: text(f.get("bank")), iban: text(f.get("iban")) });
        if (kind === "mobile_money") Object.assign(draft, { operator: operator ?? "", msisdn: text(f.get("msisdn")) });
        if (kind === "pispi_alias") Object.assign(draft, { alias: text(f.get("alias")) });
        if (kind === "payment_link") Object.assign(draft, { operator: operator ?? "", url: text(f.get("url")) });
        start(async () => {
          const r = await requestReauthCode();
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) setAccount(draft);
        });
      }}
    >
      <div role="radiogroup" aria-label="Type de compte" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 sm:grid-cols-4">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn("h-9 rounded text-xs font-medium", kind === k.id ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {k.label}
          </button>
        ))}
      </div>
      {(kind === "mobile_money" || kind === "payment_link") && (
        <div role="radiogroup" aria-label="Opérateur" className="grid grid-cols-4 gap-1">
          {OPERATORS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={operator === o.id}
              onClick={() => setOperator(o.id)}
              className={cn("h-9 rounded-md border text-xs font-medium", operator === o.id && "border-primary ring-1 ring-primary")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="holder">Titulaire du compte</Label>
        <Input id="holder" name="holder" required maxLength={120} placeholder="ex. AKWABA IMMOBILIER SARL" />
      </div>
      {kind === "banque" && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="bank">Banque</Label>
            <Input id="bank" name="bank" required maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="iban">IBAN</Label>
            <Input id="iban" name="iban" required maxLength={40} className="font-mono" placeholder="CI.." />
          </div>
        </>
      )}
      {kind === "mobile_money" && (
        <div className="grid gap-1.5">
          <Label htmlFor="msisdn">Numéro Mobile Money</Label>
          <Input id="msisdn" name="msisdn" type="tel" inputMode="tel" required maxLength={20} placeholder="07 …" />
        </div>
      )}
      {kind === "pispi_alias" && (
        <div className="grid gap-1.5">
          <Label htmlFor="alias">Alias PI-SPI (numéro mobile ou adresse de paiement)</Label>
          <Input id="alias" name="alias" required maxLength={40} className="font-mono" />
        </div>
      )}
      {kind === "payment_link" && (
        <div className="grid gap-1.5">
          <Label htmlFor="url">Lien de paiement marchand</Label>
          <Input id="url" name="url" type="url" required maxLength={300} placeholder="https://…" />
          <p className="text-xs text-muted-foreground">Seuls les domaines validés par LoyerCI pour cet opérateur sont acceptés.</p>
        </div>
      )}
      {kind !== "banque" && (
        <div className="grid gap-1.5">
          <Label htmlFor="displayName">Nom affiché par l&apos;application de l&apos;opérateur</Label>
          <Input id="displayName" name="displayName" maxLength={120} placeholder="ex. AKWABA IMMOBILIER" />
          <p className="text-xs text-muted-foreground">Le locataire vérifiera ce nom avant de valider son transfert.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || ((kind === "mobile_money" || kind === "payment_link") && !operator)}>
          <Send />
          {pending ? "Envoi du code…" : "Continuer : recevoir un code"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
      {status}
    </form>
  );
}
