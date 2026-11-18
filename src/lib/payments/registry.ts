import "server-only";
import { serverEnv } from "@/lib/env";
import { createCinetPay } from "./cinetpay";
import { ProviderError, type PaymentProvider, type ProviderName } from "./types";

/**
 * Point d'extension : brancher ici un adaptateur PI-SPI (API-Business BCEAO) ou Wave
 * Checkout direct, en implémentant l'interface PaymentProvider. Aucun autre fichier
 * (webhook, Server Actions, base) n'a besoin de changer.
 */
export function getProvider(name: ProviderName = "cinetpay"): PaymentProvider {
  const env = serverEnv();
  switch (name) {
    case "cinetpay":
      if (!env.CINETPAY_API_KEY || !env.CINETPAY_SITE_ID || !env.CINETPAY_SECRET_KEY) {
        throw new ProviderError("Paiement via CinetPay non activé");
      }
      return createCinetPay({ apiKey: env.CINETPAY_API_KEY, siteId: env.CINETPAY_SITE_ID, secretKey: env.CINETPAY_SECRET_KEY });
    default:
      throw new Error(`Fournisseur « ${name} » non configuré`);
  }
}

export function isProviderConfigured(name: ProviderName): boolean {
  const env = serverEnv();
  return name === "cinetpay" && !!(env.CINETPAY_API_KEY && env.CINETPAY_SITE_ID && env.CINETPAY_SECRET_KEY);
}

export function isAllowedCheckoutUrl(url: string, provider: PaymentProvider): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && provider.checkoutHosts.includes(u.hostname);
  } catch {
    return false;
  }
}
