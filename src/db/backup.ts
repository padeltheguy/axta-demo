import type { Backup } from "@/domain/types";
import { fromV1, isV1, isV2, normalizeV2 } from "@/domain/migrate";

/** Lit une sauvegarde axta (v2, ou v1 convertie). Lève une erreur lisible sinon. */
export function parseBackup(raw: unknown): Omit<Backup, "exportedAt"> {
  if (isV2(raw)) return normalizeV2(raw);
  if (isV1(raw)) return fromV1(raw);
  throw new Error("Ce fichier n'est pas une sauvegarde axta.");
}

export async function readBackupFile(f: File) {
  let raw: unknown;
  try { raw = JSON.parse(await f.text()); } catch { throw new Error("Fichier JSON illisible."); }
  return parseBackup(raw);
}
