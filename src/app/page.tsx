import Link from "next/link";
import { BadgeCheck, Banknote, MessageCircle, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: MessageCircle,
    title: "Avis d'échéance par WhatsApp",
    text: "Un clic : le locataire reçoit le montant, la référence et son lien de paiement.",
  },
  {
    icon: Banknote,
    title: "Orange, MTN, Wave, Moov, virement",
    text: "Encaissement Mobile Money ou virement avec référence unique et preuve.",
  },
  {
    icon: BadgeCheck,
    title: "Quittances infalsifiables",
    text: "Signature cryptographique et QR code vérifiable par n'importe quel tiers.",
  },
  {
    icon: ShieldCheck,
    title: "Sécurité renforcée",
    text: "Cloisonnement en base, journal d'audit chaîné, documents signés. LoyerCI ne détient jamais vos loyers.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Brand />
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Se connecter</Link>
        </Button>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-10 py-12">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-accent">Gestion locative · Côte d&apos;Ivoire</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Vos loyers encaissés, vos quittances prouvées.</h1>
          <p className="mt-4 text-muted-foreground sm:text-lg">
            De Cocody à San-Pédro, suivez chaque franc CFA en temps réel, sans courir après les reçus.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">Espace propriétaire</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pay">Espace locataire</Link>
            </Button>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-lg border bg-card p-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
