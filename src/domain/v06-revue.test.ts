import { describe, expect, it } from "vitest";
import { categorize, fuzzyDuplicates, matchDebt } from "./movements";
import { byCategory, periodOf, previousPeriod, summarize } from "./reports";
import { makeSnapshot } from "./history";
import { migrateMovementsV06 } from "./migrate";
import { defaultSettings } from "./defaults";
import type { Account, Debt, Movement } from "./types";

// Corrections issues de la revue d'équipe v0.6 (docs/05-revue-*.md). Données FICTIVES.
const s = defaultSettings("Kofi Mensah");
const mv = (date: string, amount: number, category: Movement["category"], extra: Partial<Movement> = {}): Movement =>
  ({ id: Math.random(), order: 1, date, label: "x", amount, currency: "XOF", category, accountId: null, debtId: null, vaultId: null, counterparty: "", source: "momo", ref: "", notes: "", ...extra });
const debt = (id: number, creditor: string, extra: Partial<Debt> = {}): Debt => ({ id, order: id, creditor, type: "Dette personnelle", total: 10000, paid: 0, dueDate: "", notes: "", ...extra });

describe("revenus : dépôts d'espèces et entrées sans règle", () => {
  it("un dépôt et une entrée inconnue sont « À classer », hors revenus", () => {
    expect(categorize({ type: "Dépôt", amount: 32700, text: "Dépôt AGENT" }, s).category).toBe("À classer");
    expect(categorize({ type: "Utilisateur MoMo", amount: 5000, text: "Utilisateur MoMo AMI INCONNU" }, s).category).toBe("À classer");
    const r = summarize([mv("2026-11-10", 32700, "À classer"), mv("2026-11-10", 50000, "Revenus"), mv("2026-11-10", -4000, "Retraits d'espèces")], periodOf("custom", new Date(), { start: "2026-11-01", end: "2026-11-30" }), s);
    expect(r).toMatchObject({ income: 50000, toClassify: 32700, expenses: 4000 });
  });
  it("la carte virtuelle n'est pas un transfert : c'est une dépense", () => {
    expect(categorize({ type: "Débit", amount: -10000, text: "Rechargement de Carte Virtuelle" }, s).category).toBe("Courses et achats");
  });
  it("un remboursement reçu réduit la dépense de sa catégorie au lieu de compter en revenu", () => {
    const p = { from: "2026-11-01", to: "2026-11-30", label: "" };
    const ms = [mv("2026-11-02", -10000, "Courses et achats"), mv("2026-11-03", 3000, "Courses et achats")];
    expect(summarize(ms, p, s)).toMatchObject({ income: 0, expenses: 7000 });
    expect(byCategory(ms, p, s)).toEqual([{ name: "Courses et achats", value: 7000 }]);
  });
  it("la migration recatégorise les mouvements de relevé, une seule fois, sans toucher aux choix manuels", () => {
    const ms = [mv("2026-11-10", 32700, "Autre entrée", { label: "Dépôt · AGENT" }), mv("2026-11-10", -500, "Transfert", { label: "Rechargement de · Carte Virtuelle" }),
      mv("2026-11-10", 20000, "Revenus", { label: "Dépôt · CLIENT" }), mv("2026-11-10", 900, "Autre entrée", { label: "Dépôt · X", source: "manuel" })];
    const once = migrateMovementsV06(ms);
    expect(once.map((m) => m.category)).toEqual(["À classer", "Courses et achats", "Revenus", "Autre entrée"]);
    expect(migrateMovementsV06(once)).toEqual(once);
  });
});

