import { formatLongDate, formatPeriod, formatXOFPlain } from "@/lib/format";

/** Instantané signé d'un avis d'échéance (table public.notices). */
export interface NoticeRow {
  id: string;
  landlord_name: string;
  tenant_name: string;
  property_label: string;
  property_location: string;
  period: string;
  rent_amount: number;
  charges_amount: number;
  amount_due: number;
  due_date: string;
  payment_reference: string;
  issued_at: string;
  content_hash: string;
  signature: string;
}

/**
 * Consigne de paiement : JAMAIS de numéro, de RIB ni de lien de paiement (invariant n° 9).
 * Un avis falsifié avec le numéro d'un escroc est le premier vecteur d'hameçonnage.
 */
export const NOTICE_PAYMENT_INSTRUCTION =
  "Réglez ce montant à votre bailleur comme d'habitude, ou au guichet de l'agence, en indiquant la référence ci-dessus.";

export const NOTICE_SAFETY_WARNING =
  "LoyerCI ne vous demandera jamais votre code Mobile Money, ni de payer sur un numéro reçu par message. En cas de doute, vérifiez ce document.";

/** Lignes d'identification de l'avis (texte pur, testable). */
export function noticeRows(n: NoticeRow): [string, string][] {
  return [
    ["Bailleur", n.landlord_name],
    ["Locataire", n.tenant_name],
    ["Bien loué", n.property_label],
    ["Adresse", n.property_location],
    ["Période", formatPeriod(n.period).replace(/^./, (c) => c.toUpperCase())],
    ["À régler avant le", formatLongDate(n.due_date)],
    ["Référence à rappeler", n.payment_reference],
  ];
}

export function noticeAmounts(n: NoticeRow): { label: string; value: string; strong?: boolean }[] {
  return [
    { label: "Loyer", value: formatXOFPlain(n.rent_amount) },
    ...(n.charges_amount > 0 ? [{ label: "Charges", value: formatXOFPlain(n.charges_amount) }] : []),
    { label: "TOTAL À PAYER", value: formatXOFPlain(n.amount_due), strong: true },
  ];
}
