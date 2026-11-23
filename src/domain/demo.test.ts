import { describe, expect, it } from "vitest";
import { demoData } from "./demo";
import { periodOf, previousPeriod, summarize, comparable } from "./reports";
import { debtRest } from "./split";

describe("démo : freelance fictive", () => {
  const now = new Date(2026, 10, 23);
  const d = demoData(now);
  it("ne date aucun mouvement dans le futur et couvre 12 mois", () => {
    const dates = d.movements.map((m) => m.date).sort();
    expect(dates[dates.length - 1] <= "2026-11-23").toBe(true);
    expect(dates[0] <= "2025-12-31").toBe(true);
    expect(d.snapshots).toHaveLength(11);
  });
  it("relie chaque versement à une dette ou un coffre existant", () => {
    for (const m of d.movements) {
      if (m.debtId) expect(d.debts[m.debtId - 1]).toBeDefined();
      if (m.vaultId) expect(d.vaults[m.vaultId - 1]).toBeDefined();
    }
    const repaid = d.movements.filter((m) => m.debtId === 2).reduce((a, m) => a - m.amount, 0);
    expect(repaid).toBe(d.debts[1].paid);
    expect(debtRest(d.debts[1])).toBe(0);
  });
  it("permet une comparaison sur 6 mois dans les rapports", () => {
    const p = periodOf("6m", now);
    expect(comparable(d.movements as never, previousPeriod(p, "6m"))).toBe(true);
    const sm = summarize(d.movements as never, p, d.settings);
    expect(sm.income).toBeGreaterThan(sm.expenses);
  });
  it("reste stable d'un chargement à l'autre", () => {
    expect(JSON.stringify(demoData(now))).toBe(JSON.stringify(d));
  });
});
