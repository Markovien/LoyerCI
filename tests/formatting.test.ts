import { describe, expect, it } from "vitest";
import { formatPeriod, formatVerificationCode, formatXOF, formatXOFPlain } from "@/lib/format";
import { amountInWords } from "@/lib/number-to-words";
import { buildDueNoticeText, whatsappLink } from "@/lib/whatsapp";
import { ibanCI, loginSchema, phoneCI, reviewTransferSchema } from "@/lib/validation/schemas";
import { clientIpFrom } from "@/lib/security/request-context";
import { pdfLooksActive, sniffProof } from "@/lib/security/files";

describe("formats FCFA et dates", () => {
  it("formate les montants sans décimales", () => {
    expect(formatXOF(450000).replace(/\s/g, " ")).toBe("450 000 FCFA");
    expect(formatXOFPlain(1250000)).toBe("1 250 000 FCFA");
    expect(formatPeriod("2026-05-01")).toBe("mai 2026");
  });
  it("écrit les montants en toutes lettres", () => {
    expect(amountInWords(450000)).toBe("quatre cent cinquante mille");
    expect(amountInWords(265000)).toBe("deux cent soixante-cinq mille");
    expect(amountInWords(80000)).toBe("quatre-vingt mille");
    expect(amountInWords(1200000)).toBe("un million deux cent mille");
    expect(amountInWords(71)).toBe("soixante et onze");
  });
  it("met en forme le code de vérification", () => {
    expect(formatVerificationCode("a1b2c3d4e5f60718ffff")).toBe("A1B2-C3D4-E5F6-0718");
  });
});

describe("validation des entrées (Zod)", () => {
  it("normalise les numéros ivoiriens à 10 chiffres", () => {
    expect(phoneCI.parse("07 07 12 34 56")).toBe("2250707123456");
    expect(phoneCI.parse("+225 05 05 98 76 54")).toBe("2250505987654");
    expect(phoneCI.safeParse("06 12 34 56 78").success).toBe(false);
  });
  it("contrôle la clé des IBAN ivoiriens", () => {
    expect(ibanCI.safeParse("CI15 CI00 8011 1301 3400 1253 0091").success).toBe(true);
    expect(ibanCI.safeParse("CI15 CI00 8011 1301 3400 1253 0092").success).toBe(false);
  });
  it("exige un motif pour rejeter un virement", () => {
    const id = "6f1c1a8e-3b5d-4c2e-9f00-1a2b3c4d5e6f";
    expect(reviewTransferSchema.safeParse({ paymentId: id, decision: "rejeter" }).success).toBe(false);
    expect(reviewTransferSchema.safeParse({ paymentId: id, decision: "rejeter", reason: "Montant absent du relevé" }).success).toBe(true);
  });
  it("bloque les redirections ouvertes après connexion", () => {
    expect(loginSchema.parse({ email: "a@b.ci", next: "//evil.example" }).next).toBe("/dashboard");
    expect(loginSchema.parse({ email: "a@b.ci", next: "https://evil.example" }).next).toBe("/dashboard");
    expect(loginSchema.parse({ email: "a@b.ci", next: "/pay/abc-123" }).next).toBe("/pay/abc-123");
  });
});

describe("avis WhatsApp", () => {
  const notice = {
    tenantName: "Kouassi Jean-Marc",
    landlordName: "Akwaba Immobilier",
    propertyLabel: "Villa Duplex 5 pièces",
    period: "2026-05-01",
    amountDue: 450000,
    amountPaid: 0,
    dueDate: "2026-05-05",
    reference: "LOYER-2026-05-VCR01-96",
    payUrl: "https://loyerci.ci/pay/123",
    overdue: false,
  };
  it("génère un lien wa.me encodé, sans coordonnées bancaires", () => {
    const text = buildDueNoticeText(notice);
    expect(text).toContain("LOYER-2026-05-VCR01-96");
    expect(text).not.toMatch(/CI\d{2}/);
    const link = whatsappLink("2250707123456", text);
    expect(link.startsWith("https://wa.me/2250707123456?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1]!)).toBe(text);
  });
  it("refuse un numéro non normalisé", () => {
    expect(() => whatsappLink("0707123456", "x")).toThrow();
  });
});

describe("sécurité des requêtes et fichiers", () => {
  it("ne fait pas confiance à l'IP falsifiée en tête de X-Forwarded-For", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 41.66.10.20" });
    expect(clientIpFrom(h, "x-forwarded-for", 1)).toBe("41.66.10.20");
    expect(clientIpFrom(new Headers({ "x-real-ip": "pas-une-ip" }), "x-real-ip", 1)).toBeNull();
  });
  it("identifie le type réel d'un fichier par ses octets magiques", () => {
    expect(sniffProof(new TextEncoder().encode("%PDF-1.7 ..."))?.ext).toBe("pdf");
    expect(sniffProof(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffProof(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(pdfLooksActive(new TextEncoder().encode("%PDF-1.4 /OpenAction << /JS (app.alert(1)) >>"))).toBe(true);
  });
});
