import type { Backup, Settings } from "./types";
import { PRIORITIES as P } from "./types";
import { iso } from "./money";

export function defaultSettings(name = ""): Settings {
  return {
    id: "settings",
    name,
    baseCurrency: "XOF",
    rates: { EUR: 655.957, USD: 570 },
    salary: 0,
    phase: 1,
    debtFreeTarget: `${new Date().getFullYear() + 1}-12-31`,
    funThreshold: 200000,
    ratesAuto: true,
    ratesUpdatedAt: "",
    ratesSource: "",
    lastBackupAt: "",
    notify: false,
    dismissed: {},
    aiInstructions: "",
    aiMemory: [],
    aiSkills: [],
    moveRules: [],
    autoBackupDays: 7,
    lastAutoBackupAt: "",
    aiScopes: { accounts: true, movements: true, debts: true, incomes: true, budget: true, vaults: true, projects: true, agenda: true, wishlist: true },
    rules: {
      salary: {
        1: { savings: 0.1, debts: 0.1, car: 0, living: 0.8 },
        2: { savings: 0.1, debts: 0, car: 0.1, living: 0.8 },
      },
      variable: {
        1: { savings: 0.2, debts: 0.55, car: 0, projects: 0.15, fun: 0.1 },
        2: { savings: 0.35, debts: 0, car: 0.4, projects: 0.15, fun: 0.1 },
      },
    },
    createdAt: new Date().toISOString(),
  };
}

