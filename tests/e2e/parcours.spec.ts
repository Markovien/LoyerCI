import { expect, test } from "@playwright/test";
import { admin, nextPeriod, ownerState, tenantState } from "./helpers";

/** PDF minimal sans contenu actif (accepté par sniffProof / pdfLooksActive). */
const PROOF_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test.describe.configure({ mode: "serial" });

let invoiceId = "";
let reference = "";

test.beforeAll(async () => {
  // Avis de Kouassi Jean-Marc non soldé sur un mois futur (indépendant de l'état du seed).
  const db = admin();
  const { data: tenant } = await db.from("tenants").select("id").eq("full_name", "Kouassi Jean-Marc").single();
  for (let k = 1; k <= 24 && !invoiceId; k++) {
    const period = nextPeriod(k);
    await db.rpc("generate_monthly_invoices", { p_period: period });
    const { data: inv } = await db
      .from("invoices")
      .select("id, status, payment_reference")
      .eq("tenant_id", tenant!.id)
      .eq("period", period)
      .single();
    if (inv && inv.status !== "paye" && inv.status !== "annule") {
      const { count } = await db
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", inv.id)
        .eq("status", "en_attente_validation");
      if (!count) ({ id: invoiceId, payment_reference: reference } = inv);
    }
  }
  expect(invoiceId, "aucun avis payable trouvé").not.toBe("");
});

test.describe("anonyme", () => {
  test("les espaces protégés redirigent vers la connexion", async ({ page }) => {
    for (const path of ["/dashboard", `/pay/${invoiceId}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });
});

test.describe("locataire", () => {
  test.use({ storageState: tenantState });

  test("déclare un virement avec preuve ; aucun QR PI-SPI dans la page (invariant n° 8)", async ({ page }) => {
    const res = await page.goto(`/pay/${invoiceId}`);
    expect(await res!.text()).not.toContain("int.bceao.pi");
    await page.getByRole("tab", { name: /Virement bancaire/ }).click();
    await expect(page.getByText(reference)).toBeVisible();
    await page.setInputFiles("#proof", { name: "recu.pdf", mimeType: "application/pdf", buffer: PROOF_PDF });
    await page.fill("#bankReference", "E2E-VIR-001");
    await page.getByRole("button", { name: /Envoyer la preuve/ }).click();
    await expect(page.getByRole("status")).toContainText("Preuve envoyée");
    await page.screenshot({ path: `test-results/captures/locataire-virement-${test.info().project.name}.png`, fullPage: true });
  });

  test("un fichier déguisé (HTML renommé en .pdf) est refusé", async ({ page }) => {
    await page.goto(`/pay/${invoiceId}`);
    await page.getByRole("tab", { name: /Virement bancaire/ }).click();
    await page.setInputFiles("#proof", {
      name: "recu.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("<html><script>alert(1)</script>"),
    });
    await page.getByRole("button", { name: /Envoyer la preuve/ }).click();
    await expect(page.getByRole("status")).toContainText("Format non reconnu");
  });
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("@desktop tableau de bord : KPIs et avis WhatsApp sans coordonnées de paiement", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Encaissé ce mois")).toBeVisible();
    const href = await page.locator('a[href^="https://wa.me/"]').first().getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/225\d{10}\?text=/);
    const text = decodeURIComponent(href!.split("text=")[1]!);
    expect(text).toContain("/pay/");
    expect(text).not.toMatch(/CI\d{2}[A-Z0-9]{4}/); // aucun IBAN
    expect(text).not.toMatch(/(?:\+?225)?\s?0[157](?:\s?\d{2}){4}/); // aucun numéro Mobile Money
    await page.screenshot({ path: `test-results/captures/proprietaire-${test.info().project.name}.png`, fullPage: true });
  });

  test("valide le virement déclaré : l'avis est soldé et une quittance est émise", async ({ page }) => {
    await page.goto("/dashboard");
    const row = page.locator("div.rounded-lg.border.p-3", { hasText: reference }).filter({ hasText: "E2E-VIR-001" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Valider" }).click();
    await expect.poll(async () => (await admin().from("invoices").select("status").eq("id", invoiceId).single()).data?.status).toBe("paye");
    const { count } = await admin().from("receipts").select("id", { count: "exact", head: true }).eq("invoice_id", invoiceId);
    expect(count).toBe(1);
  });
});

test.describe("quittance", () => {
  test.use({ storageState: tenantState });

  test("PDF téléchargeable, QR vers /verify authentique ; faux code refusé", async ({ page, request }) => {
    await page.goto(`/pay/${invoiceId}`);
    const link = page.locator('a[href^="/api/receipts/"]');
    await expect(link).toBeVisible();
    const pdf = await page.request.get((await link.getAttribute("href"))!);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const { data: r } = await admin().from("receipts").select("id, signature").eq("invoice_id", invoiceId).single();
    await page.goto(`/verify/${r!.id}?c=${r!.signature.slice(0, 16)}`);
    await expect(page.getByText("Quittance Authentique")).toBeVisible();

    const bad = await request.get(`/verify/${r!.id}?c=0123456789abcdef`);
    expect(await bad.text()).toContain("Quittance non reconnue");
  });
});
