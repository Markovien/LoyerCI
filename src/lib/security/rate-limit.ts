import "server-only";

/**
 * Limiteur à fenêtre glissante, en mémoire.
 * ⚠️ En production multi-instances / serverless, remplacer le stockage par Redis
 * (ex. Upstash Ratelimit) : l'interface `limit()` reste identique.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 50_000;

export function limit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const retryAfterSec = Math.ceil((windowMs - (now - hits[0]!)) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  buckets.delete(key); // réinsertion : la Map reste triée de la moins à la plus récemment utilisée
  buckets.set(key, hits);
  // Garde-fou mémoire : on évince les clés les plus anciennes. Un effacement total
  // permettrait à un attaquant de remettre à zéro TOUS les compteurs en inondant de clés.
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  return { ok: true, retryAfterSec: 0 };
}
