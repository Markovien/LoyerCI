"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/db";

/** Client navigateur : utilisé uniquement pour l'abonnement Realtime (lecture, RLS appliquée). */
export function createSupabaseBrowser() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
