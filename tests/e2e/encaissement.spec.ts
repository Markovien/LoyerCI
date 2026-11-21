import { expect, test } from "@playwright/test";
import { admin, ownerState, payableInvoice, tenantState } from "./helpers";

/** P1.5 révisé : le bailleur atteste lui-même la réception des fonds. */
test.describe.configure({ mode: "serial" });

const ref = `W${Date.now().toString(36).toUpperCase()}.ENC`;
let a: { id: string; reference: string; amount: number };
let b: { id: string; reference: string; amount: number };
const month = async (invoiceId: string) =>
  (await admin().from("invoices").select("period").eq("id", invoiceId).single()).data!.period.slice(0, 7);

test.beforeAll(async () => {
  a = await payableInvoice("Koné Ibrahim");
  b = await payableInvoice("Ouattara Seydou");
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("enregistre un loyer reçu par Wave : avis soldé et quittance, sans déclaration du locataire", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(`/dashboard?mois=${await month(a.id)}`);
    const item = page.locator("li", { hasText: a.reference });
    await item.getByRole("button", { name: "Encaissement" }).click();
    const form = item.getByRole("form", { name: "Enregistrer un encaissement" });
    await form.getByRole("radio", { name: "Mobile Money" }).click();
    await form.getByRole("radio", { name: "Wave" }).click();
    await form.getByLabel("N° de transaction").fill(ref);
    await page.screenshot({ path: "test-results/captures/proprietaire-encaissement-390.png", fullPage: true });
    await form.getByRole("button", { name: /Enregistrer l'encaissement/ }).click();
    await expect.poll(async () => (await admin().from("invoices").select("status").eq("id", a.id).single()).data?.status).toBe("paye");
    const { data: r } = await admin().from("receipts").select("payment_methods").eq("invoice_id", a.id).single();
    expect(r?.payment_methods).toBe("mobile_money");
  });

  test("le même transfert ne peut pas être enregistré deux fois", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(`/dashboard?mois=${await month(b.id)}`);
    const item = page.locator("li", { hasText: b.reference });
    await item.getByRole("button", { name: "Encaissement" }).click();
    const form = item.getByRole("form", { name: "Enregistrer un encaissement" });
    await form.getByRole("radio", { name: "Mobile Money" }).click();
    await form.getByRole("radio", { name: "Orange" }).click();
    await form.getByLabel("N° de transaction").fill(ref.toLowerCase());
    await form.getByRole("button", { name: /Enregistrer l'encaissement/ }).click();
    await expect(item.getByRole("status")).toContainText("déjà enregistré");
    expect((await admin().from("invoices").select("amount_paid").eq("id", b.id).single()).data?.amount_paid).toBe(0);
  });
});

test.describe("locataire", () => {
  test.use({ storageState: tenantState });

  test("« J'ai payé » sans n° de transaction", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const inv = await payableInvoice("Kouassi Jean-Marc");
    await page.goto(`/pay/${inv.id}`);
    await page.getByRole("button", { name: /Wave/ }).click();
    await page.getByRole("button", { name: /Déclarer mon paiement/ }).click();
    await expect(page.getByRole("status")).toContainText("Déclaration envoyée");
    const { data } = await admin().from("payments").select("operator_txn_ref, status").eq("invoice_id", inv.id).single();
    expect(data).toMatchObject({ operator_txn_ref: null, status: "en_attente_validation" });
  });
});
