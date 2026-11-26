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

test("P4.5 santé : secret exigé ; état renvoyé", async ({ request }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  expect((await request.get("/api/cron/health")).status()).toBe(401);
  const r = await request.get("/api/cron/health", { headers: auth() });
  expect(r.status()).toBe(200);
  const body = (await r.json()) as { ok: boolean; problems: string[] };
  expect(body.problems).not.toContain("chaine_audit_rompue");
});

test("P4.5 rapports CSP : en-têtes posés, rapport accepté, taille bornée", async ({ request }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  const page = await request.get("/login");
  expect(page.headers()["content-security-policy"]).toContain("report-uri /api/csp-report");
  expect(page.headers()["reporting-endpoints"]).toBe('csp="/api/csp-report"');
  const report = await request.post("/api/csp-report", {
    headers: { "Content-Type": "application/csp-report" },
    data: JSON.stringify({
      "csp-report": {
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?t=1",
        "document-uri": "http://localhost:3000/pay?x=1",
      },
    }),
  });
  expect(report.status()).toBe(204);
  const big = await request.post("/api/csp-report", { headers: { "Content-Type": "application/json" }, data: "x".repeat(9000) });
  expect(big.status()).toBe(413);
});