/** Petit jeu 100 % fictif et stable, utilisé par les tests. La démo de l'appli est dans demo.ts. */
export function sampleData(): Omit<Backup, "exportedAt"> {
  const y = new Date().getFullYear();
  const m = (k: number, d = 15) => { const x = new Date(y, new Date().getMonth() - k, d); return iso(x); };
  const settings = { ...defaultSettings("Alex Démo"), salary: 350000 };
  return {
    app: "axta",
    version: 3,
    settings,
    snapshots: [],
    movements: [
      { order: 1, date: m(2, 25), label: "Salaire", amount: 350000, currency: "XOF", category: "Salaire", accountId: null, debtId: null, vaultId: null, counterparty: "Employeur", source: "manuel", ref: "", notes: "" },
      { order: 2, date: m(2, 26), label: "Loyer", amount: -60000, currency: "XOF", category: "Logement", accountId: null, debtId: null, vaultId: null, counterparty: "Propriétaire", source: "manuel", ref: "", notes: "" },
      { order: 3, date: m(2, 27), label: "Courses du mois", amount: -55000, currency: "XOF", category: "Nourriture", accountId: null, debtId: null, vaultId: null, counterparty: "", source: "manuel", ref: "", notes: "" },
      { order: 4, date: m(1, 25), label: "Salaire", amount: 350000, currency: "XOF", category: "Salaire", accountId: null, debtId: null, vaultId: null, counterparty: "Employeur", source: "manuel", ref: "", notes: "" },
      { order: 5, date: m(1, 20), label: "Mission ONG Horizon", amount: 393574, currency: "XOF", category: "Revenus", accountId: null, debtId: null, vaultId: null, counterparty: "ONG Horizon", source: "manuel", ref: "", notes: "" },
      { order: 6, date: m(1, 26), label: "Versement école", amount: -100000, currency: "XOF", category: "Remboursement de dette", accountId: null, debtId: 3, vaultId: null, counterparty: "École", source: "manuel", ref: "", notes: "" },
      { order: 7, date: m(1, 27), label: "Fonds d'urgence", amount: -45000, currency: "XOF", category: "Épargne", accountId: null, debtId: null, vaultId: 1, counterparty: "", source: "manuel", ref: "", notes: "" },
      { order: 8, date: m(1, 28), label: "Électricité", amount: -21000, currency: "XOF", category: "Électricité et eau", accountId: null, debtId: null, vaultId: null, counterparty: "", source: "manuel", ref: "", notes: "" },
      { order: 9, date: m(0, 5), label: "Acompte Studio Lagune", amount: 150000, currency: "XOF", category: "Revenus", accountId: null, debtId: null, vaultId: null, counterparty: "Studio Lagune", source: "manuel", ref: "", notes: "" },
      { order: 10, date: m(0, 6), label: "Retrait", amount: -20000, currency: "XOF", category: "Retraits d'espèces", accountId: null, debtId: null, vaultId: null, counterparty: "", source: "manuel", ref: "", notes: "" },
    ],
    accounts: [
      { order: 1, name: "Compte courant", type: "Banque", institution: "Banque A", currency: "XOF", balance: 85000, updatedAt: m(0, 1), notes: "" },
      { order: 2, name: "Mobile money", type: "Mobile money", institution: "Opérateur", currency: "XOF", balance: 12500, updatedAt: m(0, 1), notes: "" },
      { order: 3, name: "Épargne en ligne", type: "Épargne", institution: "Appli d'épargne", currency: "XOF", balance: 165000, updatedAt: m(0, 1), notes: "Somme des coffres." },
    ],
    incomes: [
      { order: 1, date: m(0, 5), kind: "Freelance", client: "Studio Lagune", project: "Refonte site vitrine", status: "En cours", currency: "XOF", amount: 450000, deposit: 150000, balance: null, applyRules: true, notes: "Solde à la livraison." },
      { order: 2, date: m(1, 20), kind: "Freelance", client: "ONG Horizon", project: "Rapport annuel", status: "Payé", currency: "EUR", amount: 600, deposit: 393574, balance: null, applyRules: true, notes: "" },
      { order: 3, date: m(2, 10), kind: "Prime", client: "Employeur", project: "Prime de projet", status: "Payé", currency: "XOF", amount: 100000, deposit: null, balance: 100000, applyRules: true, notes: "" },
      { order: 4, date: m(4, 2), kind: "Vente", client: "Marketplace", project: "Vente ancien écran", status: "Payé", currency: "XOF", amount: 60000, deposit: null, balance: 60000, applyRules: true, notes: "" },
    ],
    debts: [
      { order: 1, creditor: "Opérateur mobile (micro-crédit)", type: "Banque", total: 25000, paid: 0, dueDate: m(-1, 28), notes: "Pénalité en cas de retard." },
      { order: 2, creditor: "Ami — prêt dépannage", type: "Dette personnelle", total: 40000, paid: 10000, dueDate: "", notes: "" },
      { order: 3, creditor: "École de formation", type: "Frais de scolarité", total: 800000, paid: 250000, dueDate: "", notes: "Débloque le diplôme." },
    ],
    vaults: [
      { order: 1, name: "Fonds d'urgence", target: 300000, targetDate: `${y + 1}-06-30`, balance: 45000, notes: "Uniquement pour une vraie urgence." },
      { order: 2, name: "Éducation des enfants", target: 1000000, targetDate: `${y + 2}-12-31`, balance: 120000, notes: "" },
      { order: 3, name: "Voyage en famille", target: 400000, targetDate: `${y + 1}-12-15`, balance: 0, notes: "" },
    ],
    charges: [
      { order: 1, label: "Loyer", category: "Logement", frequency: "Mensuel", amount: 60000, status: "Actif", notes: "" },
      { order: 2, label: "Électricité", category: "Logement", frequency: "Mensuel", amount: 20000, status: "Actif", notes: "" },
      { order: 3, label: "Internet", category: "Abonnements", frequency: "Mensuel", amount: 15000, status: "Actif", notes: "" },
      { order: 4, label: "Streaming", category: "Abonnements", frequency: "Mensuel", amount: 5000, status: "À réduire", notes: "" },
      { order: 5, label: "Courses", category: "Nourriture", frequency: "Hebdomadaire", amount: 15000, status: "Actif", notes: "" },
      { order: 6, label: "Transport", category: "Transport", frequency: "Hebdomadaire", amount: 4000, status: "Actif", notes: "" },
      { order: 7, label: "Forfait téléphone", category: "Abonnements", frequency: "Mensuel", amount: 5000, status: "Actif", notes: "" },
    ],
    projects: [
      { order: 1, name: "Chaise de bureau ergonomique", category: "Bureau", priority: P[0], budget: 60000, paid: 0, status: "Planifié", targetDate: `${y + 1}-01-31`, notes: "" },
      { order: 2, name: "Formation en ligne (UX)", category: "Compétences", priority: P[1], budget: 45000, paid: 15000, status: "En cours", targetDate: "", notes: "" },
      { order: 3, name: "Étagères", category: "Maison", priority: P[3], budget: null, paid: null, status: "Idée", targetDate: "", notes: "Prix à demander." },
    ],
    tasks: [
      { order: 1, title: "Renouveler la carte d'identité", owner: "Moi", priority: P[0], cost: 7000, dueDate: m(-1, 10), status: "À faire", notes: "" },
      { order: 2, title: "Souscrire une assurance santé", owner: "Famille", priority: P[1], cost: null, dueDate: "", status: "À faire", notes: "" },
      { order: 3, title: "Passer le permis de conduire", owner: "Moi", priority: P[1], cost: 150000, dueDate: "", status: "À faire", notes: "" },
    ],
    wishlist: [
      { order: 1, name: "Casque à réduction de bruit", category: "Électronique", status: "À acheter", priority: "Moyenne", price: 79.99, currency: "EUR", url: "https://example.com/casque", notes: "", addedAt: m(0, 1) },
      { order: 2, name: "Livre : design de produit", category: "Livres", status: "Acheté", priority: "Basse", price: 15, currency: "EUR", url: "", notes: "", addedAt: m(2, 1) },
    ],
  };
}
