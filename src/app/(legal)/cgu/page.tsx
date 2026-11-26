import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function Cgu() {
  return (
    <LegalPage title="Conditions générales d'utilisation">
      <h2>1. Objet</h2>
      <p>
        LoyerCI, édité par {LEGAL.editor}, est un logiciel de gestion locative pour la Côte d&apos;Ivoire : biens, locataires, baux, avis
        d&apos;échéance, encaissements, quittances et relances. Ces conditions s&apos;appliquent aux bailleurs (propriétaires, agences et
        membres de leur équipe) et aux locataires qui utilisent l&apos;application.
      </p>

      <h2>2. LoyerCI ne détient jamais les fonds</h2>
      <p>
        Les loyers sont payés directement par le locataire sur les comptes du bailleur (Mobile Money, virement, espèces). LoyerCI ne reçoit,
        ne conserve et ne reverse aucune somme. Une quittance n&apos;est émise qu&apos;après confirmation de la réception des fonds par le
        bailleur, ou confirmation vérifiée d&apos;un prestataire de paiement.
      </p>

      <h2>3. Accès</h2>
      <ul>
        <li>L&apos;accès se fait sur invitation : il n&apos;y a pas d&apos;inscription libre.</li>
        <li>Chacun est responsable de la confidentialité de sa boîte e-mail, qui sert à se connecter.</li>
        <li>Le compte locataire est facultatif : les documents peuvent être reçus sans compte.</li>
      </ul>

      <h2>4. Engagements du bailleur</h2>
      <ul>
        <li>Saisir des informations exactes et respecter la réglementation, notamment la loi n° 2019-576 (caution et avance).</li>
        <li>Ne confirmer un encaissement qu&apos;après avoir réellement reçu les fonds.</li>
        <li>N&apos;ajouter que des comptes de réception dont il est titulaire.</li>
        <li>Informer ses locataires du traitement de leurs données et recueillir leur accord avant tout envoi par WhatsApp.</li>
        <li>
          Exporter ses documents avant leur suppression : LoyerCI conserve les avis et quittances 2 ans après leur émission. Les obligations
          comptables et fiscales du bailleur restent les siennes.
        </li>
      </ul>
      <p>L&apos;application ne calcule ni n&apos;annonce de pénalités de retard.</p>

      <h2>5. Locataires</h2>
      <p>
        Le locataire peut consulter et télécharger ses avis et quittances, et signaler un paiement. Un paiement n&apos;est réputé reçu
        qu&apos;après confirmation du bailleur. Tout document peut être vérifié sur la page officielle de vérification ; LoyerCI ne demande
        jamais de payer sur un numéro ou un compte indiqué dans un message.
      </p>

      <h2>6. Abonnement et frais d&apos;envoi</h2>
      <p>
        L&apos;utilisation par le bailleur peut être soumise à un abonnement, dont les conditions lui sont communiquées. Les frais
        d&apos;envoi des messages automatiques sont à la charge du bailleur et inclus dans l&apos;abonnement ; ils ne sont jamais facturés
        au locataire.
      </p>

      <h2>7. Disponibilité et responsabilité</h2>
      <p>
        LoyerCI met en œuvre les moyens raisonnables pour assurer la disponibilité et la sécurité du service, sans garantir une
        disponibilité continue. LoyerCI n&apos;est pas partie au contrat de bail et ne répond pas des litiges entre bailleur et locataire,
        ni des incidents propres aux opérateurs de paiement.
      </p>

      <h2>8. Suspension</h2>
      <p>
        En cas d&apos;usage frauduleux ou contraire à ces conditions, l&apos;accès peut être suspendu, après information de l&apos;intéressé
        sauf urgence.
      </p>

      <h2>9. Données personnelles</h2>
      <p>
        Voir la <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>10. Droit applicable</h2>
      <p>
        Ces conditions sont régies par le droit ivoirien. À défaut d&apos;accord amiable, tout litige relève des juridictions compétentes
        d&apos;Abidjan. Contact : {LEGAL.email}.
      </p>
    </LegalPage>
  );
}
