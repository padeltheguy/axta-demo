import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, FolderOpen, RotateCcw, Trash2, Plus } from "lucide-react";
import { db, importBackup, APP_VERSION } from "@/db/db";
import { parseBackup } from "@/db/backup";
import { backupFolderName, chooseBackupFolder, folderBackupSupported, writeFolderBackup } from "@/app/automation";
import { downloadFile, saveSettings, useSettings } from "@/ui/parts";
import { useToast } from "@/ui/Toast";
import { Select } from "@/ui/Pickers";
import { MOVE_CATEGORIES, type MoveCategory } from "@/domain/types";

/** Paramètres › Sauvegardes : points de restauration automatiques et sauvegarde dans un dossier. */
export function BackupSettings() {
  const s = useSettings(), toast = useToast();
  const points = useLiveQuery(() => db.restorePoints.orderBy("createdAt").reverse().toArray(), []) ?? [];
  const [folder, setFolder] = useState("");
  useEffect(() => { backupFolderName().then(setFolder); }, []);
  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} Ko`;

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h3>Sauvegardes et versions</h3>
      <p className="desc">Trois filets de sécurité : une copie interne automatique (chaque jour, avant chaque import ou restauration, à chaque nouvelle version d'axta), une copie dans un dossier de ton choix, et l'export manuel. Version d'axta : <b>{APP_VERSION}</b>.</p>
      <div className="grid">
        <div>
          <h3 style={{ fontSize: 14 }}>Copie automatique dans un dossier</h3>
          {folderBackupSupported() ? (<>
            <p className="desc">Choisis par exemple ton dossier Google Drive : la sauvegarde y est écrite toute seule et suit ton Drive.</p>
            <div className="kv"><span>Dossier</span><b>{folder || "Aucun"}</b></div>
            <div className="kv"><span>Fréquence</span>
              <Select variant="input" label="Fréquence de la copie" value={s.autoBackupDays ?? 0} onChange={(v) => saveSettings({ autoBackupDays: v ?? 0 })}
                options={[{ value: 0, label: "Désactivée" }, { value: 1, label: "Chaque jour" }, { value: 7, label: "Chaque semaine" }, { value: 30, label: "Chaque mois" }]} />
            </div>
            <div className="kv"><span>Dernière copie</span><b>{s.lastAutoBackupAt ? new Date(s.lastAutoBackupAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "Jamais"}</b></div>
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btn" onClick={async () => { try { setFolder(await chooseBackupFolder()); toast.show("Dossier enregistré."); } catch { /* annulé */ } }}><FolderOpen />{folder ? "Changer de dossier" : "Choisir un dossier"}</button>
              {folder && <button className="btn primary" onClick={async () => { try { const n = await writeFolderBackup(true); toast.show(n ? `Écrit : ${n}` : "Choisis d'abord un dossier."); } catch (e) { toast.show(e instanceof Error ? e.message : "Écriture impossible."); } }}>Sauvegarder maintenant</button>}
            </div>
          </>) : <p className="desc">Ton navigateur ne permet pas d'écrire dans un dossier (Chrome ou Edge le permettent). Utilise « Sauvegarder » dans la carte Données.</p>}
        </div>
        <div>
          <h3 style={{ fontSize: 14 }}>Points de restauration ({points.length}/30)</h3>
          <p className="desc">Copies internes, conservées sur cet appareil. Restaurer crée d'abord un nouveau point : rien n'est perdu.</p>
          <div className="mem" style={{ maxHeight: 260, overflow: "auto" }}>
            {points.map((p) => (
              <div className="mem-row" key={p.id}>
                <span><b style={{ fontWeight: 500 }}>{new Date(p.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</b> · {p.reason}<br /><small style={{ color: "var(--soft-fg)" }}>v{p.version} · {kb(p.size)}</small></span>
                <button className="icon-btn" aria-label="Télécharger" title="Télécharger" onClick={() => downloadFile(p.json, `axta-point-${p.createdAt.slice(0, 16).replace(/[:T]/g, "-")}.json`, "application/json")}><Download size={14} /></button>
                <button className="icon-btn" aria-label="Restaurer ce point" title="Restaurer" onClick={async () => { if (!confirm(`Revenir à l'état du ${new Date(p.createdAt).toLocaleString("fr-FR")} ?`)) return; await importBackup(parseBackup(JSON.parse(p.json)), true, "Avant retour à un point de restauration"); toast.show("Point de restauration appliqué."); }}><RotateCcw size={14} /></button>
              </div>
            ))}
            {!points.length && <p className="desc" style={{ margin: 0 }}>Le premier point sera créé à la prochaine ouverture d'axta.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Paramètres › Règles de catégorisation des imports (texte contenu → catégorie). */
export function RulesSettings() {
  const s = useSettings(), toast = useToast();
  const [d, setD] = useState<{ match: string; category: MoveCategory; dir: "" | "in" | "out" }>({ match: "", category: "Autre dépense", dir: "" });
  const rules = s.moveRules ?? [];
  return (
    <div className="card">
      <h3>Règles d'import</h3>
      <p className="desc">Quand un relevé est importé, un libellé qui contient ce texte reçoit cette catégorie. Ces règles passent avant les règles automatiques.</p>
      {rules.map((r) => (
        <div className="mem-row" key={r.id} style={{ marginBottom: 6 }}>
          <span>« {r.match} »{r.dir ? (r.dir === "in" ? " (entrées)" : " (sorties)") : ""} → <b style={{ fontWeight: 500 }}>{r.category}</b></span>
          <button className="icon-btn" aria-label="Supprimer la règle" onClick={() => saveSettings({ moveRules: rules.filter((x) => x.id !== r.id) })}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="skill-row" style={{ marginTop: 8 }}>
        <input placeholder="Texte du libellé (ex. SBEE, nom d'une personne)" value={d.match} onChange={(e) => setD({ ...d, match: e.target.value })} aria-label="Texte à reconnaître" />
        <div style={{ display: "flex", gap: 8 }}>
          <Select variant="input" className="grow" label="Catégorie" value={d.category} onChange={(v) => v && setD({ ...d, category: v })} options={MOVE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Select variant="input" label="Sens" value={d.dir} onChange={(v) => setD({ ...d, dir: v ?? "" })} options={[{ value: "", label: "Entrées et sorties" }, { value: "in", label: "Entrées" }, { value: "out", label: "Sorties" }]} />
        </div>
        <div><button className="btn" disabled={!d.match.trim()} onClick={() => { saveSettings({ moveRules: [...rules, { id: Math.random().toString(36).slice(2), match: d.match.trim(), category: d.category, ...(d.dir ? { dir: d.dir } : {}) }] }); setD({ ...d, match: "" }); toast.show("Règle ajoutée."); }}><Plus />Ajouter la règle</button></div>
      </div>
    </div>
  );
}
