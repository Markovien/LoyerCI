import { formatDate, formatPeriod, formatXOF } from "./format";

export interface DueNotice {
  tenantName: string;
  landlordName: string;
  propertyLabel: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  dueDate: string;
  reference: string;
  payUrl: string;
  overdue: boolean;
}

/**
 * Texte de l'avis d'échéance. Volontairement SANS RIB ni numéro Mobile Money :
 * le locataire ne doit payer qu'à travers le lien officiel (anti-hameçonnage).
 */
export function buildDueNoticeText(n: DueNotice): string {
  const remaining = n.amountDue - n.amountPaid;
  const lines = [
    `Bonjour ${n.tenantName},`,
    "",
    n.overdue
      ? `Rappel : votre loyer de ${formatPeriod(n.period)} est en retard (échéance du ${formatDate(n.dueDate)}).`
      : `Votre avis d'échéance de ${formatPeriod(n.period)} est disponible.`,
    `• Bien : ${n.propertyLabel}`,
    `• Montant à régler : ${formatXOF(remaining)}`,
    `• Référence : ${n.reference}`,
    "",
    `Payez en ligne (Orange Money, MTN MoMo, Wave, Moov Money ou virement) :`,
    n.payUrl,
    "",
    `Attention : ${n.landlordName} ne vous demandera jamais de payer sur un autre lien ou numéro.`,
  ];
  return lines.join("\n");
}

/** Numéro ivoirien normalisé (2250XXXXXXXXX) -> lien wa.me pré-rempli. */
export function whatsappLink(msisdn: string, text: string): string {
  if (!/^225\d{10}$/.test(msisdn)) throw new Error("Numéro ivoirien invalide");
  return `https://wa.me/${msisdn}?text=${encodeURIComponent(text)}`;
}

export function smsLink(msisdn: string, text: string): string {
  return `sms:+${msisdn}?body=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string, subject: string, text: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
