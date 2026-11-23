import { describe, expect, it } from "vitest";
import { collectEvents, groupByMonth, monthGrid } from "./calendar";
import { toICS } from "./ics";
import { isStale, parseUsdXof, fetchRates, EUR_XOF } from "./rates";
import { suggest } from "./suggestions";
import { sampleData, defaultSettings } from "./defaults";
import { normalizeV2 } from "./migrate";
import type { Task } from "./types";

const NOW = new Date(2026, 10, 22, 10);
const task = (o: Partial<Task>): Task => ({ id: 1, order: 1, title: "Auto-école", owner: "Moi", priority: "", cost: 40000, dueDate: "2027-01-15", status: "À faire", notes: "", ...o });

describe("agenda", () => {
  const d = sampleData();
  const evts = collectEvents({
    tasks: [task({}), task({ id: 2, title: "Passeport", dueDate: "2027-02-28" }), task({ id: 3, title: "CNI", dueDate: "2026-08-20" }), task({ id: 4, title: "Sans date", dueDate: "" })],
    projects: [], vaults: d.vaults.map((v, i) => ({ ...v, id: i + 1 })), debts: [],
  });
  it("rassemble et trie les éléments datés", () => {
    expect(evts.find((e) => e.title === "Sans date")).toBeUndefined();
    expect(evts[0].title).toBe("CNI");
    expect(evts.some((e) => e.kind === "vault")).toBe(true);
  });
  it("met les retards à part et groupe par mois", () => {
    const g = groupByMonth(evts, new Date(2026, 10, 22));
    expect(g.late.map((e) => e.title)).toEqual(["CNI"]);
    expect(g.months[0].key).toBe("2027-01");
    expect(g.months.find((m) => m.key === "2027-02")!.events[0].title).toBe("Passeport");
  });
  it("construit une grille lundi-dimanche", () => {
    const w = monthGrid(2027, 0); // janvier 2027 commence un vendredi
    expect(w[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(w[0][4]).toBe("2027-01-01");
    expect(w.every((x) => x.length === 7)).toBe(true);
  });
  it("exporte un .ics valide avec rappels J-7 et J-1", () => {
    const ics = toICS(evts, NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270115");
    expect(ics).toContain("DTEND;VALUE=DATE:20270116");
    expect(ics.match(/TRIGGER:-P7D/g)!.length).toBe(ics.match(/BEGIN:VEVENT/g)!.length);
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});

describe("taux de change", () => {
  it("garde l'euro à parité fixe et lit le dollar", async () => {
    const fake = (async () => ({ ok: true, json: async () => ({ result: "success", rates: { XOF: 566.123 } }) })) as unknown as typeof fetch;
    expect(await fetchRates(fake)).toEqual({ EUR: EUR_XOF, USD: 566.12 });
  });
  it("rejette une réponse aberrante et sait quand rafraîchir", () => {
    expect(parseUsdXof({ result: "error" })).toBeNull();
    expect(parseUsdXof({ rates: { XOF: 3 } })).toBeNull();
    expect(isStale("")).toBe(true);
    expect(isStale(new Date(Date.now() - 3600e3).toISOString())).toBe(false);
  });
});

describe("suggestions", () => {
  const base = { ...sampleData(), settings: { ...defaultSettings("Alex"), salary: 300000, lastBackupAt: NOW.toISOString() } };
  const ctx = (patch: Partial<typeof base> = {}) => {
    const b = { ...base, ...patch };
    return { settings: b.settings, tasks: b.tasks.map((t, i) => ({ ...t, id: i + 1 })), debts: b.debts.map((x, i) => ({ ...x, id: i + 1 })),
      vaults: b.vaults.map((x, i) => ({ ...x, id: i + 1 })), charges: b.charges.map((x, i) => ({ ...x, id: i + 1 })),
      projects: b.projects.map((x, i) => ({ ...x, id: i + 1 })), incomes: b.incomes.map((x, i) => ({ ...x, id: i + 1 })), wishlist: b.wishlist.map((x, i) => ({ ...x, id: i + 1 })) };
  };
  it("signale les démarches en retard en premier", () => {
    const s = suggest(ctx({ tasks: [task({ dueDate: "2026-08-20" })] }), NOW);
    expect(s[0].tone).toBe("bad");
    expect(s[0].title).toMatch(/en retard/);
  });
  it("propose de passer en phase 2 quand tout est soldé", () => {
    const s = suggest(ctx({ debts: base.debts.map((d) => ({ ...d, paid: d.total })) }), NOW);
    expect(s.some((x) => x.action?.run === "phase2")).toBe(true);
  });
  it("prépare une relance client par e-mail", () => {
    const s = suggest(ctx({ incomes: [{ ...base.incomes[0], date: "2026-09-01" }] }), NOW);
    const r = s.find((x) => x.id.startsWith("income-chase"))!;
    expect(r.action!.href).toMatch(/^mailto:/);
  });
  it("rappelle la sauvegarde et respecte le masquage", () => {
    const noBackup = ctx(); noBackup.settings = { ...noBackup.settings, lastBackupAt: "" };
    const s = suggest(noBackup, NOW);
    const b = s.find((x) => x.action?.run === "backup")!;
    expect(b).toBeTruthy();
    noBackup.settings = { ...noBackup.settings, dismissed: { [b.id]: "forever" } };
    expect(suggest(noBackup, NOW).find((x) => x.id === b.id)).toBeUndefined();
  });
  it("oriente un gros achat vers Projets", () => {
    const s = suggest(ctx({ wishlist: [{ ...base.wishlist[0], price: 649.99, status: "À acheter" }] }), NOW);
    expect(s.some((x) => x.id.startsWith("wish-big"))).toBe(true);
  });
});

describe("normalisation v2", () => {
  it("ajoute les nouveaux champs à une ancienne sauvegarde v2", () => {
    const old = sampleData() as never as { settings: Record<string, unknown> };
    delete old.settings.ratesAuto; delete old.settings.dismissed;
    const b = normalizeV2(old as never);
    expect(b.settings.ratesAuto).toBe(true);
    expect(b.settings.dismissed).toEqual({});
  });
});
