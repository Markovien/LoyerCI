import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { renderNoticePdf } from "@/lib/documents/notice-pdf";
import { requestContext } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { uuid } from "@/lib/validation/schemas";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Avis d'échéance PDF signé : locataire de l'avis ou membre de l'organisation.
 * L'avis est émis (instantané signé) à la première demande, puis toujours resservi à l'identique.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  if (!uuid.safeParse(invoiceId).success) return new NextResponse("Introuvable", { status: 404 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Non authentifié", { status: 401 });
  if (!(await limit(`notice-pdf:${auth.user.id}`, 30, 60_000)).ok) return new NextResponse("Trop de requêtes", { status: 429 });

  // Lecture RLS : l'avis doit être visible par cet utilisateur.
  const { data: invoice } = await supabase.from("invoices").select("id").eq("id", invoiceId).maybeSingle();
  if (!invoice) return new NextResponse("Introuvable", { status: 404 });

  const ctx = await requestContext();
  const { data: noticeId, error } = await supabaseAdmin().rpc("issue_notice", {
    p_actor: auth.user.id,
    p_invoice: invoice.id,
    p_ip: ctx.ip,
    p_ua: ctx.userAgent,
  });
  if (error || !noticeId) return new NextResponse("Avis indisponible", { status: 403 });

  const { data: notice } = await supabase
    .from("notices")
    .select(
      "id, landlord_name, tenant_name, property_label, property_location, period, rent_amount, charges_amount, amount_due, due_date, payment_reference, issued_at, content_hash, signature",
    )
    .eq("id", noticeId)
    .maybeSingle();
  if (!notice) return new NextResponse("Introuvable", { status: 404 });

  const pdf = await renderNoticePdf(notice, serverEnv().NEXT_PUBLIC_APP_URL);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="avis-${notice.payment_reference}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
