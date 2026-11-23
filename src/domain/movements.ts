import type { Debt, MoveCategory, Movement, Settings } from "./types";

/**
 * Mouvements : lecture d'un relevé MTN MoMo (texte du PDF ou CSV axta), catégorisation, dédoublonnage.
 * Fonctions pures : aucune donnée réelle ici. Les règles personnelles (noms) vivent dans Settings.moveRules.
 */

export interface RawTx { date: string; time: string; type: string; amount: number; fee: number; id: string; text: string; name?: string }

const MONTHS: Record<string, number> = {
  "janv.": 1, "févr.": 2, "mars": 3, "avr.": 4, "mai": 5, "juin": 6, "juil.": 7, "août": 8, "sept.": 9, "oct.": 10, "nov.": 11, "déc.": 12,
  "janv": 1, "févr": 2, "avr": 4, "juil": 7, "sept": 9, "oct": 10, "nov": 11, "déc": 12,
};
const DATE_LINE = /^\s*(\d{1,2}) (\S+) (\d{4}) (\d{2}:\d{2})\s+(.*)$/;

/**
 * Lit le texte d'un relevé MoMo, ligne par ligne (colonnes séparées par 2 espaces ou plus).
 * Une transaction commence par « 22 nov. 2026 13:52 » ; les lignes suivantes la complètent.
 */
