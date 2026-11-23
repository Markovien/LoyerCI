import { describe, expect, it } from "vitest";
import { avisMessage, quittanceMessage } from "@/lib/documents/messages";

const verifyUrl = "https://loyerci.ci/verify/6f1c2b8e-1d2a-4b3c-8d4e-123456789abc?c=6bf9594eab113521";
const PAYMENT_DATA = [/CI\d{2}[A-Z0-9]{4}/, /(?:\+?225)?\s?0[157](?:\s?\d{2}){4}/, /wa\.me|int\.bceao\.pi|\*\d{3}#|\/pay\//];

describe("messages d'envoi des documents (D.2)", () => {
  const avis = avisMessage({
    tenantName: "Kouassi Jean-Marc",
    landlordName: "Akwaba Immobilier",
    period: "2026-12-01",
    amountDue: 450000,
    dueDate: "2026-12-05",
    reference: "LOYER-2026-12-VCR01-08",
    verifyUrl,
  });
  const quittance = quittanceMessage({
    tenantName: "Kouassi Jean-Marc",
    landlordName: "Akwaba Immobilier",
    period: "2026-11-01",
    amount: 450000,
    receiptNumber: "AKW-2026-000007",
    verifyUrl,
  });

  it("contiennent l'essentiel et le lien de vérification", () => {
    expect(avis).toContain("LOYER-2026-12-VCR01-08");
    expect(avis).toMatch(/450\s?000/);
    expect(avis).toContain("5 décembre 2026");
    expect(avis).toContain(verifyUrl);
    expect(quittance).toContain("AKW-2026-000007");
    expect(quittance).toContain(verifyUrl);
  });

  it("ne contiennent JAMAIS de coordonnée de paiement (invariant n° 9)", () => {
    for (const text of [avis, quittance]) {
      for (const re of PAYMENT_DATA) expect(text).not.toMatch(re);
      expect(text).toContain("ne vous demandera jamais votre code Mobile Money");
    }
  });
});
