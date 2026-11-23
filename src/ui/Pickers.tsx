import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { addDaysIso, dayGrid } from "@/domain/calendar";
import { iso, parseISO, today } from "@/domain/money";

/**
 * Contrôles d'axta : liste de choix, sélecteur de date et filtre de période.
 * Ils remplacent les <select> et <input type="date"> natifs, dont l'apparence dépend du système
 * (format américain, menus gris) et ne suit pas le design d'axta.
 * Accessibles : rôles ARIA (listbox, dialog, grid), clavier complet, Échap, focus rendu au déclencheur.
 */

const EASE = [0.16, 1, 0.3, 1] as const;
const Level = createContext(0);

/* ---------- Popover : ancré au déclencheur, rendu hors des conteneurs (pas de rognage), couches imbriquées ---------- */
function Popover({ anchor, open, onClose, children, width, label, role = "dialog" }: {
  anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; children: ReactNode; width?: number; label: string; role?: "dialog" | "listbox";
}) {
  const level = useContext(Level) + 1;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect(), h = ref.current?.offsetHeight ?? 320, w = ref.current?.offsetWidth ?? width ?? 240;
      const up = r.bottom + h + 12 > window.innerHeight && r.top - h - 12 > 0;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: up ? r.top - h - 6 : r.bottom + 6, up });
    };
    place();
    const id = requestAnimationFrame(place); // seconde passe une fois la taille réelle connue
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      const layer = t.closest?.("[data-pop-level]");
      if (layer && Number(layer.getAttribute("data-pop-level")) > level) return; // clic dans une couche enfant
      onClose();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, onClose, anchor, level]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <Level.Provider value={level}>
          <motion.div ref={ref} className="pop" data-pop-level={level} role={role === "dialog" ? "dialog" : undefined} aria-label={label}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, transformOrigin: pos?.up ? "bottom left" : "top left" }}
            initial={{ opacity: 0, scale: 0.97, y: pos?.up ? 4 : -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: EASE }}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); anchor.current?.focus(); } }}>
            {children}
          </motion.div>
        </Level.Provider>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ---------- Liste de choix ---------- */
export interface Option<T> { value: T; label: string; hint?: string; dot?: string }
type Variant = "field" | "pill" | "cell" | "input" | "chip";

