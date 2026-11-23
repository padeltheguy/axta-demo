import { lazy, Suspense, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { Login } from "@/app/Login";
import { Shell } from "@/app/Shell";
import Dashboard from "@/features/Dashboard";
import { Accounts, Budget, Debts, Incomes, Projects, Tasks, Vaults, Wishlist } from "@/features/Lists";
import Settings from "@/features/Settings";
import Help from "@/features/Help";
import Agenda from "@/features/Agenda";
// Pages lourdes chargées à la demande (graphiques, lecteur PDF)
const Reports = lazy(() => import("@/features/Reports"));
const Movements = lazy(() => import("@/features/Movements"));
import { ToastProvider } from "@/ui/Toast";

const SESSION = "axta.unlocked";

export default function App() {
  // undefined = chargement ; null = aucun espace encore créé
  const settings = useLiveQuery(async () => (await db.settings.get("settings")) ?? null, []);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION) === "1");
  if (settings === undefined) return null;

  // Sans code non plus, la déconnexion ramène à l'écran d'entrée (on peut y quitter la démo).
  const needsLogin = !settings || !unlocked;
  const enter = () => { sessionStorage.setItem(SESSION, "1"); setUnlocked(true); };
  const lock = () => { sessionStorage.removeItem(SESSION); setUnlocked(false); };

  return (
    <MotionConfig reducedMotion="user">{/* animations JS coupées si « réduire les animations » est actif */}
    <ToastProvider>
      <HashRouter>
        <AnimatePresence mode="wait">
          {needsLogin ? (
            <motion.div key="login" exit={{ opacity: 0, transition: { duration: 0.16 } }}>
              <Login settings={settings ?? undefined} onEnter={enter} />
            </motion.div>
          ) : (
            <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.24 }}>
              <Shell onLock={lock}>
                <Suspense fallback={<p className="desc">Chargement…</p>}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/rapports" element={<Reports />} />
                  <Route path="/mouvements" element={<Movements />} />
                  <Route path="/comptes" element={<Accounts />} />
                  <Route path="/revenus" element={<Incomes />} />
                  <Route path="/dettes" element={<Debts />} />
                  <Route path="/epargne" element={<Vaults />} />
                  <Route path="/budget" element={<Budget />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route path="/projets" element={<Projects />} />
                  <Route path="/achats" element={<Wishlist />} />
                  <Route path="/demarches" element={<Tasks />} />
                  <Route path="/parametres" element={<Settings />} />
                  <Route path="/aide" element={<Help />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </Suspense>
              </Shell>
            </motion.div>
          )}
        </AnimatePresence>
      </HashRouter>
    </ToastProvider>
    </MotionConfig>
  );
}
