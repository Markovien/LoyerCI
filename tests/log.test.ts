import { afterEach, describe, expect, it, vi } from "vitest";
import { log, maskIp, redact } from "@/lib/log";

describe("journaux structurés (P4.5)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("masque e-mails, téléphones, IBAN, jetons et JWT", () => {
    const s = redact(
      "jm.kouassi@exemple.ci a payé depuis 07 07 12 34 56 / 2250707123456 / +225 0505987654, IBAN CI15CI0080111301340012530091, " +
        `jeton ${"ab".repeat(32)}, jwt eyJhbGciOi.eyJzdWIiOi.abc-def`,
    );
    expect(s).not.toMatch(/kouassi|0707|2250707|0505987654|CI15CI|abab|eyJ/);
    expect(s).toContain("[email]");
    expect(s).toContain("[tel]");
    expect(s).toContain("[iban]");
    expect(s).toContain("[jeton]");
    expect(s).toContain("[jwt]");
  });

  it("garde les montants, références et identifiants courts", () => {
    expect(redact("450000 FCFA · LOYER-2026-10-VBA07-72 · code=over_email_send_rate_limit")).toBe(
      "450000 FCFA · LOYER-2026-10-VBA07-72 · code=over_email_send_rate_limit",
    );
  });

  it("une ligne JSON par événement, champs filtrés", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("test_evenement", { detail: "contact : awa@exemple.ci", n: 3 });
    const entry = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: "warn", event: "test_evenement", detail: "contact : [email]", n: 3 });
  });

  it("IP tronquée au réseau", () => {
    expect(maskIp("41.202.10.57")).toBe("41.202.10.0/24");
    expect(maskIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::/48");
    expect(maskIp(null)).toBe("inconnue");
  });
});
