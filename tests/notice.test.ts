import { describe, expect, it } from "vitest";
import { NOTICE_PAYMENT_INSTRUCTION, NOTICE_SAFETY_WARNING, noticeAmounts, noticeRows, type NoticeRow } from "@/lib/documents/notice";

const n: NoticeRow = {
  id: "6f1c2b8e-1d2a-4b3c-8d4e-123456789abc",
  landlord_name: "Akwaba Immobilier",
  tenant_name: "Kouassi Jean-Marc",
  property_label: "Villa Duplex 5 pièces",
  property_location: "Riviera 3, Cocody, Abidjan",
  period: "2026-12-01",
  rent_amount: 450000,
  charges_amount: 0,
  amount_due: 450000,
  due_date: "2026-12-05",
  payment_reference: "LOYER-2026-12-VCR01-08",
  issued_at: "2026-11-22T10:00:00Z",
  content_hash: "a".repeat(64),
  signature: "b".repeat(64),
};

describe("avis d'échéance (D.1)", () => {
  it("contient la référence, l'échéance et le montant", () => {
    const all = [...noticeRows(n).flat(), ...noticeAmounts(n).flatMap((a) => [a.label, a.value])].join(" ");
    expect(all).toContain("LOYER-2026-12-VCR01-08");
    expect(all).toMatch(/450\s?000/);
    expect(all).toContain("5 décembre 2026");
  });

  it("ne contient JAMAIS de coordonnée de paiement (invariant n° 9)", () => {
    const all = [
      ...noticeRows(n).flat(),
      ...noticeAmounts(n).flatMap((a) => [a.label, a.value]),
      NOTICE_PAYMENT_INSTRUCTION,
      NOTICE_SAFETY_WARNING,
    ].join(" ");
    expect(all).not.toMatch(/CI\d{2}[A-Z0-9]{4}/); // IBAN
    expect(all).not.toMatch(/(?:\+?225)?\s?0[157](?:\s?\d{2}){4}/); // numéro Mobile Money
    expect(all).not.toMatch(/https?:\/\/|wa\.me|int\.bceao\.pi|\*\d{3}#/); // lien, QR PI-SPI, USSD
  });

  it("n'affiche pas de ligne Charges quand il n'y en a pas", () => {
    expect(noticeAmounts(n).map((a) => a.label)).toEqual(["Loyer", "TOTAL À PAYER"]);
  });
});
