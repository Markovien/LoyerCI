import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sha256Hex, safeEqualHex } from "@/lib/security/crypto";
import { mailerConfigured, sendEmail } from "@/lib/notifications/mailer";
import { renderNotification, type NotificationKind } from "@/lib/notifications/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = [
  "paiement_declare",
  "declaration_en_attente",
  "paiement_confirme",
  "paiement_rejete",
  "alerte_compte_reception",
  "depart_locataire",
  "rappel_suppression_compte",
] as const satisfies readonly NotificationKind[];

const recipientsSchema = z.array(z.object({ email: z.email().max(200), name: z.string().max(120) })).max(50);

/** Comparaison à temps constant du secret (empreintes de même longueur). */
function authorized(req: NextRequest): boolean {
  const secret = serverEnv().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  return safeEqualHex(sha256Hex(header.slice(7)), sha256Hex(secret));
}

/**
 * P3.2 — Expédition des notifications e-mail, appelée par l'ordonnanceur de l'hébergeur
 * (Vercel Cron : « Authorization: Bearer CRON_SECRET »). Réserve un lot en base (verrou,
 * plafond quotidien), envoie un message par destinataire, puis acquitte. Idempotent :
 * deux appels simultanés ne reprennent jamais le même message.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("Non autorisé", { status: 401 });
  if (!mailerConfigured()) return new NextResponse("SMTP non configuré : file conservée", { status: 503 });

  const db = supabaseAdmin();
  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL;
  let sent = 0;
  let failed = 0;
  // Trois lots au plus par appel : le reste attend l'appel suivant.
  for (let batch = 0; batch < 3; batch++) {
    const { data: rows, error } = await db.rpc("claim_notifications", { p_limit: 20 });
    if (error) return NextResponse.json({ sent, failed, error: "lecture de la file impossible" }, { status: 500 });
    if (!rows?.length) break;
    for (const row of rows) {
      const kind = KINDS.find((k) => k === row.kind);
      const recipients = recipientsSchema.safeParse(row.recipients);
      if (!kind || !recipients.success) {
        await db.rpc("complete_notification", { p_id: row.id, p_error: "message invalide" });
        failed++;
        continue;
      }
      const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
      const errors: string[] = [];
      for (const r of recipients.data) {
        try {
          await sendEmail(r.email, renderNotification(kind, data, { appUrl, orgName: row.org_name ?? "", recipientName: r.name }));
        } catch (e) {
          // Jamais l'adresse dans le journal d'erreur : seulement la nature de l'échec.
          errors.push(e instanceof Error ? e.message.slice(0, 120) : "échec d'envoi");
        }
      }
      await db.rpc("complete_notification", { p_id: row.id, p_error: errors.length ? errors.join(" | ") : undefined });
      if (errors.length) failed++;
      else sent++;
    }
  }
  return NextResponse.json({ sent, failed });
}
