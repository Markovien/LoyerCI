"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, MessageCircle, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeriod, formatXOF } from "@/lib/format";
import { cn } from "@/lib/utils";
import { recordReminder } from "../actions";

export interface ReminderItem {
  invoiceId: string;
  step: number;
  stepLabel: string;
  tenantName: string;
  period: string;
  remaining: number;
  whatsappUrl: string | null;
  smsUrl: string | null;
  emailed: boolean;
}

/**
 * P3.3 — Relances du jour : la dernière échéance atteinte de chaque avis non soldé, pas
 * encore traitée. Un geste = le message part du WhatsApp du bailleur (D.2) et la relance est
 * tracée. Aucune pénalité n'est annoncée.
 */
export function RemindersToday({ items, offsetsLabel }: { items: ReminderItem[]; offsetsLabel: string }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-5 text-warning" aria-hidden />
          Relances du jour ({items.length})
        </CardTitle>
        <CardDescription>Échéances de relance : {offsetsLabel}. Le message part de votre WhatsApp.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <ul className="divide-y" aria-label="Relances du jour">
          {items.map((i) => (
            <ReminderRow key={`${i.invoiceId}:${i.step}`} item={i} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReminderRow({ item }: { item: ReminderItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Le lien s'ouvre normalement (pas de fenêtre bloquée) ; l'enregistrement part en parallèle.
  const track = (channel: "whatsapp" | "sms") =>
    start(async () => {
      const r = await recordReminder({ invoiceId: item.invoiceId, step: item.step, channel });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  return (
    <li className="grid gap-2 px-4 py-3 sm:px-5" data-testid="reminder-row">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="truncate font-medium">{item.tenantName}</p>
        <Badge tone={item.step > 0 ? "danger" : "warning"}>{item.stepLabel}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {formatXOF(item.remaining)} · loyer de {formatPeriod(item.period)}
        {item.emailed && " · rappel e-mail envoyé"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {item.whatsappUrl && (
          <Button asChild size="sm" variant="whatsapp" aria-disabled={pending}>
            <a
              href={item.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Relancer ${item.tenantName} par WhatsApp`}
              onClick={() => track("whatsapp")}
            >
              <MessageCircle />
              WhatsApp
            </a>
          </Button>
        )}
        {item.smsUrl && (
          <Button asChild size="sm" variant="outline" aria-disabled={pending}>
            <a href={item.smsUrl} aria-label={`Relancer ${item.tenantName} par SMS`} onClick={() => track("sms")}>
              <MessageSquareText />
              SMS
            </a>
          </Button>
        )}
      </div>
      {msg && !msg.ok && (
        <p role="status" className={cn("rounded-md p-2 text-sm", "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
    </li>
  );
}
