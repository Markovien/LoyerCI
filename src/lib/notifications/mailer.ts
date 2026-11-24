import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/env";
import type { RenderedEmail } from "./templates";

let transport: Transporter | null = null;

/** Transport SMTP de l'adresse unique LoyerCI (P3.2) ; null si non configuré. */
function smtp(): Transporter | null {
  const env = serverEnv();
  if (!env.SMTP_URL) return null;
  transport ??= nodemailer.createTransport(env.SMTP_URL);
  return transport;
}

export function mailerConfigured(): boolean {
  return Boolean(serverEnv().SMTP_URL);
}

/** Un message par destinataire : jamais d'adresses d'autres personnes en copie. */
export async function sendEmail(to: string, mail: RenderedEmail): Promise<void> {
  const t = smtp();
  if (!t) throw new Error("SMTP non configuré");
  await t.sendMail({
    from: serverEnv().MAIL_FROM,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
  });
}