describe("rapprochement des dettes", () => {
  const debts = [debt(1, "Jean-Louis Houngbo"), debt(2, "Paul Mensah"), debt(3, "AGBO Services")];
  it("mots entiers : un autre prénom composé ne correspond pas", () => {
    expect(matchDebt("Utilisateur MoMo JEAN-BAPTISTE KPADE", debts)).toBeUndefined();
    expect(matchDebt("Utilisateur MoMo LOUISETTE HOUNGBOVI", debts)).toBeUndefined();
    expect(matchDebt("Utilisateur MoMo AGBODJAN", debts)).toBeUndefined();
    expect(matchDebt("Utilisateur MoMo JEAN-LOUIS HOUNGBO", debts)?.id).toBe(1);
  });
  it("le nom du titulaire ne relie pas un virement à soi-même à un créancier homonyme", () => {
    expect(matchDebt("PI BCEAO KOFI MENSAH", debts, "Kofi Mensah")).toBeUndefined();
    expect(matchDebt("Utilisateur MoMo PAUL MENSAH", debts, "Kofi Mensah")?.id).toBe(2);
  });
  it("plusieurs candidats : aucune dette reliée", () => {
    expect(matchDebt("AGBO SERVICES et JEAN-LOUIS HOUNGBO", debts)).toBeUndefined();
  });
});

describe("période précédente en mois calendaires", () => {
  it("3 mois, année, année bissextile, depuis janvier", () => {
    expect(previousPeriod({ from: "2026-09-01", to: "2026-11-22", label: "" }, "3m")).toMatchObject({ from: "2026-06-01", to: "2026-08-22" });
    expect(previousPeriod({ from: "2025-01-01", to: "2025-12-31", label: "" }, "year")).toMatchObject({ from: "2024-01-01", to: "2024-12-31" });
    expect(previousPeriod({ from: "2024-01-01", to: "2024-12-31", label: "" }, "year")).toMatchObject({ from: "2023-01-01", to: "2023-12-31" });
    expect(previousPeriod({ from: "2026-01-01", to: "2026-11-22", label: "" }, "ytd")).toMatchObject({ from: "2025-01-01", to: "2025-11-22" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31", label: "" }, "3m")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("valeur nette : un découvert suivi comme dette n'est compté qu'une fois", () => {
  it("le solde négatif du compte lié est ignoré", () => {
    const accounts: Account[] = [{ id: 1, order: 1, name: "Banque A", type: "Banque", institution: "", currency: "XOF", balance: -31750, updatedAt: "", notes: "" }];
    const base = { settings: s, accounts, vaults: [], charges: [] };
    expect(makeSnapshot("2026-11", { ...base, debts: [debt(2, "Banque A", { total: 31750 })] }).netWorth).toBe(-63500);
    expect(makeSnapshot("2026-11", { ...base, debts: [debt(2, "Banque A", { total: 31750, accountId: 1 })] }).netWorth).toBe(-31750);
  });
});

describe("doublons entre sources", () => {
  it("une capture lue par l'assistant puis le relevé : même montant à ± 1 jour", () => {
    const existing = [mv("2026-11-09", -28680, "Électricité et eau", { source: "ia", id: 7 }), mv("2026-11-09", -500, "Autre dépense", { source: "momo", id: 8 })];
    const incoming = [mv("2026-11-10", -28680, "Électricité et eau"), mv("2026-11-09", -500, "Autre dépense"), mv("2026-11-20", -28680, "Électricité et eau")];
    const d = fuzzyDuplicates(incoming, existing);
    expect([...d.keys()]).toEqual([0]);
    expect(d.get(0)?.id).toBe(7);
  });
});


import { addDaysIso, dayGrid } from "./calendar";
describe("sélecteur de date", () => {
  it("grille du mois : 42 cases, lundi en premier", () => {
    const g = dayGrid(2026, 10); // novembre 2026 : le 1er est un dimanche
    expect(g).toHaveLength(42);
    expect(g[0]).toMatchObject({ iso: "2026-10-26", inMonth: false });
    expect(g[6]).toMatchObject({ iso: "2026-11-01", day: 1, inMonth: true });
    expect(g.filter((c) => c.inMonth)).toHaveLength(30);
  });
  it("décalage de jours, changement de mois et d'année", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2024-03-01", -1)).toBe("2024-02-29");
  });
});
