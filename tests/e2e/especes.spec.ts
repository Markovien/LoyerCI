import { expect, test } from "@playwright/test";
import { accountantState, admin, ownerState, payableInvoice } from "./helpers";

/** Décision D2 : espèces saisies par un comptable au-delà du seuil -> confirmation du propriétaire. */
test.describe.configure({ mode: "serial" });

let invoice: { id: string; reference: string; amount: number };

test.beforeAll(async () => {
  const db = admin();
  invoice = await payableInvoice("Bamba & Fils SARL");
  const { data: acc } = await db.from("memberships").select("user_id").eq("role", "accountant").limit(1).single();
  const { data, error } = await db
    .rpc("record_cash_payment", { p_actor: acc!.user_id, p_invoice: invoice.id, p_amount: invoice.amount, p_ip: "127.0.0.1", p_ua: "e2e" })
    .single();
  expect(error).toBeNull();
  expect(data!.status).toBe("en_attente_validation");
});

test.describe("comptable", () => {
  test.use({ storageState: accountantState });

  test("voit l'encaissement en attente mais ne peut pas le confirmer", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard");
    const row = page.getByTestId("pending-payment").filter({ hasText: invoice.reference });
    await expect(row).toContainText("Espèces");
    await expect(row).toContainText("Confirmation réservée au propriétaire");
    await expect(row.getByRole("button", { name: "Confirmer", exact: true })).toHaveCount(0);
  });
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("confirme l'encaissement : avis soldé et quittance", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard");
    const row = page.getByTestId("pending-payment").filter({ hasText: invoice.reference });
    await expect(row).toContainText("Saisi par");
    await row.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Paiement confirmé" })).toBeVisible();
    await expect
      .poll(async () => (await admin().from("invoices").select("status").eq("id", invoice.id).single()).data?.status)
      .toBe("paye");
    const { count } = await admin().from("receipts").select("id", { count: "exact", head: true }).eq("invoice_id", invoice.id);
    expect(count).toBe(1);
  });
});
