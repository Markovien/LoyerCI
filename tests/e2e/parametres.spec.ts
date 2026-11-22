import { expect, test, type Page } from "@playwright/test";
import { accountantState, admin, latestCode, OWNER, ownerState } from "./helpers";

/** P1.6 : coordonnées de réception protégées par ré-authentification, carence et alerte. */
test.describe.configure({ mode: "serial" });

const SETTINGS = "/dashboard/parametres/paiements";
const MSISDN = "01 01 23 45 67";

test.afterAll(async () => {
  // Nettoyage : les autres suites attendent le virement actif.
  const db = admin();
  const { data: org } = await db.from("organizations").select("id").eq("name", "Akwaba Immobilier").single();
  await db.from("org_payment_settings").update({ transfer_enabled: true, direct_enabled: true }).eq("org_id", org!.id);
});

/** Étape 1 : saisie + envoi du code ; gère la limite Supabase d'un e-mail par minute et par adresse. */
async function requestCode(page: Page): Promise<number> {
  const codeForm = page.getByRole("form", { name: "Code de confirmation" });
  const submit = page.getByRole("button", { name: /Continuer : recevoir un code/ });
  let since = Date.now();
  await submit.click();
  await expect(codeForm.or(page.getByText(/patientez une minute/i))).toBeVisible();
  if (await codeForm.isVisible()) return since;
  await page.waitForTimeout(61_000); // limite Supabase : un e-mail par minute et par adresse
  since = Date.now();
  await submit.click();
  await expect(codeForm).toBeVisible({ timeout: 15_000 });
  return since;
}

test.describe("comptable", () => {
  test.use({ storageState: accountantState });
  test("n'accède pas aux paramètres de réception des fonds", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(SETTINGS);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("ajout d'un compte Moov : code faux refusé, bon code -> compte en carence de 48 h", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    test.setTimeout(180_000);
    await page.goto(SETTINGS);
    await page.getByRole("button", { name: /Ajouter un compte de réception/ }).click();
    const form = page.getByRole("form", { name: "Nouveau compte de réception" });
    await form.getByRole("radio", { name: "Mobile Money" }).click();
    await form.getByRole("radio", { name: "Moov" }).click();
    await form.getByLabel("Titulaire du compte").fill("AKWABA IMMOBILIER SARL");
    await form.getByLabel("Numéro Mobile Money").fill(MSISDN);
    await form.getByLabel(/Nom affiché/).fill("AKWABA IMMOBILIER");
    const since = await requestCode(page);
    const code = await latestCode(OWNER, since);

    const confirm = page.getByRole("form", { name: "Code de confirmation" });
    await confirm.getByLabel("Code reçu par e-mail").fill(code === "000000" ? "111111" : "000000");
    await confirm.getByRole("button", { name: "Confirmer l'ajout" }).click();
    await expect(confirm.getByRole("status")).toContainText("Code incorrect");
    expect((await admin().from("payout_accounts").select("id").eq("msisdn", "2250101234567")).data).toHaveLength(0);

    await confirm.getByLabel("Code reçu par e-mail").fill(code);
    await confirm.getByRole("button", { name: "Confirmer l'ajout" }).click();
    await expect(page.getByText(/Compte ajouté\. Par sécurité, il sera actif le/)).toBeVisible();
    const row = page.getByTestId("receiving-account").filter({ hasText: "01 01 23 45 67" });
    await expect(row).toContainText("Actif le");
    await page.screenshot({ path: "test-results/captures/proprietaire-reception-fonds-390.png", fullPage: true });
  });

  test("le tableau de bord alerte pendant la carence et permet d'annuler", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard");
    const banner = page.getByRole("alert", { name: "Nouveau compte de réception" });
    await expect(banner).toContainText("01 01 23 45 67");
    await banner.getByRole("button", { name: /Ce n'est pas moi : annuler/ }).click();
    // Le compte n'est plus en carence : le bandeau disparaît aussitôt (confirmation visible).
    await expect(page.getByRole("alert", { name: "Nouveau compte de réception" })).toHaveCount(0);
    const { data } = await admin().from("payout_accounts").select("revoked_at").eq("msisdn", "2250101234567").single();
    expect(data?.revoked_at).not.toBeNull();
  });

  test("modes de paiement : désactivation du virement enregistrée et tracée", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(SETTINGS);
    const form = page.getByRole("form", { name: "Modes de paiement" });
    await form.getByLabel(/Virement bancaire/).uncheck();
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status")).toContainText("Paramètres enregistrés");
    const { data } = await admin().from("org_payment_settings").select("transfer_enabled").limit(1).single();
    expect(data?.transfer_enabled).toBe(false);
  });
});
