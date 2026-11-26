import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Confidentialité" };

const RETENTION: [string, string][] = [
  ["Avis d'échéance, quittances, preuves de virement", "2 ans après leur émission, puis suppression automatique"],
  ["Compte d'un locataire sorti du parc", "Supprimé 3 mois après la fin du dernier bail"],
  ["Notifications techniques des opérateurs de paiement", "90 jours"],
  ["Messages automatiques envoyés (file d'envoi)", "90 jours après l'envoi"],
  ["Sauvegardes chiffrées de la base", "30 jours"],
  ["Journal d'audit des actions sensibles (avec adresse IP)", "Conservé pour la sécurité et la preuve (voir ci-dessous)"],
];

export default function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        Cette politique explique quelles données LoyerCI traite, pourquoi, combien de temps, et quels sont vos droits, conformément à la loi
        n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel.
      </p>

      <h2>Qui est responsable ?</h2>
      <ul>
        <li>
          <strong>Le bailleur</strong> (propriétaire ou agence) est responsable des données de ses locataires, qu&apos;il saisit pour gérer
          ses baux. LoyerCI les traite pour son compte, selon ses instructions.
        </li>
        <li>
          <strong>{LEGAL.editor}</strong>, éditeur de LoyerCI, est responsable des comptes des utilisateurs de l&apos;application et des
          données de sécurité (journal d&apos;audit, prévention des abus).
        </li>
      </ul>

      <h2>Données traitées</h2>
      <ul>
        <li>Bailleurs et membres de leur équipe : nom, adresse e-mail, téléphone, rôle.</li>
        <li>
          Locataires : nom, téléphone, adresse e-mail (facultative), bien loué, loyer, avis d&apos;échéance, paiements (montant, opérateur,
          numéro de transaction, numéro du payeur), quittances, preuves de virement déposées, accord pour recevoir les documents par
          WhatsApp.
        </li>
        <li>Données techniques : adresse IP et navigateur lors des actions sensibles, cookies strictement nécessaires.</li>
      </ul>
      <p>Aucune pièce d&apos;identité n&apos;est demandée ni conservée.</p>

      <h2>Pourquoi ?</h2>
      <ul>
        <li>Gérer la location : avis d&apos;échéance, encaissements, quittances, relances (sans pénalité de retard).</li>
        <li>Prouver les paiements : documents signés, vérifiables par un tiers (dossier de location, banque, visa).</li>
        <li>Sécuriser le service : journal d&apos;audit, prévention de la fraude et des abus.</li>
        <li>Envoyer les documents par WhatsApp, uniquement avec l&apos;accord du locataire.</li>
      </ul>

      <h2>Qui y a accès ?</h2>
      <ul>
        <li>Le bailleur et son équipe, selon leur rôle (propriétaire, gestionnaire, comptable).</li>
        <li>Le locataire, pour ses propres documents.</li>
        <li>
          Nos prestataires techniques, tenus à la confidentialité : hébergement (Supabase, Union européenne ; Vercel), envoi des e-mails
          automatiques ({LEGAL.mailProvider}), sauvegardes chiffrées (GitHub ; illisibles sans notre clé, conservée hors ligne).
        </li>
      </ul>
      <p>
        Les messages WhatsApp, SMS ou e-mails que le bailleur envoie depuis ses propres comptes passent par ses propres prestataires. Aucune
        donnée n&apos;est vendue ni utilisée à des fins publicitaires.
      </p>

      <h2>Combien de temps ?</h2>
      <table>
        <thead>
          <tr>
            <th>Données</th>
            <th>Durée</th>
          </tr>
        </thead>
        <tbody>
          {RETENTION.map(([d, t]) => (
            <tr key={d}>
              <td>{d}</td>
              <td>{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Avant la suppression des documents, le bailleur est prévenu et peut les exporter. Ses propres obligations de conservation
        (comptables notamment) restent de sa responsabilité. Le locataire est invité à télécharger ses quittances pour les garder.
      </p>

      <h2>Sécurité</h2>
      <p>
        Données hébergées dans l&apos;Union européenne, chiffrées en transit ; cloisonnement strict entre bailleurs ; documents signés ;
        journal d&apos;audit infalsifiable ; ré-authentification et délai de 48 heures pour tout nouveau compte de réception des loyers ;
        aucun numéro de compte ni de Mobile Money dans les messages.
      </p>

      <h2>Cookies</h2>
      <p>
        Uniquement des cookies nécessaires au fonctionnement : session de connexion et organisation active. Aucun cookie de mesure
        d&apos;audience ni de publicité.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez demander l&apos;accès à vos données, leur rectification ou leur suppression, et vous opposer à certains traitements.
        Locataires : adressez-vous d&apos;abord à votre bailleur, qui gère votre dossier. Pour toute demande : {LEGAL.privacyEmail}. Vous
        pouvez aussi saisir l&apos;ARTCI.
      </p>
    </LegalPage>
  );
}
