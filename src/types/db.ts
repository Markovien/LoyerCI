import type { Database as Generated, Json } from "./supabase";

/**
 * Types de la base, générés par `supabase gen types` (src/types/supabase.ts, ne pas éditer)
 * puis ajustés : PostgreSQL accepte NULL pour tout argument de fonction (p_ip, p_ua,
 * motif…), ce que le générateur ne sait pas exprimer. Les fonctions SQL revérifient
 * elles-mêmes les arguments obligatoires.
 */
type NullableArgs<F> = {
  [K in keyof F]: F[K] extends { Args: infer A; Returns: infer R }
    ? { Args: { [P in keyof A]: A[P] | null }; Returns: R } & Omit<F[K], "Args" | "Returns">
    : F[K];
};

type GT = Generated["public"]["Tables"];

export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Functions" | "Tables"> & {
    Functions: NullableArgs<Generated["public"]["Functions"]>;
    Tables: Omit<GT, "invoices"> & {
      // Colonne générée (rent_amount + charges_amount, toutes deux NOT NULL) : jamais nulle.
      invoices: Omit<GT["invoices"], "Row"> & { Row: Omit<GT["invoices"]["Row"], "amount_due"> & { amount_due: number } };
    };
  };
};

export type { Json };
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
