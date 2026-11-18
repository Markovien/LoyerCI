import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <Brand />
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>Propriétaires, gestionnaires et locataires : un lien sécurisé vous est envoyé par e-mail.</CardDescription>
        </CardHeader>
        <CardContent><LoginForm next={next} /></CardContent>
      </Card>
    </main>
  );
}
