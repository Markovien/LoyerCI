import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmacSha256Hex(secret: string, data: string | Buffer): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Comparaison à temps constant de deux chaînes hexadécimales (anti attaque temporelle). */
export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b)) return false;
  const ba = Buffer.from(a.toLowerCase(), "hex");
  const bb = Buffer.from(b.toLowerCase(), "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Vérifie une signature horodatée « t=<unix>,v1=<hex> » (format répandu : Stripe, Wave…)
 * calculée sur `${t}.${rawBody}`. La fenêtre de tolérance bloque le rejeu de vieilles requêtes.
 */
export function verifyTimestampedSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  { toleranceSec = 300, now = Date.now() }: { toleranceSec?: number; now?: number } = {},
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...v] = kv.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = hmacSha256Hex(secret, `${t}.${rawBody}`);
  return safeEqualHex(expected, parts.v1 ?? "");
}

/** Identifiant de transaction marchand : alphanumérique, non devinable, ≤ 32 caractères. */
export function newTransactionId(prefix = "LCI"): string {
  return `${prefix}${Date.now().toString(36)}${randomBytes(8).toString("hex")}`.toUpperCase();
}
