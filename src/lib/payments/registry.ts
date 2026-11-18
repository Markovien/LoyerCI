import "server-only";
import { serverEnv } from "@/lib/env";
import { createCinetPay } from "./cinetpay";
import type { PaymentProvider, ProviderName } from "./types";

/**
 * Point d'extension : brancher ici un adaptateur PI-SPI (API-Business BCEAO) ou Wave
 * Checkout direct, en implémentant l'interface PaymentProvider. Aucun autre fichier
 * (webhook, Server Actions, base) n'a besoin de changer.
 */
export function getProvider(name: ProviderName = "cinetpay"): PaymentProvider {
  const env = serverEnv();
  switch (name) {
    case "cinetpay":
      return createCinetPay({ apiKey: env.CINETPAY_API_KEY, siteId: env.CINETPAY_SITE_ID, secretKey: env.CINETPAY_SECRET_KEY });
    default:
      throw new Error(`Fournisseur « ${name} » non configuré`);
  }
}

export function isAllowedCheckoutUrl(url: string, provider: PaymentProvider): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && provider.checkoutHosts.includes(u.hostname);
  } catch {
    return false;
  }
}
