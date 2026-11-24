import { formatLongDate, formatPeriod, formatXOFPlain } from "@/lib/format";
import { stepLabel } from "@/lib/reminders";

/**
 * P3.2 — Contenu des e-mails automatiques de LoyerCI.
 * Invariant 9 : AUCUNE coordonnée de paiement (RIB, numéro Mobile Money, alias) et aucun texte
 * libre saisi par un utilisateur ; uniquement un lien vers la page authentifiée.
 * Phrases courtes, vocabulaire simple : une partie des destinataires lit difficilement.
 */
export type NotificationKind =
  | "paiement_declare"
  | "declaration_en_attente"
  | "paiement_confirme"
  | "paiement_rejete"
  | "alerte_compte_reception"
  | "depart_locataire"
  | "rappel_suppression_compte"
  | "relance_loyer";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Data = Record<string, unknown>;

const MODES: Record<string, string> = {
  mobile_money: "Mobile Money",
  virement: "virement bancaire",
  especes: "espèces",
  avance: "avance",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const uuidOrEmpty = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : "";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Une ligne d'en-tête du message : pas de retour à la ligne ni de caractère de contrôle. */
const oneLine = (s: string) => s.replace(/\p{Cc}+/gu, " ").trim();

function build(subject: string, paragraphs: string[], action: { label: string; url: string } | null, orgName: string): RenderedEmail {
  const footer = [
    "Ce message est envoyé automatiquement par LoyerCI. Ne répondez pas à cet e-mail.",
    "LoyerCI ne vous demandera jamais de payer sur un numéro ou un compte indiqué dans un e-mail ou un SMS.",
  ];
  const text = [...paragraphs, ...(action ? ["", `${action.label} : ${action.url}`] : []), "", ...footer].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f5f3;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px;font-weight:bold;color:#176b4a;font-size:18px">LoyerCI${orgName ? ` · ${escapeHtml(orgName)}` : ""}</p>
<div style="background:#fff;border-radius:12px;padding:20px">
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escapeHtml(p)}</p>`).join("\n")}
${action ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#176b4a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:16px">${escapeHtml(action.label)}</a></p>` : ""}
</div>
${footer.map((f) => `<p style="margin:12px 0 0;font-size:12px;color:#666">${escapeHtml(f)}</p>`).join("\n")}
</div></body></html>`;
  return { subject: oneLine(subject), text, html };
}

export function renderNotification(
  kind: NotificationKind,
  data: Data,
  ctx: { appUrl: string; orgName: string; recipientName: string },
): RenderedEmail {
  const app = ctx.appUrl.replace(/\/$/, "");
  const hello = ctx.recipientName ? `Bonjour ${oneLine(ctx.recipientName)},` : "Bonjour,";
  const org = oneLine(ctx.orgName);
  const amount = formatXOFPlain(num(data.montant));
  const period = str(data.periode) ? formatPeriod(str(data.periode)) : "";
  const tenant = oneLine(str(data.locataire));
  const mode = MODES[str(data.mode)] ?? "paiement";
  const invoice = uuidOrEmpty(data.invoice_id);

  switch (kind) {
    case "paiement_declare":
      return build(
        `Paiement à confirmer : ${tenant}, ${amount}`,
        [
          hello,
          `${tenant} indique avoir payé ${amount} (${mode}) pour le loyer de ${period}.`,
          "Vérifiez la réception des fonds sur votre compte, puis confirmez ou refusez dans LoyerCI.",
        ],
        { label: "Voir le paiement à confirmer", url: `${app}/dashboard` },
        org,
      );
    case "declaration_en_attente":
      return build(
        `Rappel : paiement de ${tenant} en attente depuis plus de 48 heures`,
        [
          hello,
          `Le paiement de ${amount} déclaré par ${tenant} pour ${period} attend votre confirmation depuis plus de 48 heures.`,
          "Le locataire ne reçoit sa quittance qu'après votre confirmation.",
        ],
        { label: "Confirmer ou refuser", url: `${app}/dashboard` },
        org,
      );
    case "paiement_confirme":
      return build(
        `Votre paiement de ${amount} est confirmé`,
        [
          hello,
          `${org} a confirmé la réception de votre paiement de ${amount} pour le loyer de ${period}.`,
          "Votre quittance est disponible dans votre espace.",
        ],
        { label: "Voir mon loyer", url: invoice ? `${app}/pay/${invoice}` : `${app}/pay` },
        org,
      );
    case "paiement_rejete":
      return build(
        "Votre déclaration de paiement n'a pas été confirmée",
        [
          hello,
          `${org} n'a pas pu confirmer votre paiement de ${amount} pour ${period}.`,
          "Le motif est indiqué dans votre espace. En cas de doute, contactez directement votre bailleur.",
        ],
        { label: "Voir le motif", url: invoice ? `${app}/pay/${invoice}` : `${app}/pay` },
        org,
      );
    case "alerte_compte_reception": {
      const when = str(data.effectif_le) ? formatLongDate(str(data.effectif_le)) : "dans 48 heures";
      return build(
        "Alerte de sécurité : nouveau compte de réception des loyers",
        [
          hello,
          `Un nouveau compte de réception des loyers a été ajouté pour ${org}. Il sera actif le ${when}.`,
          "Si vous n'êtes pas à l'origine de cet ajout, annulez-le immédiatement depuis LoyerCI.",
        ],
        { label: "Vérifier mes comptes de réception", url: `${app}/dashboard/parametres/paiements` },
        org,
      );
    }
    case "relance_loyer": {
      const step = num(data.etape);
      const due = str(data.echeance) ? formatLongDate(str(data.echeance)) : "";
      const hasAccount = data.compte === true;
      return build(
        step < 0 ? `Rappel : loyer de ${period} attendu le ${due}` : `Rappel : loyer de ${period} non réglé`,
        [
          hello,
          step < 0
            ? `Votre loyer de ${period} est attendu le ${due}.`
            : `Votre loyer de ${period} n'est pas encore réglé (échéance du ${due}). ${stepLabel(step)}.`,
          `Montant restant : ${amount}. Référence de votre avis : ${oneLine(str(data.reference))}.`,
          "Si vous avez déjà payé, ne tenez pas compte de ce message.",
          ...(hasAccount ? [] : [`Pour toute question, contactez directement ${org}.`]),
        ],
        // Sans compte, aucun lien : le locataire ne pourrait pas se connecter (et un lien de
        // moins, c'est une prise de moins pour l'hameçonnage).
        hasAccount && invoice ? { label: "Voir mon avis", url: `${app}/pay/${invoice}` } : null,
        org,
      );
    }
    case "depart_locataire":
    case "rappel_suppression_compte": {
      const when = str(data.suppression_le) ? formatLongDate(str(data.suppression_le)) : "";
      return build(
        kind === "depart_locataire" ? "Votre compte LoyerCI sera supprimé" : "Rappel : votre compte LoyerCI sera bientôt supprimé",
        [
          hello,
          `Vous n'avez plus de bail en cours. Votre compte sera supprimé le ${when}.`,
          "Téléchargez dès maintenant vos avis et quittances pour les garder.",
        ],
        { label: "Télécharger mes documents", url: `${app}/pay` },
        org,
      );
    }
  }
}
