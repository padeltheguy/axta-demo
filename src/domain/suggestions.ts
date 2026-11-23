import type { Charge, Debt, Income, Project, Settings, Task, Vault, WishItem } from "./types";
import { daysTo, fmt, monthsTo, n, toBase, today } from "./money";
import { debtRest, incomeOutstanding, vaultRest } from "./split";
import { livingEnvelope, monthlyCharges } from "./aggregates";

export interface Suggestion {
  id: string;            // stable : sert à masquer une suggestion
  tone: "bad" | "warn" | "info" | "ok";
  title: string;
  body: string;
  action?: { label: string; to?: string; href?: string; run?: "backup" | "phase2" };
  /** Mérite une notification (urgent). */
  urgent?: boolean;
}

interface Ctx {
  settings: Settings; tasks: Task[]; debts: Debt[]; vaults: Vault[]; charges: Charge[];
  projects: Project[]; incomes: Income[]; wishlist: WishItem[];
}

const BIG_PURCHASE = 50000;
const plural = (k: number, w: string) => `${k} ${w}${k > 1 ? "s" : ""}`;

/**
 * Moteur de suggestions : règles déterministes, locales, explicables.
 * axta propose, l'utilisateur décide : aucune règle ne modifie les données d'elle-même.
 */
export function suggest(c: Ctx, now = new Date()): Suggestion[] {
  const t0 = today(); t0.setTime(new Date(now).setHours(0, 0, 0, 0));
  const out: Suggestion[] = [];
  const s = c.settings;

  // 1. Démarches en retard / imminentes
  const pending = c.tasks.filter((t) => t.title && t.status !== "Fait" && t.dueDate);
  const late = pending.filter((t) => daysTo(t.dueDate, t0) < 0);
  if (late.length) out.push({ id: `tasks-late-${late.map((t) => t.id).join(".")}`, tone: "bad", urgent: true,
    title: `${plural(late.length, "démarche")} en retard`,
    body: `${late.slice(0, 3).map((t) => t.title).join(", ")}${late.length > 3 ? "…" : ""}. Fixe une nouvelle date réaliste ou fais-la cette semaine.`,
    action: { label: "Voir l'agenda", to: "/agenda" } });
  const week = pending.filter((t) => { const d = daysTo(t.dueDate, t0); return d >= 0 && d <= 7; });
  for (const t of week) out.push({ id: `task-soon-${t.id}-${t.dueDate}`, tone: "warn", urgent: true,
    title: `${t.title} : ${daysTo(t.dueDate, t0) === 0 ? "aujourd'hui" : `dans ${daysTo(t.dueDate, t0)} j`}`,
    body: t.cost ? `Prévois ${fmt(n(t.cost))}.` : "Bloque un créneau dès maintenant.", action: { label: "Ouvrir", to: "/demarches" } });

  // 2. Dettes : presque soldées, petites dettes, toutes soldées
  const open = c.debts.filter((d) => d.creditor && debtRest(d) > 0);
  for (const d of open) {
    const p = n(d.total) ? n(d.paid) / n(d.total) : 0;
    if (p >= 0.75) out.push({ id: `debt-almost-${d.id}`, tone: "ok", title: `Plus que ${fmt(debtRest(d))} pour solder ${d.creditor}`,
      body: "Tu as fait le plus dur : un dernier versement et elle quitte ta liste.", action: { label: "Dettes", to: "/dettes" } });
  }
  const small = open.filter((d) => debtRest(d) <= 25000);
  if (small.length >= 2) out.push({ id: `debt-small-${small.length}`, tone: "info",
    title: `${plural(small.length, "petite dette")} : ${fmt(small.reduce((a, d) => a + debtRest(d), 0))} au total`,
    body: "Les solder d'un coup réduit le nombre de personnes à qui tu dois quelque chose.", action: { label: "Dettes", to: "/dettes" } });
  const dueDebt = open.filter((d) => d.dueDate && daysTo(d.dueDate, t0) <= 7);
  for (const d of dueDebt) out.push({ id: `debt-due-${d.id}-${d.dueDate}`, tone: daysTo(d.dueDate, t0) < 0 ? "bad" : "warn", urgent: true,
    title: daysTo(d.dueDate, t0) < 0 ? `${d.creditor} : échéance dépassée` : `${d.creditor} : échéance dans ${daysTo(d.dueDate, t0)} j`,
    body: `Reste ${fmt(debtRest(d))}.${d.notes ? ` ${d.notes}` : ""}`, action: { label: "Dettes", to: "/dettes" } });
  if (c.debts.some((d) => d.creditor) && !open.length && s.phase === 1) out.push({ id: "phase2", tone: "ok", urgent: true,
    title: "Toutes tes dettes sont soldées", body: "Passe en phase 2 : la part dettes ira à l'épargne et à tes projets.", action: { label: "Passer en phase 2", run: "phase2" } });

  // 3. Budget
  const margin = livingEnvelope(s) - monthlyCharges(c.charges);
  if (s.salary > 0 && margin < 0) out.push({ id: `budget-neg-${Math.round(margin / 1000)}`, tone: "bad",
    title: `Budget en déficit de ${fmt(-margin)} par mois`, body: "Tes charges dépassent ton enveloppe vie courante. Commence par les postes « À réduire ».", action: { label: "Budget", to: "/budget" } });
  const cancel = c.charges.filter((x) => x.status === "À résilier");
  if (cancel.length) out.push({ id: `charges-cancel-${cancel.map((x) => x.id).join(".")}`, tone: "warn",
    title: `${plural(cancel.length, "abonnement")} à résilier`, body: `${cancel.map((x) => x.label).join(", ")} : chaque mois qui passe te coûte encore.`, action: { label: "Budget", to: "/budget" } });

  // 4. Coffres en retard sur leur date
  for (const v of c.vaults) {
    if (!v.name || !v.targetDate || vaultRest(v) <= 0) continue;
    const m = monthsTo(v.targetDate, t0);
    if (m === 0) out.push({ id: `vault-late-${v.id}-${v.targetDate}`, tone: "warn", title: `${v.name} : date cible dépassée`,
      body: `Il manque ${fmt(vaultRest(v))}. Repousse la date ou augmente les versements.`, action: { label: "Épargne", to: "/epargne" } });
  }

  // 5. Revenus à relancer (mission en cours depuis plus de 30 jours avec un reste à encaisser)
  for (const i of c.incomes) {
    const rest = incomeOutstanding(i, s);
    if (i.status !== "En cours" || !i.date || rest <= 0 || daysTo(i.date, t0) > -30) continue;
    const subject = encodeURIComponent(`Relance : ${i.project || "facture"}`);
    const body = encodeURIComponent(`Bonjour,\n\nJe me permets de revenir vers vous au sujet du règlement de « ${i.project} ». Le solde restant est de ${fmt(rest)}.\n\nPouvez-vous me confirmer la date de paiement ?\n\nMerci et bonne journée,\n${s.name}`);
    out.push({ id: `income-chase-${i.id}`, tone: "info", title: `Relancer ${i.client || "le client"} : ${fmt(rest)} à encaisser`,
      body: `« ${i.project} » est en cours depuis ${-daysTo(i.date, t0)} jours.`, action: { label: "Écrire la relance", href: `mailto:?subject=${subject}&body=${body}` } });
  }

  // 6. Achats : gros article dans la liste d'achats → Projets (règle des 72 h)
  for (const w of c.wishlist) {
    if (w.status !== "À acheter" || w.price == null) continue;
    const xof = toBase(n(w.price), w.currency, s);
    if (xof > BIG_PURCHASE) out.push({ id: `wish-big-${w.id}`, tone: "info", title: `${w.name} : ${fmt(xof)}`,
      body: "Au-delà de 50 000 CFA, passe-le en Projets et laisse passer 72 h avant d'acheter.", action: { label: "Projets", to: "/projets" } });
  }

  // 7. Hygiène : sauvegarde, taux
  const days = s.lastBackupAt ? Math.floor((now.getTime() - Date.parse(s.lastBackupAt)) / 864e5) : Infinity;
  if (days >= 7) out.push({ id: `backup-${Math.floor(now.getTime() / (7 * 864e5))}`, tone: "warn",
    title: s.lastBackupAt ? `Dernière sauvegarde il y a ${days} jours` : "Aucune sauvegarde pour l'instant",
    body: "Tes données ne vivent que sur cet appareil. Une sauvegarde prend 2 secondes.", action: { label: "Sauvegarder", run: "backup" } });

  const order = { bad: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.filter((x) => !isSnoozed(s.dismissed?.[x.id], now)).sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Une suggestion est masquée tant que la date de report n'est pas passée. « forever » = définitivement. */
export function isSnoozed(until: string | undefined, now = new Date()): boolean {
  if (!until) return false;
  if (until === "forever") return true;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now.getTime();
}

export type SnoozeChoice = "day" | "week" | "month" | "forever";
export function snoozeUntil(choice: SnoozeChoice, now = new Date()): string {
  if (choice === "forever") return "forever";
  const d = new Date(now);
  if (choice === "day") d.setDate(d.getDate() + 1);
  if (choice === "week") d.setDate(d.getDate() + 7);
  if (choice === "month") d.setMonth(d.getMonth() + 1);
  d.setHours(6, 0, 0, 0);
  return d.toISOString();
}
