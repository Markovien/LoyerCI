import "server-only";
import { buildPayloadString, computeCrc16, isValidPispiQrPayload } from "@pi-spi/qrcode";

/** Adresse de paiement PI-SPI : seul identifiant autorisé dans un QR (jamais un numéro de téléphone). */
export const PISPI_PAYMENT_ADDRESS = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Payload EMV d'un QR PI-SPI STATIQUE pour l'affiche de guichet (invariant 8 : présentiel
 * uniquement). Bibliothèque officielle BCEAO `@pi-spi/qrcode` ; aucun montant n'est jamais
 * encodé (le locataire saisit le montant et la référence de son avis). Le résultat est
 * revalidé par le validateur officiel avant d'être imprimé.
 */
export function staticPosterPayload(alias: string, referenceLabel: string): string {
  if (!PISPI_PAYMENT_ADDRESS.test(alias)) throw new Error("Adresse de paiement PI-SPI invalide");
  const ref = referenceLabel
    .normalize("NFD")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .toUpperCase()
    .slice(0, 25);
  if (!ref) throw new Error("Référence de l'affiche vide");
  const payload = buildPayloadString({ alias: alias.toLowerCase(), countryCode: "CI", qrType: "STATIC", referenceLabel: ref });
  const check = isValidPispiQrPayload(payload);
  if (!check.valid) throw new Error(`Payload PI-SPI refusée par le validateur officiel : ${check.errors.join(", ")}`);
  // Contrôle indépendant du CRC16-CCITT (0x1021 / 0xFFFF) et de l'absence de montant (tag 54).
  if (computeCrc16(payload.slice(0, -4)) !== payload.slice(-4)) throw new Error("CRC PI-SPI incohérent");
  if (parseTags(payload).has("54")) throw new Error("Un QR d'affiche ne doit jamais contenir de montant");
  return payload;
}

/** Découpe EMV de premier niveau (id 2 chiffres, longueur 2 chiffres, valeur). */
export function parseTags(payload: string): Map<string, string> {
  const tags = new Map<string, string>();
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isInteger(len)) throw new Error("Payload EMV malformée");
    tags.set(id, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return tags;
}

/** Marqueur du schéma PI-SPI : sert aux garde-fous (aucune page locataire ne doit le contenir). */
export const PISPI_SCHEME = "int.bceao.pi";
