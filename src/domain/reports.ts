import type { Debt, Movement, Project, Settings, Snapshot, Task } from "./types";
import { INCOME_MOVES, NEUTRAL_MOVES, NON_FLOW_MOVES } from "./types";
import { parseISO, toBase } from "./money";

/**
 * Rapports par période : définitions des indicateurs (documentées dans docs/06-historique-rapports.md).
 * - Revenus : entrées des catégories de revenus (Revenus, Salaire, Famille (reçu), Autre entrée).
 *   « À classer » (dépôts d'espèces, entrées sans règle), Transfert et Emprunt sont neutres.
 * - Dépenses : sorties hors neutres, Remboursement de dette et Épargne, nettes des remboursements reçus dans la même catégorie.
 * - Dettes remboursées : sorties « Remboursement de dette ». Emprunté : entrées « Emprunt ».
 * - Épargne constituée : sorties « Épargne » moins les retraits d'épargne (entrées « Épargne »).
 * - Reste : revenus − dépenses − dettes remboursées − épargne (ce qui n'a pas été affecté).
 * - Taux d'épargne : épargne constituée / revenus.
 */

export type Preset = "3m" | "6m" | "12m" | "ytd" | "year" | "years" | "custom";
export interface Period { from: string; to: string; label: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Bornes d'une période. 3/6/12 mois = mois glissants, mois courant inclus. */
export function periodOf(p: Preset, now = new Date(), opt: { year?: number; from?: number; to?: number; start?: string; end?: string } = {}): Period {
  const y = now.getFullYear(), m = now.getMonth();
  const months = (k: number) => ({ from: iso(new Date(y, m - k + 1, 1)), to: iso(now), label: `${k} derniers mois` });
  switch (p) {
    case "3m": return months(3);
    case "6m": return months(6);
    case "12m": return months(12);
    case "ytd": return { from: `${y}-01-01`, to: iso(now), label: `Depuis le 1er janvier ${y}` };
    case "year": { const Y = opt.year ?? y; return { from: `${Y}-01-01`, to: `${Y}-12-31`, label: `Année ${Y}` }; }
    case "years": { const A = opt.from ?? y - 1, B = opt.to ?? y; return { from: `${Math.min(A, B)}-01-01`, to: `${Math.max(A, B)}-12-31`, label: `${Math.min(A, B)}–${Math.max(A, B)}` }; }
    case "custom": return { from: opt.start ?? iso(new Date(y, m, 1)), to: opt.end ?? iso(now), label: "Période personnalisée" };
  }
}

/**
 * Période précédente, pour les comparaisons. Les préréglages reculent en mois calendaires
 * (3 mois du 01/09 au 22/11 → 01/06 au 22/08 ; année 2025 → 2024 entière) ; les dates libres, du même nombre de jours.
 */
export function previousPeriod(p: Period, preset: Preset = "custom"): Period {
  const shift = (k: number) => {
    const back = (s: string, end: boolean) => {
      const d = parseISO(s), y = d.getFullYear(), m = d.getMonth() - k;
      const last = new Date(y, m + 1, 0).getDate();
      const lastOfSource = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return iso(new Date(y, m, end && d.getDate() === lastOfSource ? last : Math.min(d.getDate(), last)));
    };
    return { from: back(p.from, false), to: back(p.to, true), label: "Période précédente" };
  };
  const months = (a: string, b: string) => (parseISO(b).getFullYear() - parseISO(a).getFullYear()) * 12 + parseISO(b).getMonth() - parseISO(a).getMonth() + 1;
  if (preset === "ytd") return shift(12); // même plage, l'année d'avant
  if (preset !== "custom") return shift(months(p.from, p.to));
  return previousByDays(p);
}
function previousByDays(p: Period): Period {
  const a = parseISO(p.from), b = parseISO(p.to);
  const days = Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
  const to = new Date(a); to.setDate(to.getDate() - 1);
  const from = new Date(to); from.setDate(from.getDate() - days + 1);
  return { from: iso(from), to: iso(to), label: "Période précédente" };
}

const NEUTRAL = NEUTRAL_MOVES, NOT_EXPENSE = NON_FLOW_MOVES;
const isIncome = (x: Movement) => INCOME_MOVES.includes(x.category);

export interface Summary {
  /** toClassify : entrées « À classer » (dépôts d'espèces, virements sans règle), hors revenus en attendant d'être qualifiées. */
  toClassify: number;
  income: number; expenses: number; debtRepaid: number; borrowed: number; saved: number; left: number; savingsRate: number; count: number;
}

export function summarize(ms: Movement[], p: Period, s: Pick<Settings, "rates" | "baseCurrency">): Summary {
  const inP = ms.filter((x) => x.date >= p.from && x.date <= p.to);
  const v = (x: Movement) => toBase(x.amount, x.currency, s);
  let income = 0, expenses = 0, debtRepaid = 0, borrowed = 0, saved = 0, toClassify = 0;
  for (const x of inP) {
    const a = v(x);
    if (x.category === "Épargne") saved -= a;
    else if (x.category === "Remboursement de dette") debtRepaid -= a;
    else if (x.category === "Emprunt") borrowed += a;
    else if (x.category === "À classer") { if (a > 0) toClassify += a; }
    else if (NEUTRAL.includes(x.category)) continue;
    else if (isIncome(x)) income += a;
    else expenses -= a; // un remboursement reçu (positif) dans une catégorie de dépense la réduit
  }
  const r = (k: number) => Math.round(k);
  return { toClassify: r(toClassify), income: r(income), expenses: r(expenses), debtRepaid: r(debtRepaid), borrowed: r(borrowed), saved: r(saved), left: r(income - expenses - debtRepaid - saved), savingsRate: income > 0 ? saved / income : 0, count: inP.length };
}

/** Série mensuelle sur la période (un point par mois, mois vides inclus). Au-delà de 24 mois : par trimestre. */
export function byMonth(ms: Movement[], p: Period, s: Pick<Settings, "rates" | "baseCurrency">) {
  const a = parseISO(p.from), b = parseISO(p.to);
  const keys: string[] = [];
  for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d.setMonth(d.getMonth() + 1)) keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const quarter = keys.length > 24;
  const keyOf = (k: string) => (quarter ? `${k.slice(0, 4)}-T${Math.floor((Number(k.slice(5, 7)) - 1) / 3) + 1}` : k);
  const rows = new Map<string, { key: string; label: string; revenus: number; depenses: number; dettes: number; epargne: number }>();
  for (const k of keys) {
    const kk = keyOf(k);
    if (!rows.has(kk)) {
      const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1);
      const label = quarter ? kk.replace("-", " ") : d.toLocaleDateString("fr-FR", { month: "short", year: keys.length > 12 ? "2-digit" : undefined }).replace(".", "");
      rows.set(kk, { key: kk, label, revenus: 0, depenses: 0, dettes: 0, epargne: 0 });
    }
  }
  for (const x of ms) {
    if (x.date < p.from || x.date > p.to) continue;
    const row = rows.get(keyOf(x.date.slice(0, 7)));
    if (!row) continue;
    const v = toBase(x.amount, x.currency, s);
    if (x.category === "Épargne") row.epargne -= v;
    else if (x.category === "Remboursement de dette") row.dettes -= v;
    else if (NEUTRAL.includes(x.category)) continue;
    else if (isIncome(x)) row.revenus += v;
    else row.depenses -= v;
  }
  return [...rows.values()].map((r) => ({ ...r, revenus: Math.round(r.revenus), depenses: Math.round(r.depenses), dettes: Math.round(r.dettes), epargne: Math.round(r.epargne) }));
}

