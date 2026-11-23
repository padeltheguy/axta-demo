import Dexie, { type Table } from "dexie";
import type { Account, Backup, Charge, Debt, Income, ListName, ListTypes, Movement, Project, Settings, Snapshot, Task, Vault, WishItem } from "@/domain/types";
import { closurePatch, makeSnapshot, monthKey } from "@/domain/history";
import { migrateMovementsV06 } from "@/domain/migrate";

export interface RestorePoint { id?: number; createdAt: string; reason: string; version: string; size: number; json: string }

/** Base locale (IndexedDB). Les données ne quittent jamais l'appareil. */
export class AxtaDB extends Dexie {
  settings!: Table<Settings, string>;
  accounts!: Table<Account, number>;
  movements!: Table<Movement, number>;
  snapshots!: Table<Snapshot, number>;
  restorePoints!: Table<RestorePoint, number>;
  meta!: Table<{ key: string; value: unknown }, string>;
  incomes!: Table<Income, number>;
  debts!: Table<Debt, number>;
  vaults!: Table<Vault, number>;
  charges!: Table<Charge, number>;
  projects!: Table<Project, number>;
  tasks!: Table<Task, number>;
  wishlist!: Table<WishItem, number>;

  constructor(name = "axta") {
    super(name);
    this.version(1).stores({
      settings: "id",
      incomes: "++id, order, date, status",
      debts: "++id, order",
      vaults: "++id, order",
      charges: "++id, order",
      projects: "++id, order, status",
      tasks: "++id, order, status, dueDate",
      wishlist: "++id, order, status",
    });
    // v2 : comptes (banque, mobile money, épargne, crypto)
    this.version(2).stores({ accounts: "++id, order" });
    // v3 : historique (mouvements, photos du mois), points de restauration, métadonnées
    this.version(3).stores({ movements: "++id, order, date, category, ref", snapshots: "++id, &month", restorePoints: "++id, createdAt", meta: "key" });
    // v4 (0.6, après revue) : dépôts d'espèces « À classer », carte virtuelle en dépense, aperçu des changements dans docs/05-revue-data.md
    this.version(4).stores({}).upgrade(async (tx) => {
      const t = tx.table<Movement, number>("movements");
      const all = await t.toArray(), next = migrateMovementsV06(all);
      await t.bulkPut(next.filter((m, i) => m.category !== all[i].category));
    });

    // Archives datées : closedAt posé/retiré automatiquement quand une dette est soldée, une démarche faite, un projet acquis.
    // Uniquement lors d'une modification (le moment réel) : un import ou une restauration ne date rien à la place de l'utilisateur.
    for (const kind of ["debts", "tasks", "projects"] as const) {
      const t = this.table(kind);
      t.hook("updating", (mods, _k, obj) => {
        const patch = closurePatch(kind, obj as never, mods as never);
        return Object.keys(patch).length ? patch : undefined;
      });
    }
    // Un autre onglet ouvre une version plus récente de la base : on libère et on recharge, plutôt que d'échouer en silence.
    this.on("versionchange", () => { this.close(); if (typeof location !== "undefined") location.reload(); return false; });
  }
}

export const db = new AxtaDB();
export const LISTS: ListName[] = ["accounts", "movements", "incomes", "debts", "vaults", "charges", "projects", "tasks", "wishlist"];
export const table = <K extends ListName>(k: K) => db[k] as unknown as Table<ListTypes[K], number>;
export const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

/** Demande au navigateur de ne pas purger les données (Safari/ITP, manque d'espace). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export async function exportBackup(): Promise<Backup> {
  const settings = await db.settings.get("settings");
  if (!settings) throw new Error("Aucun profil à sauvegarder.");
  const lists = await Promise.all(LISTS.map((k) => table(k).orderBy("order").toArray()));
  const snapshots = await db.snapshots.orderBy("month").toArray();
  const out = { app: "axta", version: 3, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), settings, snapshots } as Backup;
  LISTS.forEach((k, i) => { (out as unknown as Record<string, unknown>)[k] = lists[i]; });
  return out;
}

/** Remplace tout le contenu local par la sauvegarde, dans une transaction unique. Un point de restauration est créé avant. */
export async function importBackup(b: Omit<Backup, "exportedAt">, keepPin = true, reason = "Avant restauration"): Promise<void> {
  if (await db.settings.get("settings")) await safeRestorePoint(reason);
  await db.transaction("rw", [db.settings, db.snapshots, ...LISTS.map((k) => table(k))], async () => {
    const prev = await db.settings.get("settings");
    await db.settings.put({ ...b.settings, id: "settings", pinHash: keepPin ? prev?.pinHash ?? b.settings.pinHash : b.settings.pinHash });
    for (const k of LISTS) {
      await table(k).clear();
      // Les identifiants sont conservés : les liens (mouvement → dette, compte, coffre) restent valides après restauration.
      // Sans identifiants (ancienne sauvegarde, démo), on numérote 1..n : les références (debtId : 3) visent alors la 3e ligne.
      const src = (b as unknown as Record<string, ListTypes[ListName][]>)[k] ?? [];
      const noIds = src.every((r) => r.id == null);
      const rows = src.map((r, i) => ({ ...r, ...(noIds ? { id: i + 1 } : {}), order: r.order ?? i + 1 }));
      await table(k).bulkAdd(rows as never[]);
    }
    await db.snapshots.clear();
    await db.snapshots.bulkAdd(b.snapshots ?? []);
  });
}

