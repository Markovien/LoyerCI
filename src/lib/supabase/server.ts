import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Client « utilisateur » côté serveur : porte le JWT de la session (cookies).
 * Toutes les LECTURES passent par lui → la RLS PostgreSQL filtre chaque ligne.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appel depuis un Server Component : le rafraîchissement est assuré par src/proxy.ts.
        }
      },
    },
  });
}
