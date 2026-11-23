import { expect, test } from "@playwright/test";
import { accountantState, admin, ownerState } from "./helpers";

/** P2.1 : biens. */
const code = `E${Date.now().toString(36).slice(-6).toUpperCase()}`;

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("crée puis modifie un bien ; doublon de code refusé", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard/biens");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const form = page.getByRole("form", { name: "Nouveau bien" });
    await form.getByLabel("Code").fill(code.toLowerCase());
    await form.getByLabel("Type").selectOption("studio");
    await form.getByLabel("Libellé").fill("Studio meublé test");
    await form.getByLabel("Commune").selectOption("Treichville");
    await form.getByLabel("Quartier").fill("Avenue 8");
    await form.getByRole("button", { name: "Créer le bien" }).click();
    await expect(form.getByRole("status")).toContainText("Bien créé");
    await expect(form.getByLabel("Code")).toHaveValue(""); // formulaire vidé après création
    const row = page.getByTestId("property").filter({ hasText: code });
    await expect(row).toContainText("Vacant");

    // Doublon
    await form.getByLabel("Code").fill(code);
    await form.getByLabel("Libellé").fill("Doublon");
    await form.getByLabel("Commune").selectOption("Treichville");
    await form.getByRole("button", { name: "Créer le bien" }).click();
    await expect(form.getByRole("status")).toContainText("existe déjà");

    // Intérieur du pays : commune en saisie libre ; modification tracée
    await row.click();
    const edit = page.getByRole("form", { name: "Modifier le bien" });
    await edit.getByLabel("Ville").fill("Bouaké");
    await edit.getByLabel("Commune").fill("Bouaké");
    await edit.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(edit.getByRole("status")).toContainText("Bien modifié");
    const { data } = await admin().from("properties").select("city, commune").eq("code", code).single();
    expect(data).toEqual({ city: "Bouaké", commune: "Bouaké" });
  });
});

test.describe("comptable", () => {
  test.use({ storageState: accountantState });
  test("lit les biens sans pouvoir les modifier", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard/biens");
    await expect(page.getByTestId("property").first()).toBeVisible();
    await expect(page.getByRole("form", { name: "Nouveau bien" })).toHaveCount(0);
  });
});
