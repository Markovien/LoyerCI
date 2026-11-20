import { expect, test } from "@playwright/test";
import { admin, ownerState, payableInvoice, tenantState } from "./helpers";

test.describe.configure({ mode: "serial" });

let invoice: { id: string; reference: string; amount: number };
const txnRef = `MP${Date.now().toString(36).toUpperCase()}.E2E`;

test.beforeAll(async () => {
  invoice = await payableInvoice("Kouassi Jean-Marc");
});

test.describe("locataire : paiement direct (P1.3)", () => {
  test.use({ storageState: tenantState });

  test("Orange Money : numéro et nom attendu, copie en un tap, déclaration en 2 écrans", async ({ page, context }, info) => {
    test.skip(info.project.name !== "mobile", "parcours mobile");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const res = await page.goto(`/pay/${invoice.id}`);
    const html = await res!.text();
    expect(html).not.toContain("int.bceao.pi"); // invariant n° 8 : jamais de QR PI-SPI
    await expect(page.getByText("CinetPay")).toHaveCount(0); // désactivé par défaut : non rendu

    await page.getByRole("button", { name: /Orange Money/ }).click();
    await expect(page.getByText("07 07 00 01 11")).toBeVisible();
    await expect(page.getByText("AKWABA IMMOBILIER", { exact: true })).toBeVisible();
    await expect(page.getByText("Vérifiez que votre application affiche ce nom")).toBeVisible();

    await page.getByRole("button", { name: /Copier Numéro du bénéficiaire/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("0707000111");
    await page.getByRole("button", { name: /Copier Motif/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invoice.reference);

    // Critère d'acceptation : le parcours complet tient en 2 écrans (390 × 844).
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThanOrEqual(2 * 844);
    await page.screenshot({ path: "test-results/captures/locataire-direct-390.png", fullPage: true });

    await page.fill("#txnRef", txnRef);
    await page.fill("#payerPhone", "01 01 99 88 77"); // ≠ téléphone du locataire
    await page.getByRole("button", { name: /Déclarer mon paiement/ }).click();
    await expect(page.getByRole("status")).toContainText("Déclaration envoyée");
    await page.reload();
    await expect(page.getByText("En attente de confirmation du bailleur").first()).toBeVisible();

    const { data: pay } = await admin()
      .from("payments")
      .select("status, provider, operator, payer_msisdn")
      .eq("operator_txn_ref", txnRef)
      .single();
    expect(pay).toMatchObject({ status: "en_attente_validation", provider: "direct", operator: "orange", payer_msisdn: "2250101998877" });
    const { count } = await admin().from("receipts").select("id", { count: "exact", head: true }).eq("invoice_id", invoice.id);
    expect(count).toBe(0); // une déclaration seule n'émet jamais de quittance
  });

  test("Moov (aucun compte du bailleur sur ce réseau) : transfert interopérable PI-SPI", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "parcours mobile");
    await page.goto(`/pay/${invoice.id}`);
    await page.getByRole("button", { name: /Moov Money/ }).click();
    await expect(page.getByText(/transfert interopérable \(PI-SPI\)/)).toBeVisible();
    await expect(page.getByText("Adresse de paiement PI-SPI")).toBeVisible();
  });

  test("un n° de transaction déjà déclaré est refusé", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "parcours mobile");
    await page.goto(`/pay/${invoice.id}`);
    await page.getByRole("button", { name: /Wave/ }).click();
    await page.fill("#txnRef", txnRef.toLowerCase());
    await page.fill("#amount", "1000");
    await page.getByRole("button", { name: /Déclarer mon paiement/ }).click();
    await expect(page.getByRole("status")).toContainText("déjà été déclaré");
  });
});

test.describe("propriétaire : confirmation du paiement direct", () => {
  test.use({ storageState: ownerState });

  test("la confirmation solde l'avis et émet une quittance", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    // Déclaration vieillie de 49 h (base locale) : la carte doit la signaler.
    await admin()
      .from("payments")
      .update({ created_at: new Date(Date.now() - 49 * 3600_000).toISOString() })
      .eq("operator_txn_ref", txnRef);
    const res = await page.goto("/dashboard");
    const html = await res!.text();
    expect(html).not.toMatch(/0101998877|01 01 99 88 77/); // numéro payeur jamais envoyé en clair au navigateur
    expect(html).not.toContain("transfer-proofs");

    const row = page.getByTestId("pending-payment").filter({ hasText: invoice.reference }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(txnRef);
    await expect(row).toContainText("•••• 8877");
    await expect(row).toContainText("plus de 48 h");
    await expect(page.getByText(/en attente depuis plus de 48 h/)).toBeVisible();
    await page.screenshot({ path: "test-results/captures/proprietaire-paiements-a-confirmer-390.png", fullPage: true });

    await row.getByRole("button", { name: "Confirmer", exact: true }).click();
    // Le message survit à la disparition de la ligne (rafraîchissement temps réel).
    await expect(page.getByRole("status").filter({ hasText: "Paiement confirmé" })).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect
      .poll(async () => (await admin().from("invoices").select("status").eq("id", invoice.id).single()).data?.status)
      .toBe("paye");
    const { data: r } = await admin().from("receipts").select("payment_methods, signature_version").eq("invoice_id", invoice.id).single();
    expect(r).toMatchObject({ payment_methods: "mobile_money", signature_version: 2 });
  });
});
