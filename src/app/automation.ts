import { useEffect, useRef } from "react";
import { APP_VERSION, createRestorePoint, db, exportBackup, getMeta, setMeta, upsertMonthSnapshot } from "@/db/db";
import { fetchRates, isStale, RATES_SOURCE } from "@/domain/rates";
import { iso } from "@/domain/money";
import type { Settings } from "@/domain/types";
import type { Suggestion } from "@/domain/suggestions";

/** Met à jour les taux si l'option est active et qu'ils ont plus de 12 h. Échec silencieux : on garde les derniers taux. */
export async function refreshRates(s: Settings, force = false): Promise<boolean> {
  if (!force && (!s.ratesAuto || !isStale(s.ratesUpdatedAt) || !navigator.onLine)) return false;
  try {
    const rates = await fetchRates();
    await db.settings.update("settings", { rates, ratesUpdatedAt: new Date().toISOString(), ratesSource: RATES_SOURCE });
    return true;
  } catch {
    return false;
  }
}

const NOTIFY_KEY = "axta.lastNotify";

/** Une notification par jour maximum, à l'ouverture de l'appli, pour les suggestions urgentes. */
export async function notifyUrgent(s: Settings, list: Suggestion[]) {
  if (!s.notify || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const day = iso(new Date());
  try { if (localStorage.getItem(NOTIFY_KEY) === day) return; } catch { /* stockage indisponible */ }
  const urgent = list.filter((x) => x.urgent);
  if (!urgent.length) return;
  const body = urgent.slice(0, 3).map((x) => `• ${x.title}`).join("\n") + (urgent.length > 3 ? `\n+ ${urgent.length - 3} autres` : "");
  const title = `axta : ${urgent.length} point${urgent.length > 1 ? "s" : ""} à traiter`, opts = { body, icon: "./favicon.svg", tag: "axta-daily" };
  try {
    // Sur mobile (Android, iOS installé), seules les notifications du service worker fonctionnent.
    const reg = "serviceWorker" in navigator ? await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 1500))]) : null;
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    localStorage.setItem(NOTIFY_KEY, day);
  } catch { /* notifications bloquées */ }
}

/* ---------- Sauvegardes automatiques ---------- */
type DirHandle = { name: string; queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string>; getFileHandle: (n: string, o: object) => Promise<{ createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }> };
export const folderBackupSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Choisit le dossier de sauvegarde (ex. ton dossier Google Drive) ; nécessite un clic. */
export async function chooseBackupFolder(): Promise<string> {
  const dir = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ id: "axta-backups", mode: "readwrite" });
  await setMeta("backupDir", dir);
  return dir.name;
}
export const backupFolderName = async () => (await getMeta<DirHandle>("backupDir"))?.name ?? "";

/** Écrit une sauvegarde datée dans le dossier choisi. `interactive` : peut redemander l'autorisation (clic requis). */
export async function writeFolderBackup(interactive = false): Promise<string | null> {
  const dir = await getMeta<DirHandle>("backupDir");
  if (!dir) return null;
  let perm = (await dir.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (perm !== "granted" && interactive) perm = (await dir.requestPermission?.({ mode: "readwrite" })) ?? "denied";
  if (perm !== "granted") throw new Error("Autorisation du dossier à renouveler (Paramètres › Sauvegardes).");
  const name = `axta-sauvegarde-${iso(new Date())}.json`;
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(await exportBackup(), null, 1)); await w.close();
  const now = new Date().toISOString();
  await db.settings.update("settings", { lastAutoBackupAt: now, lastBackupAt: now });
  return name;
}

/** À l'ouverture : photo du mois, point de restauration quotidien (et à chaque nouvelle version), sauvegarde dans le dossier si due. */
export async function dailyHousekeeping(s: Settings): Promise<void> {
  if (!(await db.settings.get("settings"))) return;
  await upsertMonthSnapshot().catch(() => undefined);
  const lastVersion = await getMeta<string>("lastVersion");
  const last = await db.restorePoints.orderBy("createdAt").last();
  if (lastVersion && lastVersion !== APP_VERSION) await createRestorePoint(`Passage de la version ${lastVersion} à ${APP_VERSION}`).catch(() => undefined);
  else if (!last || Date.now() - Date.parse(last.createdAt) > 20 * 3600e3) await createRestorePoint("Copie quotidienne automatique").catch(() => undefined);
  await setMeta("lastVersion", APP_VERSION);
  if (s.autoBackupDays > 0 && (!s.lastAutoBackupAt || Date.now() - Date.parse(s.lastAutoBackupAt) > s.autoBackupDays * 864e5)) await writeFolderBackup(false).catch(() => undefined);
}

/** Tâches de fond légères, lancées une fois, 2 s après l'ouverture (le temps que les données locales soient chargées). */
export function useAutomation(s: Settings, suggestions: Suggestion[]) {
  const latest = useRef({ s, suggestions });
  latest.current = { s, suggestions };
  useEffect(() => {
    const t = setTimeout(() => {
      refreshRates(latest.current.s);
      dailyHousekeeping(latest.current.s);
      void notifyUrgent(latest.current.s, latest.current.suggestions);
    }, 2000);
    return () => clearTimeout(t);
  }, []);
}
