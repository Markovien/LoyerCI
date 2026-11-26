import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy-session";

/**
 * Proxy (ex-middleware, Next.js 16) :
 *  1. CSP stricte avec nonce unique par requête (scripts injectés = bloqués) ;
 *  2. rafraîchissement de la session Supabase ;
 *  3. garde de routes : /dashboard et /pay exigent une session.
 * Ce n'est PAS la seule barrière : chaque page/action revérifie l'utilisateur, et la RLS
 * filtre en base. Le proxy n'est qu'une première ligne (défense en profondeur).
 */
const PROTECTED = ["/dashboard", "/pay"];

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseWs = supabase.replace(/^http/, "ws");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${supabaseWs}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.cinetpay.com",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    isDev ? "" : "upgrade-insecure-requests",
    // P4.5 : violations remontées (rien n'est stocké ; journal filtré).
    "report-uri /api/csp-report",
    "report-to csp",
  ]
    .filter(Boolean)
    .join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { response, user } = await refreshSession(request, requestHeaders);

  const { pathname, search } = request.nextUrl;
  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }

  const res = response();
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Reporting-Endpoints", 'csp="/api/csp-report"');
  return res;
}

export const config = {
  matcher: [
    // Exclut les assets statiques et le webhook (appel serveur-à-serveur, sans cookies).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|api/webhooks).*)",
  ],
};