export function parseMomoText(text: string): RawTx[] {
  const out: RawTx[] = [];
  let cur: { head: string[]; d: string; t: string; more: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const cols = cur.head;
    const idx = cols.findIndex((c, i) => i > 0 && /^\d{10,12}$/.test(c) && /^[+-]\d[\d ]*$/.test(cols[i - 1]));
    if (idx > 0) {
      const fee = cols[idx + 1]?.includes("FCFA") ? Number(cols[idx + 1].replace(/\D/g, "")) || 0 : 0;
      // Nom de la contrepartie : la colonne avant le montant, complétée par les mots alphabétiques des lignes suivantes.
      const head = idx >= 2 && !/^[+\d]/.test(cols[idx - 2]) ? cols[idx - 2] : "";
      const tail = cur.more.map((l) => l.split(/\s{2,}/).filter((c) => /^[A-ZÀ-Ü'’().\- ]+$/.test(c) && !/^(IFU|P2M)$/.test(c)).join(" ")).filter(Boolean).slice(0, 2).join(" ");
      const name = `${head} ${tail}`.replace(/\s+/g, " ").trim();
      out.push({ date: cur.d, time: cur.t, type: cols[0], amount: Number(cols[idx - 1].replace(/\s/g, "")), fee, id: cols[idx], name, text: [cols.join(" "), ...cur.more].join(" ").replace(/\s+/g, " ").trim() });
    }
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(DATE_LINE);
    if (m && MONTHS[m[2]]) {
      flush();
      const d = `${m[3]}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      cur = { head: m[5].trim().split(/\s{2,}/), d, t: m[4], more: [] };
    } else if (cur && raw.trim() && !/^(Date et|heure|Détails|Page \d)/.test(raw.trim())) {
      cur.more.push(raw.trim());
    }
  }
  flush();
  return out;
}

/** Lit le CSV produit par axta (« date;heure;type;montant;frais;id;libelle »). */
export function parseMomoCsv(csv: string): RawTx[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length || !/^date;heure;type;montant/.test(lines[0])) throw new Error("CSV non reconnu : il faut l'en-tête date;heure;type;montant;frais;id;libelle.");
  return lines.slice(1).map((l) => {
    const [date, time, type, amount, fee, id, ...rest] = l.split(";");
    return { date, time, type, amount: Number(amount), fee: Number(fee) || 0, id, text: rest.join(";") };
  }).filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount));
}

const up = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();

const STOP = new Set(["SERVICES", "BANK", "BANQUE", "MONSIEUR", "MADAME", "CREDIT", "PRET"]);
const words = (s: string) => up(s).split(/[^A-Z]+/).filter((w) => w.length >= 3);

/**
 * Retrouve la dette liée à une opération, sans faux positif :
 * - comparaison par mots entiers (« JEAN-BAPTISTE » ne correspond pas à « Jean-Louis ») ;
 * - si le créancier a plusieurs mots, il en faut au moins deux (un prénom ou un nom de famille seul ne suffit pas) ;
 * - les mots du nom du titulaire (owner) sont ignorés : un virement à soi-même ne vise pas un créancier homonyme ;
 * - plusieurs dettes candidates → aucune (mieux vaut ne rien relier que relier à tort).
 */
export function matchDebt(text: string, debts: Debt[], owner = ""): Debt | undefined {
  const T = new Set(words(text)), mine = new Set(words(owner));
  const hits = debts.filter((d) => {
    const ws = words(d.creditor).filter((w) => w.length >= 4 && !STOP.has(w) && !mine.has(w));
    if (!ws.length) return false;
    const n = ws.filter((w) => T.has(w)).length;
    return ws.length === 1 ? n === 1 : n >= 2;
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/** Catégorie d'une transaction MoMo : règles personnelles d'abord, puis règles génériques. */
export function categorize(t: Pick<RawTx, "type" | "amount" | "text">, s: Pick<Settings, "moveRules"> & { name?: string }, debts: Debt[] = []): { category: MoveCategory; debtId: number | null } {
  const T = up(t.text), inflow = t.amount > 0, owner = s.name ?? "";
  for (const r of s.moveRules ?? []) if (r.match && T.includes(up(r.match)) && (!r.dir || (r.dir === "in") === inflow)) {
    const d = r.category === "Remboursement de dette" || r.category === "Emprunt" ? matchDebt(t.text, debts, owner) : undefined;
    return { category: r.category, debtId: d?.id ?? null };
  }
  if (T.includes("MOMOKASH")) {
    const d = debts.find((x) => up(x.creditor).includes("MOMOKASH"));
    return inflow ? { category: "Emprunt", debtId: d?.id ?? null } : { category: "Remboursement de dette", debtId: d?.id ?? null };
  }
  if (/ASSU SAS|MFS OPEN SI/.test(T)) return { category: "Épargne", debtId: null };
  // Carte virtuelle et achats « BUY » : la carte n'est pas un compte suivi, ce qu'on y met est dépensé (sinon ces dépenses disparaîtraient).
  if (/CARTE VIRTUELLE|BUY D/.test(T)) return { category: inflow ? "À classer" : "Courses et achats", debtId: null };
  if (/MOMO TO BANK|BANK TO MOMO|PI BCEAO|PI_BCEAO|RECHARGEMENT DE|TRANSFERT DE/.test(T)) return { category: "Transfert", debtId: null };
  if (/BNB MTOS|MFS THUNES|PAYDUNIA|PURCHASE OF SERVICE/.test(T) && inflow) return { category: "Revenus", debtId: null };
  if (/SBEE|SONEB/.test(T)) return { category: "Électricité et eau", debtId: null };
  if (/FORFAIT|ACHAT DE CREDIT|AIRTIME/.test(T)) return { category: "Abonnements et téléphone", debtId: null };
  if (t.type === "Retrait") return { category: "Retraits d'espèces", debtId: null };
  if (t.type === "Dépôt") return { category: "À classer", debtId: null }; // espèces redéposées : pas un revenu tant que non qualifié
  if (t.type === "Paiement") return { category: /PHARMA/.test(T) ? "Santé" : /PAIN|BOULANG|RESTAU|FOOD/.test(T) ? "Nourriture" : "Courses et achats", debtId: null };
  if (!inflow) { const d = matchDebt(t.text, debts, owner); if (d) return { category: "Remboursement de dette", debtId: d.id ?? null }; }
  return { category: inflow ? "À classer" : "Autre dépense", debtId: null };
}

/** Nom de la contrepartie (meilleur effort). */
const counterparty = (t: RawTx) => (t.name ?? "").slice(0, 60);

/** Transforme des transactions brutes en mouvements axta (+ un mouvement « frais » quand il y en a). */
export function toMovements(txs: RawTx[], s: Pick<Settings, "moveRules"> & { name?: string }, debts: Debt[], accountId: number | null): Omit<Movement, "id" | "order">[] {
  const out: Omit<Movement, "id" | "order">[] = [];
  for (const t of txs) {
    const { category, debtId } = categorize(t, s, debts);
    out.push({ date: t.date, label: `${t.type} · ${counterparty(t) || "MoMo"}`, amount: t.amount, currency: "XOF", category, accountId, debtId, vaultId: null, counterparty: counterparty(t), source: "momo", ref: `momo:${t.id}`, notes: t.text.slice(0, 240) });
    if (t.fee > 0) out.push({ date: t.date, label: `Frais · ${t.type}`, amount: -t.fee, currency: "XOF", category: "Frais bancaires et MoMo", accountId, debtId: null, vaultId: null, counterparty: "MTN MoMo", source: "momo", ref: `momo:${t.id}:frais`, notes: "" });
  }
  return out;
}

/** Ne garde que les mouvements absents (même référence). */
export function dedupe<T extends { ref: string }>(incoming: T[], existing: { ref: string }[]): T[] {
  const seen = new Set(existing.map((m) => m.ref).filter(Boolean));
  return incoming.filter((m) => !m.ref || !seen.has(m.ref));
}

type Dupable = Pick<Movement, "date" | "amount" | "accountId" | "source">;
const dayGap = (a: string, b: string) => Math.abs((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 864e5);

/**
 * Doublons probables entre sources différentes (saisie manuelle d'un côté, relevé de l'autre) :
 * même montant, même compte (ou compte non renseigné), date à ± 1 jour. Chaque mouvement existant ne sert qu'une fois.
 * Renvoie, pour chaque index entrant concerné, le mouvement existant correspondant. Rien n'est supprimé ici.
 */
export function fuzzyDuplicates<T extends Dupable>(incoming: T[], existing: (Dupable & { id?: number })[]): Map<number, Dupable & { id?: number }> {
  const used = new Set<number>(), out = new Map<number, Dupable & { id?: number }>();
  incoming.forEach((m, i) => {
    const j = existing.findIndex((e, k) => !used.has(k) && e.source !== m.source && e.amount === m.amount && dayGap(e.date, m.date) <= 1
      && (e.accountId == null || m.accountId == null || e.accountId === m.accountId));
    if (j >= 0) { used.add(j); out.set(i, existing[j]); }
  });
  return out;
}

/** Fragment de texte d'une page PDF (coordonnées pdf.js : y vers le haut). */
export interface TextItem { str: string; x: number; y: number; w: number }

/**
 * Reconstruit des lignes de texte « en colonnes » à partir des fragments d'une page :
 * mêmes ordonnées (± 2) = même ligne ; un écart horizontal > 4 = séparateur de colonne (2 espaces).
 */
export function linesFromItems(items: TextItem[]): string[] {
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const it of items.filter((i) => i.str.trim())) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => {
    let line = "", end = -Infinity;
    for (const it of r.items.sort((a, b) => a.x - b.x)) {
      const gap = it.x - end;
      line += line ? (gap > 4 ? "    " : gap > 0.5 ? " " : "") : "";
      line += it.str;
      end = it.x + it.w;
    }
    return line;
  });
}
