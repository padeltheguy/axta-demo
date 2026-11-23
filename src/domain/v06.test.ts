import { describe, expect, it } from "vitest";
import { parseMomoText, parseMomoCsv, categorize, toMovements, dedupe, matchDebt } from "./movements";
import { comparable, periodOf, previousPeriod, summarize, byMonth, byCategory, wealthSeries, achievements, delta } from "./reports";
import { closurePatch, makeSnapshot } from "./history";
import { sampleData, defaultSettings } from "./defaults";
import type { Debt, Movement } from "./types";

// Extrait FICTIF au format du relevé MoMo (colonnes séparées par 2 espaces ou plus)
const MOMO = `Détails de la transaction
 22 nov. 2026 13:52          Retrait            10000001         BOUTIQUE A (IFU)    -4000             10000000011      125 FCFA       0 FCFA            1
                                                                 QUARTIER 2
 21 nov. 2026 16:48          Débit                               MFS UBA            -27               10000000012      0 FCFA         0 FCFA            -
                                                                 MoMoKash SP
 17 nov. 2026 18:03          Utilisateur MoMo   +229 01 00       BNB MTOs           +45000            10000000013      0 FCFA         48 200 FCFA       PoR:Bill payment
 04 nov. 2026 10:56          Utilisateur MoMo   +229 01 01       KOFFI M            -21500            10000000014      50 FCFA        26 700 FCFA       Merci
                                                                 JEAN DUPONT
 06 nov. 2026 10:26          Débit              1000000002       MFS OPEN SI        -4100             10000000015      0 FCFA         110 000 FCFA      ASSU SAS 6
 09 nov. 2026 22:32          Utilisateur MoMo   +229 01 02       AGENT X            -26500            10000000016      50 FCFA        61 250 FCFA       Sbee chbr`;

const s = defaultSettings("Test");
const debts: Debt[] = [
  { id: 1, order: 1, creditor: "MoMoKash (MTN)", type: "Banque", total: 25000, paid: 0, dueDate: "", notes: "" },
  { id: 2, order: 2, creditor: "Jean DUPONT", type: "Dette personnelle", total: 30000, paid: 0, dueDate: "", notes: "" },
];

describe("relevé MoMo", () => {
  const tx = parseMomoText(MOMO);
  it("lit chaque transaction, son montant, ses frais et sa contrepartie", () => {
    expect(tx).toHaveLength(6);
    expect(tx[0]).toMatchObject({ date: "2026-11-22", type: "Retrait", amount: -4000, fee: 125, id: "10000000011" });
    expect(tx[2].amount).toBe(45000);
    expect(tx[3].name).toContain("JEAN DUPONT");
  });
  it("catégorise avec les règles génériques et relie les dettes", () => {
    const c = tx.map((t) => categorize(t, s, debts));
    expect(c.map((x) => x.category)).toEqual(["Retraits d'espèces", "Remboursement de dette", "Revenus", "Remboursement de dette", "Épargne", "Électricité et eau"]);
    expect(c[1].debtId).toBe(1);
    expect(c[3].debtId).toBe(2);
    expect(matchDebt("BOUTIQUE A", debts)).toBeUndefined();
  });
  it("applique d'abord les règles personnelles", () => {
    const r = categorize(tx[5], { moveRules: [{ id: "1", match: "agent x", category: "Logement" }] }, debts);
    expect(r.category).toBe("Logement");
  });
  it("crée un mouvement de frais et dédoublonne par référence", () => {
    const mv = toMovements(tx, s, debts, null);
    expect(mv.filter((m) => m.category === "Frais bancaires et MoMo").map((m) => m.amount)).toEqual([-125, -50, -50]);
    expect(dedupe(mv, mv.slice(0, 3))).toHaveLength(mv.length - 3);
  });
  it("relit le CSV produit par axta", () => {
    const csv = "date;heure;type;montant;frais;id;libelle\n2026-11-22;13:52;Retrait;-4000;125;1343;Retrait BOUTIQUE";
    expect(parseMomoCsv(csv)[0]).toMatchObject({ date: "2026-11-22", amount: -4000, fee: 125 });
    expect(() => parseMomoCsv("a;b\n1;2")).toThrow(/CSV non reconnu/);
  });
});

const mv = (date: string, amount: number, category: Movement["category"]): Movement => ({ order: 0, date, label: "", amount, currency: "XOF", category, accountId: null, debtId: null, vaultId: null, counterparty: "", source: "manuel", ref: "", notes: "" });

