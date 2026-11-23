import { useRef } from "react";
import { Head, downloadFile, saveSettings, useSettings } from "@/ui/parts";
import { useToast } from "@/ui/Toast";
import { Select } from "@/ui/Pickers";
import { exportBackup, importBackup, wipe } from "@/db/db";
import { readBackupFile } from "@/db/backup";
import { refreshRates } from "@/app/automation";
import { BackupSettings, RulesSettings } from "./BackupSettings";
import { demoData } from "@/domain/demo";
import { iso, today } from "@/domain/money";
import { ruleTotal } from "@/domain/split";
import type { Phase, Settings as S } from "@/domain/types";

export async function downloadBackup() {
  const b = await exportBackup();
  downloadFile(JSON.stringify(b, null, 1), `axta-sauvegarde-${iso(today())}.json`, "application/json");
  await saveSettings({ lastBackupAt: new Date().toISOString() });
}

export default function Settings() {
  const s = useSettings(), toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const line = (label: string, k: keyof S, type = "number", step = "1") => (
    <div className="kv"><span>{label}</span>
      <input className="set-input" type={type} step={step} defaultValue={String(s[k] ?? "")} key={String(s[k] ?? "")} aria-label={label}
        onBlur={(e) => saveSettings({ [k]: type === "number" ? Number(e.target.value) || 0 : e.target.value } as Partial<S>)} />
    </div>
  );
  const rule = (grp: "salary" | "variable", keys: string[], labels: string[]) => (
    <table>
      <thead><tr><th>Part</th><th className="num">Phase 1 (%)</th><th className="num">Phase 2 (%)</th></tr></thead>
      <tbody>
        {keys.map((k, i) => (
          <tr key={k}><td style={{ paddingLeft: 10 }}>{labels[i]}</td>
            {([1, 2] as Phase[]).map((ph) => {
              const r = s.rules[grp][ph] as unknown as Record<string, number>;
              return <td key={ph}><input type="number" step="1" defaultValue={Math.round(r[k] * 100)} key={r[k]} aria-label={`${labels[i]} phase ${ph}`}
                onBlur={(e) => { const rules = structuredClone(s.rules); (rules[grp][ph] as unknown as Record<string, number>)[k] = (Number(e.target.value) || 0) / 100; saveSettings({ rules }); }} /></td>;
            })}
          </tr>
        ))}
        <tr className="tot"><td style={{ textAlign: "left" }}>Total</td>
          {([1, 2] as Phase[]).map((ph) => { const t = Math.round(ruleTotal(s.rules[grp][ph]) * 100); return <td key={ph} className={t !== 100 ? "neg" : ""}>{t} %</td>; })}
        </tr>
      </tbody>
    </table>
  );
  return (
    <>
      <Head title="Paramètres" sub="Chaque règle doit faire 100 %. La phase 2 démarre quand toutes les dettes sont soldées." />
      <div className="grid">
        <div className="card"><h3>Général</h3>
          {line("Prénom et nom", "name", "text")}
          <div className="kv"><span>Phase</span>
            <Select variant="input" label="Phase" value={s.phase} onChange={(v) => v && saveSettings({ phase: v as Phase })}
              options={[{ value: 1, label: "1 · Rembourser", hint: "dettes d'abord" }, { value: 2, label: "2 · Construire", hint: "dettes soldées" }]} />
          </div>
          {line("Salaire net mensuel", "salary")}
          {line("Seuil plaisir (revenus variables / mois)", "funThreshold")}
        </div>
        <div className="card"><h3>Taux de change</h3>
          <p className="desc">L'euro est à parité fixe avec le franc CFA. Le dollar varie : axta le met à jour seul, toutes les 12 h au plus, quand tu es connecté.</p>
          <div className="kv"><span>EUR → CFA</span><b>{s.rates.EUR.toLocaleString("fr-FR")} <span style={{ color: "var(--soft-fg)", fontWeight: 400 }}>· parité fixe</span></b></div>
          <div className="kv"><span>USD → CFA</span>
            {s.ratesAuto ? <b>{s.rates.USD.toLocaleString("fr-FR")}</b>
              : <input className="set-input" type="number" step="0.01" defaultValue={s.rates.USD} key={s.rates.USD} onBlur={(e) => saveSettings({ rates: { ...s.rates, USD: Number(e.target.value) || s.rates.USD } })} aria-label="Taux USD vers CFA" />}
          </div>
          <div className="kv"><span>Mise à jour automatique</span><input type="checkbox" className="toggle" checked={s.ratesAuto} onChange={(e) => saveSettings({ ratesAuto: e.target.checked })} aria-label="Mise à jour automatique des taux" /></div>
          <div className="kv"><span>Dernière mise à jour</span><b>{s.ratesUpdatedAt ? new Date(s.ratesUpdatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "Jamais"}</b></div>
          <div className="actions" style={{ marginTop: 12, alignItems: "center" }}>
            <button className="btn" onClick={async () => toast.show((await refreshRates(s, true)) ? "Taux mis à jour." : "Impossible de joindre le service de taux. Les derniers taux sont conservés.")}>Mettre à jour maintenant</button>
            <a className="link" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer noopener" style={{ color: "var(--muted-fg)" }}>Rates By Exchange Rate API</a>
          </div>
        </div>
        <BackupSettings />
        <RulesSettings />
        <div className="card"><h3>Rappels</h3>
          <p className="desc">axta n'a pas de serveur : il ne peut pas encore envoyer d'e-mails. En attendant, deux relais fiables :</p>
          <div className="kv"><span>Notifications sur cet appareil<br /><small style={{ color: "var(--soft-fg)" }}>Un résumé des urgences par jour, à l'ouverture d'axta</small></span>
            <input type="checkbox" className="toggle" checked={s.notify} aria-label="Notifications" onChange={async (e) => {
              const on = e.target.checked;
              if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
                const p = await Notification.requestPermission();
                if (p !== "granted") { toast.show("Notifications refusées par le navigateur."); return; }
              }
              await saveSettings({ notify: on });
            }} />
          </div>
          <div className="kv"><span>Rappels par e-mail<br /><small style={{ color: "var(--soft-fg)" }}>Agenda › Exporter (.ics) › importe-le dans Google Agenda, puis active les rappels par e-mail</small></span>
            <a className="btn" href="#/agenda">Agenda</a>
          </div>
          {Object.keys(s.dismissed ?? {}).length > 0 && (
            <div className="kv"><span>Suggestions masquées : {Object.keys(s.dismissed).length}</span><button className="btn ghost" onClick={() => saveSettings({ dismissed: {} })}>Tout réafficher</button></div>
          )}
        </div>
        <div className="card"><h3>Règle du salaire</h3>{rule("salary", ["savings", "debts", "car", "living"], ["Épargne", "Dettes", "Voiture", "Vie courante"])}</div>
        <div className="card"><h3>Règle des revenus variables</h3>{rule("variable", ["savings", "debts", "car", "projects", "fun"], ["Épargne", "Dettes", "Voiture", "Projets", "Plaisir"])}</div>
        <div className="card"><h3>Données</h3>
          <p className="desc">Tes données restent sur cet appareil. Sauvegarde-les dans un fichier chaque semaine : c'est ta copie de secours, et le moyen de passer sur un autre appareil.</p>
          <div className="actions">
            <button className="btn primary" onClick={() => downloadBackup().then(() => toast.show("Sauvegarde téléchargée."))}>Sauvegarder</button>
            <button className="btn" onClick={() => file.current?.click()}>Restaurer</button>
            <button className="btn" onClick={() => { if (confirm("Remplacer tes données par le jeu de démonstration ? Sauvegarde avant.")) importBackup(demoData()).then(() => toast.show("Démo chargée.")); }}>Charger la démo</button>
            <button className="btn danger" onClick={() => { if (confirm("Tout effacer de cet appareil ? Sauvegarde avant.")) wipe().then(() => location.reload()); }}>Tout effacer</button>
          </div>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            try { const b = await readBackupFile(f); if (!confirm(`Remplacer les données actuelles par « ${f.name} » ?`)) return; await importBackup(b); toast.show("Sauvegarde restaurée."); }
            catch (err) { toast.show(err instanceof Error ? err.message : "Fichier illisible."); }
          }} />
          <p className="desc" style={{ marginTop: 14 }}>Accepte les sauvegardes axta v2 et celles de l'ancienne version (v1). Dernière sauvegarde : {s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleDateString("fr-FR") : "jamais"}.</p>
        </div>
      </div>
    </>
  );
}
