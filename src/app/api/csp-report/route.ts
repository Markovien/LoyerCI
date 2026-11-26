import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import { clientIpFrom } from "@/lib/security/request-context";
import { limit } from "@/lib/security/rate-limit";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 8 * 1024;

/** Ne garde qu'une origine (jamais le chemin ni les paramètres, qui peuvent porter des données). */
function originOf(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  if (!v.includes("://")) return v.slice(0, 40); // « inline », « eval », « data »…
  try {
    return new URL(v).origin;
  } catch {
    return "invalide";
  }
}
const pathOf = (v: unknown) => {
  try {
    return typeof v === "string" ? new URL(v).pathname.slice(0, 100) : null;
  } catch {
    return null;
  }
};
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 60) : null);

/**
 * P4.5 — Rapports de violation de la CSP (anciens « report-uri » et « Reporting API »).
 * Public par nature : taille bornée, débit limité par IP, rien n'est stocké ; seuls la
 * directive, l'origine bloquée et le chemin de la page sont journalisés.
 */
export async function POST(req: NextRequest) {
  const env = serverEnv();
  const ip = clientIpFrom(await headers(), env.CLIENT_IP_HEADER, env.TRUSTED_PROXY_HOPS);
  if (!(await limit(`csp-report:${ip ?? "?"}`, 30, 60_000)).ok) return new NextResponse(null, { status: 429 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const items: unknown[] = Array.isArray(parsed) ? parsed.slice(0, 10) : [parsed];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const body = (o["csp-report"] ?? o.body ?? {}) as Record<string, unknown>;
    log.warn("csp_violation", {
      directive: str(body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"]),
      bloque: originOf(body["blocked-uri"] ?? body.blockedURL),
      page: pathOf(body["document-uri"] ?? body.documentURL),
      mode: str(body.disposition),
    });
  }
  return new NextResponse(null, { status: 204 });
}
