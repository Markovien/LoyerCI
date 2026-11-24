import { expect, test } from "@playwright/test";
import { accountantState, admin, MAILPIT, ownerState } from "./helpers";

/** P3.3 : relances du jour (WhatsApp tracé), réglages, rappel e-mail optionnel. Sans pénalité. */
test.describe.configure({ mode: "serial" });

async function orgId() {
  const { data } = await admin().from("organizations").select("id").eq("name", "Akwaba Immobilier").single();
  return data!.id;
}

test.afterAll(async () => {
  // Réglages par défaut rétablis pour les autres suites.
  await admin()
    .from("org_reminder_settings")
    .delete()
    .eq("org_id", await orgId());
});

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("relance WhatsApp en un geste : message sans coordonnée, relance tracée, ligne traitée", async ({ page, context }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await context.route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "WhatsApp" }));
    const db = admin();
    await page.goto("/dashboard");
    const list = page.getByRole("list", { name: "Relances du jour" });
    await expect(list).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Première relance encore à faire (rejouable : chaque exécution en traite une).
    const first = list.locator('a[href^="https://wa.me/"]').first();
    const text = decodeURIComponent((await first.getAttribute("href"))!.split("?text=")[1]!);
    const reference = /Référence de votre avis : (\S+)/.exec(text)![1]!;
    expect(text).not.toMatch(/pénalit|majoration|CI\d{2}CI|\b0[157](?:\s?\d{2}){4}\b/i);
    const { data: inv } = await db.from("invoices").select("id").eq("payment_reference", reference).single();
    const link = list.locator(`a[href^="https://wa.me/"][href*="${encodeURIComponent(reference)}"]`);
    await expect(link).toHaveCount(1);

    const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
    await popup.close();
    await expect(link).toHaveCount(0); // relance traitée : la ligne quitte la liste
    const { data: logs } = await db.from("audit_logs").select("metadata").eq("action", "relance_envoyee").eq("entity_id", inv!.id);
    expect(logs).toHaveLength(1);
  });

  test("réglage des échéances et du rappel e-mail (propriétaire)", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard/parametres/envois");
    const form = page.getByRole("form", { name: "Réglage des relances" });
    await form.getByLabel("Échéances de relance").fill("J+10, J-5, J+1");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status")).toContainText("Relances enregistrées");
    const { data } = await admin()
      .from("org_reminder_settings")
      .select("offsets, email_enabled")
      .eq("org_id", await orgId())
      .single();
    expect(data).toEqual({ offsets: [-5, 1, 10], email_enabled: true });

    await form.getByLabel("Échéances de relance").fill("J+99");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status")).toContainText("de 1 à 5 valeurs");
  });

  test("rappel automatique par e-mail : au locataire, sans lien s'il n'a pas de compte", async ({ request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const db = admin();
    await db.from("org_reminder_settings").upsert({ org_id: await orgId(), offsets: [-3, 3, 10], email_enabled: true });
    const { data: tenant } = await db.from("tenants").select("id, email").eq("full_name", "Cabinet N'Guessan & Associés").single();
    // Avis non soldé pas encore rappelé par e-mail à l'étape J+3 (rejouable).
    const { data: candidates } = await db
      .from("invoices")
      .select("id, due_date, invoice_reminders(step, channel)")
      .eq("tenant_id", tenant!.id)
      .in("status", ["a_payer", "partiel", "en_retard"])
      .order("due_date");
    const inv = candidates?.find((c) => !c.invoice_reminders.some((r) => r.step === 3 && r.channel === "email_auto"));
    test.skip(!inv, "aucun avis disponible pour ce test (base à réinitialiser)");
    const due = new Date(`${inv!.due_date}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 3);
    const since = Date.now();
    const { data: n, error } = await db.rpc("enqueue_reminder_emails", { p_today: due.toISOString().slice(0, 10) });
    expect(error).toBeNull();
    expect(n).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 5; i++) {
      const r = await request.get("/api/cron/notifications", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
      expect(r.status()).toBe(200);
      if (((await r.json()) as { sent: number }).sent === 0) break;
    }
    type List = { messages?: { ID: string; Created: string; Subject: string; To: { Address: string }[] }[] };
    let text = "";
    for (let i = 0; i < 20 && !text; i++) {
      const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=200`)).json()) as List;
      const m = list.messages?.find(
        (x) =>
          x.To.some((t) => t.Address === tenant!.email) &&
          x.Subject.startsWith("Rappel : loyer") &&
          new Date(x.Created).getTime() >= since - 2000,
      );
      if (m) text = ((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string }).Text;
      else await new Promise((r) => setTimeout(r, 500));
    }
    expect(text).toContain("Retard de 3 jours");
    expect(text).not.toContain("http"); // aucun lien : pas de compte locataire
    expect(text).not.toMatch(/pénalit|majoration/i);
  });
});

test.describe("comptable", () => {
  test.use({ storageState: accountantState });
  test("voit le réglage sans pouvoir le modifier", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    await page.goto("/dashboard/parametres/envois");
    const form = page.getByRole("form", { name: "Réglage des relances" });
    await expect(form.getByLabel("Échéances de relance")).toBeDisabled();
    await expect(form.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
  });
});
