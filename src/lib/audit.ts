import { z } from "zod";

/** Libellés français des actions journalisées (contrainte CHECK de audit_logs.action). */
export const AUDIT_ACTIONS = {
  bail_cree: "Bail créé",
  bail_resilie: "Bail résilié",
  bail_termine: "Bail terminé (date de fin)",
  avance_enregistree: "Avance enregistrée",
  avis_generes: "Avis générés",
  avis_emis: "Avis émis",
  avis_annule: "Avis annulé",
  paiement_initie: "Paiement en ligne initié",
  paiement_confirme: "Paiement en ligne confirmé",
  paiement_echoue: "Paiement en ligne échoué",
  paiement_anomalie: "Anomalie de paiement",
  preuve_virement_soumise: "Preuve de virement soumise",
  virement_valide: "Virement validé",
  virement_rejete: "Virement rejeté",
  acces_preuve_virement: "Preuve de virement consultée",
  paiement_direct_declare: "Paiement déclaré par le locataire",
  paiement_direct_confirme: "Paiement direct confirmé",
  paiement_direct_rejete: "Paiement direct rejeté",
  especes_a_confirmer: "Espèces à confirmer",
  especes_confirme: "Espèces confirmées",
  especes_rejete: "Espèces rejetées",
  quittance_generee: "Quittance émise",
  quittance_annulee: "Quittance annulée",
  rib_ajoute: "Coordonnées de réception ajoutées",
  rib_annule: "Coordonnées de réception révoquées",
  parametres_paiement_modifies: "Paramètres de paiement modifiés",
  affiche_guichet_generee: "Affiche de guichet générée",
  reauthentification: "Ré-authentification",
  document_envoye: "Document envoyé",
  compte_locataire_supprime: "Compte locataire supprimé",
  bien_cree: "Bien créé",
  bien_modifie: "Bien modifié",
  locataire_cree: "Locataire créé",
  locataire_modifie: "Locataire modifié",
  locataire_invite: "Locataire invité",
  locataire_lie: "Compte locataire rattaché",
  locataire_delie: "Compte locataire détaché",
  consentement_whatsapp: "Consentement WhatsApp",
  membre_ajoute: "Membre ajouté",
  membre_role_modifie: "Rôle d'un membre modifié",
  membre_retire: "Membre retiré",
  audit_exporte: "Journal exporté",
  relances_parametrees: "Relances paramétrées",
  relance_envoyee: "Relance envoyée",
} as const satisfies Record<string, string>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
export const isAuditAction = (a: string): a is AuditAction => Object.hasOwn(AUDIT_ACTIONS, a);
export const auditActionLabel = (a: string) => (isAuditAction(a) ? AUDIT_ACTIONS[a] : a);
/** Colonne inet (typée « unknown » par le générateur) : texte, sinon vide. */
export const ipText = (v: unknown) => (typeof v === "string" ? v : "");

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Date invalide");
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

/** Filtres du journal (paramètres d'URL : action, du, au, acteur, page) — validés par Zod. */
export const auditFilterSchema = z
  .object({
    action: z.preprocess(blankToUndefined, z.string().refine(isAuditAction, "Action inconnue").optional()),
    du: z.preprocess(blankToUndefined, isoDay.optional()),
    au: z.preprocess(blankToUndefined, isoDay.optional()),
    acteur: z.preprocess(blankToUndefined, z.uuid().optional()),
    page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(10_000).default(1)),
  })
  .refine((f) => !f.du || !f.au || f.du <= f.au, { message: "La date de début doit précéder la date de fin" });
export type AuditFilters = z.infer<typeof auditFilterSchema>;

/** Paramètres d'URL -> filtres ; valeurs invalides ignorées (jamais transmises à la base). */
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const raw = { action: one("action"), du: one("du"), au: one("au"), acteur: one("acteur"), page: one("page") };
  const r = auditFilterSchema.safeParse(raw);
  return r.success ? r.data : { page: 1 };
}

/** Bornes UTC (Abidjan = UTC+0) : « au » est inclusif. */
export function auditRange(f: Pick<AuditFilters, "du" | "au">): { from?: string; to?: string } {
  const to = f.au ? new Date(Date.parse(`${f.au}T00:00:00Z`) + 86_400_000).toISOString() : undefined;
  return { from: f.du ? `${f.du}T00:00:00.000Z` : undefined, to };
}

/** Détails lisibles (métadonnées déjà minimisées en base), bornés pour l'affichage. */
export function auditDetails(meta: unknown, max = 240): string {
  if (!meta || typeof meta !== "object" || Object.keys(meta).length === 0) return "";
  const s = JSON.stringify(meta);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
