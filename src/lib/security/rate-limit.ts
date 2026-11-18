import "server-only";

/**
 * Limiteur à fenêtre glissante, en mémoire.
 * ⚠️ En production multi-instances / serverless, remplacer le stockage par Redis
 * (ex. Upstash Ratelimit) : l'interface `limit()` reste identique.
 */
const buckets = new Map<string, number[]>();

export function limit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const retryAfterSec = Math.ceil((windowMs - (now - hits[0]!)) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 50_000) buckets.clear(); // garde-fou mémoire
  return { ok: true, retryAfterSec: 0 };
}
