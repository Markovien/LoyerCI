import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/security/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P3.4 — Retrait du stockage des fichiers mis en file par la purge des documents de plus
 * de 2 ans (la purge elle-même tourne en base, chaque nuit). Passe par l'API Storage : une
 * suppression directe en SQL laisserait le fichier dans le stockage objet.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new NextResponse("Non autorisé", { status: 401 });
  const db = supabaseAdmin();
  const { data: rows, error } = await db.rpc("claim_storage_deletions", { p_limit: 200 });
  if (error) return NextResponse.json({ error: "lecture de la file impossible" }, { status: 500 });
  let removed = 0;
  let failed = 0;
  const byBucket = new Map<string, { id: number; path: string }[]>();
  for (const r of rows ?? []) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), { id: r.id, path: r.path }]);
  for (const [bucket, items] of byBucket) {
    const { error: rmError } = await db.storage.from(bucket).remove(items.map((i) => i.path));
    for (const i of items) {
      await db.rpc("complete_storage_deletion", { p_id: i.id, p_error: rmError ? rmError.message.slice(0, 200) : undefined });
      if (rmError) failed++;
      else removed++;
    }
  }
  return NextResponse.json({ removed, failed });
}
