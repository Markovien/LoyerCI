import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/types/database";

const MAP: Record<InvoiceStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  a_payer: { label: "À payer", tone: "warning" },
  partiel: { label: "Partiel", tone: "info" },
  en_retard: { label: "En retard", tone: "danger" },
  paye: { label: "Payé", tone: "success" },
  annule: { label: "Annulé", tone: "neutral" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const s = MAP[status];
  return (
    <Badge tone={s.tone}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  );
}
