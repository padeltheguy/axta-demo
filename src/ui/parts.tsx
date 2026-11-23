import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, table } from "@/db/db";
import type { ListName, ListTypes, Settings } from "@/domain/types";
import { defaultSettings } from "@/domain/defaults";
import { fmt, pct } from "@/domain/money";

/* ---- Données ---- */
export function useList<K extends ListName>(k: K): ListTypes[K][] {
  return useLiveQuery(() => table(k).orderBy("order").toArray(), [k]) ?? [];
}
const DEFAULTS = defaultSettings();
export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get("settings"), []);
  // Fusion avec les valeurs par défaut : un espace créé avant l'ajout d'un champ le reçoit.
  return s ? { ...DEFAULTS, ...s, dismissed: s.dismissed ?? {} } : DEFAULTS;
}
export const saveSettings = (patch: Partial<Settings>) => db.settings.update("settings", patch);

/* ---- Persistance légère de l'interface (filtres, onglets) ---- */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(`axta.ui.${key}`); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  const set = (x: T) => { setV(x); try { localStorage.setItem(`axta.ui.${key}`, JSON.stringify(x)); } catch { /* stockage indisponible */ } };
  return [v, set];
}

/* ---- Blocs ---- */
export const Head = ({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) => (
  <div className="head">
    <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
    {actions && <div className="actions">{actions}</div>}
  </div>
);

/** Compteur animé : de l'ancienne valeur à la nouvelle (600 ms). */
export function Counter({ value, format = fmt }: { value: number; format?: (x: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduce) { el.textContent = format(value); prev.current = value; return; }
    const c = animate(prev.current, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => { el.textContent = format(x); } });
    prev.current = value;
    return () => c.stop();
  }, [value, format, reduce]);
  return <span ref={ref} aria-label={format(value)}>{format(value)}</span>;
}

export const Stat = ({ label, value, hint, tone, raw }: { label: string; value: number; hint?: ReactNode; tone?: "neg" | "pos" | ""; raw?: (x: number) => string }) => (
  <div className="card stat">
    <div className="lbl">{label}</div>
    <div className={`val ${tone ?? ""}`}><Counter value={value} format={raw} /></div>
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const Progress = ({ value }: { value: number }) => (
  <div className="pcell">
    <div className="prog"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(1, value) * 100}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} /></div>
    <span>{pct(value)}</span>
  </div>
);

export function Tabs<T extends string>({ id, items, value, onChange }: { id: string; items: [T, string, number][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, l, c]) => (
        <button key={k} role="tab" className="tab" aria-selected={k === value} onClick={() => onChange(k)}>
          {l}<span className="count">{c}</span>
          {k === value && <motion.i className="tab-line" layoutId={`tab-${id}`} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }} />}
        </button>
      ))}
    </div>
  );
}

export const Tag = ({ children, tone }: { children: ReactNode; tone: "ok" | "mid" | "bad" }) => <span className={`tag t-${tone}`}>{children}</span>;

export function downloadFile(content: string, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
