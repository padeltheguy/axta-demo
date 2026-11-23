import { useState } from "react";
import { Plus, Download, ExternalLink, Link2 } from "lucide-react";
import { DataTable, StatusPill, addRow, type Col } from "@/ui/DataTable";
import { DatePicker, Select } from "@/ui/Pickers";
import { Head, Progress, Stat, Tabs, downloadFile, useList, usePref, useSettings } from "@/ui/parts";
import { recordDebtPayment, table } from "@/db/db";
import { useToast } from "@/ui/Toast";
import { daysTo, fmt, hostOf, iso, monthsTo, n, pct, toBase, today } from "@/domain/money";
import { FREQUENCIES, PRIORITIES, type ListName, type ListTypes, type Settings } from "@/domain/types";
import { debtRest, debtStatus, incomeAllocation, incomeBase, incomeOutstanding, incomeReceived, projectRest, vaultProgress, vaultRest } from "@/domain/split";
import { chargeMonthly, livingEnvelope, monthlyCharges } from "@/domain/aggregates";

const CUR = ["XOF", "EUR", "USD"] as const;

function csv<K extends ListName>(name: K, cols: Col<K>[], rows: ListTypes[K][]) {
  const use = cols.filter((c) => c.k || c.calc);
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const val = (c: Col<K>, r: ListTypes[K]) => { if (c.k) return (r as unknown as Record<string, unknown>)[c.k]; const v = c.calc!(r); return typeof v === "number" ? Math.round(v) : v; };
  downloadFile("﻿" + [use.map((c) => q(c.label)).join(";"), ...rows.map((r) => use.map((c) => q(val(c, r))).join(";"))].join("\n"), `axta_${name}.csv`, "text/csv");
}
const Btns = ({ onAdd, label, onCsv }: { onAdd: () => void; label: string; onCsv: () => void }) => (
  <>
    <button className="btn" onClick={onCsv}><Download />CSV</button>
    <button className="btn primary" onClick={onAdd}><Plus />{label}</button>
  </>
);

/* ---------------- Revenus ---------------- */
const incomeCols = (s: Settings): Col<"incomes">[] => [
  { k: "date", label: "Date", type: "date" },
  { k: "kind", label: "Type", opts: ["Freelance", "Prime", "Commission", "Vente", "Autre"], pill: "outline" },
  { k: "client", label: "Client", w: "w-m" },
  { k: "project", label: "Projet", w: "w-l" },
  { k: "status", label: "Statut", opts: ["Devis envoyé", "En cours", "Payé", "Annulé"], pill: "status" },
  { k: "currency", label: "Devise", opts: CUR, pill: "outline" },
  { k: "amount", label: "Montant", type: "number" },
  { label: "En CFA", money: true, total: true, calc: (r) => (r.amount == null ? "" : incomeBase(r, s)) },
  { k: "deposit", label: "Acompte reçu (CFA)", type: "number", total: true },
  { k: "balance", label: "Solde reçu (CFA)", type: "number", total: true },
  { label: "Reste à encaisser", money: true, total: true, calc: (r) => (r.amount == null ? "" : incomeOutstanding(r, s)) },
  { k: "applyRules", label: "Règles", type: "toggle" },
  { label: "À épargner", money: true, total: true, calc: (r) => incomeAllocation(r, s, "save") },
  { label: "Pour les dettes", money: true, total: true, calc: (r) => incomeAllocation(r, s, "debts") },
  { label: "Projets et plaisir", money: true, total: true, calc: (r) => incomeAllocation(r, s, "projects") },
  { k: "notes", label: "Notes", w: "w-l" },
];

