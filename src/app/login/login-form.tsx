"use client";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid gap-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="vous@exemple.ci" />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        <Mail />
        {pending ? "Envoi…" : "Recevoir mon lien de connexion"}
      </Button>
      {state && (
        <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
