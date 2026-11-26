import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Mentions légales" };

export default function MentionsLegales() {
  return (
    <LegalPage title="Mentions légales">
      <h2>Éditeur</h2>
      <p>
        {LEGAL.editor}, {LEGAL.form}. RCCM : {LEGAL.rccm}. Compte contribuable : {LEGAL.taxId}.
        <br />
        Siège : {LEGAL.address}. Téléphone : {LEGAL.phone}. E-mail : {LEGAL.email}.
        <br />
        Directeur de la publication : {LEGAL.publisher}.
      </p>
      <h2>Hébergement</h2>
      <ul>
        <li>Application : Vercel Inc., États-Unis (exécution en région européenne).</li>
        <li>Base de données et fichiers : Supabase, région de l&apos;Union européenne.</li>
      </ul>
      <p>
        Le transfert de données hors de Côte d&apos;Ivoire fait l&apos;objet d&apos;une autorisation de l&apos;ARTCI (référence :{" "}
        {LEGAL.artciRef}).
      </p>
      <h2>Ce que fait LoyerCI</h2>
      <p>
        LoyerCI est un logiciel de gestion locative. <strong>LoyerCI ne reçoit, ne détient et ne reverse jamais les loyers</strong> : les
        paiements vont directement du locataire vers les comptes du bailleur. LoyerCI n&apos;est ni une banque ni un établissement de
        paiement.
      </p>
      <h2>Vérifier un document</h2>
      <p>
        Les avis d&apos;échéance et les quittances émis par LoyerCI portent un QR code et un code de vérification. Leur authenticité se
        contrôle uniquement sur cette application, à l&apos;adresse affichée sur le document. LoyerCI ne vous demandera jamais de payer sur
        un numéro ou un compte indiqué dans un message.
      </p>
    </LegalPage>
  );
}
