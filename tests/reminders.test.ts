import { describe, expect, it } from "vitest";
import { buildReminderText, daysFromDue, formatOffsets, parseOffsets, reminderStep, stepLabel } from "@/lib/reminders";

describe("relances (P3.3)", () => {
  it("étape : dernière échéance atteinte (même règle que la base)", () => {
    const o = [-3, 3, 10];
    expect(reminderStep("2026-11-05", "2026-11-01", o)).toBeNull();
    expect(reminderStep("2026-11-05", "2026-11-02", o)).toBe(-3);
    expect(reminderStep("2026-11-05", "2026-11-09", o)).toBe(3);
    expect(reminderStep("2026-11-05", "2026-11-25", o)).toBe(10);
    expect(daysFromDue("2026-02-27", "2026-03-02")).toBe(3);
  });

  it("saisie des échéances : bornée, triée, dédoublonnée", () => {
    expect(parseOffsets("J-3, J+3, 10")).toEqual([-3, 3, 10]);
    expect(parseOffsets("10 3 -3 3")).toEqual([-3, 3, 10]);
    expect(parseOffsets("1,2,3,4,5,6")).toBeNull();
    expect(parseOffsets("99")).toBeNull();
    expect(parseOffsets("abc")).toBeNull();
    expect(parseOffsets("")).toBeNull();
    expect(formatOffsets([-3, 0, 10])).toBe("J-3, J, J+10");
  });

  it("libellés", () => {
    expect(stepLabel(-3)).toBe("Rappel 3 jours avant l'échéance");
    expect(stepLabel(1)).toBe("Retard de 1 jour");
  });

  it("texte WhatsApp : sans coordonnée de paiement ni pénalité ; lien seulement avec un compte", () => {
    const base = {
      tenantName: "Koné Ibrahim",
      landlordName: "Akwaba Immobilier",
      period: "2026-11-01",
      remaining: 185000,
      dueDate: "2026-11-05",
      reference: "AKW-2611-MRC02",
      step: 10,
      payUrl: null,
    };
    const t = buildReminderText(base);
    expect(t).toContain("n'est pas encore réglé");
    expect(t).toContain("AKW-2611-MRC02");
    expect(t).not.toMatch(/https?:\/\//);
    expect(t).not.toMatch(/pénalit|majoration|intérêt|\b0[157]\d{8}\b|CI\d{2}CI/i);
    expect(buildReminderText({ ...base, step: -3, payUrl: "https://app/pay/x" })).toContain("est attendu le");
  });
});
