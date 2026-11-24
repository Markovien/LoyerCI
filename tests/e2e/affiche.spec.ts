import { expect, test } from "@playwright/test";
import { accountantState, admin, ownerState, payableInvoice, tenantState } from "./helpers";

/** P1.7 : affiche de guichet PI-SPI (présentiel uniquement, invariant 8). */
const PAYMENT_ADDRESS = "3497a720-ab11-4973-9619-534e04f263a1";
const EMV_PISPI = /000201[\s\S]*int\.bceao\.pi/;

async function posterAccountId() {
  const { data } = await admin().from("payout_accounts").select("id").eq("pispi_alias", PAYMENT_ADDRESS).single();
  return data!.id;
}

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });
  test("imprime l'affiche de guichet depuis l'adresse de paiement active (tracé)", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard/parametres/paiements");
    const card = page.getByTestId("receiving-account").filter({ hasText: PAYMENT_ADDRESS });
    const link = card.getByRole("link", { name: "Imprimer l'affiche de guichet" });
    await expect(link).toBeVisible();
    // L'alias « numéro de téléphone » n'offre pas d'affiche et l'explique.
    await expect(page.getByTestId("receiving-account").filter({ hasText: "Un numéro de téléphone ne peut pas figurer" })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const since = new Date().toISOString();
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe("affiche-guichet-pispi.pdf");
    const bytes = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const { data: logs } = await admin()
      .from("audit_logs")
      .select("entity_id")
      .eq("action", "affiche_guichet_generee")
      .gte("created_at", since);
    expect(logs?.map((l) => l.entity_id)).toContain(await posterAccountId());
  });
});

test.describe("comptable", () => {
  test.use({ storageState: accountantState });
  test("ne peut pas générer l'affiche", async ({ request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const r = await request.get(`/api/pispi-poster?account=${await posterAccountId()}`);
    expect(r.status()).toBe(403);
    expect((await request.get("/api/pispi-poster?account=pas-un-uuid")).status()).toBe(400);
  });
});

test.describe("locataire", () => {
  test.use({ storageState: tenantState });
  test("aucune page de paiement ni avis ne contient de QR PI-SPI", async ({ page, request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const inv = await payableInvoice("Kouassi Jean-Marc");
    for (const path of ["/pay", `/pay/${inv.id}`]) {
      const html = await (await request.get(path)).text();
      expect(html).not.toMatch(EMV_PISPI);
      expect(html).not.toContain("int.bceao.pi");
    }
    await page.goto(`/pay/${inv.id}`);
    expect(await page.content()).not.toContain("int.bceao.pi");
    const notice = await request.get(`/api/notices/${inv.id}/pdf`);
    expect(notice.status()).toBe(200);
    expect((await notice.body()).toString("latin1")).not.toContain("int.bceao.pi");
    // La route de l'affiche est refusée au locataire.
    expect((await request.get(`/api/pispi-poster?account=${await posterAccountId()}`)).status()).toBe(403);
  });
});
