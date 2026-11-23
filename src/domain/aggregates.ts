import type { Charge, Debt, Income, Settings, Task, Vault } from "./types";
import { FREQUENCIES } from "./types";
import { daysTo, n, parseISO, today } from "./money";
import { debtRest, incomeOutstanding, incomeReceived, openDebts } from "./split";

export const chargeMonthly = (c: Charge) => (c.status === "Prévu" ? 0 : n(c.amount) * (FREQUENCIES[c.frequency] ?? 1));
export const monthlyCharges = (cs: Charge[]) => cs.reduce((a, c) => a + chargeMonthly(c), 0);
export const livingEnvelope = (s: Settings) => n(s.salary) * s.rules.salary[s.phase].living;

export function debtSummary(ds: Debt[]) {
  const real = ds.filter((d) => d.creditor);
  const total = real.reduce((a, d) => a + n(d.total), 0);
  const paid = real.reduce((a, d) => a + n(d.paid), 0);
  const rest = real.reduce((a, d) => a + Math.max(0, debtRest(d)), 0);
  const open = openDebts(real);
  return { total, paid, rest, open, progress: total ? paid / total : 0 };
}

export const savingsTotal = (vs: Vault[]) => vs.reduce((a, v) => a + n(v.balance), 0);

export function taskAlerts(ts: Task[], from = today()) {
  const pending = ts.filter((t) => t.status !== "Fait" && t.dueDate);
  return {
    late: pending.filter((t) => daysTo(t.dueDate, from) < 0),
    soon: pending.filter((t) => { const d = daysTo(t.dueDate, from); return d >= 0 && d <= 30; }),
  };
}

export const outstanding = (is: Income[], s: Settings) => is.reduce((a, i) => a + incomeOutstanding(i, s), 0);

/** Encaissements par mois sur les N derniers mois (clé yyyy-mm). Base : date de la ligne. */
export function receivedByMonth(is: Income[], months = 12, from = today()) {
  const out: { key: string; label: string; value: number }[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(from.getFullYear(), from.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""), value: 0 });
  }
  const idx = new Map(out.map((m, i) => [m.key, i]));
  for (const i of is) {
    if (!i.date || i.status === "Annulé") continue;
    const d = parseISO(i.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const at = idx.get(key);
    if (at != null) out[at].value += incomeReceived(i);
  }
  return out;
}
