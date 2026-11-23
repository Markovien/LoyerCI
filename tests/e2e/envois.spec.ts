import { expect, test } from "@playwright/test";
import { accountantState, admin, ownerState } from "./helpers";

/** D.5 : comptage des envois et export pour la facturation. */
test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("récapitulatif du mois et export CSV", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    // Un envoi manuel au moins (suite « documents » ou trace créée ici).
    const db = admin();
    const { count } = await db.from("message_events").select("id", { count: "exact", head: true });
    expect(count ?? 0).toBeGreaterThan(0);

    await page.goto("/dashboard/parametres/envois");
    await expect(page.getByRole("heading", { name: /Envois —/ })).toBeVisible();
    expect(Number(await page.getByTestId("manual-total").innerText())).toBeGreaterThan(0);
    await expect(page.getByTestId("billable-total")).toHaveText("0"); // aucun envoi automatique tant qu'aucun fournisseur n'est branché

    const href = (await page.getByRole("link", { name: /Exporter le mois/ }).getAttribute("href"))!;
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain('"date";"canal";"source";"facturable";"document"');
    expect(csv).toMatch(/"(whatsapp|partage)";"manuel";"non"/);
  });
});

test.describe("comptable", () => {
  test.use({ storageState: accountantState });
  test("accède à la consommation", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard/parametres/envois");
    await expect(page.getByRole("heading", { name: /Envois —/ })).toBeVisible();
  });
});
