import { AlarmClock, Building2, Hourglass, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatXOF } from "@/lib/format";
import type { DashboardKpis } from "@/types/database";
import { cn } from "@/lib/utils";

export function KpiGrid({ k }: { k: DashboardKpis }) {
  const recovery = k.expected > 0 ? Math.min(100, Math.round((k.collected / k.expected) * 100)) : 0;
  const occupancy = k.properties_total > 0 ? Math.round((k.properties_occupied / k.properties_total) * 100) : 0;

  const items = [
    {
      label: "Encaissé ce mois",
      value: formatXOF(k.collected),
      sub: `${recovery} % de ${formatXOF(k.expected)} attendus`,
      icon: Wallet,
      tone: "text-success",
      bar: recovery,
    },
    {
      label: "En attente",
      value: formatXOF(k.pending),
      sub: "Avis du mois non soldés",
      icon: Hourglass,
      tone: "text-[oklch(0.55_0.12_70)]",
    },
    {
      label: "Taux d'occupation",
      value: `${occupancy} %`,
      sub: `${k.properties_occupied} biens loués sur ${k.properties_total}`,
      icon: Building2,
      tone: "text-info",
      bar: occupancy,
    },
    {
      label: "Retards de paiement",
      value: String(k.overdue_count),
      sub: `${formatXOF(k.overdue_amount)} d'impayés`,
      icon: AlarmClock,
      tone: k.overdue_count ? "text-danger" : "text-muted-foreground",
    },
  ];

  return (
    <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, sub, icon: Icon, tone, bar }) => (
        <Card key={label} className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
            <Icon className={cn("size-4", tone)} aria-hidden />
          </div>
          <p className="text-lg font-semibold tracking-tight sm:text-2xl">{value}</p>
          {bar !== undefined && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={bar}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={label}
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${bar}%` }} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">{sub}</p>
        </Card>
      ))}
    </section>
  );
}
