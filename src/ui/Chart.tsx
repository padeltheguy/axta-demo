import { createContext, useContext, useId, type CSSProperties, type ReactNode } from "react";
import { ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmt } from "@/domain/money";

/**
 * Graphiques au modèle shadcn/ui (Chart = Recharts + une « config » par série),
 * habillés aux couleurs d'axta. La config donne le libellé et la couleur de chaque série ;
 * ChartContainer expose chaque couleur en variable CSS --color-<clé>, utilisée par les marques.
 */
export type ChartConfig = Record<string, { label: string; color: string }>;

/* Palette catégorielle d'axta, validée (luminosité, chroma, daltonisme) : ordre fixe, jamais recyclé. */
export const CHART = { c1: "#2A9D90", c2: "#E76E50", c3: "#3E6FB0", c4: "#C5951B", c5: "#9A5BB0", other: "#A1A1AA" };
export const SERIES = [CHART.c1, CHART.c2, CHART.c3, CHART.c4, CHART.c5];

const Ctx = createContext<ChartConfig>({});
export const useChartConfig = () => useContext(Ctx);

export function ChartContainer({ config, children, height = 260, label }: { config: ChartConfig; children: ReactNode; height?: number; label: string }) {
  const id = useId().replace(/:/g, "");
  const vars = Object.fromEntries(Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color])) as CSSProperties;
  return (
    <Ctx.Provider value={config}>
      <div className="chart-box" data-chart={id} style={{ ...vars, height }} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">{children as never}</ResponsiveContainer>
      </div>
    </Ctx.Provider>
  );
}

type Item = { dataKey?: string | number; name?: string; value?: number; color?: string; payload?: Record<string, unknown> };

/** Infobulle façon shadcn : libellé, puis une ligne par série avec sa pastille. Texte en encre, jamais en couleur de série. */
export function ChartTooltipContent({ active, payload, label, format = fmt, labelKey, nameKey }: { active?: boolean; payload?: Item[]; label?: string; format?: (v: number) => string; labelKey?: string; nameKey?: string }) {
  const config = useChartConfig();
  if (!active || !payload?.length) return null;
  const title = labelKey ? String(payload[0].payload?.[labelKey] ?? label) : label;
  return (
    <div className="chart-tip">
      {title && <div className="chart-tip-title">{title}</div>}
      {payload.map((it, i) => {
        const key = String(nameKey ? it.payload?.[nameKey] : it.dataKey ?? it.name);
        const conf = config[key];
        return (
          <div className="chart-tip-row" key={i}>
            <i style={{ background: (it.payload?.fill as string) ?? it.color ?? conf?.color }} />
            <span>{conf?.label ?? it.name ?? key}</span>
            <b>{format(Number(it.value ?? 0))}</b>
          </div>
        );
      })}
    </div>
  );
}
export const ChartTooltip = Tooltip;

/** Légende façon shadcn : pastille + libellé, sous le graphique. */
export function ChartLegendContent({ payload }: { payload?: { dataKey?: string | number; value?: string; color?: string }[] }) {
  const config = useChartConfig();
  if (!payload?.length) return null;
  return (
    <div className="chart-legend">
      {payload.map((it, i) => {
        const key = String(it.dataKey ?? it.value);
        return <span key={i}><i style={{ background: config[key]?.color ?? it.color }} />{config[key]?.label ?? it.value}</span>;
      })}
    </div>
  );
}
export const ChartLegend = Legend;

/** Graduation compacte : 0 · 50k · 1,2M (une seule convention par axe). */
export const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e4) return `${Math.round(v / 1e3).toLocaleString("fr-FR")} k`;
  return Math.round(v).toLocaleString("fr-FR");
};