export function Incomes() {
  const s = useSettings(), all = useList("incomes");
  const [tab, setTab] = usePref<"all" | "open" | "paid" | "quote">("inc.tab", "all");
  const [from, setFrom] = usePref("inc.from", ""), [to, setTo] = usePref("inc.to", "");
  const F = { all: () => true, open: (r: ListTypes["incomes"]) => r.status === "En cours", paid: (r: ListTypes["incomes"]) => r.status === "Payé", quote: (r: ListTypes["incomes"]) => r.status === "Devis envoyé" };
  const inPeriod = (r: ListTypes["incomes"]) => (!from && !to) || (!!r.date && (!from || r.date >= from) && (!to || r.date <= to));
  const per = all.filter(inPeriod);
  const rows = per.filter(F[tab]);
  const got = per.reduce((a, r) => a + incomeReceived(r), 0);
  const left = per.reduce((a, r) => a + incomeOutstanding(r, s), 0);
  const r = s.rules.variable[s.phase];
  const cols = incomeCols(s);
  const quick = (k: "m" | "3" | "12" | "all") => {
    if (k === "all") { setFrom(""); setTo(""); return; }
    const st = today(); if (k === "m") st.setDate(1); else st.setMonth(st.getMonth() - Number(k));
    setFrom(iso(st)); setTo(iso(today()));
  };
  return (
    <>
      <Head title="Revenus variables" sub="Une ligne par mission, prime ou vente. Saisis l'acompte et le solde quand ils arrivent. Désactive « Règles » pour un encaissement qui ne doit rien répartir."
        actions={<Btns label="Nouvelle mission" onCsv={() => csv("incomes", cols, all)}
          onAdd={() => { setTab("all"); setFrom(""); setTo(""); addRow("incomes", { date: iso(today()), kind: "Freelance", client: "", project: "", status: "En cours", currency: "XOF", amount: null, deposit: null, balance: null, applyRules: true, notes: "" }); }} />} />
      <Tabs id="inc" value={tab} onChange={setTab} items={[["all", "Toutes", per.length], ["open", "En cours", per.filter(F.open).length], ["paid", "Payées", per.filter(F.paid).length], ["quote", "Devis envoyés", per.filter(F.quote).length]]} />
      <div className="filters">
        <DatePicker prefix="Du" label="Début" value={from} onChange={setFrom} max={to || undefined} placeholder="début" />
        <DatePicker prefix="Au" label="Fin" value={to} onChange={setTo} min={from || undefined} placeholder="fin" />
        {([["m", "Ce mois"], ["3", "3 derniers mois"], ["12", "12 derniers mois"], ["all", "Tout"]] as const).map(([k, l]) => <button key={k} className="btn ghost" onClick={() => quick(k)}>{l}</button>)}
      </div>
      <div className="summary">
        <Stat label="Encaissé sur la période" value={got} hint={`${per.length} ligne${per.length > 1 ? "s" : ""}`} />
        <Stat label="Reste à encaisser" value={left} hint="Hors annulées" />
        <Stat label="À épargner sur l'encaissé" value={per.filter((x) => x.applyRules).reduce((a, x) => a + incomeReceived(x), 0) * (r.savings + r.car)} hint={`${pct(r.savings + r.car)} des paiements avec « Règles » actif`} />
      </div>
      <DataTable list="incomes" cols={cols} rows={rows} all={all} />
    </>
  );
}

/* ---------------- Dettes ---------------- */
/** Saisie rapide d'un versement : s'ajoute à « Déjà payé ». */
function PayCell({ d }: { d: ListTypes["debts"] }) {
  const toast = useToast();
  const [v, setV] = useState("");
  const pay = async () => {
    const x = Number(v);
    if (!x || x <= 0) return;
    try {
      const undo = await recordDebtPayment(d.id!, x, "manuel", iso(today()));
      setV("");
      const paid = Math.min(n(d.total), n(d.paid) + x);
      toast.show(paid >= n(d.total) ? `${d.creditor} est soldée. Elle quitte ta liste.` : `${fmt(x)} versés à ${d.creditor}. Reste ${fmt(n(d.total) - paid)}.`, { label: "Annuler", run: undo });
    } catch (e) { toast.show(e instanceof Error ? e.message : "Versement non enregistré."); }
  };
  // Entrée pour valider (pas d'enregistrement à la sortie du champ : une saisie abandonnée ne doit rien changer)
  return <input className="pay-in" type="number" inputMode="numeric" placeholder="+ montant ↵" value={v} aria-label={`Ajouter un versement à ${d.creditor} (Entrée pour valider)`}
    onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") pay(); if (e.key === "Escape") setV(""); }} />;
}
/** Compte lié (ex. découvert) : évite de compter deux fois la même dette dans la valeur nette. */
function DebtAccount({ d }: { d: ListTypes["debts"] }) {
  const accounts = useList("accounts");
  return <Select variant="cell" label={`Compte lié à ${d.creditor}`} value={d.accountId ?? null} clearable placeholder="—"
    options={accounts.map((a) => ({ value: a.id!, label: a.name }))} onChange={(v) => table("debts").update(d.id!, { accountId: v })} />;
}
const debtCols: Col<"debts">[] = [
  { k: "creditor", label: "Créancier", w: "w-x" },
  { k: "type", label: "Type", opts: ["Frais de scolarité", "Banque", "Dette personnelle", "Services", "Crédit", "Autre"], pill: "outline" },
  { k: "total", label: "Montant total", type: "number", total: true },
  { label: "Verser", render: (r) => (debtRest(r) > 0 ? <PayCell d={r} /> : "") },
  { k: "paid", label: "Déjà payé", type: "number", total: true },
  { label: "Reste à payer", money: true, total: true, calc: (r) => debtRest(r) },
  { label: "Progression", render: (r) => <Progress value={n(r.total) ? n(r.paid) / n(r.total) : 0} /> },
  { label: "Statut", render: (r) => <StatusPill v={debtStatus(r)} /> },
  { k: "dueDate", label: "Échéance (facultatif)", type: "date" },
  { label: "Compte lié", render: (r) => <DebtAccount d={r} /> },
  { k: "notes", label: "Notes", w: "w-l" },
];
export function Debts() {
  const all = useList("debts");
  const [tab, setTab] = usePref<"open" | "done" | "all">("debt.tab", "open");
  const F = { open: (r: ListTypes["debts"]) => debtRest(r) > 0, done: (r: ListTypes["debts"]) => !!r.creditor && debtRest(r) <= 0, all: () => true };
  const open = all.filter((r) => r.creditor && debtRest(r) > 0);
  const rest = open.reduce((a, d) => a + debtRest(d), 0);
  const paid = all.reduce((a, d) => a + n(d.paid), 0), total = all.reduce((a, d) => a + n(d.total), 0);
  return (
    <>
      <Head title="Dettes" sub="Ce que tu dois, à qui. Saisis un versement dans « Verser » : tout s'enregistre seul. Une dette payée en entier quitte la liste « À rembourser »."
        actions={<Btns label="Ajouter une dette" onCsv={() => csv("debts", debtCols, all)}
          onAdd={() => { setTab("open"); addRow("debts", { creditor: "", type: "Dette personnelle", total: 0, paid: 0, dueDate: "", notes: "" }); }} />} />
      <div className="summary">
        <Stat label="Tu dois encore" value={rest} hint={`à ${open.length} créancier${open.length > 1 ? "s" : ""}`} />
        <Stat label="Déjà remboursé" value={paid} hint={`${pct(total ? paid / total : 0)} du total`} />
        <Stat label="Plus grosse dette" value={open.reduce((m, d) => Math.max(m, debtRest(d)), 0)} hint={[...open].sort((a, b) => debtRest(b) - debtRest(a))[0]?.creditor ?? "Aucune"} />
      </div>
      <Tabs id="debt" value={tab} onChange={setTab} items={[["open", "À rembourser", all.filter(F.open).length], ["done", "Remboursées", all.filter(F.done).length], ["all", "Toutes", all.length]]} />
      <DataTable list="debts" cols={debtCols} rows={all.filter(F[tab])} all={all} />
    </>
  );
}

/* ---------------- Épargne ---------------- */
const vaultCols: Col<"vaults">[] = [
  { k: "name", label: "Coffre", w: "w-l" },
  { k: "target", label: "Objectif", type: "number", total: true },
  { k: "targetDate", label: "Date cible", type: "date" },
  { k: "balance", label: "Épargné (coffre)", type: "number", total: true },
  { label: "Progression", render: (r) => <Progress value={vaultProgress(r)} /> },
  { label: "Reste", money: true, total: true, calc: (r) => vaultRest(r) },
  { label: "À verser par mois", render: (r) => { const re = vaultRest(r), m = monthsTo(r.targetDate); return re <= 0 ? "Objectif atteint" : fmt(m ? re / m : re); } },
  { k: "notes", label: "Notes", w: "w-x" },
];
export function Vaults() {
  const all = useList("vaults");
  return (
    <>
      <Head title="Épargne" sub="Un coffre par objectif. Mets à jour l'épargne disponible une fois par mois avec le solde de ton appli d'épargne. L'ordre décide où va la part épargne."
        actions={<Btns label="Ajouter un coffre" onCsv={() => csv("vaults", vaultCols, all)} onAdd={() => addRow("vaults", { name: "", target: 0, targetDate: "", balance: 0, notes: "" })} />} />
      <DataTable list="vaults" cols={vaultCols} rows={all} all={all} />
    </>
  );
}

