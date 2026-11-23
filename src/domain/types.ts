/** Modèle de données axta v2 (générique, aucune donnée personnelle). */

export type Currency = "XOF" | "EUR" | "USD";
export type Phase = 1 | 2;

export const PRIORITIES = [
  "Urgent et important",
  "Important, pas urgent",
  "Urgent, pas important",
  "Ni urgent ni important",
] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Parts d'un salaire (somme = 1). */
export interface SalaryRule { savings: number; debts: number; car: number; living: number }
/** Parts d'un revenu variable (somme = 1). */
export interface VariableRule { savings: number; debts: number; car: number; projects: number; fun: number }

export type AiScope = "accounts" | "movements" | "debts" | "incomes" | "budget" | "vaults" | "projects" | "agenda" | "wishlist";
export interface AiSkill { id: string; name: string; prompt: string }

export interface Settings {
  id: "settings";
  name: string;
  /** Hash SHA-256 du code de déverrouillage local (facultatif). */
  pinHash?: string;
  baseCurrency: Currency;
  rates: { EUR: number; USD: number };
  salary: number;
  phase: Phase;
  /** Conservé pour compatibilité ; plus affiché (pas d'échéance imposée aux dettes). */
  debtFreeTarget: string; // ISO date
  /** Taux mis à jour automatiquement (USD ; l'EUR est à parité fixe). */
  ratesAuto: boolean;
  ratesUpdatedAt: string; // ISO datetime, "" si jamais
  ratesSource: string;
  lastBackupAt: string; // ISO datetime, "" si jamais
  /** Rappels via notifications du navigateur. */
  notify: boolean;
  /** Suggestions reportées : id → date ISO jusqu'à laquelle elle reste masquée. */
  dismissed: Record<string, string>;
  /** Champs réservés à l'espace IA (absent de cette version de démonstration), gardés pour la compatibilité des sauvegardes. */
  aiInstructions: string;
  aiMemory: { id: string; text: string; createdAt: string }[];
  aiSkills: AiSkill[];
  aiScopes: Record<AiScope, boolean>;
  /** Règles personnelles de catégorisation des mouvements importés (texte contenu → catégorie). */
  moveRules: { id: string; match: string; category: MoveCategory; dir?: "in" | "out" }[];
  /** Sauvegarde automatique dans un dossier : fréquence en jours (0 = désactivée) et date de la dernière. */
  autoBackupDays: number;
  lastAutoBackupAt: string;
  funThreshold: number;
  rules: {
    salary: Record<Phase, SalaryRule>;
    variable: Record<Phase, VariableRule>;
  };
  createdAt: string;
}

interface Row { id?: number; order: number }

export interface Income extends Row {
  date: string;
  kind: "Freelance" | "Prime" | "Commission" | "Vente" | "Autre";
  client: string;
  project: string;
  status: "Devis envoyé" | "En cours" | "Payé" | "Annulé";
  currency: Currency;
  amount: number | null;
  deposit: number | null;
  balance: number | null;
  /** false = encaissement antérieur aux règles : rien à répartir. */
  applyRules: boolean;
  notes: string;
}

export interface Debt extends Row {
  creditor: string;
  type: "Frais de scolarité" | "Banque" | "Dette personnelle" | "Services" | "Crédit" | "Autre";
  total: number;
  paid: number;
  dueDate: string;
  notes: string;
  /** Compte lié (ex. découvert bancaire) : son solde négatif n'est pas recompté dans la valeur nette. */
  accountId?: number | null;
  /** Date (ISO) à laquelle la dette a été soldée ; posée automatiquement. */
  closedAt?: string;
}

export interface Vault extends Row {
  name: string;
  target: number;
  targetDate: string;
  balance: number;
  notes: string;
}

export const FREQUENCIES = {
  "Hebdomadaire": 52 / 12,
  "Toutes les 2 semaines": 26 / 12,
  "Mensuel": 1,
  "Trimestriel": 1 / 3,
  "Tous les 4 mois": 1 / 4,
  "Annuel": 1 / 12,
} as const;
export type Frequency = keyof typeof FREQUENCIES;

export interface Charge extends Row {
  label: string;
  category: string;
  frequency: Frequency;
  amount: number;
  status: "Actif" | "Prévu" | "À réduire" | "À résilier";
  notes: string;
}

export interface Project extends Row {
  name: string;
  category: string;
  priority: Priority | "";
  budget: number | null;
  paid: number | null;
  status: "Idée" | "Planifié" | "En cours" | "Acquis" | "Annulé";
  targetDate: string;
  notes: string;
  closedAt?: string;
}

