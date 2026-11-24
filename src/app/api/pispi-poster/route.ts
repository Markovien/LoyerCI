import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { dbErrorMessage, supabaseAdmin } from "@/lib/supabase/admin";
import { renderPispiPosterPdf } from "@/lib/documents/pispi-poster-pdf";
import { staticPosterPayload } from "@/lib/payments/pispi-qr";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { uuid } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P1.7 — Affiche de guichet PI-SPI (PDF A5, QR statique SANS montant). Propriétaire ou
 * gestionnaire ; adresse de paiement active (hors carence, non révoquée) ; génération
 * journalisée en base (affiche_guichet_generee). Jamais servie dans une page de paiement.
 */
export async function GET(req: NextRequest) {
  const account = uuid.safeParse(req.nextUrl.searchParams.get("account"));
  if (!account.success) return new NextResponse("Requête invalide", { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Non authentifié", { status: 401 });
  if (!limit(`pispi-poster:${auth.user.id}`, 10, 60_000).ok) return new NextResponse("Trop de requêtes", { status: 429 });

  const ctx = await requestContext();
  const { data, error } = await supabaseAdmin()
    .rpc("pispi_poster_data", { p_actor: auth.user.id, p_account: account.data, p_ip: ctx.ip, p_ua: ctx.userAgent })
    .maybeSingle();
  if (error || !data)
    return new NextResponse(error ? dbErrorMessage(error) : "Introuvable", { status: error?.code === "42501" ? 403 : 422 });

  const pdf = await renderPispiPosterPdf({
    payload: staticPosterPayload(data.alias, data.reference_label),
    beneficiary: data.beneficiary,
    orgName: data.org_name,
    referenceLabel: data.reference_label,
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="affiche-guichet-pispi.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