/* ---------------- Budget ---------------- */
const chargeCols: Col<"charges">[] = [
  { k: "label", label: "Poste", w: "w-l" },
  { k: "category", label: "Catégorie", opts: ["Logement", "Abonnements", "Travail", "Enfants", "Nourriture", "Transport", "Banque", "Santé", "Famille", "Divers"], pill: "outline" },
  { k: "frequency", label: "Fréquence", opts: Object.keys(FREQUENCIES), pill: "outline" },
  { k: "amount", label: "Montant", type: "number" },
  { label: "Par mois", money: true, total: true, calc: (r) => chargeMonthly(r) },
  { k: "status", label: "Statut", opts: ["Actif", "Prévu", "À réduire", "À résilier"], pill: "status" },
  { k: "notes", label: "Notes", w: "w-l" },
];
export function Budget() {
  const s = useSettings(), all = useList("charges");
  const c = monthlyCharges(all), v = livingEnvelope(s), m = v - c;
  return (
    <>
      <Head title="Budget mensuel" sub="Les charges qui reviennent. Une charge hebdomadaire ou trimestrielle est ramenée au mois."
        actions={<Btns label="Ajouter une charge" onCsv={() => csv("charges", chargeCols, all)} onAdd={() => addRow("charges", { label: "", category: "", frequency: "Mensuel", amount: 0, status: "Actif", notes: "" })} />} />
      <div className="summary">
        <Stat label="Charges par mois" value={c} hint="Hors charges « Prévu »" />
        <Stat label="Enveloppe vie courante" value={v} hint={`${pct(s.rules.salary[s.phase].living)} du salaire`} />
        <Stat label="Marge" value={m} tone={m < 0 ? "neg" : "pos"} hint={m < 0 ? "Réduis un poste « À réduire »" : "Reste disponible chaque mois"} />
      </div>
      <DataTable list="charges" cols={chargeCols} rows={all} all={all} />
    </>
  );
}

/* ---------------- Projets ---------------- */
const projectCols: Col<"projects">[] = [
  { k: "order", label: "Ordre", type: "number", w: "w-s" },
  { k: "name", label: "Projet", w: "w-x" },
  { k: "category", label: "Catégorie", opts: ["Maison", "Bureau", "Personnel", "Famille", "Compétences", "Loisirs", "Mobilité", "Finances"], pill: "outline" },
  { k: "priority", label: "Priorité", opts: PRIORITIES, pill: "prio" },
  { k: "budget", label: "Budget", type: "number", total: true },
  { k: "paid", label: "Déjà payé", type: "number", total: true },
  { label: "Reste à payer", money: true, total: true, calc: (r) => (r.budget == null ? "" : projectRest(r)) },
  { k: "status", label: "Statut", opts: ["Idée", "Planifié", "En cours", "Acquis", "Annulé"], pill: "status" },
  { k: "targetDate", label: "Date cible", type: "date" },
  { k: "notes", label: "Notes", w: "w-l" },
];
export function Projects() {
  const all = useList("projects");
  const [tab, setTab] = usePref<"active" | "done" | "all">("proj.tab", "active");
  const F = { active: (r: ListTypes["projects"]) => r.status !== "Acquis" && r.status !== "Annulé", done: (r: ListTypes["projects"]) => r.status === "Acquis", all: () => true };
  return (
    <>
      <Head title="Projets et acquisitions" sub="L'ordre décide de ce qui passe en premier avec l'enveloppe projets. Règle : tout achat de plus de 50 000 CFA passe ici et attend 72 h."
        actions={<Btns label="Ajouter un projet" onCsv={() => csv("projects", projectCols, all)}
          onAdd={() => { setTab("active"); addRow("projects", { name: "", category: "", priority: "", budget: null, paid: null, status: "Planifié", targetDate: "", notes: "" }); }} />} />
      <Tabs id="proj" value={tab} onChange={setTab} items={[["active", "À financer", all.filter(F.active).length], ["done", "Acquis", all.filter(F.done).length], ["all", "Tous", all.length]]} />
      <DataTable list="projects" cols={projectCols} rows={all.filter(F[tab])} all={all} />
    </>
  );
}

