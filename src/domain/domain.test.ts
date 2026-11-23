import { describe, expect, it } from "vitest";
import { defaultSettings, sampleData } from "./defaults";
import { split, incomeAllocation, incomeOutstanding, debtStatus, openDebts, ruleTotal } from "./split";
import { chargeMonthly, debtSummary, receivedByMonth, taskAlerts } from "./aggregates";
import { fromV1, isV1 } from "./migrate";
import { monthsTo, toBase } from "./money";
import type { Income } from "./types";
import { guessName } from "@/features/Lists";

const s = { ...defaultSettings("Test"), salary: 300000 };

describe("répartition", () => {
  it("salaire complet en phase 1 : 10 / 10 / 80", () => {
    const p = split(300000, "salary", s);
    expect(p.map((x) => [x.key, x.amount])).toEqual([["savings", 30000], ["debts", 30000], ["living", 240000]]);
  });
  it("salaire partiel : on épargne, on ne rembourse pas", () => {
    const p = split(100000, "partial", s);
    expect(p.find((x) => x.key === "debts")).toBeUndefined();
    expect(p.find((x) => x.key === "living")!.amount).toBe(90000);
  });
  it("revenu variable en phase 2 : la voiture remplace les dettes", () => {
    const p = split(100000, "variable", { ...s, phase: 2 });
    expect(p.map((x) => x.key)).toEqual(["savings", "car", "projects", "fun"]);
    expect(p.reduce((a, x) => a + x.amount, 0)).toBe(100000);
  });
  it("toutes les règles par défaut font 100 %", () => {
    for (const ph of [1, 2] as const) {
      expect(ruleTotal(s.rules.salary[ph])).toBeCloseTo(1);
      expect(ruleTotal(s.rules.variable[ph])).toBeCloseTo(1);
    }
  });
});

describe("revenus", () => {
  const base: Income = { order: 1, date: "2026-07-31", kind: "Freelance", client: "", project: "", status: "Payé", currency: "XOF", amount: 100000, deposit: 100000, balance: null, applyRules: true, notes: "" };
  it("n'alloue rien quand les règles sont désactivées (bug v1 corrigé)", () => {
    expect(incomeAllocation({ ...base, applyRules: false }, s, "save")).toBe(0);
    expect(incomeAllocation(base, s, "debts")).toBe(55000);
  });
  it("convertit l'euro au taux fixe et calcule le reste à encaisser", () => {
    const eur = { ...base, currency: "EUR" as const, amount: 100, deposit: 30000 };
    expect(toBase(100, "EUR", s)).toBeCloseTo(65595.7);
    expect(incomeOutstanding(eur, s)).toBeCloseTo(35595.7);
    expect(incomeOutstanding({ ...eur, status: "Annulé" }, s)).toBe(0);
  });
  it("cumule les encaissements par mois", () => {
    const from = new Date(2026, 10, 22);
    const m = receivedByMonth([base, { ...base, date: "2026-11-02", deposit: 5000 }], 12, from);
    expect(m).toHaveLength(12);
    expect(m.find((x) => x.key === "2026-07")!.value).toBe(100000);
    expect(m.at(-1)!.value).toBe(5000);
  });
});

describe("dettes, budget, démarches", () => {
  const d = sampleData();
  it("statut et ordre des dettes", () => {
    expect(debtStatus({ ...d.debts[0], paid: 25000 })).toBe("Remboursée");
    expect(debtStatus(d.debts[1])).toBe("En cours");
    expect(openDebts(d.debts)[0].order).toBe(1);
  });
  it("totalise ce qui reste dû, sans échéance imposée", () => {
    const sum = debtSummary(d.debts);
    expect(sum.rest).toBe(25000 + 30000 + 550000);
    expect(sum.open).toHaveLength(3);
  });
  it("ramène une charge hebdomadaire au mois et ignore « Prévu »", () => {
    expect(chargeMonthly({ ...d.charges[4], amount: 12000 })).toBeCloseTo(52000);
    expect(chargeMonthly({ ...d.charges[0], status: "Prévu" })).toBe(0);
  });
  it("repère les démarches en retard", () => {
    const a = taskAlerts([{ ...d.tasks[0], dueDate: "2026-01-01" }], new Date(2026, 10, 22));
    expect(a.late).toHaveLength(1);
  });
  it("compte les mois restants, mois courant inclus", () => {
    expect(monthsTo("2027-12-31", new Date(2026, 10, 22))).toBe(14);
    expect(monthsTo("2020-01-01", new Date(2026, 10, 22))).toBe(0);
  });
});

describe("migration v1 → v2", () => {
  const v1 = {
    params: { phase: 1, eur: 655.957, usd: 570, salaire: 200000, objectif: "2027-12-31", seuilPS5: 150000,
      sal: { 1: { ep: .1, det: .1, voi: 0, vie: .8 }, 2: { ep: .1, det: 0, voi: .1, vie: .8 } },
      vari: { 1: { ep: .2, det: .55, voi: 0, pro: .15, pla: .1 }, 2: { ep: .35, det: 0, voi: .4, pro: .15, pla: .1 } } },
    freelance: [{ date: "2026-07-31", type: "Freelance", client: "X", projet: "Historique", statut: "Payé", devise: "FCFA", montant: 1000, acompte: "", solde: 1000, notes: "Avant les règles : rien à verser." }],
    dettes: [{ ordre: 1, creancier: "Banque A", type: "Banque", total: 5000, notes: "" }],
    paiements: [{ creancier: "Banque A", montant: 1200 }],
    epargne: [], budget: [], projets: [{ ordre: 1, projet: "Chaise", cat: "Bureau", urgent: "Oui", important: "Oui", budget: 40000, paye: 0, statut: "Planifié", date: "", notes: "" }],
    demarches: [],
  };
  it("détecte et convertit une sauvegarde v1", () => {
    expect(isV1(v1)).toBe(true);
    const b = fromV1(v1 as never);
    expect(b.settings.salary).toBe(200000);
    expect(b.settings.rules.variable[1]).toEqual({ savings: .2, debts: .55, car: 0, projects: .15, fun: .1 });
    expect(b.incomes[0].applyRules).toBe(false);
    expect(b.incomes[0].currency).toBe("XOF");
    expect(b.debts[0].paid).toBe(1200);
    expect(b.projects[0].priority).toBe("Urgent et important");
  });
});

describe("capture de lien", () => {
  it("devine un nom lisible depuis l'URL", () => {
    expect(guessName("https://www.fnac.com/a3786407/Austin-Kleon-Steal-like-an-artist")).toBe("Austin Kleon Steal like an artist");
    expect(guessName("pas une url")).toBe("");
  });
});
