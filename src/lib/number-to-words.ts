/**
 * Montant en toutes lettres (français, règles de 1990 simplifiées), pour la quittance.
 * Ex. 450000 -> « quatre cent cinquante mille »
 */
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number): string {
  if (n <= 16) return UNITS[n]!;
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[t]!;
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${below100(n - 60)}`;
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${below100(n - 80)}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  if (h === 0) return below100(r);
  const head = h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 ? "s" : ""}`;
  return r === 0 ? head : `${head} ${below100(r)}`;
}

export function amountInWords(amount: number): string {
  if (!Number.isInteger(amount) || amount < 0 || amount >= 1e12) throw new RangeError("Montant hors limites");
  if (amount === 0) return "zéro";
  const parts: string[] = [];
  const billions = Math.floor(amount / 1e9);
  const millions = Math.floor((amount % 1e9) / 1e6);
  const thousands = Math.floor((amount % 1e6) / 1e3);
  const rest = amount % 1e3;
  if (billions) parts.push(`${below1000(billions)} milliard${billions > 1 ? "s" : ""}`);
  if (millions) parts.push(`${below1000(millions)} million${millions > 1 ? "s" : ""}`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${below1000(thousands).replace(/(cent|vingt)s$/, "$1")} mille`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}
