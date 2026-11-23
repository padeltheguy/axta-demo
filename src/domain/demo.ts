import type { Account, Backup, Charge, Debt, Income, Movement, MoveCategory, Project, Snapshot, Task, Vault, WishItem } from "./types";
import { PRIORITIES as P } from "./types";
import { defaultSettings } from "./defaults";
import { iso, n } from "./money";
import { monthlyCharges } from "./aggregates";

/**
 * Démo d'axta : Sika Mensah, photographe et vidéaste freelance.
 * Personne, clients et montants 100 % fictifs. Douze mois d'historique, datés par rapport à aujourd'hui,
 * pour que les rapports (3, 6, 12 mois), les photos du mois et l'agenda aient toujours quelque chose à montrer.
 */
export function demoData(now = new Date()): Omit<Backup, "exportedAt"> {
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = t0.getFullYear();
  /** Jour d du mois situé k mois avant le mois courant (borné à la fin du mois). */
  const at = (k: number, d: number) => {
    const last = new Date(t0.getFullYear(), t0.getMonth() - k + 1, 0).getDate();
    return new Date(t0.getFullYear(), t0.getMonth() - k, Math.min(d, last));
  };
  const day = (k: number, d: number) => iso(at(k, d));
  const past = (k: number, d: number) => at(k, d) <= t0;
  const inDays = (k: number) => iso(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + k));
  const notAfterToday = (x: Date) => iso(x > t0 ? t0 : x);
  // Aléatoire déterministe : la démo est identique d'un chargement à l'autre.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const vary = (base: number, spread: number) => Math.round((base + (rnd() * 2 - 1) * spread) / 100) * 100;

  const settings = {
    ...defaultSettings("Sika Mensah"),
    salary: 400000, // rémunération fixe qu'elle se verse chaque mois depuis son compte pro
    lastBackupAt: new Date(t0.getTime() - 3 * 864e5).toISOString(),
    createdAt: at(11, 1).toISOString(),
    moveRules: [
      { id: "r1", match: "coworking", category: "Autre dépense" as MoveCategory, dir: "out" as const },
      { id: "r2", match: "pixel bleu", category: "Revenus" as MoveCategory, dir: "in" as const },
    ],
  };
  const EUR = settings.rates.EUR, USD = settings.rates.USD;

  // Identifiants implicites : 1..n dans l'ordre des tableaux (voir importBackup).
  const ACC = { pro: 1, perso: 2, momo: 3, cash: 4 };
  const DEBT = { gear: 1, aunt: 2, micro: 3, print: 4 };
  const VAULT = { urgent: 1, tax: 2, gear: 3, trip: 4 };

  const accounts: Account[] = [
    { order: 1, name: "Compte pro", type: "Banque", institution: "Banque Lagune", currency: "XOF", balance: 642000, updatedAt: day(0, 1), notes: "Reçoit les paiements des clients." },
    { order: 2, name: "Compte perso", type: "Banque", institution: "Banque Lagune", currency: "XOF", balance: 91500, updatedAt: day(0, 1), notes: "Reçoit la rémunération mensuelle." },
    { order: 3, name: "Mobile money", type: "Mobile money", institution: "Opérateur mobile", currency: "XOF", balance: 23400, updatedAt: day(0, 1), notes: "" },
    { order: 4, name: "Espèces", type: "Espèces", institution: "", currency: "XOF", balance: 15000, updatedAt: day(0, 1), notes: "" },
    { order: 5, name: "Épargne en ligne", type: "Épargne", institution: "Appli d'épargne", currency: "XOF", balance: null, updatedAt: day(0, 1), notes: "Représentée par les coffres." },
    { order: 6, name: "Portefeuille USD", type: "Autre", institution: "Plateforme de paiement", currency: "USD", balance: 310, updatedAt: day(1, 20), notes: "Clients étrangers." },
  ];

  // ---------- Missions ----------
  type Mission = { k: number; d: number; kind: Income["kind"]; client: string; project: string; status: Income["status"]; currency: Income["currency"]; amount: number; deposit?: number; notes?: string };
  const missions: Mission[] = [
    { k: 11, d: 6, kind: "Freelance", client: "Agence Pixel Bleu", project: "Shooting catalogue produits", status: "Payé", currency: "XOF", amount: 380000, deposit: 150000 },
    { k: 10, d: 12, kind: "Freelance", client: "Mariage Aïcha et Koffi", project: "Photo et vidéo du mariage", status: "Payé", currency: "XOF", amount: 450000, deposit: 200000 },
    { k: 9, d: 4, kind: "Freelance", client: "ONG Terre Verte", project: "Reportage sur le terrain", status: "Payé", currency: "EUR", amount: 900 },
    { k: 8, d: 15, kind: "Freelance", client: "Hôtel Les Cocotiers", project: "Photos des chambres et du restaurant", status: "Payé", currency: "XOF", amount: 520000, deposit: 200000 },
    { k: 7, d: 9, kind: "Vente", client: "Particulier", project: "Vente d'un ancien objectif", status: "Payé", currency: "XOF", amount: 90000 },
    { k: 6, d: 3, kind: "Freelance", client: "Festival Rythmes d'ici", project: "Captation vidéo, 3 soirées", status: "Payé", currency: "XOF", amount: 750000, deposit: 300000 },
    { k: 5, d: 11, kind: "Freelance", client: "Néré Cosmétiques", project: "Campagne réseaux sociaux", status: "Payé", currency: "XOF", amount: 420000, deposit: 200000 },
    { k: 4, d: 7, kind: "Freelance", client: "Mariage Esther et Paul", project: "Photo du mariage", status: "Payé", currency: "XOF", amount: 480000, deposit: 180000 },
    { k: 3, d: 5, kind: "Freelance", client: "Studio Lagune", project: "Portraits de l'équipe", status: "Payé", currency: "XOF", amount: 260000 },
    { k: 3, d: 20, kind: "Commission", client: "Agence Pixel Bleu", project: "Apport d'affaire", status: "Payé", currency: "XOF", amount: 50000 },
    { k: 2, d: 8, kind: "Freelance", client: "Coopérative des Savanes", project: "Photos du rapport annuel", status: "Payé", currency: "USD", amount: 1200 },
    { k: 2, d: 18, kind: "Freelance", client: "Restaurant Le Baobab", project: "Photos du menu", status: "Annulé", currency: "XOF", amount: 150000, notes: "Projet reporté par le client." },
    { k: 1, d: 6, kind: "Freelance", client: "Hôtel Les Cocotiers", project: "Vidéo de présentation", status: "En cours", currency: "XOF", amount: 650000, deposit: 300000, notes: "Solde à la livraison du montage." },
    { k: 1, d: 14, kind: "Freelance", client: "ONG Terre Verte", project: "Mission 2 : atelier photo", status: "Payé", currency: "EUR", amount: 700 },
    { k: 0, d: 2, kind: "Freelance", client: "Mariage Ruth et Ismaël", project: "Photo et vidéo du mariage", status: "En cours", currency: "XOF", amount: 500000, deposit: 200000, notes: "Mariage dans 3 semaines." },
    { k: 0, d: 2, kind: "Freelance", client: "Néré Cosmétiques", project: "Campagne des fêtes", status: "Devis envoyé", currency: "XOF", amount: 380000, notes: "Relancer si pas de réponse." },
  ];
  const toXof = (m: Mission) => Math.round(m.currency === "EUR" ? m.amount * EUR : m.currency === "USD" ? m.amount * USD : m.amount);

  const movements: Omit<Movement, "order">[] = [];
  const mv = (date: string, label: string, amount: number, category: MoveCategory, accountId: number | null, extra: Partial<Movement> = {}) =>
    movements.push({ date, label, amount, currency: "XOF", category, accountId, debtId: null, vaultId: null, counterparty: "", source: "manuel", ref: "", notes: "", ...extra });

  const incomes: Income[] = missions.map((m, i) => {
    const total = toXof(m);
    const date = past(m.k, m.d) ? day(m.k, m.d) : day(m.k + 1, 26);
    let deposit: number | null = null, balance: number | null = null;
    if (m.status === "Payé") {
      if (m.deposit) {
        deposit = m.deposit; balance = total - m.deposit;
        mv(date, `Acompte ${m.client}`, deposit, "Revenus", ACC.pro, { counterparty: m.client });
        const end = new Date(at(m.k, m.d).getTime() + 19 * 864e5);
        mv(notAfterToday(end), `Solde ${m.client}`, balance, "Revenus", ACC.pro, { counterparty: m.client });
      } else {
        balance = total;
        mv(date, `${m.kind === "Vente" ? "Vente" : "Paiement"} ${m.client}`, total, m.kind === "Vente" ? "Autre entrée" : "Revenus", m.kind === "Vente" ? ACC.momo : ACC.pro, { counterparty: m.client });
      }
    } else if (m.status === "En cours" && m.deposit) {
      deposit = m.deposit;
      mv(date, `Acompte ${m.client}`, deposit, "Revenus", ACC.pro, { counterparty: m.client });
    }
    return { order: i + 1, date, kind: m.kind, client: m.client, project: m.project, status: m.status, currency: m.currency, amount: m.amount, deposit, balance, applyRules: true, notes: m.notes ?? "" };
  });

  // ---------- Vie courante, dettes et épargne, mois par mois ----------
  const GEAR_TOTAL = 1800000, GEAR_BEFORE = 500000, GEAR_MONTHLY = 100000;
  let gearPaid = GEAR_BEFORE, auntPaid = 0, printPaid = 0;
  const vault = { [VAULT.urgent]: 150000, [VAULT.tax]: 60000, [VAULT.gear]: 0, [VAULT.trip]: 0 } as Record<number, number>;
  const snapshots: Snapshot[] = [];
  const charges: Charge[] = [
    { order: 1, label: "Loyer", category: "Logement", frequency: "Mensuel", amount: 85000, status: "Actif", notes: "" },
    { order: 2, label: "Électricité et eau", category: "Logement", frequency: "Mensuel", amount: 18000, status: "Actif", notes: "" },
    { order: 3, label: "Internet fibre", category: "Abonnements", frequency: "Mensuel", amount: 25000, status: "Actif", notes: "Indispensable pour les envois de fichiers." },
    { order: 4, label: "Forfait téléphone", category: "Abonnements", frequency: "Mensuel", amount: 10000, status: "Actif", notes: "" },
    { order: 5, label: "Logiciels de retouche et de montage", category: "Travail", frequency: "Mensuel", amount: 15000, status: "Actif", notes: "" },
    { order: 6, label: "Stockage en ligne (2 To)", category: "Travail", frequency: "Mensuel", amount: 6000, status: "Actif", notes: "" },
    { order: 7, label: "Assurance du matériel", category: "Travail", frequency: "Annuel", amount: 120000, status: "Actif", notes: "Couvre vol et casse en tournage." },
    { order: 8, label: "Coworking", category: "Travail", frequency: "Mensuel", amount: 35000, status: "À réduire", notes: "Passer à la formule 10 jours ?" },
    { order: 9, label: "Courses", category: "Nourriture", frequency: "Hebdomadaire", amount: 17000, status: "Actif", notes: "" },
    { order: 10, label: "Transport", category: "Transport", frequency: "Hebdomadaire", amount: 7000, status: "Actif", notes: "" },
    { order: 11, label: "Streaming", category: "Abonnements", frequency: "Mensuel", amount: 5000, status: "À résilier", notes: "Presque jamais utilisé." },
  ];

  for (let k = 11; k >= 0; k--) {
    const ok = (d: number) => past(k, d);
    const put = (d: number, label: string, amount: number, category: MoveCategory, acc: number | null, extra: Partial<Movement> = {}) => { if (ok(d)) mv(day(k, d), label, amount, category, acc, extra); };
    // Rémunération : du compte pro vers le compte perso (transfert, ni gain ni dépense)
    put(1, "Rémunération du mois (vers compte perso)", -400000, "Transfert", ACC.pro);
    put(1, "Rémunération du mois (depuis compte pro)", 400000, "Transfert", ACC.perso);
    put(2, "Forfait téléphone", -10000, "Abonnements et téléphone", ACC.momo);
    put(3, "Loyer", -85000, "Logement", ACC.perso, { counterparty: "Propriétaire" });
    put(4, "Coworking", -35000, "Autre dépense", ACC.pro, { counterparty: "Espace coworking" });
    put(5, "Internet fibre", -25000, "Abonnements et téléphone", ACC.perso);
    put(8, "Logiciels de retouche et de montage", -15000, "Abonnements et téléphone", ACC.pro);
    put(8, "Stockage en ligne", -6000, "Abonnements et téléphone", ACC.pro);
    put(10, "Électricité et eau", -vary(18000, 3000), "Électricité et eau", ACC.momo);
    for (const d of [7, 15, 23]) put(d, "Courses", -vary(22000, 5000), "Nourriture", ACC.perso);
    for (const d of [6, 13, 20, 27]) put(d, "Transport", -vary(7000, 2000), "Transport", ACC.momo);
    put(12, "Retrait", -vary(30000, 10000), "Retraits d'espèces", ACC.perso);
    put(24, "Retrait", -vary(25000, 8000), "Retraits d'espèces", ACC.perso);
    put(18, "Soutien famille", -25000, "Famille et dons", ACC.momo);
    put(28, "Frais de tenue de compte", -2500, "Frais bancaires et MoMo", ACC.pro);
    if (k % 2 === 0) put(21, "Sortie entre amis", -vary(18000, 6000), "Loisirs", ACC.momo);
    if (k % 4 === 1) put(16, "Pharmacie et consultation", -vary(22000, 6000), "Santé", ACC.momo);
    if (k === 7) put(19, "Assurance du matériel (annuelle)", -120000, "Autre dépense", ACC.pro);
    if (k === 5) put(14, "Disque dur externe 4 To", -65000, "Courses et achats", ACC.pro);
    if (k === 1) put(14, "Dépôt d'espèces", 60000, "À classer", ACC.momo);
    if (k === 0) put(5, "Virement reçu", 45000, "À classer", ACC.perso);

    // Dettes
    if (ok(6) && gearPaid < GEAR_TOTAL) {
      const x = Math.min(GEAR_MONTHLY, GEAR_TOTAL - gearPaid); gearPaid += x;
      put(6, "Versement crédit matériel", -x, "Remboursement de dette", ACC.pro, { debtId: DEBT.gear, counterparty: "Boutique Photo Pro" });
    }
    if (k >= 9) { auntPaid += 50000; put(9, "Remboursement tante Afi", -50000, "Remboursement de dette", ACC.momo, { debtId: DEBT.aunt, counterparty: "Tante Afi" }); }
    if (k === 2 && ok(12)) { printPaid += 40000; put(12, "Acompte imprimerie (tirages de l'expo)", -40000, "Remboursement de dette", ACC.pro, { debtId: DEBT.print, counterparty: "Imprimerie Graphix" }); }

    // Épargne : un virement par coffre, le jour suivant la rémunération
    const save = (id: number, amount: number, label: string) => { if (ok(2)) { vault[id] += amount; put(2, label, -amount, "Épargne", ACC.pro, { vaultId: id }); } };
    save(VAULT.urgent, 30000, "Coffre : fonds d'urgence");
    save(VAULT.tax, 25000, "Coffre : impôts et cotisations");
    if (k <= 8) save(VAULT.gear, 40000, "Coffre : renouvellement du matériel");
    if (k <= 5) save(VAULT.trip, 15000, "Coffre : voyage à Dakar");

    // Photo du mois (prise le 1er) pour les mois passés ; celle du mois courant est prise par l'appli
    if (k >= 1) {
      const debtsLeft = (GEAR_TOTAL - gearPaid) + Math.max(0, 150000 - auntPaid) + (k <= 3 ? 85000 - printPaid : 0);
      const savings = Object.values(vault).reduce((a, v) => a + v, 0);
      const accountsTotal = Math.round((260000 + (11 - k) * 38000 + vary(0, 25000)) / 100) * 100;
      snapshots.push({
        month: day(k, 1).slice(0, 7), takenAt: at(k, 1).toISOString(), accounts: accountsTotal, savings, debts: debtsLeft,
        netWorth: accountsTotal + savings - debtsLeft, charges: Math.round(monthlyCharges(charges)), debtCount: [GEAR_TOTAL - gearPaid, 150000 - auntPaid, k <= 3 ? 85000 - printPaid : 0].filter((x) => x > 0).length,
        perDebt: { "Boutique Photo Pro (crédit matériel)": GEAR_TOTAL - gearPaid, "Tante Afi (prêt)": Math.max(0, 150000 - auntPaid), ...(k <= 3 ? { "Imprimerie Graphix (tirages de l'expo)": 85000 - printPaid } : {}) },
        perVault: { "Fonds d'urgence": vault[VAULT.urgent], "Impôts et cotisations": vault[VAULT.tax], "Renouvellement du matériel": vault[VAULT.gear], "Voyage à Dakar": vault[VAULT.trip] },
        note: "Démo : photo reconstituée",
      });
    }
  }
  // Micro-crédit récent : emprunté le mois dernier, à rembourser bientôt
  mv(day(1, 27), "Micro-crédit mobile", 35000, "Emprunt", ACC.momo, { debtId: DEBT.micro, counterparty: "Opérateur mobile" });

  const debts: Debt[] = [
    { order: 1, creditor: "Boutique Photo Pro (crédit matériel)", type: "Crédit", total: GEAR_TOTAL, paid: gearPaid, dueDate: "", notes: "Boîtier et deux objectifs. 100 000 par mois." },
    { order: 2, creditor: "Tante Afi (prêt)", type: "Dette personnelle", total: 150000, paid: auntPaid, dueDate: "", notes: "", closedAt: day(9, 9) },
    { order: 3, creditor: "Micro-crédit mobile", type: "Banque", total: 35000, paid: 0, dueDate: inDays(9), notes: "Pénalité en cas de retard." },
    { order: 4, creditor: "Imprimerie Graphix (tirages de l'expo)", type: "Services", total: 85000, paid: printPaid, dueDate: inDays(40), notes: "Solde à régler avant le vernissage." },
  ];
  const vaults: Vault[] = [
    { order: 1, name: "Fonds d'urgence", target: 900000, targetDate: `${y + 1}-12-31`, balance: vault[VAULT.urgent], notes: "3 mois de dépenses : un mois sans client ne doit pas devenir une dette." },
    { order: 2, name: "Impôts et cotisations", target: 350000, targetDate: `${y + 1}-03-31`, balance: vault[VAULT.tax], notes: "Mis de côté sur chaque mission." },
    { order: 3, name: "Renouvellement du matériel", target: 1500000, targetDate: `${y + 2}-06-30`, balance: vault[VAULT.gear], notes: "Pour ne plus acheter à crédit." },
    { order: 4, name: "Voyage à Dakar", target: 450000, targetDate: `${y + 1}-08-15`, balance: vault[VAULT.trip], notes: "" },
  ];
  // Le compte d'épargne vaut la somme des coffres
  accounts[4].balance = vaults.reduce((a, v) => a + n(v.balance), 0);

  const projects: Project[] = [
    { order: 1, name: "Objectif 35 mm lumineux", category: "Bureau", priority: P[1], budget: 650000, paid: 200000, status: "En cours", targetDate: day(-3, 15), notes: "Payé par le coffre matériel, pas à crédit." },
    { order: 2, name: "Site portfolio", category: "Compétences", priority: P[0], budget: 150000, paid: 0, status: "Planifié", targetDate: day(-1, 31), notes: "Avant la saison des mariages." },
    { order: 3, name: "Drone", category: "Loisirs", priority: P[3], budget: 900000, paid: null, status: "Idée", targetDate: "", notes: "Seulement si deux clients le demandent." },
    { order: 4, name: "Formation à l'étalonnage", category: "Compétences", priority: P[1], budget: 120000, paid: 120000, status: "Acquis", targetDate: day(5, 20), notes: "", closedAt: day(5, 20) },
  ];
  const tasks: Task[] = [
    { order: 1, title: "Déclaration fiscale annuelle", owner: "Moi", priority: P[0], cost: null, dueDate: inDays(25), status: "À faire", notes: "Rassembler les factures de l'année." },
    { order: 2, title: "Relancer l'Hôtel Les Cocotiers pour le solde", owner: "Moi", priority: P[0], cost: null, dueDate: inDays(-2), status: "À faire", notes: "" },
    { order: 3, title: "Contrat type de cession de droits", owner: "Moi", priority: P[1], cost: 50000, dueDate: inDays(60), status: "En cours", notes: "Le faire relire par un juriste." },
    { order: 4, title: "Renouveler le passeport", owner: "Moi", priority: P[1], cost: 50000, dueDate: inDays(120), status: "À faire", notes: "Avant le voyage à Dakar." },
    { order: 5, title: "Envoyer les factures du trimestre", owner: "Moi", priority: P[1], cost: null, dueDate: day(1, 30), status: "Fait", notes: "", closedAt: day(1, 28) },
    { order: 6, title: "Ouvrir le compte pro séparé", owner: "Moi", priority: P[1], cost: null, dueDate: day(11, 20), status: "Fait", notes: "", closedAt: day(11, 18) },
  ];
  const wishlist: WishItem[] = [
    { order: 1, name: "Cartes mémoire 128 Go (lot de 2)", category: "Électronique", status: "À acheter", priority: "Haute", price: 42, currency: "EUR", url: "https://example.com/cartes-memoire", notes: "", addedAt: day(0, 3) },
    { order: 2, name: "Sac à dos photo", category: "Bureau", status: "À acheter", priority: "Moyenne", price: 55000, currency: "XOF", url: "", notes: "", addedAt: day(1, 10) },
    { order: 3, name: "Livre : la lumière en portrait", category: "Livres", status: "Acheté", priority: "Basse", price: 18, currency: "EUR", url: "", notes: "", addedAt: day(4, 2) },
    { order: 4, name: "Trépied vidéo fluide", category: "Électronique", status: "À acheter", priority: "Moyenne", price: 95000, currency: "XOF", url: "", notes: "Au-delà de 50 000 : à passer en Projets.", addedAt: day(0, 1) },
  ];

  const ordered = movements.sort((a, b) => a.date.localeCompare(b.date)).map((m, i) => ({ ...m, order: i + 1 }));
  return { app: "axta", version: 3, settings, accounts, movements: ordered, snapshots, incomes, debts, vaults, charges, projects, tasks, wishlist };
}
