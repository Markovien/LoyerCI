import { expect, test } from "@playwright/test";

/** Phase 4 : tâches planifiées exposées en HTTP (secret d'ordonnanceur exigé). */
const auth = () => ({ Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` });

test("P4.2 réconciliation : secret exigé ; sans effet quand CinetPay est désactivé", async ({ request }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  expect((await request.get("/api/cron/reconcile")).status()).toBe(401);
  const r = await request.get("/api/cron/reconcile", { headers: auth() });
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ skipped: "CinetPay non activé" });
});
