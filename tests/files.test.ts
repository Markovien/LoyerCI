import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "@/lib/security/files";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));

function segment(marker: number, payload: string) {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...Buffer.from(payload, "latin1")];
}

function chunk(type: string, data: string) {
  const len = data.length;
  return [len >>> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...Buffer.from(type + data, "latin1"), 0, 0, 0, 0];
}

describe("retrait des métadonnées des preuves", () => {
  it("JPEG : retire EXIF (GPS), XMP, IPTC et commentaires, conserve l'image", () => {
    const jpeg = bytes(
      [0xff, 0xd8],
      segment(0xe0, "JFIF\0"),
      segment(0xe1, "Exif\0\0GPSLatitude=5.3600N;GPSLongitude=4.0083W"),
      segment(0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Abidjan</x:xmpmeta>"),
      segment(0xed, "Photoshop 3.0\0IPTC"),
      segment(0xfe, "commentaire"),
      segment(0xdb, "QUANT"),
      [0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0xaa, 0xbb, 0xcc, 0xff, 0xd9],
    );
    const out = stripImageMetadata(jpeg, "jpg")!;
    const text = Buffer.from(out).toString("latin1");
    expect(text).not.toMatch(/GPS|Exif|xmpmeta|IPTC|commentaire/);
    expect(text).toContain("JFIF");
    expect(text).toContain("QUANT");
    expect([...out.subarray(-7)]).toEqual([0x01, 0x02, 0xaa, 0xbb, 0xcc, 0xff, 0xd9]);
  });

  it("PNG : retire eXIf/tEXt/iTXt/zTXt/tIME, conserve IHDR/IDAT/IEND", () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      chunk("IHDR", "hdr0123456789"),
      chunk("tEXt", "Comment\0Cocody"),
      chunk("eXIf", "GPS"),
      chunk("iTXt", "XML:com.adobe.xmp"),
      chunk("IDAT", "pixels"),
      chunk("IEND", ""),
    );
    const text = Buffer.from(stripImageMetadata(png, "png")!).toString("latin1");
    expect(text).not.toMatch(/Cocody|GPS|adobe/);
    expect(text).toMatch(/IHDR[\s\S]*IDAT[\s\S]*IEND/);
  });

  it("refuse une structure incohérente", () => {
    expect(stripImageMetadata(bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), "jpg")).toBeNull();
    expect(stripImageMetadata(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], chunk("IHDR", "x").slice(0, 6)), "png")).toBeNull();
  });
});

describe("déclaration de paiement direct (Zod)", () => {
  it("valide la forme et normalise le numéro payeur", async () => {
    const { directPaymentSchema } = await import("@/lib/validation/schemas");
    const base = {
      invoiceId: "6f1c2b8e-1d2a-4b3c-8d4e-123456789abc",
      operator: "orange",
      amount: "450000",
      txnRef: " MP261120.1234.A00001 ",
    };
    const ok = directPaymentSchema.parse({ ...base, payerPhone: "07 07 12 34 56" });
    expect(ok.txnRef).toBe("MP261120.1234.A00001");
    expect(ok.payerPhone).toBe("2250707123456");
    expect(directPaymentSchema.parse({ ...base, payerPhone: "" }).payerPhone).toBeUndefined();
    expect(directPaymentSchema.safeParse({ ...base, payerPhone: "27 22 44 55 66" }).success).toBe(false); // fixe
    expect(directPaymentSchema.safeParse({ ...base, txnRef: "MP 1234" }).success).toBe(false);
    expect(directPaymentSchema.safeParse({ ...base, amount: "450000.5" }).success).toBe(false);
  });
});
