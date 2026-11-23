"use client";
import { useActionState } from "react";
import { Link2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { acceptInvitation, requestInvitationLogin, type InvitationState } from "./actions";

const Status = ({ s }: { s: InvitationState }) =>
  s && (
    <p role="status" className={cn("rounded-md p-3 text-sm", s.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
      {s.message}
    </p>
  );

export function EmailStep({ token }: { token: string }) {
  const [state, action, pending] = useActionState<InvitationState, FormData>(requestInvitationLogin, null);
  return (
    <form action={action} aria-label="Créer mon espace" className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <Label htmlFor="email">Votre adresse e-mail</Label>
      <Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@exemple.ci" />
      <Button type="submit" size="lg" disabled={pending}>
        <Mail />
        {pending ? "Envoi…" : "Recevoir mon lien de connexion"}
      </Button>
      <Status s={state} />
    </form>
  );
}

export function AcceptStep({ token, landlord }: { token: string; landlord: string }) {
  const [state, action, pending] = useActionState<InvitationState, FormData>(acceptInvitation, null);
  return (
    <form action={action} aria-label="Confirmer le rattachement" className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending}>
        <Link2 />
        {pending ? "Rattachement…" : `Rattacher mon compte à ${landlord}`}
      </Button>
      <Status s={state} />
    </form>
  );
}
