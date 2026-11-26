import { describe, expect, it, vi } from "vitest";

// Base injoignable : le limiteur doit se replier sur sa version locale, pas tout laisser passer.
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: () => ({ single: () => Promise.resolve({ data: null, error: { message: "connexion refusée" } }) }),
  }),
}));

describe("limiteur partagé (P4.1)", () => {
  it("repli local si la base est injoignable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { limit } = await import("@/lib/security/rate-limit");
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await limit("repli:test", 3, 60_000)).ok);
    expect(results).toEqual([true, true, true, false]);
    // Journal structuré, sans la clé (qui peut contenir une IP ou un e-mail).
    expect(spy.mock.calls[0]?.[0]).toContain("rate_limit_fallback");
    expect(String(spy.mock.calls[0]?.[0])).not.toContain("repli:test");
    spy.mockRestore();
  });
});
