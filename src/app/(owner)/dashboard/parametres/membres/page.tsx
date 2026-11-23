import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMember } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { AddMemberForm, MemberRow } from "./members-client";

export const metadata: Metadata = { title: "Équipe", robots: { index: false } };

/** P2.5 : membres de l'organisation et rôles (propriétaire uniquement). */
export default async function MembersPage() {
  const { supabase, user, membership } = await requireOrgMember();
  if (membership.role !== "owner") redirect("/dashboard");
  const orgId = membership.org_id;

  const { data } = await supabase.from("memberships").select("user_id, role, created_at").eq("org_id", orgId).order("created_at");
  const rows = data ?? [];
  const { data: profiles } = rows.length
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in(
          "id",
          rows.map((r) => r.user_id),
        )
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Brand href="/dashboard" />
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Tableau de bord
        </Link>
      </header>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
        <p className="text-sm text-muted-foreground">{membership.organizations?.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membres</CardTitle>
          <CardDescription>
            Propriétaire : tout, dont la réception des fonds et l&apos;équipe. Gestionnaire : biens, locataires, baux et avis, sans valider
            les encaissements. Comptable : encaissements et envois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" aria-label="Membres de l'organisation">
            {rows.map((r) => (
              <MemberRow
                key={r.user_id}
                orgId={orgId}
                userId={r.user_id}
                name={names.get(r.user_id) ?? "Membre"}
                role={r.role}
                since={formatDate(r.created_at)}
                isMe={r.user_id === user.id}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter un membre</CardTitle>
          <CardDescription>
            Un lien de connexion est envoyé à son adresse e-mail. Aucune inscription publique : seules les personnes que vous ajoutez ont
            accès.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddMemberForm orgId={orgId} />
        </CardContent>
      </Card>
    </div>
  );
}
