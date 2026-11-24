import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { unzipSync } from "fflate";
import { admin, ownerState, payableInvoice } from "./helpers";

/**
 * P3.4 : documents conservés 2 ans après émission. Les documents sont « vieillis » par la
 * connexion superutilisateur de la base LOCALE (impossible par l'API, comme pour le seed).
 */
test.describe.configure({ mode: "serial" });
const dbUrl = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function newReceipt(tenant: string): Promise<{ id: string; signature: string }> {
  const db = admin();
  const inv = await payableInvoice(tenant);
  const { data: m } = await db.from("memberships").select("user_id").eq("role", "owner").order("created_at").limit(1).single();
  const { error } = await db.rpc("record_cash_payment", {
    p_actor: m!.user_id,
    p_invoice: inv.id,
    p_amount: inv.amount,
    p_ip: null,
    p_ua: "e2e",
  });
  expect(error).toBeNull();
  const { data: r } = await db.from("receipts").select("id, signature").eq("invoice_id", inv.id).single();
  return r!;
}

async function age(receiptId: string, interval: string) {
  if (!["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname)) throw new Error("base locale uniquement");
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`; // contourne l'immuabilité (test)
      await tx`update public.receipts set issued_at = now() - ${interval}::interval where id = ${receiptId}`;
    });
  } finally {
    await sql.end();
  }
}

test.describe("propriétaire", () => {
  test.use({ storageState: ownerState });

  test("alerte J-30, export ZIP journalisé, purge à 2 ans et /verify « plus conservé »", async ({ page, request }, info) => {
    test.skip(info.project.name !== "mobile", "une seule fois");
    const expired = await newReceipt("Ouattara Seydou");
    const soon = await newReceipt("Ouattara Seydou");
    await age(expired.id, "2 years 1 day");
    await age(soon.id, "2 years -10 days");

    await page.goto("/dashboard");
    const banner = page.getByRole("region", { name: "Documents bientôt supprimés" });
    await expect(banner).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const [download] = await Promise.all([page.waitForEvent("download"), banner.getByRole("link", { name: /Exporter/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^documents-loyerci-\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = unzipSync(new Uint8Array(Buffer.concat(await (await download.createReadStream()).toArray())));
    const names = Object.keys(zip);
    expect(names.some((n) => n.startsWith("quittances/"))).toBe(true);
    expect(Buffer.from(zip[names[0]!]!.subarray(0, 5)).toString()).toBe("%PDF-");
    const { count } = await admin().from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "documents_exportes");
    expect(count).toBeGreaterThan(0);

    // Purge (tâche quotidienne en base) : seul le document de plus de 2 ans disparaît.
    const { error } = await admin().rpc("purge_expired_documents");
    expect(error).toBeNull();
    const { data: left } = await admin().from("receipts").select("id").in("id", [expired.id, soon.id]);
    expect(left?.map((r) => r.id)).toEqual([soon.id]);

    const v = await request.get(`/verify/${expired.id}?c=${expired.signature.slice(0, 16)}`);
    expect(await v.text()).toContain("Document plus conservé");
    const wrong = await request.get(`/verify/${expired.id}?c=ffffffffffffffff`);
    expect(await wrong.text()).not.toContain("Document plus conservé");
  });
});

test("retrait des fichiers : route réservée à l'ordonnanceur", async ({ request }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  expect((await request.get("/api/cron/retention")).status()).toBe(401);
  const ok = await request.get("/api/cron/retention", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ failed: 0 });
});
