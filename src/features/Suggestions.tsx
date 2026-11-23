import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CircleAlert, Clock, Lightbulb, PartyPopper } from "lucide-react";
import { saveSettings, useList, useSettings } from "@/ui/parts";
import { useToast } from "@/ui/Toast";
import { suggest, snoozeUntil, type SnoozeChoice, type Suggestion } from "@/domain/suggestions";
import { downloadBackup } from "./Settings";

const ICON = { bad: CircleAlert, warn: AlertTriangle, info: Lightbulb, ok: PartyPopper };
const EASE = [0.16, 1, 0.3, 1] as const;

export function useSuggestions(): Suggestion[] {
  const settings = useSettings();
  const tasks = useList("tasks"), debts = useList("debts"), vaults = useList("vaults"), charges = useList("charges");
  const projects = useList("projects"), incomes = useList("incomes"), wishlist = useList("wishlist");
  return useMemo(() => suggest({ settings, tasks, debts, vaults, charges, projects, incomes, wishlist }),
    [settings, tasks, debts, vaults, charges, projects, incomes, wishlist]);
}

export function Suggestions() {
  const s = useSettings(), list = useSuggestions(), nav = useNavigate(), toast = useToast();
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 3);
  const [snooze, setSnooze] = useState<string | null>(null);
  const LABEL: Record<SnoozeChoice, string> = { day: "Demain", week: "Dans une semaine", month: "Dans un mois", forever: "Ne plus afficher" };
  const dismiss = (id: string, c: SnoozeChoice) => {
    saveSettings({ dismissed: { ...s.dismissed, [id]: snoozeUntil(c) } }); setSnooze(null);
    toast.show(c === "forever" ? "Suggestion masquée." : `Reportée : ${LABEL[c].toLowerCase()}.`, { label: "Annuler", run: () => { const d = { ...s.dismissed }; delete d[id]; saveSettings({ dismissed: d }); } });
  };
  const act = async (x: Suggestion) => {
    const a = x.action!;
    if (a.to) nav(a.to);
    if (a.run === "backup") { await downloadBackup(); toast.show("Sauvegarde téléchargée."); }
    if (a.run === "phase2") { await saveSettings({ phase: 2 }); toast.show("Phase 2 activée : place à la construction."); }
  };
  return (
    <section className="card" style={{ marginBottom: 14 }} aria-label="Suggestions">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div><h3>axta te suggère</h3><p className="desc">Ce qui mérite ton attention maintenant. Rien n'est modifié sans toi.</p></div>
        {list.length > 3 && <button className="btn ghost" onClick={() => setAll(!all)}>{all ? "Réduire" : `Tout voir (${list.length})`}</button>}
      </div>
      <div className="sugg">
        <AnimatePresence initial={false}>
          {shown.map((x) => {
            const I = ICON[x.tone];
            return (
              <motion.div key={x.id} layout className={`sugg-item ${x.tone}`}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: -8, transition: { duration: 0.2 } }} transition={{ duration: 0.24, ease: EASE }}>
                <span className="sugg-ic"><I /></span>
                <div className="sugg-body"><b>{x.title}</b><p>{x.body}</p></div>
                <div className="sugg-act">
                  {x.action?.href ? <a className="btn" href={x.action.href}>{x.action.label}</a>
                    : x.action && <button className="btn" onClick={() => act(x)}>{x.action.label}</button>}
                  <span style={{ position: "relative" }}>
                    <button className="icon-btn" onClick={() => setSnooze(snooze === x.id ? null : x.id)} aria-label="Reporter cette suggestion" aria-expanded={snooze === x.id}><Clock size={15} /></button>
                    {snooze === x.id && (
                      <div className="menu" style={{ position: "absolute", right: 0, top: 36 }} role="menu" onMouseLeave={() => setSnooze(null)}>
                        <small style={{ display: "block", padding: "6px 10px", color: "var(--soft-fg)" }}>Reporter</small>
                        {(["day", "week", "month"] as SnoozeChoice[]).map((c) => <button key={c} role="menuitem" onClick={() => dismiss(x.id, c)}>{LABEL[c]}</button>)}
                        <hr /><button role="menuitem" className="danger" onClick={() => dismiss(x.id, "forever")}>{LABEL.forever}</button>
                      </div>
                    )}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
