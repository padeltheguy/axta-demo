import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { AxtaDB, db, exportBackup, importBackup, recordDebtPayment, setMeta, wipe } from "./db";
import { parseBackup } from "./backup";
import { sampleData } from "@/domain/defaults";

describe("base locale", () => {
  it("importe, exporte et relit une sauvegarde sans perte", async () => {
    await importBackup(sampleData());
    const b = await exportBackup();
    expect(b.version).toBe(3);
    expect(b.movements.length).toBe(sampleData().movements.length);
    expect(b.debts).toHaveLength(sampleData().debts.length);
    await wipe();
    expect(await db.debts.count()).toBe(0);
    await importBackup(parseBackup(JSON.parse(JSON.stringify(b))));
    expect((await exportBackup()).wishlist.map((w) => w.name)).toEqual(sampleData().wishlist.map((w) => w.name));
  });
  it("refuse un fichier qui n'est pas une sauvegarde axta", () => {
    expect(() => parseBackup({ foo: 1 })).toThrow(/pas une sauvegarde/);
  });
});

describe("historique en base", () => {
  it("pose closedAt quand une dette est soldée et le retire si elle repart", async () => {
    const { db: d, importBackup: imp, upsertMonthSnapshot, createRestorePoint } = await import("./db");
    await imp(sampleData());
    const debt = (await d.debts.toArray())[0];
    await d.debts.update(debt.id!, { paid: debt.total });
    expect((await d.debts.get(debt.id!))!.closedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await d.debts.update(debt.id!, { paid: 0 });
    expect((await d.debts.get(debt.id!))!.closedAt).toBeUndefined();
    await d.debts.add({ order: 99, creditor: "Importée", type: "Autre", total: 100, paid: 100, dueDate: "", notes: "" });
    expect((await d.debts.where("order").equals(99).first())!.closedAt).toBeUndefined(); // un import ne date rien
    const task = (await d.tasks.toArray())[0];
    await d.tasks.update(task.id!, { status: "Fait" });
    expect((await d.tasks.get(task.id!))!.closedAt).toBeTruthy();
    await upsertMonthSnapshot("2026-11"); await upsertMonthSnapshot("2026-11");
    expect(await d.snapshots.where("month").equals("2026-11").count()).toBe(1);
    const rp = await createRestorePoint("test");
    expect(JSON.parse(rp.json).app).toBe("axta");
  });
  it("crée un point de restauration avant chaque restauration", async () => {
    const { db: d, importBackup: imp } = await import("./db");
    const before = await d.restorePoints.count();
    await imp(sampleData());
    expect(await d.restorePoints.count()).toBe(before + 1);
  });
});

describe("liens après restauration", () => {
  it("conserve les identifiants, donc les liens mouvement → dette", async () => {
    const { db: d, importBackup: imp, exportBackup: exp } = await import("./db");
    await imp(sampleData());
    const b = await exp();
    const linked = b.movements.find((m) => m.debtId)!;
    const creditor = b.debts.find((x) => x.id === linked.debtId)!.creditor;
    await imp(JSON.parse(JSON.stringify(b)));
    const m2 = (await d.movements.toArray()).find((m) => m.ref === linked.ref && m.label === linked.label)!;
    expect((await d.debts.get(m2.debtId!))!.creditor).toBe(creditor);
  });
});

describe("revue v0.6 : effacement, versements, migration", () => {
  it("« Tout effacer » vide aussi les points de restauration et les métadonnées", async () => {
    await importBackup(sampleData());
    await importBackup(sampleData()); // crée un point de restauration
    await setMeta("backupDir", "x");
    expect(await db.restorePoints.count()).toBeGreaterThan(0);
    await wipe();
    expect(await db.restorePoints.count()).toBe(0);
    expect(await db.meta.count()).toBe(0);
  });
  it("un versement met à jour « Déjà payé », crée le mouvement relié et s'annule", async () => {
    await importBackup(sampleData());
    const d = (await db.debts.toArray()).find((x) => x.total > x.paid)!;
    const before = await db.movements.count();
    const undo = await recordDebtPayment(d.id!, 1000, "manuel", "2026-11-22");
    expect((await db.debts.get(d.id!))!.paid).toBe(d.paid + 1000);
    const m = (await db.movements.toArray()).at(-1)!;
    expect(m).toMatchObject({ amount: -1000, category: "Remboursement de dette", debtId: d.id, source: "manuel" });
    await undo();
    expect((await db.debts.get(d.id!))!.paid).toBe(d.paid);
    expect(await db.movements.count()).toBe(before);
  });
  it("migration v3 → v4 : les dépôts d'espèces d'une base existante passent « À classer »", async () => {
    const name = "axta-migration-test";
    const old = new Dexie(name);
    old.version(3).stores({ settings: "id", incomes: "++id, order, date, status", debts: "++id, order", vaults: "++id, order", charges: "++id, order", projects: "++id, order, status", tasks: "++id, order, status, dueDate", wishlist: "++id, order, status", accounts: "++id, order", movements: "++id, order, date, category, ref", snapshots: "++id, &month", restorePoints: "++id, createdAt", meta: "key" });
    await old.table("movements").add({ order: 1, date: "2026-11-10", label: "Dépôt · AGENT", amount: 5000, currency: "XOF", category: "Autre entrée", accountId: null, debtId: null, vaultId: null, counterparty: "", source: "momo", ref: "momo:1", notes: "" });
    old.close();
    const fresh = new AxtaDB(name);
    expect((await fresh.movements.toArray())[0].category).toBe("À classer");
    fresh.close();
  });
});
