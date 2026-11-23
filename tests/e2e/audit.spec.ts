import { expect, test } from "@playwright/test";
import { accountantState, ownerState } from "./helpers";

/** P2.6 : journal d'audit consultable (propriétaire), filtres, export tracé, intégrité. */
test.describe.configure({ mode: "serial" });
const PAGE = "/dashboard/audit";

test.describe("comptable", () => {
  test.use({ storageState: accountantState });
  test("ni page ni export", async ({ page, request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(PAGE);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await request.get("/api/audit/csv")).status()).toBe(403);
  });
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("intégrité, export CSV tracé puis filtre par action", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { name: "Journal d'audit" })).toBeVisible();
    await expect(page.getByTestId("audit-integrity")).toContainText("Journal intègre");
    await expect(page.getByTestId("audit-row").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Exporter/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^journal-audit-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await (await download.createReadStream()).toArray();
    const text = Buffer.concat(csv).toString("utf8");
    expect(text.split("\r\n")[0]).toContain('"empreinte_sha256"');

    // L'export lui-même apparaît dans le journal.
    await page.getByLabel("Action").selectOption("audit_exporte");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/action=audit_exporte/);
    const rows = page.getByTestId("audit-row");
    await expect(rows.first()).toContainText("Journal exporté");
    await expect(rows.first()).toContainText("Coulibaly");
    for (const r of await rows.all()) await expect(r).toContainText("Journal exporté");
  });

  test("filtres invalides : ignorés à l'affichage, refusés à l'export", async ({ page, request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(`${PAGE}?action=drop%20table&acteur=1%20or%201%3D1`);
    await expect(page.getByTestId("audit-row").first()).toBeVisible();
    expect((await request.get("/api/audit/csv?acteur=x")).status()).toBe(400);
    expect((await request.get("/api/audit/csv?du=2026-12-01&au=2026-11-01")).status()).toBe(400);
  });
});
