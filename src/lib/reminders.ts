import { formatDate, formatPeriod, formatXOF } from "./format";

/** P3.3 — Relances de loyer. Aucune pénalité de retard (décision du 24/11/2026). */
export const DEFAULT_REMINDER_OFFSETS = [-3, 3, 10] as const;

const DAY = 86_400_000;
const dayIndex = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

/** Jours écoulés depuis l'échéance (négatif avant) ; même règle que private.reminder_step. */
export function daysFromDue(dueDate: string, today: string): number {
  return dayIndex(today) - dayIndex(dueDate);
}

/** Dernière échéance de relance atteinte, ou null. */
export function reminderStep(dueDate: string, today: string, offsets: readonly number[]): number | null {
  const d = daysFromDue(dueDate, today);
  const reached = offsets.filter((o) => o <= d);
  return reached.length ? Math.max(...reached) : null;
}

export function stepLabel(step: number): string {
  if (step < 0) return `Rappel ${-step} jour${step < -1 ? "s" : ""} avant l'échéance`;
  if (step === 0) return "Rappel le jour de l'échéance";
  return `Retard de ${step} jour${step > 1 ? "s" : ""}`;
}

/** « -3, 3, 10 » -> [-3, 3, 10] (1 à 5 valeurs entre -15 et 60), ou null si invalide. */
export function parseOffsets(input: string): number[] | null {
  const parts = input
    .split(/[\s,;]+/)
    .map((p) => p.trim().replace(/^J/i, ""))
    .filter(Boolean);
  if (!parts.length || parts.some((p) => !/^[+-]?\d{1,2}$/.test(p))) return null;
  const values = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  if (values.length > 5 || values.some((v) => v < -15 || v > 60)) return null;
  return values;
}

export const formatOffsets = (offsets: readonly number[]) => offsets.map((o) => (o < 0 ? `J${o}` : o === 0 ? "J" : `J+${o}`)).join(", ");

export interface ReminderMessage {
  tenantName: string;
  landlordName: string;
  period: string;
  remaining: number;
  dueDate: string;
  reference: string;
  step: number;
  /** Lien vers l'espace du locataire s'il a un compte ; sinon aucun lien. */
  payUrl: string | null;
}

/**
 * Texte de relance envoyé depuis le WhatsApp du bailleur. Invariant 9 : jamais de RIB ni de
 * numéro Mobile Money. Ton courtois, phrases courtes ; aucune pénalité.
 */
export function buildReminderText(m: ReminderMessage): string {
  const due = formatDate(m.dueDate);
  const head =
    m.step < 0
      ? `Petit rappel : votre loyer de ${formatPeriod(m.period)} est attendu le ${due}.`
      : m.step === 0
        ? `Petit rappel : votre loyer de ${formatPeriod(m.period)} est attendu aujourd'hui.`
        : `Votre loyer de ${formatPeriod(m.period)} n'est pas encore réglé (échéance du ${due}).`;
  return [
    `Bonjour ${m.tenantName},`,
    "",
    head,
    `• Montant restant : ${formatXOF(m.remaining)}`,
    `• Référence de votre avis : ${m.reference}`,
    ...(m.payUrl ? ["", "Votre avis et les moyens de paiement :", m.payUrl] : []),
    "",
    "Si vous avez déjà payé, merci de ne pas tenir compte de ce message.",
    `Attention : ${m.landlordName} ne vous demandera jamais de payer sur un autre lien ou numéro.`,
  ].join("\n");
}
