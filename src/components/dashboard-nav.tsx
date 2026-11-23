import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/dashboard/biens", label: "Biens" },
  { href: "/dashboard/locataires", label: "Locataires" },
] as const;

/** Navigation principale de l'espace bailleur (mobile d'abord : défilement horizontal). */
export function DashboardNav({ current }: { current: (typeof ITEMS)[number]["href"] }) {
  return (
    <nav aria-label="Navigation principale" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 text-sm">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={current === i.href ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full px-3 whitespace-nowrap",
                current === i.href ? "bg-primary text-white" : "bg-muted text-muted-foreground",
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
