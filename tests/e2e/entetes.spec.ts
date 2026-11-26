import { expect, test } from "@playwright/test";

/** P4.7 : en-têtes de sécurité sur les pages publiques et les documents. */
test("en-têtes de sécurité (pages publiques)", async ({ request }, info) => {
  test.skip(info.project.name !== "mobile", "une seule fois");
  for (const path of ["/login", "/verify/00000000-0000-4000-8000-000000000000"]) {
    const h = (await request.get(path)).headers();
    expect(h["strict-transport-security"]).toContain("max-age=63072000");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
    expect(h["x-powered-by"]).toBeUndefined();
    const csp = h["content-security-policy"] ?? "";
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) expect(csp).toContain(d);
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("'unsafe-eval'");
  }
  const verify = (await request.get("/verify/00000000-0000-4000-8000-000000000000")).headers();
  expect(verify["x-robots-tag"]).toBe("noindex, nofollow");
  expect(verify["cache-control"]).toContain("no-store");
});
