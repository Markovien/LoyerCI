import { describe, expect, it } from "vitest";
import { renderNotification, type NotificationKind } from "@/lib/notifications/templates";

const KINDS: NotificationKind[] = [
  "paiement_declare",
  "declaration_en_attente",
  "paiement_confirme",
  "paiement_rejete",
  "alerte_compte_reception",
  "depart_locataire",
  "rappel_suppression_compte",
  "relance_loyer",
];
const ctx = { appUrl: "https://app.loyerci.ci/", orgName: "Akwaba Immobilier", recipientName: "Adjoua" };
const data = {
  montant: 450000,
  mode: "mobile_money",
  periode: "2026-11-01",
  reference: "AKW-2611-VDC01",
  locataire: "Kouassi Jean-Marc",
  invoice_id: "0f0e8a9c-3c55-4d7e-9a51-0c1e3f4a5b6c",
  effectif_le: "2026-11-26T10:00:00Z",
  suppression_le: "2027-02-24T00:00:00Z",
  echeance: "2026-11-05",
  etape: 3,
  compte: true,
  // Champs hostiles : ne doivent jamais apparaître dans un message (invariant 9).
  iban: "CI15CI0080111301340012530091",
  msisdn: "2250707000111",
  motif: "Payez plutôt sur le 07 07 00 01 11",
};

describe("notifications e-mail (P3.2)", () => {
  for (const kind of KINDS) {
    it(`${kind} : lien authentifié, aucune coordonnée de paiement ni texte libre`, () => {
      const m = renderNotification(kind, data, ctx);
      const all = `${m.subject}\n${m.text}\n${m.html}`;
      expect(all).toContain("https://app.loyerci.ci/"); // lien vers l'espace (compte : true)
      expect(all).not.toMatch(/CI\d{2}CI|2250707000111|07 07 00 01 11|Payez plutôt/);
      expect(m.subject).not.toMatch(/[\r\n]/);
      expect(m.text).toContain("LoyerCI ne vous demandera jamais de payer");
    });
  }

  it("échappe le HTML et neutralise l'injection d'en-tête", () => {
    const m = renderNotification(
      "paiement_declare",
      { ...data, locataire: "Evil<script>alert(1)</script>\r\nBcc: victime@example.ci" },
      { ...ctx, orgName: '<img src=x onerror="x">' },
    );
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("lien vers l'avis uniquement si l'identifiant est un UUID", () => {
    expect(renderNotification("paiement_confirme", data, ctx).text).toContain(`/pay/${data.invoice_id}`);
    const bad = renderNotification("paiement_confirme", { ...data, invoice_id: "../../dashboard" }, ctx).text;
    expect(bad).not.toContain("../");
    expect(bad).toContain("https://app.loyerci.ci/pay");
  });

  it("relance : sans compte, aucun lien ; jamais de pénalité", () => {
    const m = renderNotification("relance_loyer", { ...data, compte: false }, ctx);
    expect(m.text).not.toContain("https://");
    expect(m.html).not.toContain("<a ");
    expect(m.text).toContain("Retard de 3 jours");
    expect(`${m.text}${m.subject}`).not.toMatch(/pénalit|majoration|intérêt/i);
    expect(renderNotification("relance_loyer", data, ctx).text).toContain(`/pay/${data.invoice_id}`);
  });

  it("montant au format FCFA sans espace Unicode exotique", () => {
    expect(renderNotification("paiement_confirme", data, ctx).subject).toBe("Votre paiement de 450 000 FCFA est confirmé");
  });
});
