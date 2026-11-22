"use client";
import { useState, useTransition } from "react";
import { Ban, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cancelReceivingAccount } from "./actions";
import type { AccountView } from "./types";

export function AccountsList({ accounts, canCancel }: { accounts: AccountView[]; canCancel: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (accounts.length === 0) return <p className="text-sm text-muted-foreground">Aucun compte de réception configuré.</p>;
  return (
    <div className="grid gap-2">
      {msg && (
        <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
      <ul className="grid gap-2">
        {accounts.map((a) => (
          <li
            key={a.id}
            data-testid="receiving-account"
            className={cn(
              "rounded-lg border p-3",
              a.status === "carence" && "border-warning bg-warning/8",
              a.status === "revoque" && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{a.title}</p>
                <p className="break-all font-mono text-sm">{a.coordinate}</p>
                <p className="text-xs text-muted-foreground">
                  Titulaire : {a.holder}
                  {a.displayName ? ` · nom affiché : ${a.displayName}` : ""}
                  {a.createdBy ? ` · ajouté par ${a.createdBy}` : ""}
                </p>
              </div>
              {a.status === "actif" && <Badge className="bg-success/15 text-success">Actif</Badge>}
              {a.status === "carence" && (
                <Badge className="bg-warning/20 text-[oklch(0.35_0.08_70)]">
                  <ShieldAlert className="size-3.5" aria-hidden />
                  Actif le {formatLongDate(a.activatesAt)}
                </Badge>
              )}
              {a.status === "revoque" && <Badge className="bg-muted">Révoqué le {formatLongDate(a.revokedAt!)}</Badge>}
            </div>
            {canCancel && a.status !== "revoque" && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await cancelReceivingAccount(a.id);
                    setMsg({ ok: r.ok, text: r.message });
                  })
                }
              >
                <Ban />
                {a.status === "carence" ? "Ce n'est pas moi : annuler" : "Révoquer"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
