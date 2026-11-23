import { LayoutDashboard, Briefcase, Receipt, PiggyBank, Wallet, ShoppingBag, ListChecks, FileCheck2, Settings2, CircleHelp, CalendarDays, Landmark, ChartPie, ArrowLeftRight, type LucideIcon } from "lucide-react";

export interface NavItem { path: string; label: string; icon: LucideIcon; group: "Argent" | "Vie" | "foot" }

export const NAV: NavItem[] = [
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard, group: "Argent" },
  { path: "/rapports", label: "Rapports", icon: ChartPie, group: "Argent" },
  { path: "/mouvements", label: "Mouvements", icon: ArrowLeftRight, group: "Argent" },
  { path: "/comptes", label: "Comptes", icon: Landmark, group: "Argent" },
  { path: "/revenus", label: "Revenus", icon: Briefcase, group: "Argent" },
  { path: "/dettes", label: "Dettes", icon: Receipt, group: "Argent" },
  { path: "/epargne", label: "Épargne", icon: PiggyBank, group: "Argent" },
  { path: "/budget", label: "Budget", icon: Wallet, group: "Argent" },
  { path: "/agenda", label: "Agenda", icon: CalendarDays, group: "Vie" },
  { path: "/projets", label: "Projets", icon: ListChecks, group: "Vie" },
  { path: "/achats", label: "Liste d'achats", icon: ShoppingBag, group: "Vie" },
  { path: "/demarches", label: "Démarches", icon: FileCheck2, group: "Vie" },
  { path: "/parametres", label: "Paramètres", icon: Settings2, group: "foot" },
  { path: "/aide", label: "Mode d'emploi", icon: CircleHelp, group: "foot" },
];
