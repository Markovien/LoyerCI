import { expect, test } from "@playwright/test";
import { admin, ownerState, payableInvoice } from "./helpers";

/** P2.4 : génération manuelle, annulation d'avis non réglé, annulation de quittance. */
test.use({ storageState: ownerState });

test("génération manuelle des avis du mois puis annulation motivée d'un avis non réglé", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 30); // mois lointain : aucun avis encore
  const month = d.toISOString().slice(0, 7);
  await page.goto(`/dashboard?mois=${month}`);
  await page.getByRole("button", { name: "Générer les avis du mois" }).click();
  await expect(page.getByRole("status").filter({ hasText: /avis générés/ })).toBeVisible();

  const { data: tenant } = await admin().from("tenants").select("id").eq("full_name", "Koné Ibrahim").single();
  const { data: inv } = await admin().from("invoices").select("id").eq("tenant_id", tenant!.id).eq("period", `${month}-01`).single();
  await page.reload();
  // Ligne repérée par l'avis lui-même (le bouton d'annulation disparaît une fois ouvert).
  const row = page.locator("li").filter({ has: page.locator(`a[href="/api/notices/${inv!.id}/pdf"]`) });
  await row.getByRole("button", { name: "Annuler l'avis" }).click();
  await row.getByLabel("Motif").fill("Bien en travaux ce mois-ci");
  await row.getByRole("button", { name: "Confirmer l'annulation" }).click();
  // L'avis annulé est retrié en fin de liste au rafraîchissement : on vérifie son badge
  // (le message transitoire peut disparaître avec le rafraîchissement temps réel).
  await expect(row.getByText("Annulé", { exact: true })).toBeVisible();
  const { data } = await admin().from("invoices").select("status, cancelled_reason").eq("id", inv!.id).single();
  expect(data).toEqual({ status: "annule", cancelled_reason: "Bien en travaux ce mois-ci" });
});

test("annulation d'une quittance : /verify la signale annulée", async ({ page, request }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  const db = admin();
  // Quittance propre au test : espèces encaissées par la propriétaire sur un avis futur.
  const inv = await payableInvoice("Cabinet N'Guessan & Associés");
  const { data: m } = await db.from("memberships").select("user_id").eq("role", "owner").limit(1).single();
  await db.rpc("record_cash_payment", { p_actor: m!.user_id, p_invoice: inv.id, p_amount: inv.amount, p_ip: null, p_ua: "e2e" }).single();
  const { data: r } = await db.from("receipts").select("id, signature").eq("invoice_id", inv.id).single();
  const { data: i } = await db.from("invoices").select("period").eq("id", inv.id).single();

  await page.goto(`/dashboard?mois=${i!.period.slice(0, 7)}`);
  const row = page.locator("li").filter({ has: page.locator(`a[href="/api/notices/${inv.id}/pdf"]`) });
  await row.getByRole("button", { name: "Annuler la quittance" }).click();
  await row.getByLabel("Motif").fill("Billets refusés par la banque");
  await row.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(row.getByRole("status")).toContainText("Quittance annulée");
  const v = await request.get(`/verify/${r!.id}?c=${r!.signature.slice(0, 16)}`);
  expect(await v.text()).toContain("Quittance annulée");
});
