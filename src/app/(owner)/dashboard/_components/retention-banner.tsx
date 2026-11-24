import { Archive, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLongDate } from "@/lib/format";

/**
 * P3.4 — Documents qui atteindront 2 ans dans les 30 jours : invitation à les exporter
 * avant leur suppression (le bailleur reste responsable de ses propres archives).
 */
export function RetentionBanner({ count, from }: { count: number; from: string | null }) {
  if (count === 0 || !from) return null;
  return (
    <section
      aria-label="Documents bientôt supprimés"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-warning/10 p-4"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Archive className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p className="text-sm">
          <strong>
            {count} document{count > 1 ? "s" : ""}
          </strong>{" "}
          (avis, quittances) {count > 1 ? "seront supprimés" : "sera supprimé"} à partir du {formatLongDate(from)} : LoyerCI les conserve 2
          ans. Exportez-les pour vos archives.
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href="/api/export/documents" download>
          <Download />
          Exporter (ZIP)
        </a>
      </Button>
    </section>
  );
}
