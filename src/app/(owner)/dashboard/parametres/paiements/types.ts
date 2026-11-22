/** Vue d'une coordonnée de réception préparée côté serveur (propriétaire / comptable). */
export interface AccountView {
  id: string;
  kind: "banque" | "mobile_money" | "pispi_alias" | "payment_link";
  title: string; // ex. « Orange Money », « Société Générale »
  coordinate: string; // ex. « 07 07 00 01 11 », « CI15 CI00 … »
  holder: string;
  displayName: string | null;
  status: "actif" | "carence" | "revoque";
  activatesAt: string;
  revokedAt: string | null;
  createdBy: string | null;
}

const OPERATOR_NAMES: Record<string, string> = { orange: "Orange Money", mtn: "MTN MoMo", moov: "Moov Money", wave: "Wave" };

export function toAccountView(
  a: {
    id: string;
    kind: string;
    operator: string | null;
    bank_name: string | null;
    iban: string | null;
    msisdn: string | null;
    pispi_alias: string | null;
    payment_link_url: string | null;
    account_holder: string;
    display_name_expected: string | null;
    activates_at: string;
    revoked_at: string | null;
    created_by: string;
  },
  names: Map<string, string>,
  now = Date.now(),
): AccountView {
  const group = (local: string) => local.replace(/(\d{2})(?=\d)/g, "$1 ");
  const op = a.operator ? (OPERATOR_NAMES[a.operator] ?? a.operator) : null;
  const view = (() => {
    switch (a.kind) {
      case "banque":
        return { title: a.bank_name ?? "Banque", coordinate: (a.iban ?? "").replace(/(.{4})(?=.)/g, "$1 ") };
      case "mobile_money":
        return { title: op ?? "Mobile Money", coordinate: group((a.msisdn ?? "").replace(/^225/, "")) };
      case "pispi_alias":
        return {
          title: "Alias PI-SPI (interopérable)",
          coordinate: a.pispi_alias?.startsWith("+225") ? group(a.pispi_alias.slice(4)) : (a.pispi_alias ?? ""),
        };
      default:
        return { title: `Lien de paiement ${op ?? ""}`.trim(), coordinate: a.payment_link_url ?? "" };
    }
  })();
  return {
    id: a.id,
    kind: a.kind as AccountView["kind"],
    ...view,
    holder: a.account_holder,
    displayName: a.display_name_expected,
    status: a.revoked_at ? "revoque" : new Date(a.activates_at).getTime() > now ? "carence" : "actif",
    activatesAt: a.activates_at,
    revokedAt: a.revoked_at,
    createdBy: names.get(a.created_by) ?? null,
  };
}
