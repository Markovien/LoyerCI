import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, auditDetails, auditRange, parseAuditFilters } from "@/lib/audit";
import { csvCell, csvDocument } from "@/lib/csv";

describe("journal d'audit (P2.6)", () => {
  it("les libellés couvrent exactement la contrainte CHECK de la dernière migration", () => {
    const dir = join(__dirname, "..", "supabase", "migrations");
    const last = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .filter((s) => s.includes("audit_logs_action_check check"))
      .at(-1)!;
    const body = /audit_logs_action_check check \(action in \(([\s\S]*?)\)\);/.exec(last)![1]!;
    const actions = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort((a, b) => a.localeCompare(b));
    expect(Object.keys(AUDIT_ACTIONS).sort((a, b) => a.localeCompare(b))).toEqual(actions);
  });

  it("filtres : valeurs invalides ignorées, jamais transmises", () => {
    expect(parseAuditFilters({ action: "membre_ajoute", du: "2026-11-01", au: "2026-11-30", page: "2" })).toEqual({
      action: "membre_ajoute",
      du: "2026-11-01",
      au: "2026-11-30",
      acteur: undefined,
      page: 2,
    });
    expect(parseAuditFilters({ action: "drop table" })).toEqual({ page: 1 });
    expect(parseAuditFilters({ acteur: "1 or 1=1" })).toEqual({ page: 1 });
    expect(parseAuditFilters({ du: "2026-12-01", au: "2026-11-01" })).toEqual({ page: 1 });
    expect(parseAuditFilters({ du: "", action: "" })).toMatchObject({ page: 1, du: undefined, action: undefined });
  });

  it("période : « au » inclusif", () => {
    expect(auditRange({ du: "2026-11-01", au: "2026-11-30" })).toEqual({
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-12-01T00:00:00.000Z",
    });
    expect(auditRange({})).toEqual({ from: undefined, to: undefined });
  });

  it("détails bornés", () => {
    expect(auditDetails({})).toBe("");
    expect(auditDetails({ a: "x".repeat(500) }, 20)).toHaveLength(20);
  });

  it("CSV : injection de formules neutralisée", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("-2+3")).toBe(`"'-2+3"`);
    expect(csvCell(null)).toBe('""');
    expect(csvDocument([["a", 1]]).startsWith("﻿")).toBe(true);
  });
});
