import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileUp, X } from "lucide-react";
import { DataTable, addRow, type Col } from "@/ui/DataTable";
import { Select } from "@/ui/Pickers";
import { Head, Stat, Tabs, useList, usePref, useSettings } from "@/ui/parts";
import { useToast } from "@/ui/Toast";
import { db, safeRestorePoint } from "@/db/db";
import { readStatement } from "@/app/importers";
import { dedupe, fuzzyDuplicates, toMovements } from "@/domain/movements";
import { summarize } from "@/domain/reports";
import { fmt, iso, n, today, toBase, fdate } from "@/domain/money";
import { MOVE_CATEGORIES, NON_FLOW_MOVES, type Movement, type Settings } from "@/domain/types";

const EASE = [0.16, 1, 0.3, 1] as const;
type Draft = Omit<Movement, "id" | "order">;

const cols = (s: Settings, accounts: { id?: number; name: string }[]): Col<"movements">[] => [
  { k: "date", label: "Date", type: "date" },
  { k: "label", label: "Libellé", w: "w-x" },
  { k: "category", label: "Catégorie", opts: MOVE_CATEGORIES, pill: "outline" },
  { k: "amount", label: "Montant (+/−)", type: "number" },
  { label: "En CFA", money: true, calc: (r) => toBase(n(r.amount), r.currency, s) },
  { label: "Compte", render: (r) => accounts.find((a) => a.id === r.accountId)?.name ?? "" },
  { label: "Source", render: (r) => <span className="pill">{r.source === "momo" ? "Relevé MoMo" : r.source === "ia" ? "Assistant" : r.source === "csv" ? "CSV" : "Saisie"}</span> },
  { k: "notes", label: "Notes", w: "w-l" },
];

