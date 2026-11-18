import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  // Revalide « next » : seules les routes internes sont acceptées (anti open-redirect).
  const next = loginSchema.shape.next.parse(url.searchParams.get("next") ?? undefined);
  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?erreur=lien", url.origin));
}
