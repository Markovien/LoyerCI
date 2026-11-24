import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { clean, wrap } from "@/lib/receipts/pdf";
import { formatLongDate } from "@/lib/format";

const GREEN = rgb(0.09, 0.42, 0.29);
const ORANGE = rgb(0.93, 0.49, 0.13);
const INK = rgb(0.13, 0.16, 0.15);
const MUTED = rgb(0.42, 0.45, 0.44);

export interface PosterData {
  payload: string;
  beneficiary: string;
  orgName: string;
  referenceLabel: string;
}

/**
 * P1.7 — Affiche de guichet A5 (présentiel uniquement, invariant 8). Gros caractères,
 * étapes numérotées et nom du bénéficiaire à comparer : pensée pour un public peu lettré.
 */
export async function renderPispiPosterPdf(d: PosterData, now = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Affiche de guichet PI-SPI - ${clean(d.orgName)}`);
  pdf.setAuthor(clean(d.orgName));
  pdf.setProducer("LoyerCI");
  pdf.setCreationDate(now);

  const page = pdf.addPage([419.53, 595.28]); // A5 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const M = 32;
  const center = (s: string, y: number, f = bold, size = 12, color = INK) =>
    page.drawText(clean(s), { x: (width - f.widthOfTextAtSize(clean(s), size)) / 2, y, size, font: f, color });

  page.drawRectangle({ x: 0, y: 535, width, height: 60, color: GREEN });
  page.drawRectangle({ x: 0, y: 531, width, height: 4, color: ORANGE });
  center("PAYEZ VOTRE LOYER ICI", 565, bold, 22, rgb(1, 1, 1));
  center("Paiement instantané PI-SPI (BCEAO)", 545, font, 11, rgb(1, 1, 1));

  const qrPng = await QRCode.toBuffer(d.payload, { errorCorrectionLevel: "M", margin: 2, width: 720 });
  const qr = await pdf.embedPng(qrPng);
  const size = 230;
  page.drawImage(qr, { x: (width - size) / 2, y: 290, width: size, height: size });

  center("Bénéficiaire", 270, font, 10, MUTED);
  center(d.beneficiary, 252, bold, 15, GREEN);
  center("Vérifiez ce nom sur votre téléphone avant de valider.", 236, font, 9.5, MUTED);

  const steps = [
    "Scannez le code avec l'application de votre banque ou de votre Mobile Money.",
    "Saisissez le montant indiqué sur votre avis d'échéance.",
    "Écrivez la RÉFÉRENCE de votre avis dans le motif du paiement.",
    "Montrez la confirmation au guichet.",
  ];
  let y = 210;
  steps.forEach((s, i) => {
    page.drawCircle({ x: M + 9, y: y + 4, size: 9, color: ORANGE });
    page.drawText(String(i + 1), { x: M + 6, y, size: 11, font: bold, color: rgb(1, 1, 1) });
    for (const line of wrap(s, font, 10.5, width - 2 * M - 26)) {
      page.drawText(line, { x: M + 26, y, size: 10.5, font, color: INK });
      y -= 14;
    }
    y -= 8;
  });

  page.drawLine({ start: { x: M, y: 62 }, end: { x: width - M, y: 62 }, thickness: 0.6, color: MUTED });
  for (const [i, line] of wrap(
    "Usage au guichet uniquement. Ce code ne doit jamais être envoyé par message ni affiché dans une application (règle BCEAO).",
    bold,
    8.5,
    width - 2 * M,
  ).entries())
    page.drawText(line, { x: M, y: 48 - i * 11, size: 8.5, font: bold, color: INK });
  page.drawText(clean(`${d.orgName} · ${d.referenceLabel} · imprimée le ${formatLongDate(now)}`), {
    x: M,
    y: 18,
    size: 7.5,
    font,
    color: MUTED,
  });
  return pdf.save();
}
