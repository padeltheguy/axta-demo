import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

interface Action { label: string; run: () => unknown }
interface T { id: number; text: string; action?: Action }
const Ctx = createContext<{ show: (text: string, action?: Action) => void }>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const show = useCallback((text: string, action?: Action) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, action }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), action ? 8000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} className="toast" layout
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: { duration: 0.16 } }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
              {t.text}
              {t.action && <button onClick={() => { t.action!.run(); setItems((x) => x.filter((i) => i.id !== t.id)); }}>{t.action.label}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
