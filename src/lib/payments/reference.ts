/**
 * Référence de virement : LOYER-AAAA-MM-<CODE BIEN>[-n]-<CLÉ>
 * La clé (base 36 modulo 97) est calculée par la base de données (private.ref_checksum).
 * Cette implémentation miroir permet de détecter une faute de frappe dès la saisie.
 */
export function referenceChecksum(base: string): string {
  let acc = 0;
  for (const c of base.replace(/-/g, "").toUpperCase()) {
    const v = /\d/.test(c) ? c.charCodeAt(0) - 48 : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : NaN;
    if (Number.isNaN(v)) throw new Error(`Caractère invalide : ${c}`);
    acc = (acc * 36 + v) % 97;
  }
  return String(acc).padStart(2, "0");
}

export function isValidPaymentReference(ref: string): boolean {
  const m = /^(LOYER-\d{4}-\d{2}-[A-Z0-9]{2,10}(?:-\d)?)-(\d{2})$/.exec(ref.trim().toUpperCase());
  return !!m && referenceChecksum(m[1]!) === m[2];
}
