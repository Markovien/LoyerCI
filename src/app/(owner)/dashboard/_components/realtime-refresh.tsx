"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * Écoute les changements (paiements, avis) de l'organisation et rafraîchit les
 * composants serveur. Les événements Realtime respectent la RLS de l'utilisateur.
 */
export function RealtimeRefresh({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel(`org:${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `org_id=eq.${orgId}` }, refresh)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span className={live ? "size-2 animate-pulse rounded-full bg-success" : "size-2 rounded-full bg-muted-foreground/40"} />
      {live ? "En direct" : "Hors ligne"}
    </span>
  );
}
