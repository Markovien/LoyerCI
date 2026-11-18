import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LoyerCI — Gestion locative",
    short_name: "LoyerCI",
    description: "Encaissez vos loyers par Mobile Money et virement, quittances vérifiables par QR code.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8f7f2",
    theme_color: "#17694a",
    lang: "fr-CI",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