describe("rapports par période", () => {
  const now = new Date(2026, 10, 22);
  it("calcule les bornes des périodes", () => {
    expect(periodOf("3m", now)).toMatchObject({ from: "2026-09-01", to: "2026-11-22" });
    expect(periodOf("12m", now).from).toBe("2025-12-01");
    expect(periodOf("year", now, { year: 2027 })).toMatchObject({ from: "2027-01-01", to: "2027-12-31" });
    expect(periodOf("years", now, { from: 2027, to: 2026 })).toMatchObject({ from: "2026-01-01", to: "2027-12-31", label: "2026–2027" });
    expect(previousPeriod({ from: "2026-09-01", to: "2026-11-30", label: "" })).toMatchObject({ from: "2026-06-02", to: "2026-08-31" });
  });
  const ms = [
    mv("2026-09-25", 300000, "Salaire"), mv("2026-09-26", -55000, "Logement"), mv("2026-09-27", -20000, "Retraits d'espèces"),
    mv("2026-10-01", -50000, "Remboursement de dette"), mv("2026-10-02", -30000, "Épargne"), mv("2026-10-03", 10000, "Épargne"),
    mv("2026-10-04", 19200, "Emprunt"), mv("2026-10-05", -16400, "Transfert"), mv("2026-11-10", 100000, "Revenus"), mv("2026-11-11", -3000, "Frais bancaires et MoMo"),
  ];
  const p = periodOf("3m", now);
  it("résume sans compter transferts et emprunts comme gains ou dépenses", () => {
    const sm = summarize(ms, p, s);
    expect(sm).toMatchObject({ income: 400000, expenses: 78000, debtRepaid: 50000, borrowed: 19200, saved: 20000, left: 252000 });
    expect(sm.savingsRate).toBeCloseTo(0.05);
  });
  it("donne une série par mois (mois vides inclus) et par trimestre au-delà de 24 mois", () => {
    const rows = byMonth(ms, p, s);
    expect(rows.map((r) => r.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(rows[0]).toMatchObject({ revenus: 300000, depenses: 75000 });
    expect(rows[1]).toMatchObject({ dettes: 50000, epargne: 20000 });
    const long = byMonth(ms, periodOf("years", now, { from: 2025, to: 2027 }), s);
    expect(long).toHaveLength(12);
    expect(long[0].key).toBe("2025-T1");
  });
  it("répartit les dépenses par catégorie avec « Autres »", () => {
    const c = byCategory(ms, p, s, 2);
    expect(c).toEqual([{ name: "Logement", value: 55000 }, { name: "Retraits d'espèces", value: 20000 }, { name: "Autres", value: 3000 }]);
  });
  it("trace la valeur nette depuis les photos du mois et les accomplissements", () => {
    const d = sampleData();
    const snap = makeSnapshot("2026-11", { settings: d.settings, accounts: d.accounts, debts: d.debts, vaults: d.vaults, charges: d.charges });
    expect(snap.netWorth).toBe(snap.accounts + snap.savings - snap.debts);
    expect(snap.accounts).toBe(85000 + 12500); // le compte « Épargne » est exclu : les coffres le représentent
    const w = wealthSeries([{ ...snap, month: "2026-10" }], p, snap);
    expect(w.map((x) => x.key)).toEqual(["2026-10", "2026-11"]);
    const a = achievements({ debts: [{ ...debts[0], closedAt: "2026-10-04" }], tasks: [], projects: [] }, p);
    expect(a.debts).toHaveLength(1);
    expect(delta(120, 100)).toBeCloseTo(0.2);
    expect(delta(5, 0)).toBeNull();
    expect(comparable([mv("2026-08-24", 1, "Revenus")], previousPeriod(p))).toBe(false);
    expect(comparable([mv("2026-01-01", 1, "Revenus")], previousPeriod(p))).toBe(true);
  });
});

describe("archives datées", () => {
  it("pose et retire la date de clôture", () => {
    expect(closurePatch("debts", debts[0], { paid: 25000 }, "2026-11-22")).toEqual({ closedAt: "2026-11-22" });
    expect(closurePatch("debts", { ...debts[0], paid: 25000, closedAt: "2026-11-22" }, { paid: 100 })).toEqual({ closedAt: undefined });
    expect(closurePatch("tasks", { order: 1, title: "x", owner: "", priority: "", cost: null, dueDate: "", status: "À faire" as const, notes: "" } as never, { status: "Fait" } as never, "2026-11-22")).toEqual({ closedAt: "2026-11-22" });
  });
});

import { linesFromItems } from "./movements";
describe("lecture des relevés PDF", () => {
  it("reconstruit des lignes en colonnes depuis les fragments d'une page", () => {
    const lines = linesFromItems([
      { str: "22 nov. 2026 13:52", x: 10, y: 700, w: 60 }, { str: "Retrait", x: 100, y: 700.5, w: 30 }, { str: "-4000", x: 200, y: 700, w: 20 },
      { str: "QUARTIER", x: 150, y: 690, w: 30 }, { str: "2", x: 182, y: 690, w: 5 },
    ]);
    expect(lines).toEqual(["22 nov. 2026 13:52    Retrait    -4000", "QUARTIER 2"]);
  });
});
