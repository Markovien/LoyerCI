/**
 * P4.5 — Journaux structurés (JSON sur une ligne), lisibles dans les journaux de
 * l'hébergeur. Aucune donnée personnelle : chaque texte est filtré (e-mails, numéros de
 * téléphone, IBAN, jetons) AVANT d'être écrit. Pas de prestataire externe (décision du
 * 26/11/2026) ; un outil comme Sentry pourra lire ces mêmes événements plus tard.
 */
type Level = "info" | "warn" | "error";
type Value = string | number | boolean | null | undefined;

const PATTERNS: [RegExp, string][] = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]"],
  [/\bCI\d{2}(?:\s?[A-Z0-9]){10,30}\b/gi, "[iban]"],
  [/\b[0-9a-f]{32,}\b/gi, "[jeton]"],
  // Numéros ivoiriens : 225 + 10 chiffres, ou 0X XX XX XX XX (espaces facultatifs).
  [/(?:\+?225[\s.-]?)?\b0[1-9](?:[\s.-]?\d{2}){4}\b/g, "[tel]"],
  [/\b225\d{10}\b/g, "[tel]"],
];

export function redact(s: string): string {
  let out = s;
  for (const [re, label] of PATTERNS) out = out.replace(re, label);
  return out.slice(0, 500);
}

function write(level: Level, event: string, fields: Record<string, Value> = {}) {
  const entry: Record<string, Value> = { ts: new Date().toISOString(), level, event };
  for (const [k, v] of Object.entries(fields)) entry[k] = typeof v === "string" ? redact(v) : v;
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: Record<string, Value>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, Value>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, Value>) => write("error", event, fields),
};

/** Message d'erreur sûr pour un journal. */
export const errorText = (e: unknown) => redact(e instanceof Error ? e.message : typeof e === "string" ? e : "erreur inconnue");

/** IP tronquée (réseau /24 en IPv4, /48 en IPv6) : utile pour repérer une attaque, sans identifier une personne. */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "inconnue";
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".0/24";
  return ip.split(":").slice(0, 3).join(":") + "::/48";
}
