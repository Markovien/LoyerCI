/** Cellule CSV (séparateur « ; ») ; neutralise l'injection de formules à l'ouverture dans un tableur. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvDocument(rows: (string | number | boolean | null | undefined)[][]): string {
  // BOM : Excel reconnaît l'UTF-8 (accents) ; CRLF : fin de ligne attendue par les tableurs.
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