export function Select<T extends string | number>({ value, options, onChange, label, prefix, placeholder = "Choisir…", variant = "field", searchable, clearable, dot, className, disabled }: {
  value: T | null | undefined; options: Option<T>[]; onChange: (v: T | null) => void;
  /** nom accessible */ label: string; /** texte affiché devant la valeur (ex. « Mois ») */ prefix?: string;
  placeholder?: string; variant?: Variant; searchable?: boolean; clearable?: boolean; dot?: string | null; className?: string; disabled?: boolean;
}) {
  const btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false), [q, setQ] = useState(""), [active, setActive] = useState(0);
  const withSearch = searchable ?? options.length > 9;
  const Q = q.trim().toLowerCase();
  const shown = useMemo(() => options.filter((o) => !Q || `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(Q)), [options, Q]);
  const cur = options.find((o) => o.value === value);

  const show = () => { if (disabled) return; setQ(""); setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };
  const pick = (o: Option<T> | undefined) => { if (!o) return; onChange(o.value); setOpen(false); btn.current?.focus(); };
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter" || (e.key === " " && !withSearch)) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Tab") setOpen(false);
    else if (!withSearch && e.key.length === 1) { // saisie rapide : première lettre
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase())); if (i >= 0) setActive(i);
    }
  };
  const d = dot ?? cur?.dot;

  return (
    <>
      <button ref={btn} type="button" className={`sel sel-${variant}${cur ? "" : " empty"}${className ? ` ${className}` : ""}`} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-label={`${label} : ${cur?.label ?? placeholder}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); show(); } }}>
        {prefix && <span className="sel-prefix">{prefix}</span>}
        {d && <i className="pdot" style={{ background: d }} />}
        <span className="sel-value">{cur?.label ?? placeholder}</span>
        {clearable && cur ? <X size={13} className="sel-x" aria-hidden onClick={(e) => { e.stopPropagation(); onChange(null); }} /> : <ChevronDown size={14} className="sel-chev" aria-hidden />}
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={label} role="listbox">
        {withSearch && (
          <label className="pop-search"><Search size={14} aria-hidden />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={keys} placeholder="Rechercher…" aria-label={`Rechercher dans ${label}`}
              role="combobox" aria-expanded aria-controls={id} aria-activedescendant={shown[active] ? `${id}-${active}` : undefined} />
          </label>
        )}
        <div ref={list} id={id} role="listbox" aria-label={label} className="pop-list" tabIndex={withSearch ? -1 : 0} onKeyDown={keys}
          aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}>
          {shown.length === 0 && <p className="pop-empty">Aucun résultat</p>}
          {shown.map((o, i) => (
            <div key={String(o.value)} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.value === value}
              className={`pop-opt${i === active ? " active" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              {o.dot && <i className="pdot" style={{ background: o.dot }} />}
              <span className="pop-opt-label">{o.label}</span>
              {o.hint && <span className="pop-opt-hint">{o.hint}</span>}
              {o.value === value && <Check size={14} className="pop-check" aria-hidden />}
            </div>
          ))}
        </div>
        <FocusOnOpen target={withSearch ? null : list} />
      </Popover>
    </>
  );
}

/** Donne le focus à la liste à l'ouverture (clavier immédiatement opérationnel). */
function FocusOnOpen({ target }: { target: React.RefObject<HTMLElement | null> | null }) {
  useEffect(() => { const t = setTimeout(() => target?.current?.focus(), 0); return () => clearTimeout(t); }, [target]);
  return null;
}

/* ---------- Sélecteur de date ---------- */
const WEEK = ["L", "M", "M", "J", "V", "S", "D"];
export const fdateLong = (s: string) => (s ? parseISO(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

export function DatePicker({ value, onChange, label, prefix, placeholder = "Choisir une date", variant = "field", clearable = true, min, max }: {
  value: string | null | undefined; onChange: (v: string) => void; label: string; prefix?: string; placeholder?: string;
  variant?: Exclude<Variant, "pill">; clearable?: boolean; min?: string; max?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null), grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const now = iso(today());
  const [focus, setFocus] = useState(value || now);
  const f = parseISO(focus);
  const [view, setView] = useState({ y: f.getFullYear(), m: f.getMonth() });
  const days = dayGrid(view.y, view.m);

  const show = () => { const v = value || now; const d = parseISO(v); setFocus(v); setView({ y: d.getFullYear(), m: d.getMonth() }); setOpen(true); };
  const ok = (d: string) => (!min || d >= min) && (!max || d <= max);
  const pick = (d: string) => { if (!ok(d)) return; onChange(d); setOpen(false); btn.current?.focus(); };
  const move = (d: string) => { setFocus(d); const x = parseISO(d); setView({ y: x.getFullYear(), m: x.getMonth() }); };
  const shiftMonth = (k: number) => { const x = new Date(view.y, view.m + k, 1); setView({ y: x.getFullYear(), m: x.getMonth() }); };
  useEffect(() => { if (open) grid.current?.querySelector<HTMLElement>(`[data-d="${focus}"]`)?.focus(); }, [focus, open, view]);

  const keys = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (map[e.key] != null) { e.preventDefault(); move(addDaysIso(focus, map[e.key])); }
    else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); const x = parseISO(focus); move(iso(new Date(x.getFullYear(), x.getMonth() + (e.key === "PageUp" ? -1 : 1), Math.min(x.getDate(), 28)))); }
    else if (e.key === "Home") { e.preventDefault(); move(addDaysIso(focus, -((parseISO(focus).getDay() + 6) % 7))); }
    else if (e.key === "End") { e.preventDefault(); move(addDaysIso(focus, 6 - ((parseISO(focus).getDay() + 6) % 7))); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(focus); }
  };
  const title = new Date(view.y, view.m, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <button ref={btn} type="button" className={`sel sel-${variant}${value ? "" : " empty"}`} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`${label} : ${value ? fdateLong(value) : "aucune date"}`} onClick={() => (open ? setOpen(false) : show())}>
        {prefix && <span className="sel-prefix">{prefix}</span>}
        {variant !== "cell" && <Calendar size={14} className="sel-ico" aria-hidden />}
        <span className="sel-value">{value ? fdateLong(value) : placeholder}</span>
        {clearable && value && variant !== "cell" && <X size={13} className="sel-x" aria-hidden onClick={(e) => { e.stopPropagation(); onChange(""); }} />}
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={label} width={272}>
        <div className="dp">
          <header className="dp-head">
            <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Mois précédent"><ChevronLeft size={16} /></button>
            <b aria-live="polite">{title}</b>
            <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Mois suivant"><ChevronRight size={16} /></button>
          </header>
          <div className="dp-week" aria-hidden>{WEEK.map((w, i) => <span key={i}>{w}</span>)}</div>
          <div ref={grid} className="dp-grid" role="grid" aria-label={title} onKeyDown={keys}>
            {days.map((c) => (
              <button key={c.iso} type="button" role="gridcell" data-d={c.iso} tabIndex={c.iso === focus ? 0 : -1} disabled={!ok(c.iso)}
                aria-selected={c.iso === value} aria-current={c.iso === now ? "date" : undefined} aria-label={fdateLong(c.iso)}
                className={`dp-day${c.inMonth ? "" : " dp-out"}${c.iso === value ? " dp-sel" : ""}${c.iso === now ? " dp-today" : ""}`}
                onClick={() => pick(c.iso)}>{c.day}</button>
            ))}
          </div>
          <footer className="dp-foot">
            <button type="button" className="btn ghost" onClick={() => pick(now)} disabled={!ok(now)}>Aujourd'hui</button>
            {clearable && value && <button type="button" className="btn ghost" onClick={() => { onChange(""); setOpen(false); btn.current?.focus(); }}>Effacer</button>}
          </footer>
        </div>
      </Popover>
    </>
  );
}
