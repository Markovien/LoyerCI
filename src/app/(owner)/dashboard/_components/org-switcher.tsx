"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveOrg } from "../parametres/membres/actions";

/** P2.5 : choix de l'organisation active (affiché seulement si plusieurs adhésions). */
export function OrgSwitcher({ current, orgs }: { current: string; orgs: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Organisation active"
      className="h-9 max-w-48 min-w-0 rounded-md border bg-card px-2 text-sm"
      value={current}
      disabled={pending}
      onChange={(e) => {
        const id = e.target.value;
        start(async () => {
          const r = await setActiveOrg(id);
          if (r.ok) router.refresh();
        });
      }}
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
