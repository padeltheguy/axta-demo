import type { Currency, Settings } from "./types";

export const n = (v: unknown): number => {
  if (v === "" || v == null) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const SYMBOL: Record<Currency, string> = { XOF: "CFA", EUR: "€", USD: "$" };

export function fmt(value: number, currency: Currency = "XOF"): string {
  const digits = currency === "XOF" ? 0 : 2;
  const s = value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency === "XOF" ? `${SYMBOL.XOF} ${s}` : `${s} ${SYMBOL[currency]}`;
}

export const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Convertit un montant vers la devise de base (XOF par défaut). */
export function toBase(amount: number, from: Currency, s: Pick<Settings, "rates" | "baseCurrency">): number {
  if (from === s.baseCurrency) return amount;
  const inXof = from === "XOF" ? amount : amount * s.rates[from];
  if (s.baseCurrency === "XOF") return inXof;
  return inXof / s.rates[s.baseCurrency];
}

/* Dates (ISO yyyy-mm-dd, fuseau local) */
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const parseISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fdate = (s: string) => (s ? parseISO(s).toLocaleDateString("fr-FR") : "");
export const daysTo = (s: string, from = today()) => Math.round((parseISO(s).getTime() - from.getTime()) / 864e5);
/** Nombre de mois restants (mois courant inclus) jusqu'à une date ; 0 si passée. */
export function monthsTo(s: string, from = today()): number {
  if (!s) return 0;
  const t = parseISO(s);
  if (t <= from) return 0;
  return (t.getFullYear() - from.getFullYear()) * 12 + (t.getMonth() - from.getMonth()) + 1;
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
