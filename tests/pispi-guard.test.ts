import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Invariant 8 (interdiction BCEAO du QR à distance) : le QR PI-SPI n'est produit QUE par
 * la route de l'affiche de guichet. Toute autre utilisation doit être ajoutée consciemment ici.
 */
const ROOT = join(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const src = files(join(ROOT, "src")).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") }));
const using = (re: RegExp) =>
  src
    .filter((f) => re.test(f.text))
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));

describe("garde-fou QR PI-SPI (invariant 8)", () => {
  it("la bibliothèque officielle n'est importée que par le module de l'affiche", () => {
    expect(using(/from "@pi-spi\/qrcode"/)).toEqual(["src/lib/payments/pispi-qr.ts"]);
  });
  it("le module de payload n'est utilisé que par la route de l'affiche", () => {
    expect(using(/@\/lib\/payments\/pispi-qr"/)).toEqual(["src/app/api/pispi-poster/route.ts"]);
  });
  it("le schéma int.bceao.pi n'apparaît nulle part ailleurs", () => {
    expect(using(/int\.bceao\.pi/)).toEqual(["src/lib/payments/pispi-qr.ts"]);
  });
  it("aucun composant client ne touche au QR PI-SPI", () => {
    const client = src.filter((f) => /^["']use client["']/.test(f.text));
    expect(client.filter((f) => /pispi-qr|@pi-spi\/qrcode|pispi-poster-pdf/.test(f.text)).map((f) => f.path)).toEqual([]);
  });
});
