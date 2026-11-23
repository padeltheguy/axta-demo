import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Download, Lock, PanelLeft, type LucideIcon } from "lucide-react";
import { NAV } from "./nav";
import { downloadBackup } from "@/features/Settings";

interface Cmd { label: string; hint: string; icon: LucideIcon; run: () => void }

export function CommandPalette({ onClose, onLock }: { onClose: () => void; onLock: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState(""), [sel, setSel] = useState(0);
  const all: Cmd[] = useMemo(() => [
    ...NAV.map((i) => ({ label: i.label, hint: "Aller", icon: i.icon, run: () => nav(i.path) })),
    { label: "Sauvegarder mes données", hint: "Action", icon: Download, run: () => { downloadBackup(); } },
    { label: "Replier / déplier la navigation", hint: "⌘B", icon: PanelLeft, run: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true })) },
    { label: "Verrouiller axta", hint: "Action", icon: Lock, run: onLock },
  ], [nav, onLock]);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const matches = all.filter((c) => norm(c.label).includes(norm(q)));
  const list = matches;
  const go = (c?: Cmd) => { if (!c) return; onClose(); c.run(); };
  return (
    <motion.div className="cmdk-back" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
      <motion.div className="cmdk" role="dialog" aria-label="Palette de commandes" onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
        <input autoFocus placeholder="Aller à, faire…" value={q} aria-label="Commande"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === "Enter") go(list[sel]);
          }} />
        <ul role="listbox">
          {list.map((c, i) => { const I = c.icon; return (
            <li key={c.label} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(c)}><I />{c.label}<em>{c.hint}</em></li>
          ); })}
          {!list.length && <li aria-disabled>Aucun résultat</li>}
        </ul>
      </motion.div>
    </motion.div>
  );
}