export interface Task extends Row {
  title: string;
  owner: string;
  priority: Priority | "";
  cost: number | null;
  dueDate: string;
  status: "À faire" | "En cours" | "Fait" | "Bloqué";
  notes: string;
  closedAt?: string;
}

export interface WishItem extends Row {
  name: string;
  category: string;
  status: "À acheter" | "Acheté" | "Abandonné";
  priority: "Haute" | "Moyenne" | "Basse";
  price: number | null;
  currency: Currency;
  url: string;
  notes: string;
  addedAt: string;
}

export interface Account extends Row {
  name: string;
  type: "Banque" | "Mobile money" | "Épargne" | "Crypto" | "Espèces" | "Autre";
  institution: string;
  currency: Currency;
  balance: number | null;
  updatedAt: string; // date du dernier relevé (ISO)
  notes: string;
}

/**
 * Catégories de mouvements. « Transfert », « Emprunt » et « À classer » ne comptent ni comme gain ni comme dépense.
 * « À classer » reçoit les dépôts d'espèces et les entrées sans règle : de l'argent retiré puis redéposé n'est pas un revenu.
 */
export const MOVE_CATEGORIES = [
  "Revenus", "Salaire", "Famille (reçu)", "Autre entrée", "À classer",
  "Logement", "Électricité et eau", "Nourriture", "Courses et achats", "Transport", "Santé", "Enfants", "Famille et dons",
  "Abonnements et téléphone", "Loisirs", "Frais bancaires et MoMo", "Retraits d'espèces", "Autre dépense",
  "Remboursement de dette", "Épargne", "Emprunt", "Transfert",
] as const;
export type MoveCategory = (typeof MOVE_CATEGORIES)[number];
/** Ni gain ni dépense. */
export const NEUTRAL_MOVES: readonly MoveCategory[] = ["Transfert", "Emprunt", "À classer"];
/** Entrées comptées comme revenus (un montant positif dans une catégorie de dépense est un remboursement : il réduit la dépense). */
export const INCOME_MOVES: readonly MoveCategory[] = ["Revenus", "Salaire", "Famille (reçu)", "Autre entrée"];
/** Hors revenus et dépenses : neutres + dettes et épargne (comptées à part). */
export const NON_FLOW_MOVES: readonly MoveCategory[] = [...NEUTRAL_MOVES, "Remboursement de dette", "Épargne"];

export interface Movement extends Row {
  date: string;            // ISO yyyy-mm-dd
  label: string;
  amount: number;          // signé : + entrée, − sortie (devise du mouvement)
  currency: Currency;
  category: MoveCategory;
  accountId: number | null;
  debtId: number | null;
  vaultId: number | null;
  counterparty: string;
  source: "manuel" | "momo" | "ia" | "csv";
  ref: string;             // identifiant de transaction (dédoublonnage)
  notes: string;
}

/** Photo du mois : état figé le 1er (ou à la première ouverture du mois). */
export interface Snapshot {
  id?: number;
  month: string;           // yyyy-mm
  takenAt: string;
  accounts: number;        // total des comptes (CFA)
  savings: number;         // total des coffres
  debts: number;           // reste dû
  netWorth: number;        // comptes + coffres − dettes (comptes « Épargne » exclus pour ne pas compter deux fois)
  charges: number;         // charges mensuelles
  debtCount: number;
  perDebt: Record<string, number>;
  perVault: Record<string, number>;
  /** Ex. « Reconstituée à partir du relevé MoMo (estimation) ». */
  note?: string;
}

export type ListName = "accounts" | "movements" | "incomes" | "debts" | "vaults" | "charges" | "projects" | "tasks" | "wishlist";
export interface ListTypes {
  accounts: Account; movements: Movement; incomes: Income; debts: Debt; vaults: Vault; charges: Charge; projects: Project; tasks: Task; wishlist: WishItem;
}

export interface Backup {
  app: "axta";
  version: 2 | 3;
  /** Version de l'appli qui a produit la sauvegarde. */
  appVersion?: string;
  exportedAt: string;
  settings: Settings;
  accounts: Account[];
  movements: Movement[];
  snapshots: Snapshot[];
  incomes: Income[]; debts: Debt[]; vaults: Vault[]; charges: Charge[];
  projects: Project[]; tasks: Task[]; wishlist: WishItem[];
}
