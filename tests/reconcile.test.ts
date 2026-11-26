import { describe, expect, it } from "vitest";
import { INTENT_EXPIRY_MS, reconcileIntents } from "@/lib/payments/settle";
import type { PaymentProvider, VerifiedTransaction } from "@/lib/payments/types";

type Call = { fn: string; args: Record<string, unknown> };

function fakeAdmin(calls: Call[]) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: fn === "confirm_provider_payment" ? "confirme" : "echoue", error: null });
    },
  } as never;
}

function fakeProvider(status: Record<string, VerifiedTransaction["status"] | "boom">): PaymentProvider {
  return {
    name: "cinetpay",
    checkoutHosts: [],
    initPayment: () => Promise.reject(new Error("non utilisé")),
    verifySignature: () => false,
    parseWebhook: () => ({ transactionId: "" }),
    verifyTransaction: (id) =>
      status[id] === "boom"
        ? Promise.reject(new Error("fournisseur indisponible"))
        : Promise.resolve({
            transactionId: id,
            status: status[id] as VerifiedTransaction["status"],
            amount: 450000,
            currency: "XOF",
            operator: "orange",
            raw: {},
          }),
  };
}

describe("réconciliation de secours (P4.2)", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const recent = new Date(now - 3600_000).toISOString();
  const old = new Date(now - INTENT_EXPIRY_MS - 1000).toISOString();

  it("impute comme le webhook (montant revérifié), ferme les intentions muettes > 48 h, retente les erreurs", async () => {
    const calls: Call[] = [];
    const counts = await reconcileIntents(
      fakeAdmin(calls),
      fakeProvider({ OK: "accepted", KO: "refused", WAIT: "pending", OLD: "pending", ERR: "boom" }),
      [
        { provider_transaction_id: "OK", created_at: recent },
        { provider_transaction_id: "KO", created_at: recent },
        { provider_transaction_id: "WAIT", created_at: recent },
        { provider_transaction_id: "OLD", created_at: old },
        { provider_transaction_id: "ERR", created_at: recent },
      ],
      now,
    );
    expect(counts).toEqual({ confirme: 1, echoue: 1, en_attente: 1, "expire:echoue": 1, erreur: 1 });
    expect(calls.find((c) => c.fn === "confirm_provider_payment")?.args).toMatchObject({ p_tx_id: "OK", p_amount: 450000 });
    expect(calls.filter((c) => c.fn === "fail_provider_payment").map((c) => c.args.p_reason)).toEqual([
      "refuse_par_operateur",
      "expire_sans_reponse",
    ]);
  });
});
