import { expect, test } from "@playwright/test";
import { accountantState, admin, OWNER, ownerState } from "./helpers";

/** P2.5 : membres et rôles (propriétaire uniquement), dernier propriétaire protégé, organisation active. */
test.describe.configure({ mode: "serial" });
const PAGE = "/dashboard/parametres/membres";

test.describe("comptable", () => {
  test.use({ storageState: accountantState });
  test("n'accède pas à l'équipe", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(PAGE);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("ajoute, change le rôle puis retire un membre", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const email = `membre.${Date.now()}@exemple.ci`;
    const name = "Bamba Awa";
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { name: "Équipe" })).toBeVisible();

    const form = page.getByRole("form", { name: "Ajouter un membre" });
    await form.getByLabel("Nom et prénoms").fill(name);
    await form.getByLabel("E-mail").fill(email);
    await form.getByLabel("Rôle").selectOption("manager");
    await form.getByRole("button", { name: "Ajouter le membre" }).click();
    await expect(form.getByRole("status")).toContainText("Membre ajouté");

    const row = page.getByTestId("member-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Doublon refusé.
    await form.getByLabel("Nom et prénoms").fill(name);
    await form.getByLabel("E-mail").fill(email);
    await form.getByRole("button", { name: "Ajouter le membre" }).click();
    await expect(form.getByRole("status")).toContainText("déjà membre");

    await row.getByLabel(`Rôle de ${name}`).selectOption("accountant");
    await expect(row.getByRole("status")).toContainText("Rôle modifié");

    const db = admin();
    const { data: logs } = await db
      .from("audit_logs")
      .select("action")
      .in("action", ["membre_ajoute", "membre_role_modifie"])
      .order("created_at", { ascending: false })
      .limit(2);
    expect(logs?.map((l) => l.action).sort((a, b) => a.localeCompare(b))).toEqual(["membre_ajoute", "membre_role_modifie"]);

    page.once("dialog", (d) => void d.accept());
    await row.getByRole("button", { name: `Retirer ${name}` }).click();
    await expect(page.getByTestId("member-row").filter({ hasText: name })).toHaveCount(0);
  });

  test("le dernier propriétaire ne peut pas se rétrograder", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(PAGE);
    const me = page.getByTestId("member-row").filter({ hasText: "(vous)" });
    const select = me.getByRole("combobox");
    await select.selectOption("manager");
    await expect(me.getByRole("status")).toContainText("au moins un propriétaire");
    await expect(select).toHaveValue("owner");
  });

  test("bascule d'organisation active", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const db = admin();
    const { data: users } = await db.auth.admin.listUsers();
    const owner = users.users.find((u) => u.email === OWNER)!;
    const { data: org } = await db.from("organizations").insert({ name: "Bouaké Habitat", kind: "agence" }).select("id").single();
    await db.from("memberships").insert({ org_id: org!.id, user_id: owner.id, role: "accountant" });
    try {
      await page.goto("/dashboard");
      const switcher = page.getByLabel("Organisation active");
      await expect(switcher).toBeVisible();
      await switcher.selectOption({ label: "Bouaké Habitat" });
      await expect(page.getByText(/Situation de .* · Bouaké Habitat/)).toBeVisible();
      // Comptable dans cette organisation : l'équipe n'est plus accessible.
      await expect(page.getByRole("link", { name: /Équipe/ })).toHaveCount(0);
      await page.goto(PAGE);
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.getByLabel("Organisation active").selectOption({ label: "Akwaba Immobilier" });
      await expect(page.getByText(/Situation de .* · Akwaba Immobilier/)).toBeVisible();
    } finally {
      await db.from("memberships").delete().eq("org_id", org!.id);
      await db.from("organizations").delete().eq("id", org!.id);
    }
  });
});
