import { expect, test } from "@playwright/test";
import { admin, ownerState } from "./helpers";

/** P2.3 : bail (mois d'entrée entier), avance -> quittances, consentement WhatsApp, fin planifiée. */
test.use({ storageState: ownerState });

test("création du bail, avance reçue, fin planifiée", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  const db = admin();
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  const { data: m } = await db.from("memberships").select("user_id, org_id").eq("role", "owner").limit(1).single();
  const { data: propId } = await db.rpc("create_property", {
    p_actor: m!.user_id,
    p_org: m!.org_id,
    p_code: `B${stamp}`,
    p_label: `Studio bail ${stamp}`,
    p_type: "studio",
    p_city: "Abidjan",
    p_commune: "Koumassi",
    p_quartier: null,
    p_address: null,
    p_ip: null,
    p_ua: "e2e",
  });
  const { data: tenantId } = await db.rpc("create_tenant", {
    p_actor: m!.user_id,
    p_org: m!.org_id,
    p_full_name: `Locataire ${stamp}`,
    p_phone: `22505${String(Date.now()).slice(-8)}`,
    p_email: null,
    p_ip: null,
    p_ua: "e2e",
  });
  const start = new Date();
  start.setUTCDate(15);
  const startIso = start.toISOString().slice(0, 10);

  await page.goto("/dashboard/baux");
  await expect(page.getByTestId("lease").first()).toBeVisible(); // mesure APRÈS l'affichage du contenu
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); // aucun débordement à 390 px
  const form = page.getByRole("form", { name: "Nouveau bail" });
  await form.getByLabel("Bien (vacant)").selectOption(propId!);
  await form.getByLabel("Locataire", { exact: true }).selectOption(tenantId!);
  await form.getByLabel("Loyer mensuel (FCFA)").fill("90000");
  await form.getByLabel("Date d'entrée").fill(startIso);
  await expect(form.getByText("Avance attendue : 180 000 FCFA")).toBeVisible();
  await form.getByLabel(/accepte de recevoir ses avis et quittances par WhatsApp/).check();
  await form.getByRole("button", { name: "Créer le bail" }).click();
  await expect(form.getByRole("status")).toContainText("Bail créé. Enregistrez l'avance");

  const card = page.getByTestId("lease").filter({ hasText: `Locataire ${stamp}` });
  await card.getByRole("button", { name: /Avance reçue \(2 mois\)/ }).click();
  await expect(card.getByRole("status")).toContainText("2 mois soldé(s)");
  const { data: lease } = await db.from("leases").select("id").eq("property_id", propId!).single();
  const { data: invoices } = await db
    .from("invoices")
    .select("period, status, amount_paid, receipts(payment_methods)")
    .eq("lease_id", lease!.id)
    .order("period");
  expect(invoices?.length).toBe(2);
  for (const inv of invoices ?? []) {
    expect(inv.status).toBe("paye");
    expect(inv.amount_paid).toBe(90000); // mois d'entrée entier, sans prorata
    const r = Array.isArray(inv.receipts) ? inv.receipts[0] : inv.receipts;
    expect(r?.payment_methods).toBe("avance");
  }
  const { data: t } = await db.from("tenants").select("whatsapp_consent_at").eq("id", tenantId!).single();
  expect(t?.whatsapp_consent_at).not.toBeNull();

  await page.reload();
  const card2 = page.getByTestId("lease").filter({ hasText: `Locataire ${stamp}` });
  await card2.getByRole("button", { name: "Résilier" }).click();
  const end = new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);
  const term = card2.getByRole("form", { name: "Résilier le bail" });
  await term.getByLabel("Date de fin").fill(end);
  await term.getByLabel("Motif").fill("Départ annoncé");
  await term.getByRole("button", { name: "Confirmer" }).click();
  await expect(card2.getByRole("status")).toContainText("Fin de bail planifiée");
  await page.screenshot({ path: "test-results/captures/proprietaire-baux-390.png", fullPage: true });
});
