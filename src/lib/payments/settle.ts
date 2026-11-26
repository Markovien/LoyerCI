import "server-only";
import type { supabaseAdmin } from "@/lib/supabase/admin";
import type { PaymentProvider, VerifiedTransaction } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;

/**
 * Impute une transaction APRÈS revérification serveur-à-serveur auprès du fournisseur
 * (seule source de vérité sur le statut et le montant). Partagé par le webhook et la
 * réconciliation de secours (P4.2) : une seule règle d'imputation. Lève en cas d'erreur.
 */
export async function settleVerified(admin: Admin, provider: PaymentProvider, tx: VerifiedTransaction, ip: string | null): Promise<string> {
  if (tx.status === "accepted") {
    const { data, error } = await admin.rpc("confirm_provider_payment", {
      p_provider: provider.name,
      p_tx_id: tx.transactionId,
      p_amount: tx.amount,
      p_currency: tx.currency,
      p_operator: tx.operator,
      p_ip: ip,
      p_meta: { verification: tx.raw },
    });
    if (error) throw error;
    return String(data);
  }
  if (tx.status === "refused") {
    const { data, error } = await admin.rpc("fail_provider_payment", {
      p_provider: provider.name,
      p_tx_id: tx.transactionId,
      p_reason: "refuse_par_operateur",
      p_ip: ip,
    });
    if (error) throw error;
    return String(data);
  }
  return "en_attente";
}

/** Une intention sans réponse du fournisseur au-delà de ce délai est close (avis de nouveau payable). */
export const INTENT_EXPIRY_MS = 48 * 3600_000;

export interface StaleIntent {
  provider_transaction_id: string;
  created_at: string;
}

/**
 * P4.2 — Réconciliation de secours : pour chaque intention restée « initiée » plus de
 * 30 minutes (webhook perdu), on interroge le fournisseur et on impute comme le webhook.
 * Toujours en attente après 48 h : l'intention est close (« expire_sans_reponse »).
 */
export async function reconcileIntents(
  admin: Admin,
  provider: PaymentProvider,
  intents: StaleIntent[],
  now = Date.now(),
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  for (const i of intents) {
    try {
      const tx = await provider.verifyTransaction(i.provider_transaction_id);
      let outcome = await settleVerified(admin, provider, tx, null);
      if (outcome === "en_attente" && now - Date.parse(i.created_at) > INTENT_EXPIRY_MS) {
        const { data, error } = await admin.rpc("fail_provider_payment", {
          p_provider: provider.name,
          p_tx_id: i.provider_transaction_id,
          p_reason: "expire_sans_reponse",
          p_ip: null,
        });
        if (error) throw error;
        outcome = `expire:${String(data)}`;
      }
      bump(outcome);
    } catch {
      bump("erreur"); // retentée à la prochaine exécution
    }
  }
  return counts;
}
