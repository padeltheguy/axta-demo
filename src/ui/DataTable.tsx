import { DatePicker, Select } from "./Pickers";
import { useEffect, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { table } from "@/db/db";
import type { ListName, ListTypes } from "@/domain/types";
import { fmt, n } from "@/domain/money";
import { useToast } from "./Toast";

type Row<K extends ListName> = ListTypes[K];

export interface Col<K extends ListName> {
  label: string;
  /** Champ éditable. */
  k?: keyof Row<K> & string;
  type?: "text" | "number" | "date" | "url" | "toggle";
  opts?: readonly string[];
  pill?: "status" | "prio" | "outline";
  w?: "w-s" | "w-m" | "w-l" | "w-x";
  /** Valeur calculée (lecture seule). */
  calc?: (r: Row<K>) => number | string | "";
  money?: boolean;
  total?: boolean;
  render?: (r: Row<K>) => ReactNode;
  ph?: string;
}

const KIND: Record<string, string> = {
  "Payé": "ok", "Remboursée": "ok", "Actif": "ok", "Acquis": "ok", "Fait": "ok", "Acheté": "ok",
  "En cours": "prog", "Devis envoyé": "plan", "Planifié": "plan", "Prévu": "plan", "À faire": "plan", "À acheter": "plan",
  "Idée": "idle", "À réduire": "warn", "Non payée": "bad", "Annulé": "bad", "À résilier": "bad", "Bloqué": "bad", "Abandonné": "idle",
};
const COLOR: Record<string, string> = { ok: "#22C55E", prog: "#3B82F6", plan: "#A1A1AA", idle: "#D4D4D8", warn: "#F59E0B", bad: "#EF4444" };
export const PRIO_COLOR: Record<string, string> = {
  "Urgent et important": "#EF4444", "Important, pas urgent": "#3B82F6", "Urgent, pas important": "#F59E0B", "Ni urgent ni important": "#A1A1AA",
  "Haute": "#EF4444", "Moyenne": "#F59E0B", "Basse": "#A1A1AA",
};
export const StatusPill = ({ v }: { v: string }) =>
  v ? <span className="pill"><i className="pdot" style={{ background: COLOR[KIND[v] ?? "idle"] }} />{v}</span> : null;

function Cell<K extends ListName>({ list, row, col }: { list: K; row: Row<K>; col: Col<K> }) {
  const k = col.k!;
  const v = (row as unknown as Record<string, unknown>)[k];
  const save = (val: unknown) => table(list).update(row.id!, { [k]: val } as never);

  if (col.type === "toggle")
    return <input type="checkbox" className="toggle" checked={!!v} onChange={(e) => save(e.target.checked)} aria-label={col.label} />;
  if (col.opts) {
    const dot = col.pill === "status" && v ? COLOR[KIND[String(v)] ?? "idle"] : col.pill === "prio" && v ? PRIO_COLOR[String(v)] : null;
    const colorOf = (o: string) => (col.pill === "status" ? COLOR[KIND[o] ?? "idle"] : col.pill === "prio" ? PRIO_COLOR[o] : undefined);
    return <Select variant="pill" label={col.label} value={v ? String(v) : null} dot={dot}
      options={col.opts.map((o) => ({ value: o, label: o, dot: colorOf(o) }))} onChange={(x) => save(x ?? "")} />;
  }
  const t = col.type ?? "text";
  if (t === "date") return <DatePicker variant="cell" label={col.label} value={v ? String(v) : ""} placeholder="—" onChange={(x) => save(x)} />;
  const commit = (raw: string) => {
    const next = t === "number" ? (raw === "" ? null : Number(raw)) : raw;
    if (next !== v) save(next);
  };
  return (
    <input
      // la clé force la resynchronisation si la valeur change ailleurs (import, autre onglet)
      key={String(v ?? "")}
      className={`cellin ${col.w ?? ""}`}
      type={t === "url" ? "url" : t}
      inputMode={t === "number" ? "decimal" : undefined}
      step={t === "number" ? "any" : undefined}
      defaultValue={v == null ? "" : String(v)}
      placeholder={col.ph}
      aria-label={col.label}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function DataTable<K extends ListName>({ list, cols, rows, all }: { list: K; cols: Col<K>[]; rows: Row<K>[]; all: Row<K>[] }) {
  const toast = useToast();
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close); window.addEventListener("resize", close); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("click", close); window.removeEventListener("resize", close); window.removeEventListener("keydown", esc); };
  }, [menu]);

  const act = async (what: "dup" | "up" | "down" | "del", id: number) => {
    const t = table(list);
    const sorted = [...all].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((r) => r.id === id);
    const row = sorted[i];
    if (what === "dup") {
      const { id: _id, ...copy } = row;
      await t.add({ ...copy, order: row.order + 0.5 } as never);
    } else if (what === "del") {
      await t.delete(id);
      toast.show("Ligne supprimée.", { label: "Annuler", run: () => t.add(row as never) });
    } else {
      const j = what === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= sorted.length) return;
      await t.bulkUpdate([{ key: row.id!, changes: { order: sorted[j].order } as never }, { key: sorted[j].id!, changes: { order: row.order } as never }]);
    }
    // renumérotation 1..n pour garder un ordre lisible
    const fresh = (await t.toArray()).sort((a, b) => a.order - b.order);
    await t.bulkUpdate(fresh.map((r, k) => ({ key: r.id!, changes: { order: k + 1 } as never })));
  };

  const hasTotal = cols.some((c) => c.total);
  let labelDone = false;
  return (
    <div className="dt">
      <div className="dt-wrap">
        <table>
          <thead>
            <tr>{cols.map((c, i) => <th key={i} className={c.money || c.type === "number" ? "num" : ""}>{c.label}</th>)}<th className="act"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td className="empty-row" colSpan={cols.length + 1}>Aucune ligne ici.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c, i) => {
                  if (c.render) return <td key={i} className="calc">{c.render(r)}</td>;
                  if (c.calc) { const v = c.calc(r); return <td key={i} className={`calc${c.money ? " num" : ""}`}>{c.money ? (v === "" ? "" : fmt(n(v))) : v}</td>; }
                  return <td key={i} className={c.type === "number" ? "num" : ""}><Cell list={list} row={r} col={c} /></td>;
                })}
                <td className="act">
                  <button className="icon-btn" aria-label="Actions sur la ligne" aria-haspopup="menu"
                    onClick={(e) => { e.stopPropagation(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ id: r.id!, x: b.right - 180, y: b.bottom + 4 }); }}>
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {hasTotal && rows.length > 0 && (
            <tfoot>
              <tr>
                {cols.map((c, i) => {
                  if (!c.total) { if (!labelDone) { labelDone = true; return <td key={i} className="tl">Total</td>; } return <td key={i} />; }
                  const sum = rows.reduce((a, r) => a + n(c.calc ? c.calc(r) : (r as unknown as Record<string, unknown>)[c.k!]), 0);
                  return <td key={i} className="num">{fmt(sum)}</td>;
                })}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {menu && (
        <div className="menu" role="menu" style={{ left: Math.max(8, menu.x), top: Math.min(menu.y, window.innerHeight - 190) }} onClick={(e) => e.stopPropagation()}>
          {([["dup", "Dupliquer"], ["up", "Monter"], ["down", "Descendre"]] as const).map(([a, l]) => (
            <button key={a} role="menuitem" onClick={() => { act(a, menu.id); setMenu(null); }}>{l}</button>
          ))}
          <hr />
          <button role="menuitem" className="danger" onClick={() => { act("del", menu.id); setMenu(null); }}>Supprimer</button>
        </div>
      )}
    </div>
  );
}

/** Ajoute une ligne vide en fin de liste. */
export async function addRow<K extends ListName>(list: K, blank: Omit<Row<K>, "id" | "order">) {
  const t = table(list);
  const last = await t.orderBy("order").last();
  return t.add({ ...blank, order: (last?.order ?? 0) + 1 } as never);
}