/** Efface tout de cet appareil : données, photos, points de restauration et métadonnées. */
export async function wipe(): Promise<void> {
  await db.transaction("rw", [db.settings, db.snapshots, db.restorePoints, db.meta, ...LISTS.map((k) => table(k))], async () => {
    await db.settings.clear(); await db.snapshots.clear(); await db.restorePoints.clear(); await db.meta.clear();
    for (const k of LISTS) await table(k).clear();
  });
  try {
    if (typeof localStorage !== "undefined") Object.keys(localStorage).filter((k) => k.startsWith("axta.")).forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage indisponible */ }
}

/** Point de restauration obligatoire avant une écriture de masse : en cas d'échec, l'opération est refusée. */
export async function safeRestorePoint(reason: string): Promise<RestorePoint> {
  try { return await createRestorePoint(reason); }
  catch (e) { throw new Error(`Opération annulée : impossible de créer le point de restauration (${e instanceof Error ? e.message : "espace insuffisant ?"}). Fais une sauvegarde manuelle d'abord.`); }
}

/**
 * Versement sur une dette : met à jour « Déjà payé » ET crée le mouvement « Remboursement de dette » relié, en une transaction.
 * Renvoie une fonction d'annulation.
 */
export async function recordDebtPayment(debtId: number, amount: number, source: "manuel" | "ia", date: string): Promise<() => Promise<void>> {
  let movId = 0, before = 0;
  await db.transaction("rw", db.debts, db.movements, async () => {
    const d = await db.debts.get(debtId);
    if (!d) throw new Error("Dette introuvable.");
    before = Number(d.paid) || 0;
    const x = Math.min(amount, Math.max(0, (Number(d.total) || 0) - before));
    if (x <= 0) throw new Error("Cette dette est déjà soldée.");
    await db.debts.update(debtId, { paid: before + x });
    const last = await db.movements.orderBy("order").last();
    movId = await db.movements.add({
      date, label: `Versement · ${d.creditor}`, amount: -x, currency: "XOF", category: "Remboursement de dette",
      accountId: null, debtId, vaultId: null, counterparty: d.creditor, source, ref: `paie:${debtId}:${Date.now()}`, notes: "", order: (last?.order ?? 0) + 1,
    } as Movement);
  });
  return async () => {
    await db.transaction("rw", db.debts, db.movements, async () => { await db.debts.update(debtId, { paid: before }); await db.movements.delete(movId); });
  };
}

/* ---------- Points de restauration (copies internes automatiques) ---------- */
export const MAX_RESTORE_POINTS = 30;
export async function createRestorePoint(reason: string): Promise<RestorePoint> {
  const json = JSON.stringify(await exportBackup());
  const rp: RestorePoint = { createdAt: new Date().toISOString(), reason, version: APP_VERSION, size: json.length, json };
  rp.id = await db.restorePoints.add(rp);
  const all = await db.restorePoints.orderBy("createdAt").toArray();
  if (all.length > MAX_RESTORE_POINTS) await db.restorePoints.bulkDelete(all.slice(0, all.length - MAX_RESTORE_POINTS).map((x) => x.id!));
  return rp;
}

/** Photo du mois courant (créée ou mise à jour : le dernier état connu de chaque mois est conservé). */
export async function upsertMonthSnapshot(month = monthKey()): Promise<void> {
  const settings = await db.settings.get("settings");
  if (!settings) return;
  const [accounts, debts, vaults, charges] = await Promise.all([db.accounts.toArray(), db.debts.toArray(), db.vaults.toArray(), db.charges.toArray()]);
  const snap = makeSnapshot(month, { settings, accounts, debts, vaults, charges });
  const prev = await db.snapshots.where("month").equals(month).first();
  if (prev) await db.snapshots.put({ ...snap, id: prev.id }); else await db.snapshots.add(snap);
}

export const getMeta = async <T,>(key: string) => (await db.meta.get(key))?.value as T | undefined;
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });
