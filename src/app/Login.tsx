import { useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { Eye, EyeOff, Check } from "lucide-react";
import { Convergence } from "./Convergence";
import { db, importBackup, requestPersistence } from "@/db/db";
import { readBackupFile } from "@/db/backup";
import { defaultSettings } from "@/domain/defaults";
import { demoData } from "@/domain/demo";
import type { Settings } from "@/domain/types";

const EASE = [0.16, 1, 0.3, 1] as const;

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`axta:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const stagger = { show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE } } };

/** Écran d'entrée : création de l'espace local, ou déverrouillage par code. */
export function Login({ settings, onEnter }: { settings: Settings | undefined; onEnter: () => void }) {
  const isNew = !settings;
  const [name, setName] = useState("");
  const [pin, setPin] = useState(""), [show, setShow] = useState(false);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [ok, setOk] = useState(false);
  const shake = useAnimationControls();
  const reduce = useReducedMotion();
  const file = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  const fail = (m: string) => {
    setErr(m); setBusy(false);
    if (!reduce) shake.start({ x: [0, -4, 4, -4, 4, -2, 0], transition: { duration: 0.3, ease: [0.36, 0.07, 0.19, 0.97] } });
    pinRef.current?.focus();
  };
  const succeed = () => { setOk(true); requestPersistence(); setTimeout(onEnter, reduce ? 0 : 520); };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    if (isNew) {
      if (!name.trim()) return fail("Indique ton prénom.");
      if (pin && !/^\d{4,8}$/.test(pin)) return fail("Le code doit faire 4 à 8 chiffres.");
      await db.settings.put({ ...defaultSettings(name.trim()), pinHash: pin ? await hashPin(pin) : undefined });
      return succeed();
    }
    if (!settings!.pinHash || (await hashPin(pin)) === settings!.pinHash) return succeed();
    fail("Code incorrect.");
  }

  async function importFile(f: File) {
    try {
      const b = await readBackupFile(f);
      await importBackup(b, false);
      succeed();
    } catch (x) { fail(x instanceof Error ? x.message : "Fichier illisible."); }
  }

  const first = settings?.name?.split(" ")[0];
  return (
    <div className="login">
      <section className="login-form">
        <img className="login-logo" src="./logo.svg" alt="axta" />
        <motion.form className="login-box" onSubmit={submit} variants={stagger} initial="hidden" animate="show" noValidate>
          <motion.h1 variants={item}>{isNew ? "Bienvenue" : `Bon retour${first ? `, ${first}` : ""}`}</motion.h1>
          <motion.p variants={item} className="sub" style={{ marginBottom: 26 }}>
            {isNew ? "Crée ton espace. Tes données restent sur cet appareil." : settings?.pinHash ? "Saisis ton code pour déverrouiller axta." : "Ton espace est prêt."}
          </motion.p>
          {isNew && (
            <motion.p variants={item} className="login-demo">
              Version de démonstration. Pour voir axta rempli, clique « Explorer la démo » : les données de Sika, photographe freelance fictive, se chargent dans ton navigateur.
            </motion.p>
          )}

          {isNew && (
            <motion.label variants={item} className="lf">
              <span>Prénom et nom</span>
              <input autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Awa Mensah" />
            </motion.label>
          )}
          {(isNew || settings?.pinHash) && (
            <motion.label variants={item} className="lf">
              <span>{isNew ? "Code de déverrouillage (facultatif)" : "Code"}</span>
              <motion.div animate={shake} className={`lf-pass${err ? " bad" : ""}`}>
                <input ref={pinRef} autoFocus={!isNew} type={show ? "text" : "password"} inputMode="numeric" autoComplete={isNew ? "new-password" : "current-password"}
                  value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 8)); setErr(""); }}
                  placeholder={isNew ? "4 à 8 chiffres" : "••••"} aria-invalid={!!err} aria-describedby="login-err" />
                <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? "Masquer le code" : "Afficher le code"}>
                  <motion.span key={String(show)} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.16 }} style={{ display: "grid" }}>
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </motion.span>
                </button>
              </motion.div>
            </motion.label>
          )}
          <AnimatePresence>
            {err && <motion.p id="login-err" className="lf-err" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{err}</motion.p>}
          </AnimatePresence>

          <motion.div variants={item}>
            <motion.button className="btn primary login-cta" type="submit" disabled={busy && !err} whileTap={{ scale: 0.98 }}>
              <AnimatePresence mode="wait" initial={false}>
                {ok ? <motion.span key="ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}><Check size={18} /></motion.span>
                  : busy ? <motion.span key="busy" className="spinner" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} />
                  : <motion.span key="txt" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{isNew ? "Créer mon espace" : "Déverrouiller"}</motion.span>}
              </AnimatePresence>
            </motion.button>
          </motion.div>

          {isNew && (
            <>
              <motion.div variants={item} className="or"><span>ou</span></motion.div>
              <motion.div variants={item} className="login-alt">
                <button type="button" className="btn" onClick={() => file.current?.click()}>Importer mes données</button>
                <button type="button" className="btn primary" onClick={async () => { await importBackup(demoData(), false); succeed(); }}>Explorer la démo</button>
              </motion.div>
              <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
            </>
          )}
          <motion.p variants={item} className="login-foot">
            Tes données restent sur cet appareil. Seuls les taux de change utilisent internet. La synchronisation et le partage avec ton foyer arriveront plus tard, en option.
          </motion.p>
        </motion.form>
      </section>
      <section className="login-scene"><Convergence /></section>
    </div>
  );
}
