import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { NAV, type NavItem } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { usePref, useSettings } from "@/ui/parts";
import { useAutomation } from "./automation";
import { useSuggestions } from "@/features/Suggestions";

const EASE = [0.16, 1, 0.3, 1] as const;

function Item({ it, collapsed, badge = 0 }: { it: NavItem; collapsed: boolean; badge?: number }) {
  const loc = useLocation();
  const active = it.path === "/" ? loc.pathname === "/" : loc.pathname.startsWith(it.path);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const Icon = it.icon;
  return (
    <>
      <NavLink to={it.path} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}
        onMouseEnter={(e) => { if (!collapsed) return; const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right + 12, y: r.top + r.height / 2 }); }}
        onMouseLeave={() => setTip(null)} onFocus={(e) => { if (!collapsed) return; const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right + 12, y: r.top + r.height / 2 }); }}
        onBlur={() => setTip(null)} onClick={() => setTip(null)} aria-label={collapsed ? it.label : undefined}>
        {active && <motion.i className="nav-pill" layoutId="nav-pill" transition={{ duration: 0.24, ease: EASE }} />}
        <Icon /><span>{it.label}</span>
        {badge > 0 && <b className="nav-badge" aria-label={`${badge} point${badge > 1 ? "s" : ""} urgent${badge > 1 ? "s" : ""}`}>{badge}</b>}
      </NavLink>
      {/* Rendu hors de la barre latérale : jamais rogné ni recouvert par le panneau principal. */}
      {tip && collapsed && createPortal(<div className="tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{it.label}</div>, document.body)}
    </>
  );
}

export function Shell({ children, onLock }: { children: ReactNode; onLock: () => void }) {
  const s = useSettings();
  const [collapsed, setCollapsed] = usePref("nav.collapsed", false);
  const [cmd, setCmd] = useState(false);
  const loc = useLocation(), nav = useNavigate();
  const suggestions = useSuggestions();
  useAutomation(s, suggestions);
  const urgent = suggestions.filter((x) => x.tone === "bad").length;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((x) => !x); }
      if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); setCollapsed(!collapsed); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [collapsed, setCollapsed]);

  const initials = (s.name || "Moi").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const groups = ["Argent", "Vie"] as const;
  return (
    <div className={`shell${collapsed ? " collapsed" : ""}`}>
      <motion.nav className="side" aria-label="Navigation" initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.24, ease: EASE }}>
        <div className="side-top">
          <a href="#/" onClick={(e) => { e.preventDefault(); nav("/"); }} aria-label="axta, tableau de bord">
            <img src={collapsed ? "./favicon.svg" : "./logo.svg"} alt="axta" style={{ height: collapsed ? 22 : 24 }} />
          </a>
          {!collapsed && <button className="icon-btn" onClick={() => setCollapsed(true)} aria-label="Replier la navigation (Ctrl+B)"><PanelLeftClose size={17} /></button>}
        </div>
        {collapsed && <button className="nav-item expand" onClick={() => setCollapsed(false)} aria-label="Déplier la navigation (Ctrl+B)"><PanelLeftOpen /><span>Déplier</span></button>}
        <button className="nav-item" onClick={() => setCmd(true)} aria-label="Rechercher (Ctrl+K)">
          <Search /><span className="grow-label">Rechercher</span>{!collapsed && <span className="kbd">⌘K</span>}
        </button>
        {groups.map((g) => (
          <div key={g} style={{ display: "contents" }}>
            <div className="nav-group">{g}</div>
            {NAV.filter((i) => i.group === g).map((i) => <Item key={i.path} it={i} collapsed={collapsed} badge={i.path === "/" ? urgent : 0} />)}
          </div>
        ))}
        <div className="spacer" />
        {NAV.filter((i) => i.group === "foot").map((i) => <Item key={i.path} it={i} collapsed={collapsed} />)}
        <div className="side-user" title={s.name}>
          <span className="avatar">{initials}</span>
          <span className="who" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name || "Mon espace"}</span>
          <button className="icon-btn who" onClick={onLock} aria-label="Verrouiller" style={{ width: 26, height: 26, fontSize: 12 }}>⏻</button>
        </div>
      </motion.nav>
      <main className="panel">
        {/* Entrée de page : fondu + 8 px. Pas d'animation de sortie (évite les états bloqués entre deux routes). */}
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE }}>
          {children}
        </motion.div>
      </main>
      <AnimatePresence>{cmd && <CommandPalette onClose={() => setCmd(false)} onLock={onLock} />}</AnimatePresence>
    </div>
  );
}
