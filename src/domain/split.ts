import type { Debt, Income, Settings, Vault, Project } from "./types";
import { n, toBase } from "./money";

export type IncomeKind = "salary" | "partial" | "variable";
export type PartKey = "savings" | "debts" | "car" | "living" | "projects" | "fun";

export interface Part { key: PartKey; label: string; share: number; amount: number; color: string }

export const PART_META: Record<PartKey, { label: string; color: string }> = {
  savings: { label: "Épargne", color: "var(--c2)" },
  debts: { label: "Dettes", color: "var(--c1)" },
  car: { label: "Voiture", color: "var(--c3)" },
  living: { label: "Vie courante", color: "var(--c4)" },
  projects: { label: "Projets", color: "var(--c4)" },
  fun: { label: "Plaisir", color: "var(--c5)" },
};

/** Répartit un montant reçu selon les règles de la phase courante. */
export function split(amount: number, kind: IncomeKind, s: Settings): Part[] {
  const phase = s.phase;
  let shares: [PartKey, number][];
  if (kind === "variable") {
    const r = s.rules.variable[phase];
    shares = [["savings", r.savings], ["debts", r.debts], ["car", r.car], ["projects", r.projects], ["fun", r.fun]];
  } else {
    const r = s.rules.salary[phase];
    // Salaire partiel : on épargne quand même, on ne rembourse pas ; le reste va à la vie courante.
    const debts = kind === "partial" ? 0 : r.debts;
    shares = [["savings", r.savings], ["debts", debts], ["car", r.car], ["living", 1 - r.savings - debts - r.car]];
  }
  return shares
    .filter(([, sh]) => sh > 0)
    .map(([key, share]) => ({ key, share, amount: Math.round(amount * share), ...PART_META[key] }));
}

export const ruleTotal = (r: object) => Object.values(r).reduce((a: number, v) => a + n(v), 0);

/* ---- Revenus ---- */
export const incomeBase = (i: Income, s: Settings) => (i.amount == null ? 0 : toBase(n(i.amount), i.currency, s));
export const incomeReceived = (i: Income) => n(i.deposit) + n(i.balance);
export const incomeOutstanding = (i: Income, s: Settings) =>
  i.status === "Annulé" ? 0 : Math.max(0, incomeBase(i, s) - incomeReceived(i));

/** Montant à répartir pour un revenu : 0 si les règles ne s'appliquent pas (historique). */
export function incomeAllocation(i: Income, s: Settings, key: "save" | "debts" | "projects"): number {
  if (!i.applyRules || i.amount == null) return 0;
  const r = s.rules.variable[s.phase];
  const base = incomeBase(i, s);
  const share = key === "save" ? r.savings + r.car : key === "debts" ? r.debts : r.projects + r.fun;
  return Math.round(base * share);
}

/* ---- Dettes ---- */
export const debtRest = (d: Debt) => n(d.total) - n(d.paid);
export const debtStatus = (d: Debt) => (debtRest(d) <= 0 ? "Remboursée" : n(d.paid) > 0 ? "En cours" : "Non payée");
export const openDebts = (ds: Debt[]) => ds.filter((d) => d.creditor && debtRest(d) > 0).sort((a, b) => a.order - b.order);

/* ---- Coffres ---- */
export const vaultRest = (v: Vault) => Math.max(0, n(v.target) - n(v.balance));
export const vaultProgress = (v: Vault) => (n(v.target) ? Math.min(1, n(v.balance) / n(v.target)) : 0);
export const nextVault = (vs: Vault[]) => [...vs].sort((a, b) => a.order - b.order).find((v) => n(v.balance) < n(v.target));

/* ---- Projets ---- */
export const projectRest = (p: Project) => (p.budget == null ? 0 : Math.max(0, n(p.budget) - n(p.paid)));
export const nextProject = (ps: Project[]) =>
  [...ps]
    .filter((p) => p.name && p.status !== "Acquis" && p.status !== "Annulé" && projectRest(p) > 0)
    .sort((a, b) => a.order - b.order)[0];

/** Destination conseillée pour une part (texte d'aide sous la répartition). */
export function hintFor(key: PartKey, ctx: { debts: Debt[]; vaults: Vault[]; projects: Project[] }): string {
  if (key === "debts") { const k = openDebts(ctx.debts).length; return k ? `à répartir entre tes ${k} dette${k > 1 ? "s" : ""}, au choix` : ""; }
  if (key === "savings") { const v = nextVault(ctx.vaults); return v ? `vers ${v.name}` : ""; }
  if (key === "projects") { const p = nextProject(ctx.projects); return p ? `vers ${p.name}` : ""; }
  return "";
}
