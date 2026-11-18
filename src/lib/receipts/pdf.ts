import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { ReceiptRow } from "@/types/database";
import { formatLongDate, formatPeriod, formatVerificationCode, formatXOFPlain } from "@/lib/format";
import { amountInWords } from "@/lib/number-to-words";

const GREEN = rgb(0.09, 0.42, 0.29);
const ORANGE = rgb(0.93, 0.49, 0.13);
const INK = rgb(0.13, 0.16, 0.15);
const MUTED = rgb(0.42, 0.45, 0.44);
const LINE = rgb(0.87, 0.88, 0.86);

const METHOD_LABELS: Record<string, string> = {
  mobile_money: "Mobile Money",
  virement: "Virement bancaire",
  especes: "Espèces",
};

/** Les polices standard PDF (WinAnsi) ne gèrent pas certaines espaces Unicode : on normalise. */
const clean = (s: string) => s.replace(/[   ]/g, " ").replace(/[^\x20-\x7e -ÿ€’]/g, "");

export function verifyUrl(appUrl: string, r: Pick<ReceiptRow, "id" | "signature">): string {
  return `${appUrl.replace(/\/$/, "")}/verify/${r.id}?c=${r.signature.slice(0, 16)}`;
}

export async function renderReceiptPdf(r: ReceiptRow, appUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Quittance ${r.receipt_number}`);
  pdf.setAuthor(clean(r.landlord_name));
  pdf.setProducer("LoyerCI");
  pdf.setCreationDate(new Date(r.issued_at));

  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const M = 48;

  const text = (p: PDFPage, s: string, x: number, y: number, f: PDFFont, size: number, color = INK) =>
    p.drawText(clean(s), { x, y, size, font: f, color });

  // Bandeau
  page.drawRectangle({ x: 0, y: 781, width, height: 61, color: GREEN });
  page.drawRectangle({ x: 0, y: 777, width, height: 4, color: ORANGE });
  text(page, "QUITTANCE DE LOYER", M, 805, bold, 20, rgb(1, 1, 1));
  text(page, `N° ${r.receipt_number}`, width - M - bold.widthOfTextAtSize(`N° ${r.receipt_number}`, 12), 808, bold, 12, rgb(1, 1, 1));

  let y = 740;
  const row = (label: string, value: string) => {
    text(page, label, M, y, font, 10, MUTED);
    text(page, value, M + 150, y, bold, 11);
    y -= 22;
  };

  row("Bailleur", r.landlord_name);
  row("Locataire", r.tenant_name);
  row("Bien loué", r.property_label);
  row("Adresse", r.property_location);
  row(
    "Période",
    formatPeriod(r.period).replace(/^./, (c) => c.toUpperCase()),
  );
  row("Date de paiement", formatLongDate(r.paid_at));
  row(
    "Mode de règlement",
    r.payment_methods
      .split("+")
      .map((m) => METHOD_LABELS[m] ?? m)
      .join(" + "),
  );

  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: LINE });
  y -= 26;

  // Détail des sommes
  const amountRow = (label: string, value: number, strong = false) => {
    const v = formatXOFPlain(value);
    text(page, label, M, y, strong ? bold : font, strong ? 12 : 11);
    text(
      page,
      v,
      width - M - (strong ? bold : font).widthOfTextAtSize(clean(v), strong ? 13 : 11),
      y,
      strong ? bold : font,
      strong ? 13 : 11,
    );
    y -= 22;
  };
  amountRow("Loyer principal", r.rent_amount);
  if (r.charges_amount > 0) amountRow("Charges", r.charges_amount);
  page.drawRectangle({ x: M - 8, y: y - 8, width: width - 2 * M + 16, height: 30, color: rgb(0.94, 0.97, 0.95) });
  amountRow("TOTAL ACQUITTÉ", r.amount, true);

  y -= 10;
  const words = `Arrêtée la présente quittance à la somme de ${amountInWords(r.amount)} francs CFA.`;
  for (const line of wrap(words, font, 10.5, width - 2 * M)) {
    text(page, line, M, y, font, 10.5);
    y -= 15;
  }
  y -= 8;
  const decl = `Le bailleur reconnaît avoir reçu du locataire la somme ci-dessus au titre du loyer et des charges de la période indiquée, et lui en donne quittance, sous réserve de tous droits.`;
  for (const line of wrap(decl, font, 9.5, width - 2 * M)) {
    text(page, line, M, y, font, 9.5, MUTED);
    y -= 13;
  }

  // Bloc d'authentification : QR + code + empreinte
  const url = verifyUrl(appUrl, r);
  const qrPng = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  const qr = await pdf.embedPng(qrPng);
  const boxY = 90;
  page.drawRectangle({ x: M - 8, y: boxY - 10, width: width - 2 * M + 16, height: 170, borderColor: GREEN, borderWidth: 1.2 });
  page.drawImage(qr, { x: M, y: boxY, width: 150, height: 150 });

  const tx = M + 170;
  let ty = boxY + 128;
  text(page, "Vérifier l'authenticité", tx, ty, bold, 13, GREEN);
  ty -= 20;
  for (const line of wrap(
    "Scannez le QR code ou saisissez le code ci-dessous sur la page de vérification officielle :",
    font,
    9.5,
    width - tx - M,
  )) {
    text(page, line, tx, ty, font, 9.5, MUTED);
    ty -= 13;
  }
  text(page, new URL(appUrl).host + "/verify", tx, ty, bold, 10);
  ty -= 22;
  text(page, "Code de vérification", tx, ty, font, 9, MUTED);
  ty -= 15;
  text(page, formatVerificationCode(r.signature), tx, ty, bold, 13);
  ty -= 20;
  text(page, `Empreinte SHA-256 : ${r.content_hash.slice(0, 16).toUpperCase()}`, tx, ty, font, 8.5, MUTED);
  ty -= 12;
  text(page, `Identifiant : ${r.id}`, tx, ty, font, 8.5, MUTED);

  text(
    page,
    "Méfiez-vous des copies : seule la page officielle fait foi. N'acceptez pas une page de vérification sur un autre domaine.",
    M,
    58,
    font,
    8,
    MUTED,
  );
  text(
    page,
    `Émise le ${formatLongDate(r.issued_at)} · Document généré électroniquement, valable sans signature manuscrite.`,
    M,
    44,
    font,
    8,
    MUTED,
  );

  return pdf.save();
}

function wrap(s: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean(s).split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = w;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}
