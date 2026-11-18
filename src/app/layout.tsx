import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: { default: "LoyerCI — Gestion locative en Côte d'Ivoire", template: "%s · LoyerCI" },
  description: "Avis d'échéance, paiement Mobile Money et virement, quittances infalsifiables.",
  applicationName: "LoyerCI",
  appleWebApp: { capable: true, title: "LoyerCI", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#17694a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lire les en-têtes rend chaque page dynamique : Next.js applique alors le nonce
  // à ses propres scripts, condition nécessaire à la CSP stricte de src/proxy.ts.
  await headers();
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
