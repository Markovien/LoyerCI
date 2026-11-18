import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/payments/registry";
import { ProviderError, type ProviderName } from "@/lib/payments/types";
import { sha256Hex } from "@/lib/security/crypto";
import { clientIpFrom } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;
const PROVIDERS: ProviderName[] = ["cinetpay"];

/** CinetPay « ping » l'URL de notification en GET pour vérifier sa disponibilité. */
export function GET() {
  return new NextResponse("ok", { status: 200 });
}

/**
 * Réception des notifications de paiement. Chaîne de confiance :
 *  1. Taille bornée, fournisseur connu, débit limité par IP.
 *  2. Signature HMAC-SHA256 vérifiée à temps constant sur le CORPS BRUT → sinon 401.
 *  3. Dédoublonnage : SHA-256 du corps brut, contrainte UNIQUE en base.
 *  4. Revérification serveur-à-serveur auprès du fournisseur (statut + montant) :
 *     le contenu du webhook n'est jamais cru sur parole.
 *  5. Imputation transactionnelle et idempotente en base (confirm_provider_payment).
 */
export async function POST(request: NextRequest) {
  const env = serverEnv();
  const ip = clientIpFrom(request.headers, env.CLIENT_IP_HEADER, env.TRUSTED_PROXY_HOPS);

  if (!limit(`webhook:${ip ?? "?"}`, 120, 60_000).ok) {
    return new NextResponse("too many requests", { status: 429 });
  }

  const providerName = (request.nextUrl.searchParams.get("provider") ?? "cinetpay") as ProviderName;
  if (!PROVIDERS.includes(providerName)) return new NextResponse("unknown provider", { status: 404 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return new NextResponse("payload too large", { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY) return new NextResponse("payload too large", { status: 413 });

  const provider = getProvider(providerName);

  if (!provider.verifySignature(rawBody, request.headers)) {
    // Pas d'écriture en base pour une requête non signée (évite le remplissage malveillant).
    console.warn(`[webhook] signature invalide · fournisseur=${providerName} · ip=${ip ?? "inconnue"}`);
    return new NextResponse("invalid signature", { status: 401 });
  }

  let transactionId: string;
  try {
    transactionId = provider.parseWebhook(rawBody, request.headers).transactionId;
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const admin = supabaseAdmin();
  const eventKey = sha256Hex(rawBody);
  const { data: inserted, error: insErr } = await admin
    .from("webhook_events")
    .upsert(
      { provider: providerName, event_key: eventKey, transaction_id: transactionId, signature_valid: true,
        payload: Object.fromEntries(new URLSearchParams(rawBody)) },
      { onConflict: "provider,event_key", ignoreDuplicates: true },
    )
    .select("id");
  if (insErr) return new NextResponse("storage error", { status: 500 }); // le fournisseur réessaiera
  if (!inserted || inserted.length === 0) return NextResponse.json({ status: "duplicate" });

  let outcome: string;
  try {
    const tx = await provider.verifyTransaction(transactionId);
    if (tx.status === "accepted") {
      const { data, error } = await admin.rpc("confirm_provider_payment", {
        p_provider: providerName, p_tx_id: transactionId, p_amount: tx.amount, p_currency: tx.currency,
        p_operator: tx.operator, p_ip: ip, p_meta: { verification: tx.raw },
      });
      if (error) throw error;
      outcome = String(data);
    } else if (tx.status === "refused") {
      const { data, error } = await admin.rpc("fail_provider_payment", {
        p_provider: providerName, p_tx_id: transactionId, p_reason: "refuse_par_operateur", p_ip: ip,
      });
      if (error) throw error;
      outcome = String(data);
    } else {
      outcome = "en_attente";
    }
  } catch (e) {
    const retriable = !(e instanceof ProviderError) || e.retriable;
    if (retriable) {
      // On libère la clé pour que la réémission du fournisseur soit retraitée.
      await admin.from("webhook_events").delete().eq("provider", providerName).eq("event_key", eventKey).is("processed_at", null);
      return new NextResponse("temporary error", { status: 503 });
    }
    await admin.from("webhook_events")
      .update({ outcome: `rejete: ${e instanceof Error ? e.message : "inconnu"}`.slice(0, 300), processed_at: new Date().toISOString() })
      .eq("provider", providerName).eq("event_key", eventKey);
    return NextResponse.json({ status: "rejected" });
  }

  await admin.from("webhook_events").update({ outcome, processed_at: new Date().toISOString() }).eq("provider", providerName).eq("event_key", eventKey);
  return NextResponse.json({ status: outcome });
}
