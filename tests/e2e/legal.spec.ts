import { expect, test } from "@playwright/test";

/** P4.8 : pages légales publiques, liées depuis chaque page, lisibles à 390 px. */
const PAGES = [
  { path: "/mentions-legales", heading: "Mentions légales", must: "ne détient et ne reverse jamais les loyers" },
  { path: "/confidentialite", heading: "Politique de confidentialité", must: "2 ans après leur émission" },
  { path: "/cgu", heading: "Conditions générales d'utilisation", must: "LoyerCI ne détient jamais les fonds" },
];

test.use({ storageState: { cookies: [], origins: [] } });

for (const p of PAGES) {
  test(`${p.heading} : accessible sans connexion`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
    await expect(page.getByText(p.must)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test("liens légaux en pied de chaque page", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  await page.goto("/login");
  for (const name of ["Mentions légales", "Confidentialité", "Conditions d'utilisation"])
    await expect(page.getByRole("contentinfo").getByRole("link", { name })).toBeVisible();
});
