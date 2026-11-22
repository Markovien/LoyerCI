import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { formatLongDate, formatVerificationCode } from "@/lib/format";
import { clean, wrap } from "@/lib/receipts/pdf";
import { NOTICE_PAYMENT_INSTRUCTION, NOTICE_SAFETY_WARNING, noticeAmounts, noticeRows, type NoticeRow } from "./notice";

const GREEN = rgb(0.09, 0.42, 0.29);
const ORANGE = rgb(0.93, 0.49, 0.13);
const INK = rgb(0.13, 0.16, 0.15);
const MUTED = rgb(0.42, 0.45, 0.44);
const LINE = rgb(0.87, 0.88, 0.86);

export function noticeVerifyUrl(appUrl: string, n: Pick<NoticeRow, "id" | "signature">): string {
  return `${appUrl.replace(/\/$/, "")}/verify/${n.id}?c=${n.signature.slice(0, 16)}`;
}

/** Avis d'échéance A4 signé : aucune coordonnée de paiement, bloc d'authentification (QR + code). */
export async function renderNoticePdf(n: NoticeRow, appUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Avis d'échéance ${n.payment_reference}`);
  pdf.setAuthor(clean(n.landlord_name));
  pdf.setProducer("LoyerCI");
  pdf.setCreationDate(new Date(n.issued_at));

  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const M = 48;
  const text = (s: string, x: number, y: number, f = font, size = 11, color = INK) =>
    page.drawText(clean(s), { x, y, size, font: f, color });

  page.drawRectangle({ x: 0, y: 781, width, height: 61, color: GREEN });
  page.drawRectangle({ x: 0, y: 777, width, height: 4, color: ORANGE });
  text("AVIS D'ÉCHÉANCE", M, 805, bold, 20, rgb(1, 1, 1));

  let y = 740;
  for (const [label, value] of noticeRows(n)) {
    text(label, M, y, font, 10, MUTED);
    text(value, M + 150, y, bold, 11);
    y -= 22;
  }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: LINE });
  y -= 26;
  for (const a of noticeAmounts(n)) {
    if (a.strong) page.drawRectangle({ x: M - 8, y: y - 8, width: width - 2 * M + 16, height: 30, color: rgb(0.94, 0.97, 0.95) });
    const f = a.strong ? bold : font;
    const size = a.strong ? 13 : 11;
    text(a.label, M, y, f, a.strong ? 12 : 11);
    text(a.value, width - M - f.widthOfTextAtSize(clean(a.value), size), y, f, size);
    y -= 26;
  }
  y -= 4;
  for (const line of wrap(NOTICE_PAYMENT_INSTRUCTION, bold, 10.5, width - 2 * M)) {
    text(line, M, y, bold, 10.5);
    y -= 15;
  }

  // Bloc d'authentification
  const url = noticeVerifyUrl(appUrl, n);
  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 1, width: 360 }));
  const boxY = 110;
  page.drawRectangle({ x: M - 8, y: boxY - 10, width: width - 2 * M + 16, height: 170, borderColor: GREEN, borderWidth: 1.2 });
  page.drawImage(qr, { x: M, y: boxY, width: 150, height: 150 });
  const tx = M + 170;
  let ty = boxY + 128;
  text("Vérifier l'authenticité", tx, ty, bold, 13, GREEN);
  ty -= 20;
  for (const line of wrap("Scannez le QR code ou saisissez le code sur la page officielle :", font, 9.5, width - tx - M)) {
    text(line, tx, ty, font, 9.5, MUTED);
    ty -= 13;
  }
  text(new URL(appUrl).host + "/verify", tx, ty, bold, 10);
  ty -= 22;
  text("Code de vérification", tx, ty, font, 9, MUTED);
  ty -= 15;
  text(formatVerificationCode(n.signature), tx, ty, bold, 13);
  ty -= 20;
  text(`Empreinte SHA-256 : ${n.content_hash.slice(0, 16).toUpperCase()}`, tx, ty, font, 8.5, MUTED);

  let wy = 78;
  for (const line of wrap(NOTICE_SAFETY_WARNING, font, 8.5, width - 2 * M)) {
    text(line, M, wy, font, 8.5, MUTED);
    wy -= 12;
  }
  text(`Émis le ${formatLongDate(n.issued_at)} · Document généré électroniquement par LoyerCI.`, M, 44, font, 8, MUTED);
  return pdf.save();
}
