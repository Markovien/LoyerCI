import { describe, expect, it } from "vitest";
import { computeCrc16, isValidPispiQrPayload } from "@pi-spi/qrcode";
import { parseTags, staticPosterPayload } from "@/lib/payments/pispi-qr";

const ALIAS = "3497a720-ab11-4973-9619-534e04f263a1";

describe("QR PI-SPI de l'affiche de guichet (P1.7)", () => {
  it("CRC16-CCITT-FALSE : valeur de contrôle normalisée (« 123456789 » -> 29B1)", () => {
    expect(computeCrc16("123456789")).toBe("29B1");
  });

  it("payload statique conforme : schéma, MCC, devise, pays, référence, canal statique, sans montant", () => {
    const p = staticPosterPayload(ALIAS, "AKW-GUICHET");
    const t = parseTags(p);
    expect(t.get("00")).toBe("01");
    expect(t.get("36")).toBe(`0012int.bceao.pi0136${ALIAS}`);
    expect(t.get("52")).toBe("0000");
    expect(t.get("53")).toBe("952");
    expect(t.get("58")).toBe("CI");
    expect(t.has("54")).toBe(false);
    expect(t.get("62")).toBe("0511AKW-GUICHET1103000");
    expect(p.slice(-8, -4)).toBe("6304");
    expect(isValidPispiQrPayload(p).valid).toBe(true);
  });

  it("refuse un numéro de téléphone ou une adresse invalide", () => {
    expect(() => staticPosterPayload("+2250707000111", "X")).toThrow();
    expect(() => staticPosterPayload("6f1c2b8e-1d2a-1b3c-8d4e-123456789abc", "X")).toThrow(); // pas un UUID v4
  });

  it("référence nettoyée et bornée à 25 caractères", () => {
    const t = parseTags(staticPosterPayload(ALIAS, "Akwaba Immobilier – guichet de Cocody Riviera"));
    const ref = parseTags(t.get("62")!).get("05")!;
    expect(ref.length).toBeLessThanOrEqual(25);
    expect(ref).toMatch(/^[A-Z0-9_-]+$/);
  });
});
