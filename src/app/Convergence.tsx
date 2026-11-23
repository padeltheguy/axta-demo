import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/*
  Scène « Convergence » (concept original axta) :
  des fragments épars — comptes, dettes, coffres, objectifs — dérivent, sont attirés
  par le symbole axta, puis se déploient en une seule carte « vue claire ».
  Boucle d'environ 9 s, 3 cycles maximum puis arrêt sur la vue claire.
  Mouvement réduit : vue claire statique.
*/

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_INOUT = [0.65, 0, 0.35, 1] as const;
const C = { acc: "#2A9D90", debt: "#E76E50", vault: "#E8C468", goal: "#274754" };
type Fam = keyof typeof C;

// Positions fixes (pseudo-aléatoires mais stables), jamais au centre.
const FRAGS: { fam: Fam; x: number; y: number; label: string }[] = [
  { fam: "acc", x: 40, y: 50, label: "FCFA" }, { fam: "acc", x: 300, y: 70, label: "EUR" }, { fam: "acc", x: 60, y: 300, label: "USD" },
  { fam: "debt", x: 170, y: 22, label: "" }, { fam: "debt", x: 318, y: 210, label: "" }, { fam: "debt", x: 24, y: 180, label: "" },
  { fam: "vault", x: 110, y: 128, label: "" }, { fam: "vault", x: 280, y: 318, label: "" }, { fam: "vault", x: 230, y: 130, label: "" },
  { fam: "goal", x: 168, y: 330, label: "17" }, { fam: "goal", x: 320, y: 140, label: "" }, { fam: "goal", x: 100, y: 236, label: "" },
];
// Point d'absorption par famille (les 4 pétales du symbole).
const PETAL: Record<Fam, [number, number]> = { acc: [200, 168], debt: [232, 196], vault: [200, 226], goal: [168, 196] };
const MESSAGES = [
  ["Une seule vue", "Tes comptes, tes dettes, tes objectifs, enfin alignés."],
  ["Tes objectifs", "Chaque franc reçu sait déjà où il va."],
  ["Ton foyer", "Ta vie de famille et de travail, organisée au même endroit."],
];

type Stage = "drift" | "converge" | "clear" | "breathe";

