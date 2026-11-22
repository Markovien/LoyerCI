import { ShieldAlert } from "lucide-react";
import { formatLongDate } from "@/lib/format";
import { AccountsList } from "../parametres/paiements/accounts-list";
import type { AccountView } from "../parametres/paiements/types";

/**
 * Alerte permanente pendant la carence de 48 h : un compte de réception a été ajouté.
 * C'est la défense contre la prise de contrôle d'un compte propriétaire (en attendant
 * l'envoi des alertes par e-mail / SMS, phase D).
 */
export function PendingAccountsBanner({ accounts, canCancel }: { accounts: AccountView[]; canCancel: boolean }) {
  if (accounts.length === 0) return null;
  const first = accounts[0]!;
  return (
    <section
      role="alert"
      aria-label="Nouveau compte de réception"
      className="grid gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4"
    >
      <p className="flex items-start gap-2 text-sm font-semibold">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        {accounts.length === 1
          ? `Nouveau compte de réception ajouté${first.createdBy ? ` par ${first.createdBy}` : ""} : actif le ${formatLongDate(first.activatesAt)}.`
          : `${accounts.length} nouveaux comptes de réception en attente d'activation.`}
      </p>
      <p className="text-xs">
        Vérifiez-le. Si vous n&apos;êtes pas à l&apos;origine de cet ajout, annulez-le immédiatement : les locataires ne le verront jamais.
      </p>
      <AccountsList accounts={accounts} canCancel={canCancel} />
    </section>
  );
}
