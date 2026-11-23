import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DatePicker, Select } from "@/ui/Pickers";
import { useLiveQuery } from "dexie-react-hooks";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Printer, Table2, TrendingDown, TrendingUp } from "lucide-react";
import { Head, Tag, useList, usePref, useSettings } from "@/ui/parts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, CHART, SERIES, compact, type ChartConfig } from "@/ui/Chart";
import { db } from "@/db/db";
import { achievements, comparable, byCategory, byMonth, delta, incomeBySource, periodOf, previousPeriod, summarize, wealthSeries, type Preset } from "@/domain/reports";
import { makeSnapshot, monthKey } from "@/domain/history";
import { fdate, fmt, pct } from "@/domain/money";

const PRESETS: [Preset, string][] = [["3m", "3 derniers mois"], ["6m", "6 derniers mois"], ["12m", "12 derniers mois"], ["ytd", "Depuis le 1er janvier"], ["year", "Une année"], ["years", "Plusieurs années"], ["custom", "Dates personnalisées"]];
const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

function Kpi({ label, value, before, goodUp = true, hint }: { label: string; value: number; before?: number; goodUp?: boolean; hint?: string }) {
  const d = before == null ? null : delta(value, before);
  const up = d != null && d > 0, good = d == null || d === 0 ? null : up === goodUp;
  return (
    <div className="card stat">
      <div className="lbl">{label}</div>
      <div className="val">{fmt(value)}</div>
      <div className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {d != null && d !== 0 && <span className={good ? "pos" : "neg"} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? "+" : ""}{pct(d)}</span>}
        <span>{d != null ? "vs période précédente" : hint}</span>
      </div>
    </div>
  );
}