function Fragment({ f, i, stage }: { f: (typeof FRAGS)[number]; i: number; stage: Stage }) {
  const [px, py] = PETAL[f.fam];
  const gathered = stage === "converge" || stage === "clear";
  const color = C[f.fam];
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.92, x: f.x, y: f.y }}
      animate={gathered
        ? { opacity: stage === "clear" ? 0 : [1, 1, 0], scale: 0.2, x: px - 28, y: py - 18, transition: { duration: 0.9, ease: EASE_INOUT, delay: (i % 3) * 0.06 + Object.keys(C).indexOf(f.fam) * 0.08 } }
        : { opacity: 1, scale: 1, x: [f.x, f.x + 6 + (i % 4), f.x - 4, f.x], y: [f.y, f.y - 6, f.y + 4 + (i % 3), f.y],
            transition: { opacity: { duration: 0.6, delay: i * 0.04 }, scale: { duration: 0.6, ease: EASE_OUT }, x: { duration: 3 + (i % 3) * 0.5, repeat: Infinity, ease: "easeInOut" }, y: { duration: 3.4 + (i % 2) * 0.6, repeat: Infinity, ease: "easeInOut" } } }}
    >
      <rect width="56" height="36" rx="8" fill="#fff" stroke="#E4E4E7" />
      {f.fam === "acc" && <><circle cx="14" cy="18" r="6" fill={color} /><text x="25" y="22" fontSize="10" fontWeight="600" fill="#3F3F46" fontFamily="Geist, sans-serif">{f.label}</text></>}
      {f.fam === "debt" && <><rect x="9" y="14" width="38" height="5" rx="2.5" fill="#F4F4F5" /><rect x="9" y="14" width={12 + (i % 3) * 8} height="5" rx="2.5" fill={color} /><rect x="9" y="23" width="22" height="3" rx="1.5" fill="#E4E4E7" /></>}
      {f.fam === "vault" && <><circle cx="18" cy="18" r="8" fill="none" stroke="#F4F4F5" strokeWidth="3" /><circle cx="18" cy="18" r="8" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${18 + i * 2} 60`} transform="rotate(-90 18 18)" /><rect x="31" y="15" width="16" height="6" rx="3" fill="#E4E4E7" /></>}
      {f.fam === "goal" && <><rect x="9" y="9" width="18" height="18" rx="4" fill={color} /><text x="18" y="22" fontSize="9" fontWeight="600" fill="#fff" textAnchor="middle" fontFamily="Geist, sans-serif">{f.label || "✓"}</text><rect x="31" y="15" width="16" height="6" rx="3" fill="#E4E4E7" /></>}
    </motion.g>
  );
}

const SYMBOL = "M41.6,15.05c-1.07-3.3-7.15-3.22-12.6-1.45-1.05.33-2.08.72-3.05,1.2.15-1.07.2-2.17.2-3.27,0-5.72-1.8-11.52-5.27-11.52s-5.27,5.8-5.27,11.52c0,1.1.07,2.2.2,3.27-.97-.48-2-.87-3.05-1.2-5.45-1.78-11.52-1.85-12.6,1.45-1.08,3.3,3.9,6.8,9.35,8.58,1.05.35,2.12.62,3.2.82-.72.77-1.45,1.6-2.12,2.53-1.7,2.32-2.95,4.82-3.5,6.97-.92,3.45.23,4.9,1,5.45.37.27.98.57,1.85.57.92,0,2.12-.33,3.65-1.3,1.88-1.2,3.85-3.15,5.55-5.5.65-.9,1.25-1.82,1.78-2.77.5.92,1.07,1.85,1.73,2.77,2.72,3.73,6.4,6.83,9.2,6.83.7,0,1.32-.2,1.85-.6.77-.55,1.93-2,1.02-5.45-.57-2.15-1.82-4.65-3.52-6.97-.68-.92-1.37-1.75-2.1-2.53,1.05-.2,2.13-.48,3.18-.82,5.48-1.78,10.42-5.28,9.35-8.58ZM10.3,21.17c-5.62-1.82-7.95-4.58-7.7-5.33.15-.42,1.3-.9,3.27-.9,1.55,0,3.6.3,6.1,1.1,1.85.6,3.33,1.3,4.47,2,.3,1,.68,1.9,1.1,2.65-.42.2-.9.43-1.43.77-.33.2-.65.48-1,.73-1.35-.13-2.98-.43-4.82-1.03ZM17.02,31.65c-1.5,2.1-3.23,3.83-4.85,4.85-1.45.92-2.33,1-2.58.83s-.48-1.05-.05-2.73c.5-1.85,1.6-4.02,3.12-6.1,1.05-1.45,2.17-2.7,3.33-3.67.15,0,.3.03.45.03.85,0,1.65-.1,2.38-.25.05.48.12,1,.3,1.6.1.38.23.77.38,1.18-.53,1.25-1.33,2.7-2.47,4.27ZM32.2,34.6c.43,1.68.23,2.55-.02,2.73-.65.48-3.98-.9-7.45-5.68-1.05-1.43-1.88-2.9-2.45-4.27.35-.98.57-1.9.65-2.78.72.15,1.52.25,2.4.25.13,0,.3-.03.43-.03,1.15.98,2.3,2.23,3.32,3.67,1.53,2.08,2.63,4.25,3.12,6.1ZM26.62,22.2c-.33-.25-.68-.53-1-.73-.52-.35-.97-.57-1.42-.77.42-.75.8-1.65,1.1-2.65,1.15-.7,2.65-1.4,4.5-2,2.47-.8,4.52-1.1,6.1-1.1,1.95,0,3.1.48,3.25.9.25.75-2.08,3.5-7.7,5.33-1.85.6-3.48.9-4.82,1.03Z";

function ClearView({ animateIn }: { animateIn: boolean }) {
  const t = (d: number) => (animateIn ? { duration: 0.6, ease: EASE_OUT, delay: d } : { duration: 0 });
  return (
    <motion.g initial={animateIn ? { opacity: 0, scale: 0.6 } : false} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.5, ease: [0.7, 0, 0.84, 0] } }}
      transition={t(0)} style={{ transformOrigin: "200px 200px" }}>
      <rect x="40" y="90" width="320" height="220" rx="16" fill="#fff" stroke="#E4E4E7" />
      <text x="60" y="120" fontSize="12" fill="#71717A" fontFamily="Geist, sans-serif">Ce mois-ci</text>
      <g fontFamily="Geist, sans-serif">
        {/* Reçu et réparti */}
        <circle cx="66" cy="148" r="5" fill={C.acc} />
        <text x="78" y="152" fontSize="11" fill="#71717A">Reçu et réparti</text>
        <text x="60" y="178" fontSize="18" fontWeight="500" fill="#18181B">CFA 450 000</text>
        {/* Reste dû */}
        <circle cx="216" cy="148" r="5" fill={C.debt} />
        <text x="228" y="152" fontSize="11" fill="#71717A">Reste dû</text>
        <rect x="210" y="166" width="130" height="7" rx="3.5" fill="#F4F4F5" />
        <motion.rect x="210" y="166" height="7" rx="3.5" fill={C.debt} initial={{ width: animateIn ? 52 : 65 }} animate={{ width: 65 }} transition={t(0.4)} />
        {/* Coffre */}
        <circle cx="76" cy="248" r="16" fill="none" stroke="#F4F4F5" strokeWidth="5" />
        <motion.circle cx="76" cy="248" r="16" fill="none" stroke={C.vault} strokeWidth="5" strokeLinecap="round" transform="rotate(-90 76 248)"
          strokeDasharray="100.5" initial={{ strokeDashoffset: animateIn ? 70 : 62 }} animate={{ strokeDashoffset: 62 }} transition={t(0.5)} />
        <text x="102" y="244" fontSize="11" fill="#71717A">Fonds d'urgence</text>
        <text x="102" y="261" fontSize="13" fontWeight="500" fill="#18181B">38 %</text>
        {/* Objectif */}
        <rect x="210" y="230" width="34" height="34" rx="7" fill={C.goal} />
        <text x="227" y="252" fontSize="12" fontWeight="600" fill="#fff" textAnchor="middle">17</text>
        <text x="254" y="244" fontSize="11" fill="#71717A">Prochain objectif</text>
        <text x="254" y="261" fontSize="13" fontWeight="500" fill="#18181B">mars · console</text>
        <motion.path d="M218 247 l6 6 l11 -12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: animateIn ? 0 : 1, opacity: 0 } as never} animate={{ pathLength: 1, opacity: [0, 1, 1, 0] } as never} transition={animateIn ? { duration: 1.6, delay: 0.7 } : { duration: 0 }} />
      </g>
      {/* point de vie */}
      <motion.circle r="4.5" fill="#F4A462" cx="60" cy="292"
        animate={animateIn ? { cx: [60, 140, 220, 340], cy: [292, 286, 289, 280] } : { cx: 340, cy: 280 }} transition={{ duration: 2, ease: EASE_INOUT, delay: animateIn ? 0.6 : 0 }} />
      <path d="M60 292 C 120 284, 160 292, 220 289 S 310 282, 340 280" fill="none" stroke="#F4A462" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="3 4" />
    </motion.g>
  );
}

export function Convergence() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>(reduce ? "clear" : "drift");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce) { setStage("clear"); return; }
    const plan: Record<Stage, [Stage, number]> = { drift: ["converge", 2600], converge: ["clear", 1800], clear: ["breathe", 2600], breathe: ["drift", 1200] };
    if (stage === "clear" && cycle >= 2) return; // 3 cycles max, puis arrêt sur la vue claire
    const [next, ms] = plan[stage];
    const id = setTimeout(() => {
      if (document.hidden) return setStage(stage); // pause onglet caché
      if (stage === "breathe") setCycle((c) => c + 1);
      setStage(next);
    }, ms);
    return () => clearTimeout(id);
  }, [stage, cycle, reduce]);

  const showSymbol = stage === "converge" || stage === "breathe";
  const msg = MESSAGES[cycle % MESSAGES.length];
  return (
    <div className="scene" aria-hidden="true">
      <svg viewBox="0 0 400 400" className="scene-svg">
        {stage !== "clear" && FRAGS.map((f, i) => <Fragment key={i} f={f} i={i} stage={stage} />)}
        <AnimatePresence>
          {showSymbol && (
            <motion.g key="sym" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: [0.6, 1.06, 1] }} exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.4 } }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }} style={{ transformOrigin: "200px 196px" }}>
              <g transform="translate(166 162) scale(1.63)">
                <motion.path d={SYMBOL} fill="#1D1D1B" stroke="#1D1D1B" strokeWidth=".6"
                  initial={{ pathLength: 0, fillOpacity: 0 } as never} animate={{ pathLength: 1, fillOpacity: 1 } as never} transition={{ pathLength: { duration: 0.4 }, fillOpacity: { duration: 0.2, delay: 0.4 } }} />
              </g>
            </motion.g>
          )}
          {stage === "clear" && <ClearView key="clear" animateIn={!reduce} />}
        </AnimatePresence>
      </svg>
      <AnimatePresence mode="wait">
        <motion.div key={cycle} className="scene-copy" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.24, ease: EASE_OUT }}>
          <p>{msg[0]}</p>
          <h2>{msg[1]}</h2>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
