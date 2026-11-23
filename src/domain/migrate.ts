import type { Backup, Currency, Movement, Settings } from "./types";
import { PRIORITIES } from "./types";
import { defaultSettings } from "./defaults";

/* Sauvegarde produite par axta v1 (page HTML unique, clé localStorage axta_v1). */
type V1Row = Record<string, unknown>;
interface V1 {
  params: { phase: number; eur: number; usd: number; salaire: number; objectif: string; seuilPS5: number;
    sal: Record<string, { ep: number; det: number; voi: number; vie: number }>;
    vari: Record<string, { ep: number; det: number; voi: number; pro: number; pla: number }> };
  freelance?: V1Row[]; dettes?: V1Row[]; epargne?: V1Row[]; budget?: V1Row[]; projets?: V1Row[]; demarches?: V1Row[];
  paiements?: V1Row[];
}

const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown): number | null => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const cur = (v: unknown): Currency => (v === "EUR" ? "EUR" : v === "USD" ? "USD" : "XOF");
const prio = (r: V1Row) => {
  if (r.prio) return s(r.prio) as (typeof PRIORITIES)[number];
  const u = r.urgent === "Oui", i = r.important === "Oui";
  return u && i ? PRIORITIES[0] : i ? PRIORITIES[1] : u ? PRIORITIES[2] : PRIORITIES[3];
};

export const isV1 = (x: unknown): x is V1 =>
  !!x && typeof x === "object" && "params" in x && "dettes" in x;
export const isV2 = (x: unknown): x is Backup =>
  !!x && typeof x === "object" && (x as Backup).app === "axta" && ((x as Backup).version === 2 || (x as Backup).version === 3);

/** Complète une sauvegarde v2 ancienne avec les champs ajoutés depuis (valeurs par défaut). */
/**
 * v0.6 (après revue) : recatégorise les mouvements de relevé selon les nouvelles définitions. Idempotent.
 * - « Dépôt » d'espèces : « Autre entrée » → « À classer » (de l'argent retiré puis redéposé n'est pas un revenu) ;
 * - recharge de carte virtuelle / achats « BUY D » : « Transfert » → « Courses et achats » (la carte n'est pas un compte suivi) ;
 * - envois « MFS THUNES » reçus : « Autre entrée » → « Revenus » (comme « BNB MTOs »).
 * Seules les catégories posées automatiquement sont touchées (une catégorie choisie à la main reste).
 */
export function migrateMovementsV06<T extends Pick<Movement, "label" | "category" | "amount" | "source" | "notes">>(ms: T[]): T[] {
  return ms.map((m) => {
    if (m.source !== "momo") return m;
    const L = `${m.label} ${m.notes}`.toUpperCase();
    if (m.category === "Autre entrée" && /^DÉPÔT ·/i.test(m.label)) return { ...m, category: "À classer" };
    if (m.category === "Transfert" && /CARTE VIRTUELLE|BUY D/.test(L)) return { ...m, category: m.amount > 0 ? "À classer" : "Courses et achats" };
    if (m.category === "Autre entrée" && /MFS THUNES/.test(L) && m.amount > 0) return { ...m, category: "Revenus" };
    return m;
  });
}

export function normalizeV2(b: Omit<Backup, "exportedAt">): Omit<Backup, "exportedAt"> {
  const d = defaultSettings(b.settings?.name ?? "");
  return { ...b, version: 3, accounts: b.accounts ?? [], movements: migrateMovementsV06(b.movements ?? []), snapshots: b.snapshots ?? [], settings: { ...d, ...b.settings, rates: { ...d.rates, ...b.settings?.rates }, rules: b.settings?.rules ?? d.rules, dismissed: b.settings?.dismissed ?? {}, aiScopes: { ...d.aiScopes, ...b.settings?.aiScopes } } };
}

export function fromV1(x: V1, name = ""): Omit<Backup, "exportedAt"> {
  const p = x.params;
  const base = defaultSettings(name);
  const settings: Settings = {
    ...base,
    salary: Number(p.salaire) || 0,
    phase: Number(p.phase) === 2 ? 2 : 1,
    rates: { EUR: Number(p.eur) || base.rates.EUR, USD: Number(p.usd) || base.rates.USD },
    debtFreeTarget: s(p.objectif) || base.debtFreeTarget,
    funThreshold: Number(p.seuilPS5) || base.funThreshold,
    rules: {
      salary: Object.fromEntries([1, 2].map((ph) => {
        const r = p.sal?.[ph] ?? base.rules.salary[ph as 1 | 2];
        return [ph, "ep" in r ? { savings: r.ep, debts: r.det, car: r.voi, living: r.vie } : r];
      })) as Settings["rules"]["salary"],
      variable: Object.fromEntries([1, 2].map((ph) => {
        const r = p.vari?.[ph] ?? base.rules.variable[ph as 1 | 2];
        return [ph, "ep" in r ? { savings: r.ep, debts: r.det, car: r.voi, projects: r.pro, fun: r.pla } : r];
      })) as Settings["rules"]["variable"],
    },
  };
  const paidFromPayments = (creditor: string) =>
    (x.paiements ?? []).filter((r) => r.creancier === creditor).reduce((a, r) => a + (Number(r.montant) || 0), 0);

  return {
    app: "axta",
    version: 3,
    settings,
    incomes: (x.freelance ?? []).map((r, i) => ({
      order: i + 1, date: s(r.date), kind: (s(r.type) || "Freelance") as never, client: s(r.client), project: s(r.projet),
      status: (s(r.statut) || "En cours") as never, currency: cur(r.devise), amount: num(r.montant),
      deposit: num(r.acompte), balance: num(r.solde),
      // v1 notait « Avant les règles : rien à verser » sans que le calcul en tienne compte.
      applyRules: !/avant les r[eè]gles/i.test(s(r.notes)), notes: s(r.notes),
    })),
    debts: (x.dettes ?? []).map((r, i) => ({
      order: Number(r.ordre) || i + 1, creditor: s(r.creancier), type: (s(r.type) || "Autre") as never,
      total: Number(r.total) || 0, paid: r.paye !== undefined ? Number(r.paye) || 0 : paidFromPayments(s(r.creancier)),
      dueDate: s(r.echeance), notes: s(r.notes),
    })),
    vaults: (x.epargne ?? []).map((r, i) => ({
      order: i + 1, name: s(r.coffre), target: Number(r.objectif) || 0, targetDate: s(r.date), balance: Number(r.solde) || 0, notes: s(r.notes),
    })),
    charges: (x.budget ?? []).map((r, i) => ({
      order: i + 1, label: s(r.poste), category: s(r.cat), frequency: (s(r.freq) || "Mensuel") as never,
      amount: Number(r.montant) || 0, status: (s(r.statut) || "Actif") as never, notes: s(r.notes),
    })),
    projects: (x.projets ?? []).map((r, i) => ({
      order: Number(r.ordre) || i + 1, name: s(r.projet), category: s(r.cat), priority: prio(r),
      budget: num(r.budget), paid: num(r.paye), status: (s(r.statut) || "Idée") as never, targetDate: s(r.date), notes: s(r.notes),
    })),
    tasks: (x.demarches ?? []).map((r, i) => ({
      order: i + 1, title: s(r.demarche), owner: s(r.qui), priority: prio(r), cost: num(r.cout),
      dueDate: s(r.date), status: (s(r.statut) || "À faire") as never, notes: s(r.notes),
    })),
    wishlist: [],
    accounts: [],
    movements: [],
    snapshots: [],
  };
}
