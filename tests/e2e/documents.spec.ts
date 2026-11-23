import { expect, test, type Page } from "@playwright/test";
import { admin, ownerState } from "./helpers";

/** D.2 : envoi des documents par le bailleur depuis SES comptes, suivi des envois. */
test.describe.configure({ mode: "serial" });
test.use({ storageState: ownerState });

async function documentRow(page: Page, tenant: string, label: RegExp) {
  await page.goto("/dashboard");
  const card = page.getByRole("heading", { name: /Documents à envoyer/ }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]/..");
  const done = card.getByText(/Déjà envoyés/);
  if (await done.count()) await done.click(); // ouvre la section repliée si besoin
  return page.getByTestId("document-to-send").filter({ hasText: tenant }).filter({ hasText: label }).first();
}

test("avis du mois : préparation, message WhatsApp vérifiable sans coordonnée de paiement, envoi tracé", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  await context.route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "ok" }));
  const row = await documentRow(page, "Kouassi Jean-Marc", /Avis d'échéance/);
  await row.getByRole("button", { name: /Préparer l'envoi|Renvoyer/ }).click();
  const wa = row.getByRole("link", { name: "WhatsApp" });
  await expect(wa).toBeVisible();
  const href = (await wa.getAttribute("href"))!;
  expect(href).toMatch(/^https:\/\/wa\.me\/2250707123456\?text=/);
  const text = decodeURIComponent(href.split("text=")[1]!);
  expect(text).toMatch(/\/verify\/[0-9a-f-]{36}\?c=[0-9a-f]{16}/);
  expect(text).toContain("ne vous demandera jamais votre code Mobile Money");
  expect(text).not.toMatch(/CI\d{2}[A-Z0-9]{4}|0707000111|0505000333|\/pay\//);
  await expect(row.getByRole("link", { name: /Télécharger le PDF/ })).toHaveAttribute("href", /\/api\/notices\/.+\/pdf/);
  await page.screenshot({ path: "test-results/captures/proprietaire-documents-a-envoyer-390.png", fullPage: true });

  const popup = context.waitForEvent("page");
  await wa.click();
  await (await popup).close();
  await expect(row.getByText(/WhatsApp ·/)).toBeVisible();
  await expect
    .poll(
      async () => (await admin().from("document_deliveries").select("id", { count: "exact", head: true }).eq("channel", "whatsapp")).count,
    )
    .toBeGreaterThan(0);
});

test("partage natif : le PDF signé est joint et l'envoi est tracé", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  // Navigateur de test sans Web Share : on simule l'API pour vérifier le fichier transmis.
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; type: string; size: number }[] };
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files?: File[] }) => {
        w.__shared = (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size }));
      },
    });
  });
  const row = await documentRow(page, "Kouassi Jean-Marc", /Quittance/);
  await row.getByRole("button", { name: /Préparer l'envoi|Renvoyer/ }).click();
  await row.getByRole("button", { name: "Partager le PDF" }).click();
  const shared = await page.evaluate(() => (window as unknown as { __shared?: { name: string; type: string; size: number }[] }).__shared);
  expect(shared?.[0]?.name).toMatch(/^quittance-AKW-\d{4}-\d{6}\.pdf$/);
  expect(shared?.[0]?.type).toBe("application/pdf");
  expect(shared?.[0]?.size).toBeGreaterThan(1000);
  await expect(row.getByText(/partagé ·/)).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await admin()
            .from("document_deliveries")
            .select("id", { count: "exact", head: true })
            .eq("channel", "partage")
            .eq("doc_type", "quittance")
        ).count,
    )
    .toBeGreaterThan(0);
});
