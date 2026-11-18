import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { serverEnv } from "@/lib/env";

let admin: SupabaseClient<Database> | undefined;

/**
 * Client service_role. Usage STRICTEMENT limité :
 *   - appel des fonctions métier (RPC) réservées au serveur, avec p_actor vérifié ;
 *   - Storage privé (dépôt de preuves, URL signées).
 * Ne jamais l'utiliser pour des lectures « pratiques » qui contourneraient la RLS.
 * Le module « server-only » fait échouer le build s'il est importé côté client.
 */
export function supabaseAdmin(): SupabaseClient<Database> {
  if (!admin) {
    const env = serverEnv();
    admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/** Traduit les codes d'erreur PostgreSQL levés par les fonctions métier en messages sûrs. */
export function dbErrorMessage(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case "42501": return "Accès refusé.";
    case "P0002": return "Élément introuvable.";
    case "P0001":
    case "22023": return error.message ?? "Opération refusée.";
    case "23505": return "Cette opération a déjà été enregistrée.";
    default: return "Une erreur est survenue. Réessayez dans un instant.";
  }
}
