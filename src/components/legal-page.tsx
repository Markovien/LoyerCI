import Link from "next/link";
import { Brand } from "@/components/brand";
import { LEGAL } from "@/lib/legal";

/** Mise en page commune des pages légales : lisible sur mobile, sans connexion. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <Brand />
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          Accueil
        </Link>
      </header>
      <article className="grid gap-4 text-sm leading-relaxed [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_td]:border-t [&_td]:py-1.5 [&_td]:pr-2 [&_td]:align-top [&_th]:pr-2 [&_th]:text-left [&_th]:font-medium">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">Dernière mise à jour : {LEGAL.updatedAt}</p>
        {children}
      </article>
    </div>
  );
}

/** Liens présents en bas de chaque page. */
export function LegalFooter() {
  return (
    <footer className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-4 gap-y-1 px-4 pt-4 pb-6 text-xs text-muted-foreground">
      <Link href="/mentions-legales" className="hover:underline">
        Mentions légales
      </Link>
      <Link href="/confidentialite" className="hover:underline">
        Confidentialité
      </Link>
      <Link href="/cgu" className="hover:underline">
        Conditions d&apos;utilisation
      </Link>
    </footer>
  );
}
