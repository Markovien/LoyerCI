/**
 * P4.8 — Informations légales de l'éditeur. Les valeurs « [À COMPLÉTER] » doivent être
 * renseignées (et l'ensemble des textes relu par un juriste) AVANT l'ouverture au public :
 * un test e2e et la liste de contrôle de mise en production le rappellent.
 */
export const TODO = "[À COMPLÉTER]";

export const LEGAL = {
  editor: TODO, // raison sociale
  form: TODO, // forme juridique et capital
  rccm: TODO, // n° RCCM
  taxId: TODO, // compte contribuable (NCC)
  address: TODO, // siège social (Abidjan)
  phone: TODO,
  email: TODO, // contact général
  privacyEmail: TODO, // contact « données personnelles »
  publisher: TODO, // directeur de la publication
  artciRef: TODO, // n° de récépissé / autorisation ARTCI (dont transfert hors de Côte d'Ivoire)
  mailProvider: TODO, // prestataire d'envoi des e-mails automatiques
  updatedAt: "26 novembre 2026",
} as const;

export const isPlaceholder = (v: string) => v === TODO;
