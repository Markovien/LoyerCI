import { describe, expect, it } from "vitest";
import { cinetpayToken, createCinetPay, CINETPAY_HMAC_FIELDS } from "@/lib/payments/cinetpay";
import { isValidPaymentReference, referenceChecksum } from "@/lib/payments/reference";
import { hmacSha256Hex, safeEqualHex, verifyTimestampedSignature } from "@/lib/security/crypto";

const SECRET = "secret-de-test-cinetpay-0123456789";
const provider = createCinetPay({ apiKey: "apikey-test-123", siteId: "105889", secretKey: SECRET });

function notification(overrides: Record<string, string> = {}) {
  const form = new URLSearchParams({
    cpm_site_id: "105889", cpm_trans_id: "LCIM9XK2A1B2C3D4E5F6", cpm_trans_date: "2026-05-03 10:12:44",
    cpm_amount: "450000", cpm_currency: "XOF", signature: "abc", payment_method: "WAVECI",
    cel_phone_num: "0707123456", cpm_phone_prefixe: "225", cpm_language: "fr", cpm_version: "V4",
    cpm_payment_config: "Single", cpm_page_action: "Payment", cpm_custom: "", cpm_designation: "Loyer",
    cpm_error_message: "", ...overrides,
  });
  return form;
}

describe("webhook CinetPay : HMAC x-token", () => {
  it("accepte une notification correctement signée", () => {
    const form = notification();
    const headers = new Headers({ "x-token": cinetpayToken(form, SECRET) });
    expect(provider.verifySignature(form.toString(), headers)).toBe(true);
  });

  it("rejette une requête simulée sans jeton ou avec un mauvais secret", () => {
    const form = notification();
    expect(provider.verifySignature(form.toString(), new Headers())).toBe(false);
    expect(provider.verifySignature(form.toString(), new Headers({ "x-token": cinetpayToken(form, "autre-secret-xxxxxxxx") }))).toBe(false);
  });

  it("rejette une notification dont le montant a été altéré après signature", () => {
    const signed = notification();
    const token = cinetpayToken(signed, SECRET);
    const tampered = notification({ cpm_amount: "5" });
    expect(provider.verifySignature(tampered.toString(), new Headers({ "x-token": token }))).toBe(false);
  });

  it("respecte l'ordre officiel des 16 champs", () => {
    expect(CINETPAY_HMAC_FIELDS).toHaveLength(16);
    const form = notification();
    const data = CINETPAY_HMAC_FIELDS.map((f) => form.get(f) ?? "").join("");
    expect(cinetpayToken(form, SECRET)).toBe(hmacSha256Hex(SECRET, data));
  });

  it("refuse un site_id étranger", () => {
    expect(() => provider.parseWebhook(notification({ cpm_site_id: "999999" }).toString(), new Headers())).toThrow();
  });
});

describe("signature horodatée (PI-SPI / Wave)", () => {
  const body = '{"id":"evt_1","amount":450000}';
  it("accepte une signature fraîche, rejette le rejeu et la falsification", () => {
    const now = Date.UTC(2026, 4, 3, 10, 0, 0);
    const t = Math.floor(now / 1000);
    const header = `t=${t},v1=${hmacSha256Hex(SECRET, `${t}.${body}`)}`;
    expect(verifyTimestampedSignature(header, body, SECRET, { now })).toBe(true);
    expect(verifyTimestampedSignature(header, body, SECRET, { now: now + 10 * 60_000 })).toBe(false);
    expect(verifyTimestampedSignature(header, body.replace("450000", "5"), SECRET, { now })).toBe(false);
    expect(verifyTimestampedSignature(null, body, SECRET, { now })).toBe(false);
  });

  it("compare à temps constant et refuse les entrées non hexadécimales", () => {
    expect(safeEqualHex("ab12", "AB12")).toBe(true);
    expect(safeEqualHex("ab12", "ab13")).toBe(false);
    expect(safeEqualHex("ab12", "zz")).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
  });
});

describe("référence de virement", () => {
  it("produit la même clé que la base de données", () => {
    // Valeur obtenue par private.ref_checksum('LOYER-2026-05-VCR01') dans les tests SQL
    expect(referenceChecksum("LOYER-2026-05-VCR01")).toBe("96");
    expect(isValidPaymentReference("LOYER-2026-05-VCR01-96")).toBe(true);
  });

  it("détecte une faute de frappe ou une inversion", () => {
    expect(isValidPaymentReference("LOYER-2026-05-VCR02-96")).toBe(false);
    expect(isValidPaymentReference("LOYER-2026-50-VCR01-96")).toBe(false);
    expect(isValidPaymentReference("LOYER-2026-05-VRC01-96")).toBe(false);
  });
});

describe("durcissement (audit 18/11/2026)", () => {
  it("détecte les noms PDF actifs même échappés en #xx", async () => {
    const { pdfLooksActive } = await import("@/lib/security/files");
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(pdfLooksActive(enc("%PDF-1.7 1 0 obj << /OpenAction 2 0 R >>"))).toBe(true);
    expect(pdfLooksActive(enc("%PDF-1.7 1 0 obj << /S /J#61vaScript /JS (app.alert(1)) >>"))).toBe(true);
    expect(pdfLooksActive(enc("%PDF-1.7 1 0 obj << /Type /Catalog /Pages 2 0 R >>"))).toBe(false);
  });

  it("le limiteur évince les clés anciennes sans remettre à zéro les compteurs actifs", async () => {
    const { limit } = await import("@/lib/security/rate-limit");
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(limit("cible", 3, 60_000, now).ok).toBe(true);
    expect(limit("cible", 3, 60_000, now).ok).toBe(false);
    for (let i = 0; i < 50_100; i++) limit(`bruit:${i}`, 1, 60_000, now);
    // La clé « cible » a été évincée (la plus ancienne) : comportement attendu et borné,
    // mais aucune remise à zéro globale ne survient pendant l'inondation.
    expect(limit("bruit:50099", 1, 60_000, now).ok).toBe(false);
  });

  it("normalise l'e-mail de connexion en minuscules", async () => {
    const { loginSchema } = await import("@/lib/validation/schemas");
    expect(loginSchema.parse({ email: "  Jm.Kouassi@Exemple.CI " }).email).toBe("jm.kouassi@exemple.ci");
  });
});
