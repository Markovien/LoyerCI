import { expect, test } from "@playwright/test";
import { admin, ownerState, payableInvoice, tenantState } from "./helpers";

/** D.1 : avis d'échéance PDF signés et vérifiables. */
test.describe.configure({ mode: "serial" });

let invoice: { id: string; reference: string; amount: number };

test.beforeAll(async () => {
  invoice = await payableInvoice("Kouassi Jean-Marc");
});

test.describe("locataire", () => {
  test.use({ storageState: tenantState });

  test("télécharge son avis signé ; /verify le reconnaît, un faux code est refusé", async ({ page, request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto(`/pay/${invoice.id}`);
    const link = page.getByRole("link", { name: /Télécharger l'avis d'échéance/ });
    await expect(link).toBeVisible();
    const pdf = await page.request.get((await link.getAttribute("href"))!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-disposition"]).toContain(`avis-${invoice.reference}.pdf`);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const { data: n } = await admin().from("notices").select("id, signature").eq("invoice_id", invoice.id).single();
    await page.goto(`/verify/${n!.id}?c=${n!.signature.slice(0, 16)}`);
    await expect(page.locator('[data-verdict="authentique"]')).toContainText("Avis d'échéance authentique");
    await expect(page.getByText(invoice.reference)).toBeVisible();
    await expect(page.getByText("Ko***** J.-M.")).toBeVisible(); // nom masqué
    await page.screenshot({ path: "test-results/captures/verification-avis-390.png", fullPage: true });

    const bad = await request.get(`/verify/${n!.id}?c=0123456789abcdef`);
    expect(await bad.text()).toContain("Document non reconnu");
  });
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("obtient le même avis (instantané signé unique)", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const res = await page.request.get(`/api/notices/${invoice.id}/pdf`);
    expect(res.status()).toBe(200);
    const { count } = await admin().from("notices").select("id", { count: "exact", head: true }).eq("invoice_id", invoice.id);
    expect(count).toBe(1);
  });

  test("un visiteur sans session ne peut pas télécharger l'avis", async ({ browser }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    // Session explicitement vide : un contexte créé à la main hérite sinon de la session du test.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await ctx.request.get(`/api/notices/${invoice.id}/pdf`);
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});
