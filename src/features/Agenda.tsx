import { useMemo, useState } from "react";
import { DatePicker } from "@/ui/Pickers";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CalendarPlus, ChevronLeft, ChevronRight, Download, List, CalendarDays } from "lucide-react";
import { Head, Tag, downloadFile, useList, usePref } from "@/ui/parts";
import { useToast } from "@/ui/Toast";
import { addRow } from "@/ui/DataTable";
import { collectEvents, groupByMonth, monthGrid, KIND_META, type CalEvent } from "@/domain/calendar";
import { toICS } from "@/domain/ics";
import { daysTo, fdate, iso, parseISO, today } from "@/domain/money";

const EASE = [0.16, 1, 0.3, 1] as const;
const WD = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

function When({ date, done }: { date: string; done: boolean }) {
  if (done) return <Tag tone="ok">Fait</Tag>;
  const d = daysTo(date);
  return <Tag tone={d < 0 ? "bad" : d <= 30 ? "mid" : "ok"}>{d < 0 ? `En retard de ${-d} j` : d === 0 ? "Aujourd'hui" : `Dans ${d} j`}</Tag>;
}

function Row({ e }: { e: CalEvent }) {
  const m = KIND_META[e.kind];
  const d = parseISO(e.date);
  return (
    <Link to={m.path} className="ag-row" style={{ opacity: e.done ? 0.55 : 1 }}>
      <div className="ag-date"><b>{d.getDate()}</b><small>{d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</small></div>
      <i className="ag-bar" style={{ background: m.color }} />
      <div className="ag-main"><span className="ag-title">{e.title}</span><small>{m.label}{e.detail ? ` · ${e.detail}` : ""}</small></div>
      <When date={e.date} done={e.done} />
    </Link>
  );
}

export default function Agenda() {
  const tasks = useList("tasks"), projects = useList("projects"), vaults = useList("vaults"), debts = useList("debts");
  const toast = useToast();
  const [view, setView] = usePref<"list" | "month">("agenda.view", "list");
  const [showDone, setShowDone] = usePref("agenda.done", false);
  const [cursor, setCursor] = useState(() => { const t = today(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [title, setTitle] = useState(""), [date, setDate] = useState("");

  const all = useMemo(() => collectEvents({ tasks, projects, vaults, debts }), [tasks, projects, vaults, debts]);
  const evts = showDone ? all : all.filter((e) => !e.done);
  const { late, months } = groupByMonth(evts);
  const byDay = useMemo(() => { const m = new Map<string, CalEvent[]>(); for (const e of evts) m.set(e.date, [...(m.get(e.date) ?? []), e]); return m; }, [evts]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) { toast.show("Donne un titre et une date."); return; }
    await addRow("tasks", { title: title.trim(), owner: "", priority: "Important, pas urgent", cost: null, dueDate: date, status: "À faire", notes: "" });
    setTitle(""); setDate(""); toast.show("Ajouté à l'agenda (dans Démarches).");
  };
  const exportIcs = () => {
    downloadFile(toICS(all), `axta-agenda-${iso(today())}.ics`, "text/calendar");
    toast.show("Agenda exporté. Ouvre le fichier pour l'ajouter à ton calendrier.");
  };
  const shift = (k: number) => setCursor(({ y, m }) => { const d = new Date(y, m + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const todayIso = iso(today());

  return (
    <>
      <Head title="Agenda" sub="Tout ce qui a une date : démarches, projets, objectifs d'épargne, échéances. En liste ou en calendrier."
        actions={<>
          <button className="btn" onClick={exportIcs} title="Ajoute tes échéances à Google Agenda ou Apple Calendrier, avec rappels"><Download />Exporter (.ics)</button>
          <div className="seg" role="group" aria-label="Affichage">
            {([["list", "Liste", List], ["month", "Mois", CalendarDays]] as const).map(([k, l, I]) => (
              <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>
                {view === k && <motion.i className="seg-pill" layoutId="agenda-view" transition={{ duration: 0.24, ease: EASE }} />}
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><I size={14} />{l}</span>
              </button>
            ))}
          </div>
        </>} />

      <form className="filters" onSubmit={add}>
        <label className="field grow"><CalendarPlus size={16} /><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Commencer l'auto-école, obtenir mon passeport…" aria-label="Quoi" /></label>
        <DatePicker prefix="Pour le" label="Date" value={date} onChange={setDate} placeholder="choisir" />
        <button className="btn primary" type="submit">Ajouter</button>
        <label className="field" style={{ cursor: "pointer" }}><input type="checkbox" className="toggle" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Afficher les éléments faits</label>
      </form>

      {view === "list" ? (
        <div className="ag-list">
          {!evts.length && <p className="empty-row">Rien de daté pour l'instant. Ajoute une échéance ci-dessus.</p>}
          {late.length > 0 && (
            <section className="ag-month">
              <h3 className="neg">En retard</h3>
              {late.map((e) => <Row key={e.key} e={e} />)}
            </section>
          )}
          {months.map((g, i) => (
            <motion.section key={g.key} className="ag-month" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE, delay: Math.min(i, 6) * 0.04 }}>
              <h3 style={{ textTransform: "capitalize" }}>{g.label} <span className="count">{g.events.length}</span></h3>
              {g.events.map((e) => <Row key={e.key} e={e} />)}
            </motion.section>
          ))}
        </div>
      ) : (
        <div className="card cal">
          <div className="cal-head">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mois précédent"><ChevronLeft size={18} /></button>
            <h3 style={{ textTransform: "capitalize", margin: 0 }}>{label}</h3>
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Mois suivant"><ChevronRight size={18} /></button>
            <button className="btn ghost" onClick={() => { const t = today(); setCursor({ y: t.getFullYear(), m: t.getMonth() }); }}>Aujourd'hui</button>
          </div>
          <div className="cal-grid" role="grid" aria-label={label}>
            {WD.map((w) => <div key={w} className="cal-wd">{w}</div>)}
            {monthGrid(cursor.y, cursor.m).flat().map((day, i) => (
              <div key={i} className={`cal-day${day ? "" : " out"}${day === todayIso ? " today" : ""}`} role="gridcell" aria-label={day ? fdate(day) : undefined}>
                {day && <span className="cal-n">{Number(day.slice(8))}</span>}
                {day && (byDay.get(day) ?? []).slice(0, 3).map((e) => (
                  <Link key={e.key} to={KIND_META[e.kind].path} className="cal-chip" title={`${e.title} — ${KIND_META[e.kind].label}`}
                    style={{ borderLeftColor: KIND_META[e.kind].color, opacity: e.done ? 0.5 : 1 }}>{e.title}</Link>
                ))}
                {day && (byDay.get(day)?.length ?? 0) > 3 && <small className="cal-more">+{byDay.get(day)!.length - 3}</small>}
              </div>
            ))}
          </div>
          <div className="cal-legend">{Object.values(KIND_META).map((m) => <span key={m.label}><i style={{ background: m.color }} />{m.label}</span>)}</div>
        </div>
      )}
      <p className="desc" style={{ marginTop: 16 }}>
        Astuce : « Exporter (.ics) » puis ouvre le fichier avec Google Agenda ou Apple Calendrier. Chaque échéance arrive avec deux rappels (7 jours avant et la veille) ; dans Google Agenda, tu peux les recevoir par e-mail.
      </p>
    </>
  );
}
