import { expect, test } from "@playwright/test";
import { admin, tenantState } from "./helpers";

/** D.4 : espace locataire = historique des documents ; avertissement avant suppression du compte. */
test.use({ storageState: tenantState });

test("historique : avis et quittances téléchargeables", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  await page.goto("/pay");
  await expect(page.getByRole("heading", { name: "Mes avis et quittances" })).toBeVisible();
  // Mobile d'abord : aucun défilement horizontal à 390 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("link", { name: "Avis (PDF)" }).first()).toBeVisible();
  const q = page.getByRole("link", { name: "Quittance (PDF)" }).first();
  await expect(q).toBeVisible();
  const res = await page.request.get((await q.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  await expect(page.getByRole("alert", { name: "Suppression du compte" })).toHaveCount(0); // bail en cours : aucun avertissement
});

test("sortie du parc : date de suppression du compte annoncée", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  const db = admin();
  const { data: tenant } = await db.from("tenants").select("id").eq("full_name", "Kouassi Jean-Marc").single();
  const { data: lease } = await db.from("leases").select("id").eq("tenant_id", tenant!.id).eq("status", "actif").single();
  try {
    await db.from("leases").update({ status: "termine" }).eq("id", lease!.id);
    await page.goto("/pay");
    const alert = page.getByRole("alert", { name: "Suppression du compte" });
    await expect(alert).toContainText("Votre compte sera supprimé le");
    await expect(alert).toContainText("Téléchargez dès maintenant");
    await page.screenshot({ path: "test-results/captures/locataire-sortie-du-parc-390.png", fullPage: true });
  } finally {
    await db.from("leases").update({ status: "actif" }).eq("id", lease!.id);
  }
});
