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
  // Les noms PDF acceptent les échappements « #xx » (/J#61vaScript = /JavaScript) : on les décode.
  const text = Buffer.from(bytes)
    .toString("latin1")
    .replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return /\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile|AA|RichMedia|XFA|SubmitForm|ImportData|GoToR|GoToE)\b/.test(text);
}

/**
 * Retire les métadonnées d'une image SANS la décoder (aucune dépendance native) :
 *  - JPEG : segments APP1 (EXIF, dont la position GPS, et XMP), APP13 (IPTC) et COM ;
 *  - PNG  : chunks eXIf, tEXt, iTXt, zTXt et tIME.
 * Les données d'image ne sont pas modifiées. Minimisation (loi n° 2013-450) : une
 * photo de reçu prise au téléphone révèle sinon le domicile du locataire.
 * Renvoie null si la structure est incohérente (fichier refusé).
 */
export function stripImageMetadata(bytes: Uint8Array, ext: "jpg" | "png"): Uint8Array | null {
  return ext === "jpg" ? stripJpeg(bytes) : stripPng(bytes);
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    } // octets de remplissage
    if (marker === 0xda) {
      out.push(b.subarray(i));
      return concat(out);
    } // SOS : données d'image jusqu'à la fin
    if (marker === 0xd9) {
      out.push(b.subarray(i, i + 2));
      return concat(out);
    }
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2 || i + 2 + len > b.length) return null;
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

function stripPng(b: Uint8Array): Uint8Array | null {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    const end = i + 12 + len;
    if (end > b.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(out);
  }
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    res.set(p, o);
    o += p.length;
  }
  return res;
}

export type ProofResult = { ok: true; bytes: Uint8Array; kind: ProofKind } | { ok: false; message: string };

/**
 * Contrôle complet d'une preuve téléversée : taille, type réel par octets magiques,
 * PDF sans contenu actif, images débarrassées de leurs métadonnées.
 */
export async function inspectProof(file: File): Promise<ProofResult> {
  if (file.size > MAX_PROOF_BYTES) return { ok: false, message: "Fichier trop volumineux (5 Mo maximum)." };
  const raw = new Uint8Array(await file.arrayBuffer());
  const kind = sniffProof(raw);
  if (!kind) return { ok: false, message: "Format non reconnu. Envoyez un PDF, JPG ou PNG." };
  if (kind.ext === "pdf") {
    return pdfLooksActive(raw)
      ? { ok: false, message: "PDF refusé (contenu actif). Exportez un PDF simple ou une photo." }
      : { ok: true, bytes: raw, kind };
  }
  const bytes = stripImageMetadata(raw, kind.ext);
  return bytes ? { ok: true, bytes, kind } : { ok: false, message: "Image illisible. Réessayez avec une autre capture." };
}
