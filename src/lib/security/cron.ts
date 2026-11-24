import "server-only";
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { safeEqualHex, sha256Hex } from "@/lib/security/crypto";

/**
 * Appel de l'ordonnanceur (Vercel Cron : « Authorization: Bearer CRON_SECRET »).
 * Comparaison à temps constant des empreintes ; refus si le secret n'est pas configuré.
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = serverEnv().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  return safeEqualHex(sha256Hex(header.slice(7)), sha256Hex(secret));
}
