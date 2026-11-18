import type { MobileOperator } from "@/lib/validation/schemas";
import type { Json } from "@/types/db";

export type ProviderName = "cinetpay" | "wave" | "pispi";

export interface InitPaymentInput {
  transactionId: string;
  amount: number; // FCFA entiers, calculés par la base
  description: string;
  operator: MobileOperator;
  customerName: string;
  customerPhone?: string;
  invoiceId: string;
  returnUrl: string;
  notifyUrl: string;
}

export interface VerifiedTransaction {
  transactionId: string;
  status: "accepted" | "refused" | "pending";
  amount: number;
  currency: string;
  operator: MobileOperator | null;
  raw: { [key: string]: Json | undefined };
}

export interface WebhookNotification {
  transactionId: string;
}

/**
 * Contrat commun à tous les agrégateurs (CinetPay aujourd'hui, PI-SPI / Wave direct demain).
 * Règle d'or : `parseWebhook` n'est JAMAIS une source de vérité sur le montant ou le statut ;
 * seule `verifyTransaction` (appel serveur-à-serveur) l'est.
 */
export interface PaymentProvider {
  readonly name: ProviderName;
  /** Domaines vers lesquels on accepte de rediriger le locataire (anti open-redirect). */
  readonly checkoutHosts: readonly string[];
  initPayment(input: InitPaymentInput): Promise<{ checkoutUrl: string }>;
  verifySignature(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string, headers: Headers): WebhookNotification;
  verifyTransaction(transactionId: string): Promise<VerifiedTransaction>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly retriable = false) {
    super(message);
    this.name = "ProviderError";
  }
}