/* ---------------- Démarches ---------------- */
const taskCols: Col<"tasks">[] = [
  { k: "title", label: "Démarche", w: "w-x" },
  { k: "owner", label: "Pour qui", w: "w-m" },
  { k: "priority", label: "Priorité", opts: PRIORITIES, pill: "prio" },
  { k: "cost", label: "Coût", type: "number", total: true },
  { k: "dueDate", label: "Date limite", type: "date" },
  { label: "Échéance", render: (r) => { if (r.status === "Fait" || !r.dueDate) return ""; const d = daysTo(r.dueDate); return <span className={`tag ${d < 0 ? "t-bad" : d <= 30 ? "t-mid" : ""}`}>{d < 0 ? `En retard de ${-d} j` : `Dans ${d} j`}</span>; } },
  { k: "status", label: "Statut", opts: ["À faire", "En cours", "Fait", "Bloqué"], pill: "status" },
  { k: "notes", label: "Notes", w: "w-l" },
];
export function Tasks() {
  const all = useList("tasks");
  const [tab, setTab] = usePref<"todo" | "done" | "all">("task.tab", "todo");
  const F = { todo: (r: ListTypes["tasks"]) => r.status !== "Fait", done: (r: ListTypes["tasks"]) => r.status === "Fait", all: () => true };
  return (
    <>
      <Head title="Démarches" sub="Papiers, rendez-vous, formalités. Priorité selon la matrice d'Eisenhower ; passe à « Fait » pour archiver."
        actions={<Btns label="Ajouter une démarche" onCsv={() => csv("tasks", taskCols, all)}
          onAdd={() => { setTab("todo"); addRow("tasks", { title: "", owner: "", priority: "", cost: null, dueDate: "", status: "À faire", notes: "" }); }} />} />
      <Tabs id="task" value={tab} onChange={setTab} items={[["todo", "À faire", all.filter(F.todo).length], ["done", "Faites", all.filter(F.done).length], ["all", "Toutes", all.length]]} />
      <DataTable list="tasks" cols={taskCols} rows={all.filter(F[tab])} all={all} />
    </>
  );
}

/* ---------------- Liste d'achats ---------------- */
/** Devine un nom lisible depuis l'URL d'un produit (sans réseau). */
export function guessName(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).filter((p) => !/^[a-z]?\d+$/i.test(p) && p.length > 3);
    const best = seg.sort((a, b) => b.length - a.length)[0] ?? u.hostname;
    return decodeURIComponent(best).replace(/\.(html?|php)$/i, "").replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
  } catch { return ""; }
}
const wishCols = (s: Settings): Col<"wishlist">[] => [
  { k: "name", label: "Article", w: "w-x" },
  { k: "category", label: "Catégorie", opts: ["Électronique", "Livres", "Maison", "Vêtements", "Enfants", "Bureau", "Loisirs", "Autre"], pill: "outline" },
  { k: "priority", label: "Priorité", opts: ["Haute", "Moyenne", "Basse"], pill: "prio" },
  { k: "price", label: "Prix", type: "number" },
  { k: "currency", label: "Devise", opts: CUR, pill: "outline" },
  { label: "En CFA", money: true, total: true, calc: (r) => (r.price == null ? "" : toBase(n(r.price), r.currency, s)) },
  { k: "status", label: "Statut", opts: ["À acheter", "Acheté", "Abandonné"], pill: "status" },
  { label: "Site", render: (r) => r.url ? <a className="link" href={r.url} target="_blank" rel="noreferrer noopener">{hostOf(r.url) || "Lien"}<ExternalLink /></a> : "" },
  { k: "url", label: "Lien", type: "url", w: "w-m", ph: "https://…" },
  { k: "notes", label: "Notes", w: "w-l" },
];
export function Wishlist() {
  const s = useSettings(), all = useList("wishlist"), toast = useToast();
  const [tab, setTab] = usePref<"todo" | "bought" | "all">("wish.tab", "todo");
  const [link, setLink] = useState("");
  const F = { todo: (r: ListTypes["wishlist"]) => r.status === "À acheter", bought: (r: ListTypes["wishlist"]) => r.status === "Acheté", all: () => true };
  const todo = all.filter(F.todo);
  const cols = wishCols(s);
  const capture = async () => {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) { toast.show("Colle un lien qui commence par https://"); return; }
    await addRow("wishlist", { name: guessName(url), category: "", status: "À acheter", priority: "Moyenne", price: null, currency: "EUR", url, notes: "", addedAt: iso(today()) });
    setLink(""); setTab("todo"); toast.show("Article ajouté : complète le prix.");
  };
  return (
    <>
      <Head title="Liste d'achats" sub="Les articles à ne pas oublier. Colle un lien : axta crée la ligne, tu complètes le prix. Au-delà de 50 000 CFA, passe-le en Projets."
        actions={<Btns label="Ajouter un article" onCsv={() => csv("wishlist", cols, all)}
          onAdd={() => { setTab("todo"); addRow("wishlist", { name: "", category: "", status: "À acheter", priority: "Moyenne", price: null, currency: "XOF", url: "", notes: "", addedAt: iso(today()) }); }} />} />
      <form className="filters" onSubmit={(e) => { e.preventDefault(); capture(); }}>
        <label className="field grow"><Link2 size={16} /><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Colle le lien d'un article…" aria-label="Lien de l'article" /></label>
        <button className="btn" type="submit">Capturer</button>
      </form>
      <div className="summary">
        <Stat label="À acheter" value={todo.reduce((a, r) => a + (r.price == null ? 0 : toBase(n(r.price), r.currency, s)), 0)} hint={`${todo.length} article${todo.length > 1 ? "s" : ""}`} />
        <Stat label="Priorité haute" value={todo.filter((r) => r.priority === "Haute").length} raw={(x) => String(Math.round(x))} hint="articles" />
        <Stat label="Déjà achetés" value={all.filter(F.bought).length} raw={(x) => String(Math.round(x))} hint="articles" />
      </div>
      <Tabs id="wish" value={tab} onChange={setTab} items={[["todo", "À acheter", todo.length], ["bought", "Achetés", all.filter(F.bought).length], ["all", "Tous", all.length]]} />
      <DataTable list="wishlist" cols={cols} rows={all.filter(F[tab])} all={all} />
    </>
  );
}

