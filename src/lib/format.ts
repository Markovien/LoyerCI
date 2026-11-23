const xof = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 450000 -> « 450 000 FCFA » (espaces fines insécables, rendu web). */
export function formatXOF(amount: number | bigint): string {
  return `${xof.format(amount)} FCFA`;
}

/** Variante sans caractères Unicode exotiques (polices PDF standard WinAnsi). */
export function formatXOFPlain(amount: number | bigint): string {
  return formatXOF(amount).replace(/[  ]/g, " ");
}

const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Abidjan" });

/** « 2026-05-01 » -> « mai 2026 » */
export function formatPeriod(period: string): string {
  return monthYear.format(new Date(`${period.slice(0, 10)}T00:00:00Z`));
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return shortDate.format(d);
}

export function formatLongDate(value: string | Date): string {
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return longDate.format(d);
}

/** Premier jour du mois courant en heure d'Abidjan (UTC+0), format AAAA-MM-01. */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** « 2250707123456 » -> « +225 07 07 12 34 56 » */
export function formatPhoneCI(msisdn: string): string {
  const local = msisdn.replace(/^225/, "");
  return `+225 ${local.replace(/(\d{2})(?=\d)/g, "$1 ")}`.trim();
}

/** Masque un IBAN pour l'affichage hors contexte de paiement. */
export function maskIban(iban: string): string {
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

/** Regroupe un IBAN par blocs de 4 pour la lecture. */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

/** Code de vérification lisible : 16 premiers caractères hex en 4 groupes. */
export function formatVerificationCode(signature: string): string {
  return signature
    .slice(0, 16)
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, "$1-");
}

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Africa/Abidjan",
});

/** Horodatage complet (journal d'audit), heure d'Abidjan. */
export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value));
}
