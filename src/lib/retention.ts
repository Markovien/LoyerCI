/** P3.4 — Les documents sont conservés 2 ans après leur émission (décision du 24/11/2026). */
export const RETENTION_YEARS = 2;

/**
 * Date d'émission en deçà de laquelle un document sera purgé d'ici `withinDays` jours
 * (0 : déjà purgeable).
 */
export function retentionCutoff(now: Date, withinDays = 0): Date {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - RETENTION_YEARS);
  d.setUTCDate(d.getUTCDate() + withinDays);
  return d;
}

/** Date de purge d'un document émis à `issuedAt`. */
export function purgeDate(issuedAt: string | Date): Date {
  const d = new Date(issuedAt);
  d.setUTCFullYear(d.getUTCFullYear() + RETENTION_YEARS);
  return d;
}
