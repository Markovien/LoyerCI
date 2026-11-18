import "server-only";

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export type ProofKind = { ext: "pdf" | "jpg" | "png"; mime: string };

/**
 * Détermine le type RÉEL d'un fichier par ses octets magiques. On ignore le nom et le
 * Content-Type fournis par le navigateur, tous deux contrôlés par l'attaquant.
 */
export function sniffProof(bytes: Uint8Array): ProofKind | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return { ext: "pdf", mime: "application/pdf" }; // %PDF-
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" };
  if (startsWith([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  return null;
}

/** Refuse les PDF contenant du JavaScript ou des actions automatiques (vecteurs d'attaque courants). */
export function pdfLooksActive(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString("latin1");
  return /\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile|AA)\b/.test(text);
}
