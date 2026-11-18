import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

/**
 * IP du client, lue UNIQUEMENT depuis l'en-tête fiable de l'hébergeur.
 * « x-forwarded-for » est falsifiable par le client : on ne lit que l'entrée ajoutée
 * par notre dernier proxy de confiance (comptée depuis la droite).
 */
export function clientIpFrom(h: Headers, headerName: string, trustedHops: number): string | null {
  const raw = h.get(headerName);
  if (!raw) return null;
  let candidate = raw.trim();
  if (headerName === "x-forwarded-for") {
    const chain = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    candidate = chain[Math.max(chain.length - trustedHops, 0)] ?? "";
  }
  candidate = candidate.replace(/^\[|\]$/g, "").replace(/^::ffff:/, "");
  return isIP(candidate) ? candidate : null;
}

export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  const env = serverEnv();
  return {
    ip: clientIpFrom(h, env.CLIENT_IP_HEADER, env.TRUSTED_PROXY_HOPS),
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  };
}
