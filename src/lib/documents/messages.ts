import { formatLongDate, formatPeriod, formatXOF } from "@/lib/format";

/**
 * Messages d'accompagnement des documents envoyés par le bailleur (D.2).
 * Règles fixes : JAMAIS de numéro de paiement, de RIB ni de lien de paiement
 * (invariant n° 9) ; TOUJOURS le lien de vérification du document sur le domaine
 * officiel, et le rappel anti-arnaque. Phrases courtes, montants en chiffres.
 */
export const SAFETY_LINE = "LoyerCI ne vous demandera jamais votre code Mobile Money, ni de payer sur un numéro reçu par message.";

export interface AvisMessageInput {
  tenantName: string;
  landlordName: string;
  period: string;
  amountDue: number;
  dueDate: string;
  reference: string;
  verifyUrl: string;
}

export function avisMessage(m: AvisMessageInput): string {
  return [
    `Bonjour ${m.tenantName},`,
    "",
    `Avis d'échéance de ${formatPeriod(m.period)} (${m.landlordName}) :`,
    `• Montant : ${formatXOF(m.amountDue)}`,
    `• À régler avant le : ${formatLongDate(m.dueDate)}`,
    `• Référence : ${m.reference}`,
    "",
    "Réglez à votre bailleur comme d'habitude ou au guichet de l'agence.",
    `Le document est joint. Vérifier son authenticité : ${m.verifyUrl}`,
    "",
    SAFETY_LINE,
  ].join("\n");
}

export interface QuittanceMessageInput {
  tenantName: string;
  landlordName: string;
  period: string;
  amount: number;
  receiptNumber: string;
  verifyUrl: string;
}

export function quittanceMessage(m: QuittanceMessageInput): string {
  return [
    `Bonjour ${m.tenantName},`,
    "",
    `Votre quittance de loyer de ${formatPeriod(m.period)} (${m.landlordName}) :`,
    `• N° ${m.receiptNumber}`,
    `• Montant reçu : ${formatXOF(m.amount)}`,
    "",
    `Le document est joint : conservez-le, il prouve votre paiement. Vérifier son authenticité : ${m.verifyUrl}`,
    "",
    SAFETY_LINE,
  ].join("\n");
}