export default function Movements() {
  const s = useSettings(), toast = useToast();
  const all = useList("movements"), accounts = useList("accounts"), debts = useList("debts");
  const [tab, setTab] = usePref<"all" | "in" | "out" | "todo" | "move">("mv.tab", "all");
  const [month, setMonth] = usePref("mv.month", "");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<{ name: string; rows: Draft[]; dup: number } | null>(null);
  const [addPaid, setAddPaid] = useState(true), [busy, setBusy] = useState(false);
  const [accId, setAccId] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const months = useMemo(() => [...new Set(all.map((m) => m.date.slice(0, 7)))].sort().reverse(), [all]);
  const neutral = (m: Movement) => NON_FLOW_MOVES.includes(m.category);
  const F = { all: () => true, in: (m: Movement) => m.amount > 0 && !neutral(m), out: (m: Movement) => m.amount < 0 && !neutral(m), todo: (m: Movement) => m.category === "À classer", move: (m: Movement) => neutral(m) && m.category !== "À classer" };
  const Q = q.trim().toLowerCase();
  const scoped = all.filter((m) => (!month || m.date.startsWith(month)) && (!Q || `${m.label} ${m.counterparty} ${m.category} ${m.notes}`.toLowerCase().includes(Q)));
  const rows = [...scoped.filter(F[tab])].sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
  const period = month ? { from: `${month}-01`, to: `${month}-31`, label: "" } : { from: "0000-01-01", to: "9999-12-31", label: "" };
  const sm = summarize(scoped, period, s);

  const pick = async (f: File) => {
    try {
      const tx = await readStatement(f);
      const momo = accounts.find((a) => /momo/i.test(a.name));
      const acc = accId ?? momo?.id ?? null;
      setAccId(acc);
      const drafts = toMovements(tx, s, debts, acc);
      const fresh = dedupe(drafts, all);
      setPreview({ name: f.name, rows: fresh, dup: drafts.length - fresh.length });
    } catch (e) { toast.show(e instanceof Error ? e.message : "Relevé illisible."); }
  };
  // Doublons probables avec une saisie manuelle ou une lecture de capture : la ligne du relevé remplace l'existante.
  const fuzzy = preview ? fuzzyDuplicates(preview.rows.map((r) => ({ ...r, accountId: accId })), all.filter((m) => m.source !== "momo")) : new Map();
  // Remboursements reliés à une dette et non déjà saisis : proposés pour « Déjà payé ».
  const linked = preview ? preview.rows.filter((r, i) => r.category === "Remboursement de dette" && r.debtId != null && !fuzzy.has(i)) : [];
  const toClassify = preview ? preview.rows.filter((r) => r.category === "À classer") : [];

  const confirm = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      await safeRestorePoint(`Avant import du relevé ${preview.name}`);
      await db.transaction("rw", db.movements, db.debts, async () => {
        const fresh = dedupe(preview.rows, await db.movements.toArray()); // re-vérifié au dernier moment (double clic, autre onglet)
        const replace = fuzzyDuplicates(fresh.map((r) => ({ ...r, accountId: accId })), (await db.movements.toArray()).filter((m) => m.source !== "momo"));
        const rows = fresh.map((r, i) => { const old = replace.get(i) as Movement | undefined; return old ? { ...r, debtId: r.debtId ?? old.debtId, notes: [r.notes, old.notes].filter(Boolean).join(" · ") } : r; });
        await db.movements.bulkDelete([...replace.values()].map((m) => m.id!).filter(Boolean));
        const last = await db.movements.orderBy("order").last();
        await db.movements.bulkAdd(rows.map((r, i) => ({ ...r, accountId: accId, order: (last?.order ?? 0) + i + 1 })));
        if (addPaid) {
          for (const [i, r] of rows.entries()) {
            if (replace.has(i) || r.category !== "Remboursement de dette" || r.debtId == null) continue;
            const d = await db.debts.get(r.debtId); if (!d) continue;
            await db.debts.update(d.id!, { paid: Math.min(n(d.total), n(d.paid) - r.amount) });
          }
        }
        toast.show(`${rows.length} mouvements importés${replace.size ? `, ${replace.size} saisies remplacées par le relevé` : ""}.`);
      });
      setPreview(null);
    } catch (e) { toast.show(e instanceof Error ? e.message : "Import impossible."); }
    finally { setBusy(false); }
  };

  const catSummary = (rs: Draft[]) => {
    const m = new Map<string, number>();
    rs.forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + r.amount));
    return [...m.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  };

  return (
    <>
      <Head title="Mouvements" sub="Le journal daté de tout l'argent qui entre et qui sort. C'est l'historique de ta vie financière : les rapports et les photos du mois s'en servent."
        actions={<>
          <button className="btn" onClick={() => file.current?.click()}><FileUp />Importer un relevé MoMo</button>
          <button className="btn primary" onClick={() => { setTab("all"); addRow("movements", { date: iso(today()), label: "", amount: 0, currency: "XOF", category: "Autre dépense", accountId: null, debtId: null, vaultId: null, counterparty: "", source: "manuel", ref: "", notes: "" }); }}>+ Mouvement</button>
        </>} />
      <input ref={file} type="file" accept="application/pdf,.csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f); }} />

      <div className="summary">
        <Stat label={month ? "Revenus du mois" : "Revenus (tout)"} value={sm.income} hint={sm.toClassify ? `+ ${fmt(sm.toClassify)} à classer (non comptés)` : "Hors transferts et emprunts"} />
        <Stat label={month ? "Dépenses du mois" : "Dépenses (tout)"} value={sm.expenses} hint="Hors dettes, épargne, transferts" />
        <Stat label="Dettes remboursées · épargne" value={sm.debtRepaid + sm.saved} hint={`${fmt(sm.debtRepaid)} + ${fmt(sm.saved)}`} />
      </div>
      <Tabs id="mv" value={tab} onChange={setTab} items={[["all", "Tous", scoped.length], ["in", "Entrées", scoped.filter(F.in).length], ["out", "Sorties", scoped.filter(F.out).length], ["todo", "À classer", scoped.filter(F.todo).length], ["move", "Dettes, épargne, transferts", scoped.filter(F.move).length]]} />
      <div className="filters">
        <Select prefix="Mois" label="Mois" value={month || null} clearable placeholder="Tous" onChange={(v) => setMonth(v ?? "")}
          options={months.map((m) => ({ value: m, label: new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), hint: `${all.filter((x) => x.date.startsWith(m)).length}` }))} />
        <label className="field grow"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un libellé, une personne, une catégorie…" aria-label="Rechercher" /></label>
      </div>
      <DataTable list="movements" cols={cols(s, accounts)} rows={rows.slice(0, 300)} all={all} />
      {rows.length > 300 && <p className="desc" style={{ marginTop: 10 }}>300 mouvements affichés sur {rows.length} : affine avec le mois ou la recherche.</p>}

      <AnimatePresence>
        {preview && (
          <motion.div className="cmdk-back" onClick={() => !busy && setPreview(null)} onKeyDown={(e) => { if (e.key === "Escape" && !busy) setPreview(null); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="cmdk import-box" role="dialog" aria-modal="true" aria-label="Aperçu de l'import" tabIndex={-1} ref={(el) => el?.focus()} onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }}>
              <header><b>Importer « {preview.name} »</b><button className="icon-btn" onClick={() => setPreview(null)} aria-label="Fermer"><X size={16} /></button></header>
              <div style={{ padding: "14px 18px" }}>
                <p className="desc">{preview.rows.length} nouveaux mouvements{preview.dup ? `, ${preview.dup} déjà présents ignorés` : ""}{preview.rows.length ? `, du ${fdate(preview.rows.map((r) => r.date).sort()[0])} au ${fdate(preview.rows.map((r) => r.date).sort().at(-1)!)}` : ""}. Les catégories sont proposées automatiquement : tu pourras les corriger ensuite.</p>
                <div style={{ marginBottom: 12 }}><Select prefix="Compte" label="Compte du relevé" value={accId} clearable placeholder="Aucun" onChange={(v) => setAccId(v)} options={accounts.map((x) => ({ value: x.id!, label: x.name }))} /></div>
                {fuzzy.size > 0 && <p className="desc">{fuzzy.size} opération{fuzzy.size > 1 ? "s" : ""} déjà saisie{fuzzy.size > 1 ? "s" : ""} à la main (même montant, ± 1 jour) : la ligne du relevé la remplacera, sans double compte.</p>}
                {toClassify.length > 0 && <p className="desc">{toClassify.length} entrée{toClassify.length > 1 ? "s" : ""} « À classer » ({fmt(toClassify.reduce((t, r) => t + r.amount, 0))}) : dépôts d'espèces et virements reçus sans règle. Elles ne comptent pas en revenus tant que tu ne les as pas qualifiées.</p>}
                {linked.length > 0 && <label className="check" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                  <input type="checkbox" checked={addPaid} onChange={(e) => setAddPaid(e.target.checked)} />
                  <span>Ajouter au « Déjà payé » les {linked.length} remboursement{linked.length > 1 ? "s" : ""} relié{linked.length > 1 ? "s" : ""} à une dette : {linked.map((r) => `${debts.find((d) => d.id === r.debtId)?.creditor ?? "?"} ${fmt(-r.amount)}`).join(", ")}.</span>
                </label>}
                <div className="import-cats">{catSummary(preview.rows).map(([c, v]) => <div key={c} className="kv"><span>{c}</span><b className={v < 0 ? "" : "pos"}>{v > 0 ? "+" : ""}{fmt(v)}</b></div>)}</div>
                <div className="actions" style={{ marginTop: 14, justifyContent: "flex-end" }}>
                  <button className="btn" disabled={busy} onClick={() => setPreview(null)}>Annuler</button>
                  <button className="btn primary" disabled={!preview.rows.length || busy} onClick={confirm}>{busy ? "Import…" : `Importer ${preview.rows.length} mouvements`}</button>
                </div>
                <p className="desc" style={{ marginTop: 10 }}>Un point de restauration est créé avant l'import (Paramètres › Sauvegardes).</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
