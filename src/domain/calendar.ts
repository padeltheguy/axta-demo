import type { Debt, Project, Task, Vault } from "./types";
import { daysTo, parseISO, today } from "./money";
import { debtRest, vaultRest } from "./split";

export type EventKind = "task" | "project" | "vault" | "debt";
export interface CalEvent {
  key: string;          // unique et stable : kind-id
  kind: EventKind;
  id: number;
  date: string;         // ISO yyyy-mm-dd
  title: string;
  detail: string;
  done: boolean;
}

export const KIND_META: Record<EventKind, { label: string; color: string; path: string }> = {
  task: { label: "Démarche", color: "#274754", path: "/demarches" },
  project: { label: "Projet", color: "#E8C468", path: "/projets" },
  vault: { label: "Coffre", color: "#2A9D90", path: "/epargne" },
  debt: { label: "Dette", color: "#E76E50", path: "/dettes" },
};

/** Rassemble tout ce qui a une date dans un seul agenda. */
export function collectEvents(src: { tasks: Task[]; projects: Project[]; vaults: Vault[]; debts: Debt[] }): CalEvent[] {
  const out: CalEvent[] = [];
  for (const t of src.tasks) if (t.dueDate && t.title)
    out.push({ key: `task-${t.id}`, kind: "task", id: t.id!, date: t.dueDate, title: t.title, detail: [t.owner, t.status].filter(Boolean).join(" · "), done: t.status === "Fait" });
  for (const p of src.projects) if (p.targetDate && p.name)
    out.push({ key: `project-${p.id}`, kind: "project", id: p.id!, date: p.targetDate, title: p.name, detail: p.status, done: p.status === "Acquis" || p.status === "Annulé" });
  for (const v of src.vaults) if (v.targetDate && v.name)
    out.push({ key: `vault-${v.id}`, kind: "vault", id: v.id!, date: v.targetDate, title: `Objectif : ${v.name}`, detail: "Date cible du coffre", done: vaultRest(v) <= 0 });
  for (const d of src.debts) if (d.dueDate && d.creditor)
    out.push({ key: `debt-${d.id}`, kind: "debt", id: d.id!, date: d.dueDate, title: `Échéance : ${d.creditor}`, detail: "Dette", done: debtRest(d) <= 0 });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export interface MonthGroup { key: string; label: string; events: CalEvent[] }
/** Regroupe par mois (ordre chronologique). Les éléments en retard non faits forment un groupe à part, en tête. */
export function groupByMonth(evts: CalEvent[], from = today()): { late: CalEvent[]; months: MonthGroup[] } {
  const late = evts.filter((e) => !e.done && daysTo(e.date, from) < 0);
  const months = new Map<string, MonthGroup>();
  for (const e of evts) {
    if (late.includes(e)) continue;
    const d = parseISO(e.date);
    const key = e.date.slice(0, 7);
    if (!months.has(key)) months.set(key, { key, label: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), events: [] });
    months.get(key)!.events.push(e);
  }
  return { late, months: [...months.values()] };
}

/** Grille d'un mois, semaines du lundi au dimanche (cases hors mois = null). */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // lundi = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Grille d'un mois pour le sélecteur de date : 6 semaines de 7 jours, lundi en premier.
 * Chaque case : date ISO, jour du mois, appartenance au mois affiché.
 */
export function dayGrid(year: number, month: number): { iso: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const out: { iso: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - offset + i);
    out.push({ iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return out;
}

/** Décale une date ISO de n jours (heure locale). */
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
