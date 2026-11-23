import { expect, test } from "@playwright/test";
import { admin, MAILPIT, ownerState } from "./helpers";

/** P2.2 : fiche locataire et invitation (rattachement après preuve de l'adresse e-mail). */
test.describe.configure({ mode: "serial" });
test.use({ storageState: ownerState });

const stamp = Date.now().toString(36);
const email = `invite.${stamp}@exemple.ci`;
const phone = `07${String(Date.now()).slice(-8)}`;
let link = "";

async function magicLinkFor(address: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as { messages?: { ID: string; To: { Address: string }[] }[] };
    const m = list.messages?.find((x) => x.To.some((t) => t.Address === address));
    if (m) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { HTML?: string };
      const url = msg.HTML?.match(/https?:\/\/[^"'\s<>]+verify[^"'\s<>]*/)?.[0];
      if (url) return url.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`aucun lien reçu pour ${address}`);
}

test("la propriétaire crée la fiche et invite le locataire", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  await page.goto("/dashboard/locataires");
  const form = page.getByRole("form", { name: "Nouveau locataire" });
  await form.getByLabel("Nom et prénoms").fill(`Diabaté Awa ${stamp}`);
  await form.getByLabel("Téléphone").fill(phone);
  await form.getByLabel("E-mail (facultatif)").fill(email);
  await form.getByRole("button", { name: "Ajouter le locataire" }).click();
  await expect(form.getByRole("status")).toContainText("Locataire ajouté");
  await page.getByTestId("tenant").filter({ hasText: stamp }).click();
  await page.getByRole("button", { name: /Inviter à créer son espace/ }).click();
  link = await page.getByTestId("invitation-link").innerText();
  expect(link).toMatch(/\/invitation\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("link", { name: /Envoyer par WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/225/);
});

test("le locataire ouvre le lien, prouve son e-mail, confirme et arrive dans son espace", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByText("Akwaba Immobilier")).toBeVisible();
  await expect(page.getByText(/^Di\*+ A\./)).toBeVisible(); // nom masqué
  await page.getByLabel("Votre adresse e-mail").fill(email);
  await page.getByRole("button", { name: /Recevoir mon lien/ }).click();
  await expect(page.getByRole("status")).toContainText("lien de connexion a été envoyé");
  await page.goto(await magicLinkFor(email));
  await expect(page).toHaveURL(/\/invitation\/.+\/accepter$/);
  // Rien n'est rattaché au simple affichage
  const { data: before } = await admin().from("tenants").select("user_id").eq("phone", `225${phone}`).single();
  expect(before?.user_id).toBeNull();
  await page.getByRole("button", { name: /Rattacher mon compte à Akwaba Immobilier/ }).click();
  await expect(page).toHaveURL(/\/pay$/);
  const { data: after } = await admin().from("tenants").select("user_id").eq("phone", `225${phone}`).single();
  expect(after?.user_id).not.toBeNull();
  await ctx.close();

  // Lien réutilisé : refusé
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p2 = await other.newPage();
  await p2.goto(link);
  await expect(p2.getByText("Cette invitation a déjà été utilisée.")).toBeVisible();
  await other.close();
});

test("la propriétaire voit le compte rattaché et peut le délier", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  await page.goto("/dashboard/locataires");
  await page.getByTestId("tenant").filter({ hasText: stamp }).click();
  await expect(page.getByText("Compte rattaché.")).toBeVisible();
  await page.getByRole("button", { name: "Délier le compte" }).click();
  await expect(page.getByRole("status")).toContainText("Compte délié");
  const { data } = await admin().from("tenants").select("user_id").eq("phone", `225${phone}`).single();
  expect(data?.user_id).toBeNull();
});