/* ---------------- Comptes ---------------- */
const accountCols = (s: Settings): Col<"accounts">[] => [
  { k: "name", label: "Compte", w: "w-l" },
  { k: "type", label: "Type", opts: ["Banque", "Mobile money", "Épargne", "Crypto", "Espèces", "Autre"], pill: "outline" },
  { k: "institution", label: "Établissement", w: "w-m" },
  { k: "currency", label: "Devise", opts: CUR, pill: "outline" },
  { k: "balance", label: "Solde", type: "number" },
  { label: "En CFA", money: true, total: true, calc: (r) => (r.balance == null ? "" : toBase(n(r.balance), r.currency, s)) },
  { k: "updatedAt", label: "Relevé du", type: "date" },
  { k: "notes", label: "Notes", w: "w-x" },
];
export function Accounts() {
  const s = useSettings(), all = useList("accounts");
  const cols = accountCols(s);
  const inBase = (r: ListTypes["accounts"]) => (r.balance == null ? 0 : toBase(n(r.balance), r.currency, s));
  const total = all.reduce((a, r) => a + inBase(r), 0);
  const negative = all.filter((r) => inBase(r) < 0);
  const oldest = all.filter((r) => r.updatedAt).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
  return (
    <>
      <Head title="Comptes" sub="Tes soldes : banques, mobile money, épargne, crypto. Mets-les à jour quand tu consultes tes applis ; la date du relevé dit si le chiffre est encore frais."
        actions={<Btns label="Ajouter un compte" onCsv={() => csv("accounts", cols, all)}
          onAdd={() => addRow("accounts", { name: "", type: "Banque", institution: "", currency: "XOF", balance: null, updatedAt: iso(today()), notes: "" })} />} />
      <div className="summary">
        <Stat label="Total sur tes comptes" value={total} tone={total < 0 ? "neg" : ""} hint={`${all.length} compte${all.length > 1 ? "s" : ""}`} />
        <Stat label="Comptes à découvert" value={negative.reduce((a, r) => a + inBase(r), 0)} tone={negative.length ? "neg" : ""} hint={negative.map((r) => r.name).join(", ") || "Aucun"} />
        <Stat label="Relevé le plus ancien" value={oldest ? -daysTo(oldest.updatedAt) : 0} raw={(x) => `${Math.round(x)} j`} hint={oldest?.name ?? "—"} />
      </div>
      <DataTable list="accounts" cols={cols} rows={all} all={all} />
    </>
  );
}
