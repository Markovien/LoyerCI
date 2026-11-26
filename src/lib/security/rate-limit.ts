import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/security/crypto";
import { errorText, log } from "@/lib/log";

export type LimitResult = { ok: boolean; retryAfterSec: number };

/**
 * P4.1 — Limiteur de débit PARTAGÉ entre instances : compteurs dans PostgreSQL (fonction
 * atomique public.rate_limit_hit, fenêtre glissante approchée). La clé est hachée avant
 * d'être envoyée : aucune IP ni adresse e-mail n'est stockée en clair.
 *
 * Si la base est injoignable, repli sur le limiteur local (en mémoire) plutôt que de tout
 * laisser passer : chaque instance garde au moins sa propre protection.
 */
export async function limit(key: string, max: number, windowMs: number): Promise<LimitResult> {
  try {
    const { data, error } = await supabaseAdmin()
      .rpc("rate_limit_hit", { p_key_hash: sha256Hex(key), p_max: max, p_window_ms: windowMs })
      .single();
    if (error || !data) throw new Error(error?.message ?? "réponse vide");
    return { ok: data.ok, retryAfterSec: data.retry_after_sec };
  } catch (e) {
    log.error("rate_limit_fallback", { erreur: errorText(e) });
    return limitLocal(key, max, windowMs);
  }
}

/**
 * Limiteur local à fenêtre glissante (repli et tests). Garde-fou mémoire : éviction des clés
 * les plus anciennes ; un effacement total permettrait de remettre à zéro TOUS les compteurs.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 50_000;

export function limitLocal(key: string, max: number, windowMs: number, now = Date.now()): LimitResult {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const retryAfterSec = Math.ceil((windowMs - (now - hits[0]!)) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  buckets.delete(key); // réinsertion : la Map reste triée de la moins à la plus récemment utilisée
  buckets.set(key, hits);
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  return { ok: true, retryAfterSec: 0 };
}
