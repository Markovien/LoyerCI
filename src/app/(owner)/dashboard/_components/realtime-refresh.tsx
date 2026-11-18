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
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    // Le jeton de session DOIT être transmis à Realtime avant l'abonnement : sinon le
    // canal est rejoint avec le rôle anon, la RLS filtre tous les événements et
    // l'indicateur affiche « En direct » à tort.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (cancelled || !token) return;
      await supabase.realtime.setAuth(token);
      if (cancelled) return;
      channel = supabase
        .channel(`org:${orgId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `org_id=eq.${orgId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `org_id=eq.${orgId}` }, refresh)
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    })();

    // Jeton renouvelé : Realtime doit le recevoir aussi.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span className={live ? "size-2 animate-pulse rounded-full bg-success" : "size-2 rounded-full bg-muted-foreground/40"} />
      {live ? "En direct" : "Hors ligne"}
    </span>
  );
}
