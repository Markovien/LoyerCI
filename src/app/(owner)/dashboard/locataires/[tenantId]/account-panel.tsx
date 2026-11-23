"use client";
import { useState, useTransition } from "react";
import { Copy, Link2Off, MessageCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { inviteTenant, unlinkTenant } from "../actions";

/** Compte locataire facultatif : invitation (lien à usage unique) ou déliaison. */
export function AccountPanel({ tenantId, linked, lastInvitation }: { tenantId: string; linked: boolean; lastInvitation: string | null }) {
  const [invite, setInvite] = useState<{ link: string; whatsappUrl: string | null; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-3">
      {linked ? (
        <>
          <p className="text-sm">
            <strong className="text-success">Compte rattaché.</strong> Le locataire retrouve ses avis et quittances dans son espace.
          </p>
          <Button
            variant="ghost"
            className="justify-self-start text-danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await unlinkTenant(tenantId);
                setMsg({ ok: r.ok, text: r.message });
              })
            }
          >
            <Link2Off />
            Délier le compte
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Pas de compte (facultatif). {lastInvitation ? `Dernière invitation : ${lastInvitation}.` : "Aucune invitation envoyée."}
          </p>
          {!invite ? (
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await inviteTenant(tenantId);
                  if (r.ok) setInvite({ link: r.link, whatsappUrl: r.whatsappUrl, expiresAt: r.expiresAt });
                  setMsg({ ok: r.ok, text: r.message });
                })
              }
            >
              <UserPlus />
              Inviter à créer son espace
            </Button>
          ) : (
            <div className="grid gap-2 rounded-lg border p-3">
              <p className="break-all font-mono text-xs" data-testid="invitation-link">
                {invite.link}
              </p>
              <p className="text-xs text-muted-foreground">Valable jusqu&apos;au {formatLongDate(invite.expiresAt)}, une seule fois.</p>
              <div className="flex flex-wrap gap-2">
                {invite.whatsappUrl && (
                  <Button asChild size="sm" variant="whatsapp">
                    <a href={invite.whatsappUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle />
                      Envoyer par WhatsApp
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void navigator.clipboard.writeText(invite.link).catch(() => setMsg({ ok: false, text: "Copie impossible." }))
                  }
                >
                  <Copy />
                  Copier le lien
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && (
        <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
