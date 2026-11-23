import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireOrgMember } from "@/lib/auth/session";
import { AUDIT_ACTIONS, auditActionLabel, auditDetails, ipText, parseAuditFilters } from "@/lib/audit";
import { actorLabel, memberNames, queryAudit } from "@/lib/audit-query";
import { formatDateTime } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Journal d'audit", robots: { index: false } };
const PAGE_SIZE = 50;
const SELECT = "h-10 w-full min-w-0 rounded-md border bg-card px-2 text-sm";

/** P2.6 : journal d'audit consultable (propriétaire uniquement), filtres, export, intégrité. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { supabase, user, membership } = await requireOrgMember();
  if (membership.role !== "owner") redirect("/dashboard");
  const orgId = membership.org_id;
  const f = parseAuditFilters(params);

  const [{ data, count }, names, integrity] = await Promise.all([
    queryAudit(supabase, orgId, f, (f.page - 1) * PAGE_SIZE, PAGE_SIZE),
    memberNames(supabase, orgId),
    // Vérification de la chaîne SHA-256 : fonction serveur, rôle revérifié en base.
    supabaseAdmin().rpc("audit_integrity", { p_actor: user.id, p_org: orgId }).single(),
  ]);
  const rows = data ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ok = integrity.data?.ok === true;

  const qs = (over: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { action: f.action, du: f.du, au: f.au, acteur: f.acteur, page: f.page, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) u.set(k, String(v));
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const exportQs = qs({ page: undefined });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Tableau de bord
        </Link>
      </header>
      <h1 className="text-2xl font-semibold tracking-tight">Journal d&apos;audit</h1>

      <section
        aria-label="Intégrité du journal"
        data-testid="audit-integrity"
        className={
          ok
            ? "flex items-start gap-2 rounded-lg bg-success/10 p-3 text-sm text-success"
            : "flex items-start gap-2 rounded-lg bg-danger/10 p-3 text-sm text-danger"
        }
      >
        {ok ? (
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        ) : (
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        )}
        <div className="min-w-0">
          {ok ? (
            <p className="font-medium">Journal intègre : aucune entrée modifiée ni supprimée.</p>
          ) : (
            <p className="font-medium">
              {integrity.error ? "Vérification d'intégrité indisponible." : "Altération détectée dans le journal."} Contactez le support
              LoyerCI sans attendre.
            </p>
          )}
          {integrity.data && (
            <p className="text-xs opacity-80">
              {integrity.data.org_rows} entrées pour votre organisation · chaîne SHA-256 vérifiée le{" "}
              {formatDateTime(integrity.data.checked_at)}
            </p>
          )}
        </div>
      </section>

      <Card>
        <CardContent className="pt-4">
          <form method="get" aria-label="Filtrer le journal" className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <div className="grid gap-1.5">
                <Label htmlFor="action">Action</Label>
                <select id="action" name="action" defaultValue={f.action ?? ""} className={SELECT}>
                  <option value="">Toutes</option>
                  {Object.entries(AUDIT_ACTIONS)
                    .toSorted(([, a], [, b]) => a.localeCompare(b, "fr"))
                    .map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="acteur">Acteur</Label>
                <select id="acteur" name="acteur" defaultValue={f.acteur ?? ""} className={SELECT}>
                  <option value="">Tous</option>
                  {[...names.entries()].map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="du">Du</Label>
                <Input id="du" name="du" type="date" defaultValue={f.du} className="min-w-0" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="au">Au</Label>
                <Input id="au" name="au" type="date" defaultValue={f.au} className="min-w-0" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Filtrer</Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/audit">Réinitialiser</Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`/api/audit/csv${exportQs}`} download>
                  <Download />
                  Exporter (CSV)
                </a>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground" data-testid="audit-count">
        {total} entrée{total > 1 ? "s" : ""}
        {pages > 1 && ` · page ${f.page} sur ${pages}`}
      </p>

      <ul className="grid gap-2" aria-label="Entrées du journal">
        {rows.map((r) => (
          <li key={r.chain_seq} className="min-w-0 rounded-lg border bg-card p-3 text-sm" data-testid="audit-row">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-medium">{auditActionLabel(r.action)}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
            </div>
            <p className="text-muted-foreground">
              {actorLabel(names, r.actor_id, r.actor_kind)}
              {ipText(r.ip) ? ` · IP ${ipText(r.ip)}` : ""}
            </p>
            {auditDetails(r.metadata) && (
              <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{auditDetails(r.metadata)}</p>
            )}
            <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground/80">
              n° {r.chain_seq} · {r.hash.slice(0, 16)}
            </p>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-muted-foreground">Aucune entrée pour ces filtres.</li>}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex justify-between gap-2">
          {f.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/dashboard/audit${qs({ page: f.page - 1 })}`}>Plus récentes</Link>
            </Button>
          ) : (
            <span />
          )}
          {f.page < pages && (
            <Button asChild variant="outline">
              <Link href={`/dashboard/audit${qs({ page: f.page + 1 })}`}>Plus anciennes</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
