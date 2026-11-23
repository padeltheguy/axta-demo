import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Suggestions } from "./Suggestions";
import { Head, Stat, Tag, useList, usePref, useSettings } from "@/ui/parts";
import { fmt, n, pct, daysTo } from "@/domain/money";
import { debtSummary, livingEnvelope, monthlyCharges, outstanding, receivedByMonth, savingsTotal } from "@/domain/aggregates";
import { debtRest, hintFor, nextProject, projectRest, split, vaultProgress, type IncomeKind } from "@/domain/split";
import { collectEvents, KIND_META } from "@/domain/calendar";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Dashboard() {
  const s = useSettings();
  const incomes = useList("incomes"), debts = useList("debts"), vaults = useList("vaults");
  const charges = useList("charges"), projects = useList("projects"), tasks = useList("tasks");
  const [amt, setAmt] = usePref("split.amount", "");
  const [kind, setKind] = usePref<IncomeKind>("split.kind", "salary");

  const d = debtSummary(debts);
  const charge = monthlyCharges(charges), living = livingEnvelope(s), margin = living - charge;
  const upcoming = collectEvents({ tasks, projects, vaults, debts }).filter((e) => !e.done).slice(0, 6);
  const months = receivedByMonth(incomes, 12);
  const max = Math.max(1, ...months.map((m) => m.value));
  const yearTotal = months.reduce((a, m) => a + m.value, 0);
  const parts = split(n(amt), kind, s);
  const np = nextProject(projects);
  const owed = [...d.open].sort((a, b) => debtRest(b) - debtRest(a));

  return (
    <>
      <Head title={s.name ? `Bonjour ${s.name.split(" ")[0]}` : "Tableau de bord"} sub="Tes dettes, ton épargne et ton budget en un coup d'œil." />
      <div className="stats">
        <Stat label="Dettes restantes" value={d.rest} hint={`${pct(d.progress)} déjà remboursé`} />
        <Stat label="Épargne (coffres)" value={savingsTotal(vaults)} hint={`${vaults.length} coffres`} />
        <Stat label="Marge du budget" value={margin} tone={margin < 0 ? "neg" : ""} hint={`Charges : ${fmt(charge)} par mois`} />
        <Stat label="À encaisser" value={outstanding(incomes, s)} hint={((c) => `${c} mission${c > 1 ? "s" : ""} en cours`)(incomes.filter((i) => i.status === "En cours").length)} />
      </div>

      <Suggestions />

      <section className="card" style={{ marginBottom: 14 }} aria-label="Répartir un montant">
        <h3>Répartir un montant reçu</h3>
        <p className="desc">Saisis ce que tu viens de recevoir : tes règles disent où va chaque franc.</p>
        <div className="split-row">
          <label className="money-in"><span>CFA</span>
            <input type="number" inputMode="numeric" placeholder="0" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Montant reçu" />
          </label>
          <div className="seg" role="group" aria-label="Nature du montant">
            {([["salary", "Salaire complet"], ["partial", "Salaire partiel"], ["variable", "Freelance, prime, vente"]] as const).map(([k, l]) => (
              <button key={k} aria-pressed={k === kind} onClick={() => setKind(k)}>
                {k === kind && <motion.i className="seg-pill" layoutId="seg-kind" transition={{ duration: 0.24, ease: EASE }} />}
                <span>{l}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="bar" role="img" aria-label="Répartition">
          {parts.map((p, i) => (
            <motion.i key={p.key} style={{ width: `${p.share * 100}%`, background: p.color }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.42, ease: EASE, delay: i * 0.06 }} />
          ))}
        </div>
        <div className="legend">
          {parts.map((p) => {
            const h = hintFor(p.key, { debts, vaults, projects });
            return (
              <div key={p.key}><span className="dot" style={{ background: p.color }} />
                <span><b>{fmt(p.amount)}</b><small>{p.label} · {pct(p.share)}{h && <><br />{h}</>}</small></span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid">
        <div className="card">
          <h3>Ce que tu dois</h3>
          <p className="desc">{fmt(d.rest)} à {d.open.length} créancier{d.open.length > 1 ? "s" : ""} · {pct(d.progress)} déjà remboursé.</p>
          {owed.slice(0, 7).map((x) => (
            <div className="owe" key={x.id}>
              <span>{x.creditor}</span>
              <div className="prog"><motion.i initial={{ width: 0 }} animate={{ width: `${(n(x.total) ? n(x.paid) / n(x.total) : 0) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} /></div>
              <b>{fmt(debtRest(x))}</b>
            </div>
          ))}
          {owed.length > 7 && <Link to="/dettes" className="link" style={{ marginTop: 8 }}>+ {owed.length - 7} autres dettes</Link>}
          {!owed.length && <div className="kv"><span>Aucune dette en cours</span><Tag tone="ok">Libre</Tag></div>}
        </div>

        <div className="card">
          <h3>Encaissements, 12 derniers mois</h3>
          <p className="desc">Total : {fmt(yearTotal)} · moyenne {fmt(yearTotal / 12)} par mois.</p>
          <div className="chart" role="img" aria-label="Encaissements par mois">
            {months.map((m, i) => (
              <div className="col" key={m.key} title={`${m.label} : ${fmt(m.value)}`}>
                <motion.div className={`b${m.value ? "" : " zero"}`} style={{ height: `${(m.value / max) * 100}%` }}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, ease: EASE, delay: i * 0.02 }} />
                <small>{m.label}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Coffres d'épargne</h3>
          <p className="desc">Mets l'épargne disponible à jour une fois par mois.</p>
          {vaults.filter((v) => v.name).map((v) => (
            <div key={v.id}>
              <div className="kv" style={{ borderBottom: 0, paddingBottom: 4 }}><span>{v.name}</span><b>{fmt(n(v.balance))} <span style={{ color: "var(--soft-fg)", fontWeight: 400 }}>· {pct(vaultProgress(v))}</span></b></div>
              <div className="prog" style={{ margin: "0 0 10px" }}><motion.i initial={{ width: 0 }} animate={{ width: `${vaultProgress(v) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} /></div>
            </div>
          ))}
          {!vaults.length && <p className="desc">Aucun coffre pour l'instant.</p>}
        </div>

        <div className="card">
          <h3>Prochaines échéances</h3>
          <p className="desc">Ce qui est en retard ou arrive bientôt. <Link to="/agenda" className="link">Ouvrir l'agenda</Link></p>
          {upcoming.map((e) => {
            const k = daysTo(e.date);
            return <div className="kv" key={e.key}><span><i className="pdot" style={{ background: KIND_META[e.kind].color, display: "inline-block", marginRight: 8 }} />{e.title}</span>
              <Tag tone={k < 0 ? "bad" : k <= 30 ? "mid" : "ok"}>{k < 0 ? `En retard de ${-k} j` : k === 0 ? "Aujourd'hui" : `Dans ${k} j`}</Tag></div>;
          })}
          {!upcoming.length && <div className="kv"><span>Rien de daté</span><Tag tone="ok">À jour</Tag></div>}
          <div className="kv"><span>Prochain projet à financer</span><b>{np ? `${np.name} · ${fmt(projectRest(np))}` : "Aucun"}</b></div>
        </div>
      </div>
    </>
  );
}