export default function Reports() {
  const s = useSettings();
  const movements = useList("movements"), debts = useList("debts"), tasks = useList("tasks"), projects = useList("projects");
  const accounts = useList("accounts"), vaults = useList("vaults"), charges = useList("charges");
  const snaps = useLiveQuery(() => db.snapshots.orderBy("month").toArray(), []) ?? [];
  const y = new Date().getFullYear();
  const [preset, setPreset] = usePref<Preset>("rep.preset", "3m");
  const [year, setYear] = usePref("rep.year", y);
  const [yFrom, setYFrom] = usePref("rep.yfrom", y - 1), [yTo, setYTo] = usePref("rep.yto", y);
  const [start, setStart] = usePref("rep.start", ""), [end, setEnd] = usePref("rep.end", "");
  const [table, setTable] = useState(false);

  const years = useMemo(() => {
    const ys = new Set<number>([y, y + 1]);
    movements.forEach((m) => ys.add(Number(m.date.slice(0, 4)))); snaps.forEach((x) => ys.add(Number(x.month.slice(0, 4))));
    return [...ys].sort();
  }, [movements, snaps, y]);

  const p = periodOf(preset, new Date(), { year, from: yFrom, to: yTo, start: start || undefined, end: end || undefined });
  const prev = previousPeriod(p, preset);
  const sm = summarize(movements, p, s), pv = summarize(movements, prev, s);
  const months = byMonth(movements, p, s);
  const cats = byCategory(movements, p, s, 5);
  const sources = incomeBySource(movements, p, s, 5);
  const live = makeSnapshot(monthKey(), { settings: s, accounts, debts, vaults, charges });
  const wealth = wealthSeries(snaps, p, live);
  const done = achievements({ debts, tasks, projects }, p);
  const totalCats = cats.reduce((t, c) => t + c.value, 0);
  const hasData = sm.count > 0;
  const cmp = comparable(movements, prev); // sinon : pas de pourcentage trompeur

  const flowConfig: ChartConfig = { revenus: { label: "Revenus", color: CHART.c1 }, depenses: { label: "Dépenses", color: CHART.c2 } };
  const useConfig: ChartConfig = { dettes: { label: "Dettes remboursées", color: CHART.c3 }, epargne: { label: "Épargne constituée", color: CHART.c4 } };
  const wealthConfig: ChartConfig = { valeur: { label: "Valeur nette", color: CHART.c1 }, dettes: { label: "Dettes restantes", color: CHART.c2 } };
  const catConfig: ChartConfig = Object.fromEntries(cats.map((c, i) => [c.name, { label: c.name, color: c.name === "Autres" ? CHART.other : SERIES[i % SERIES.length] }]));
  const catData = cats.map((c) => ({ ...c, fill: catConfig[c.name].color }));


  return (
    <div className="report">
      <Head title="Rapports" sub="Ta progression sur la période choisie : revenus, dépenses, dettes remboursées, épargne, valeur nette et ce que tu as accompli."
        actions={<>
          <button className="btn" onClick={() => setTable(!table)} aria-pressed={table}><Table2 />{table ? "Graphiques" : "Données"}</button>
          <button className="btn" onClick={() => window.print()}><Printer />Exporter en PDF</button>
        </>} />

      <div className="filters report-filters">
        <Select variant="chip" label="Période" prefix="Période" value={preset} onChange={(v) => v && setPreset(v)} searchable={false}
          options={PRESETS.map(([k, l]) => {
            const x = k === "year" || k === "years" || k === "custom" ? null : periodOf(k);
            return { value: k, label: l, hint: x ? `${short(x.from)} → ${short(x.to)}` : k === "custom" ? "Du… au…" : "Choisir" };
          })} />
        {preset === "year" && <Select variant="chip" label="Année" prefix="Année" value={year} onChange={(v) => v && setYear(v)} options={years.map((x) => ({ value: x, label: String(x) }))} />}
        {preset === "years" && <>
          <Select variant="chip" label="Première année" prefix="De" value={yFrom} onChange={(v) => v && setYFrom(v)} options={years.map((x) => ({ value: x, label: String(x) }))} />
          <Select variant="chip" label="Dernière année" prefix="à" value={yTo} onChange={(v) => v && setYTo(v)} options={years.map((x) => ({ value: x, label: String(x) }))} />
        </>}
        {preset === "custom" && <>
          <DatePicker variant="chip" label="Début de la période" prefix="Du" value={start} onChange={setStart} max={end || undefined} clearable={false} placeholder="début" />
          <DatePicker variant="chip" label="Fin de la période" prefix="Au" value={end} onChange={setEnd} min={start || undefined} clearable={false} placeholder="aujourd'hui" />
        </>}
        <span className="report-range">{p.label} · du {fdate(p.from)} au {fdate(p.to)}{!cmp && hasData && " · comparaison indisponible (données incomplètes sur la période précédente)"}</span>
      </div>

      {!hasData && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Pas encore de mouvements sur cette période</h3>
          <p className="desc" style={{ margin: 0 }}>Les rapports se nourrissent du journal des <Link className="link" to="/mouvements">Mouvements</Link> : importe un relevé MoMo ou saisis tes entrées et sorties.</p>
        </div>
      )}

      <div className="stats">
        <Kpi label="Revenus" value={sm.income} before={cmp ? pv.income : undefined} hint="Hors transferts, emprunts et entrées à classer" />
        <Kpi label="Dépenses" value={sm.expenses} before={cmp ? pv.expenses : undefined} goodUp={false} hint="Hors dettes, épargne, transferts" />
        <Kpi label="Dettes remboursées" value={sm.debtRepaid} before={cmp ? pv.debtRepaid : undefined} hint={sm.borrowed ? `Versés sur la période · emprunté : ${fmt(sm.borrowed)}` : "Versés sur la période"} />
        <Kpi label="Épargne constituée" value={sm.saved} before={cmp ? pv.saved : undefined} hint={`Taux d'épargne : ${pct(sm.savingsRate)}`} />
      </div>
      {sm.toClassify > 0 && (
        <p className="rep-note" role="note">
          {fmt(sm.toClassify)} d'entrées <b>à classer</b> (dépôts d'espèces, virements reçus sans règle) ne sont pas comptées en revenus.{" "}
          <Link className="link" to="/mouvements">Qualifie-les</Link> : un paiement client devient « Revenus », de l'argent retiré puis redéposé reste à part.
        </p>
      )}

      {table ? (
        <div className="card">
          <h3>Données de la période</h3>
          <div className="dt-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Mois</th><th className="num">Revenus</th><th className="num">Dépenses</th><th className="num">Dettes remboursées</th><th className="num">Épargne</th></tr></thead>
              <tbody>{months.map((r) => <tr key={r.key}><td className="calc">{r.label}</td><td className="calc num">{fmt(r.revenus)}</td><td className="calc num">{fmt(r.depenses)}</td><td className="calc num">{fmt(r.dettes)}</td><td className="calc num">{fmt(r.epargne)}</td></tr>)}</tbody>
              <tfoot><tr><td className="tl">Total</td><td className="num">{fmt(sm.income)}</td><td className="num">{fmt(sm.expenses)}</td><td className="num">{fmt(sm.debtRepaid)}</td><td className="num">{fmt(sm.saved)}</td></tr></tfoot>
            </table>
          </div>
          <div className="dt-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead><tr><th>Dépenses par catégorie</th><th className="num">Montant</th><th className="num">Part</th></tr></thead>
              <tbody>{cats.map((c) => <tr key={c.name}><td className="calc">{c.name}</td><td className="calc num">{fmt(c.value)}</td><td className="calc num">{pct(totalCats ? c.value / totalCats : 0)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid report-grid">
          <section className="card span2">
            <h3>Revenus et dépenses</h3>
            <p className="desc">Par {months.length > 24 ? "trimestre" : "mois"}. Revenus − dépenses − dettes − épargne : <b>{fmt(sm.left)}</b>{sm.left < 0 && (sm.borrowed || sm.toClassify) ? <> (couvert par {[sm.borrowed && `${fmt(sm.borrowed)} empruntés`, sm.toClassify && `${fmt(sm.toClassify)} d'entrées à classer`].filter(Boolean).join(" et ")})</> : null}.</p>
            <ChartContainer config={flowConfig} label="Revenus et dépenses par mois">
              <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="#EDEDF0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={compact} fontSize={12} />
                <ChartTooltip cursor={{ fill: "rgba(0,0,0,.03)" }} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="revenus" fill="var(--color-revenus)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="depenses" fill="var(--color-depenses)" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ChartContainer>
          </section>

          <section className="card">
            <h3>Où partent tes dépenses</h3>
            <p className="desc">{fmt(totalCats)} sur la période.</p>
            {catData.length ? (
              <div className="donut-wrap">
                <ChartContainer config={catConfig} height={200} label="Répartition des dépenses par catégorie">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Pie data={catData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={1} stroke="#fff" strokeWidth={2}>
                      {catData.map((c) => <Cell key={c.name} fill={c.fill} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="donut-legend">
                  {catData.map((c) => <li key={c.name}><i style={{ background: c.fill }} /><span>{c.name}</span><b>{pct(totalCats ? c.value / totalCats : 0)}</b></li>)}
                </ul>
              </div>
            ) : <p className="desc">Aucune dépense enregistrée.</p>}
          </section>

          <section className="card">
            <h3>Dettes et épargne</h3>
            <p className="desc">Ce que tu as remboursé et mis de côté, mois par mois.</p>
            <ChartContainer config={useConfig} height={240} label="Dettes remboursées et épargne constituée par mois">
              <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="#EDEDF0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={compact} fontSize={12} />
                <ChartTooltip cursor={{ fill: "rgba(0,0,0,.03)" }} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="dettes" fill="var(--color-dettes)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="epargne" fill="var(--color-epargne)" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ChartContainer>
          </section>

          <section className="card span2">
            <h3>Valeur nette et dettes dans le temps</h3>
            <p className="desc">D'après les photos du mois (comptes + coffres − dettes). {wealth.some((w) => snaps.find((x) => x.month === w.key)?.note) && "Les mois reconstitués depuis un relevé sont des estimations."}</p>
            {wealth.length > 1 ? (
              <ChartContainer config={wealthConfig} height={240} label="Valeur nette et dettes restantes par mois">
                <LineChart data={wealth} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#EDEDF0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compact} fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line dataKey="valeur" stroke="var(--color-valeur)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: "var(--color-valeur)" }} activeDot={{ r: 5 }} />
                  <Line dataKey="dettes" stroke="var(--color-dettes)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: "var(--color-dettes)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ChartContainer>
            ) : <p className="desc">Une photo est prise chaque mois à l'ouverture d'axta : la courbe apparaîtra dès le deuxième mois.</p>}
          </section>

          <section className="card">
            <h3>D'où viennent tes revenus</h3>
            {sources.length ? sources.map((x, i) => (
              <div className="owe" key={x.name}><i className="pdot" style={{ background: SERIES[i % SERIES.length] }} /><span>{x.name}</span><b>{fmt(x.value)}</b></div>
            )) : <p className="desc">Aucun revenu enregistré.</p>}
          </section>

          <section className="card">
            <h3>Accompli sur la période</h3>
            {done.debts.map((d) => <div className="kv" key={`d${d.id}`}><span>Dette soldée : {d.creditor}</span><Tag tone="ok">{fdate(d.closedAt!)}</Tag></div>)}
            {done.projects.map((d) => <div className="kv" key={`p${d.id}`}><span>Projet acquis : {d.name}</span><Tag tone="ok">{fdate(d.closedAt!)}</Tag></div>)}
            {done.tasks.map((d) => <div className="kv" key={`t${d.id}`}><span>Démarche faite : {d.title}</span><Tag tone="ok">{fdate(d.closedAt!)}</Tag></div>)}
            {!done.debts.length && !done.projects.length && !done.tasks.length && <p className="desc">Rien d'archivé sur cette période. Les dettes soldées, démarches faites et projets acquis sont datés automatiquement.</p>}
          </section>
        </div>
      )}
      <p className="desc print-only">axta · rapport généré le {new Date().toLocaleDateString("fr-FR")} · {s.name}</p>
    </div>
  );
}
