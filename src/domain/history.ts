import type { Account, Charge, Debt, Project, Settings, Snapshot, Task, Vault } from "./types";
import { iso, n, toBase } from "./money";
import { debtRest } from "./split";
import { monthlyCharges } from "./aggregates";

/**
 * Historique : dates de clôture (archives) et photos du mois.
 * Les montants courants sont écrasés à chaque saisie ; ces deux mécanismes gardent la trace du passé.
 */

const todayIso = () => iso(new Date());

/** Patch à appliquer lors d'une modification : pose ou retire closedAt selon le nouvel état. */
export function closurePatch<T extends Debt | Task | Project>(kind: "debts" | "tasks" | "projects", obj: T, mods: Partial<T>, today = todayIso()): Partial<T> {
  const next = { ...obj, ...mods } as T;
  let closed: boolean;
  if (kind === "debts") closed = !!(next as Debt).creditor && n((next as Debt).total) > 0 && debtRest(next as Debt) <= 0;
  else if (kind === "tasks") closed = (next as Task).status === "Fait";
  else closed = (next as Project).status === "Acquis";
  if (closed && !obj.closedAt) return { closedAt: today } as Partial<T>;
  if (!closed && obj.closedAt) return { closedAt: undefined } as Partial<T>;
  return {};
}

/**
 * Photo de l'état actuel pour un mois donné.
 * - Les comptes de type « Épargne » sont exclus s'il existe des coffres (ils les représentent déjà).
 * - Le solde négatif d'un compte relié à une dette ouverte (découvert suivi comme dette) n'est pas recompté.
 */
export function makeSnapshot(month: string, d: { settings: Settings; accounts: Account[]; debts: Debt[]; vaults: Vault[]; charges: Charge[] }, now = new Date()): Snapshot {
  const s = d.settings;
  const hasVaults = d.vaults.some((v) => v.name);
  const open = d.debts.filter((x) => x.creditor && debtRest(x) > 0);
  const asDebt = new Set(open.map((x) => x.accountId).filter((x): x is number => x != null));
  const acc = d.accounts.filter((a) => a.balance != null && !(hasVaults && a.type === "Épargne"));
  const bal = (a: Account) => { const v = toBase(n(a.balance), a.currency, s); return a.id != null && asDebt.has(a.id) ? Math.max(0, v) : v; };
  const accounts = Math.round(acc.reduce((t, a) => t + bal(a), 0));
  const savings = Math.round(d.vaults.reduce((t, v) => t + n(v.balance), 0));
  const debts = Math.round(open.reduce((t, x) => t + debtRest(x), 0));
  return {
    month, takenAt: now.toISOString(), accounts, savings, debts, netWorth: accounts + savings - debts,
    charges: Math.round(monthlyCharges(d.charges)), debtCount: open.length,
    perDebt: Object.fromEntries(d.debts.filter((x) => x.creditor).map((x) => [x.creditor, Math.max(0, debtRest(x))])),
    perVault: Object.fromEntries(d.vaults.filter((v) => v.name).map((v) => [v.name, n(v.balance)])),
  };
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
