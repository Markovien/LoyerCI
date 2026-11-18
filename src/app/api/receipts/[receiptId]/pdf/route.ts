import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { renderReceiptPdf } from "@/lib/receipts/pdf";
import { uuid } from "@/lib/validation/schemas";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Téléchargement de quittance : réservé au locataire concerné et à l'organisation (RLS). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  if (!uuid.safeParse(receiptId).success) return new NextResponse("Introuvable", { status: 404 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Non authentifié", { status: 401 });

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, receipt_number, landlord_name, tenant_name, property_label, property_location, period, rent_amount, charges_amount, amount, payment_methods, paid_at, content_hash, signature, status, issued_at")
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt) return new NextResponse("Introuvable", { status: 404 });
  if (receipt.status !== "valide") return new NextResponse("Quittance annulée", { status: 410 });

  const pdf = await renderReceiptPdf(receipt, serverEnv().NEXT_PUBLIC_APP_URL);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quittance-${receipt.receipt_number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