/** Dépenses par catégorie, triées ; au-delà de `top`, regroupées en « Autres ». */
export function byCategory(ms: Movement[], p: Period, s: Pick<Settings, "rates" | "baseCurrency">, top = 5) {
  const m = new Map<string, number>();
  for (const x of ms) {
    if (x.date < p.from || x.date > p.to || NOT_EXPENSE.includes(x.category)) continue;
    if (isIncome(x)) continue;
    m.set(x.category, (m.get(x.category) ?? 0) - toBase(x.amount, x.currency, s)); // net des remboursements reçus
  }
  const all = [...m.entries()].filter(([, v]) => v > 0).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  const head = all.slice(0, top), rest = all.slice(top).reduce((t, x) => t + x.value, 0);
  return rest > 0 ? [...head, { name: "Autres", value: rest }] : head;
}

/** Revenus par source (catégorie + contrepartie principale). */
export function incomeBySource(ms: Movement[], p: Period, s: Pick<Settings, "rates" | "baseCurrency">, top = 5) {
  const m = new Map<string, number>();
  for (const x of ms) {
    if (x.date < p.from || x.date > p.to || !isIncome(x)) continue;
    const v = toBase(x.amount, x.currency, s);
    if (v > 0) m.set(x.category, (m.get(x.category) ?? 0) + v);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, top);
}

/** Valeur nette et dettes dans le temps, à partir des photos du mois (+ point « maintenant »). */
export function wealthSeries(snaps: Snapshot[], p: Period, live?: Snapshot) {
  const pts = snaps.filter((x) => x.month >= p.from.slice(0, 7) && x.month <= p.to.slice(0, 7)).sort((a, b) => a.month.localeCompare(b.month));
  if (live && !pts.some((x) => x.month === live.month) && live.month <= p.to.slice(0, 7)) pts.push(live);
  return pts.map((x) => ({ key: x.month, label: new Date(Number(x.month.slice(0, 4)), Number(x.month.slice(5, 7)) - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }).replace(".", ""), valeur: x.netWorth, dettes: x.debts, epargne: x.savings }));
}

/** Ce qui a été accompli sur la période (archives datées). */
export function achievements(d: { debts: Debt[]; tasks: Task[]; projects: Project[] }, p: Period) {
  const inP = (x?: string) => !!x && x >= p.from && x <= p.to;
  return {
    debts: d.debts.filter((x) => inP(x.closedAt)),
    tasks: d.tasks.filter((x) => inP(x.closedAt)),
    projects: d.projects.filter((x) => inP(x.closedAt)),
  };
}

/** Variation relative (null si la base est nulle). */
export const delta = (now: number, before: number) => (before ? (now - before) / Math.abs(before) : null);

/** Une comparaison n'a de sens que si les mouvements couvrent toute la période précédente. */
export function comparable(ms: Movement[], prev: Period): boolean {
  if (!ms.length) return false;
  const first = ms.reduce((m, x) => (x.date < m ? x.date : m), ms[0].date);
  return first <= prev.from;
}
