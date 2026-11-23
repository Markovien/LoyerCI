/** Communes du district autonome d'Abidjan (saisie libre pour l'intérieur du pays). */
export const ABIDJAN_COMMUNES = [
  "Abobo",
  "Adjamé",
  "Anyama",
  "Attécoubé",
  "Bingerville",
  "Cocody",
  "Koumassi",
  "Marcory",
  "Plateau",
  "Port-Bouët",
  "Songon",
  "Treichville",
  "Yopougon",
] as const;

export const PROPERTY_TYPES = [
  { id: "appartement", label: "Appartement" },
  { id: "villa", label: "Villa" },
  { id: "studio", label: "Studio" },
  { id: "magasin", label: "Magasin" },
  { id: "bureau", label: "Bureau" },
  { id: "entrepot", label: "Entrepôt" },
] as const;
