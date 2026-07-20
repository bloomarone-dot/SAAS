import {
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  CalendarClock,
  CheckCheck,
  CreditCard,
  Percent,
  ReceiptText,
  TrendingDown,
  Wallet,
} from "lucide-react";

export const tabs = [
  ["dashboard", "Tableau de bord", BarChart3],
  ["accounts", "Plan comptable", BookOpen],
  ["journals", "Journaux", ReceiptText],
  ["entries", "Écritures", Calculator],
  ["expenses", "Sorties d'argent", Wallet],
  ["expense-analytics", "Où part l'argent ?", TrendingDown],
  ["encaissements", "Entrées d'argent", CreditCard],
  ["revenues", "Recettes manuelles", CreditCard],
  ["payments", "Paiements", CreditCard],
  ["cash", "Ma caisse", Wallet],
  ["statements", "États financiers", Building2],
  ["food-cost", "Coût matière (%)", Percent],
  ["echeancier", "Échéancier", CalendarClock],
  ["rapprochement", "Rapprochement", CheckCheck],
];

export const accountTypes = [
  ["asset", "Actif"],
  ["liability", "Passif"],
  ["equity", "Capitaux propres"],
  ["income", "Produit"],
  ["expense", "Charge"],
];

export const journalTypes = [
  ["cash", "Caisse"],
  ["bank", "Banque"],
  ["purchase", "Achats"],
  ["sale", "Ventes"],
  ["general", "OD"],
  ["stock", "Stock"],
  ["adjustment", "Ajustement"],
];

const TAB_KEYS = tabs.map(([key]) => key);

export function resolveAccountingTab(mode) {
  if (TAB_KEYS.includes(mode)) return mode;
  const aliases = {
    comptabilite: "dashboard",
    "accounting-dashboard": "dashboard",
    "accounting-entries": "entries",
    "accounting-expenses": "expenses",
    "accounting-revenues": "revenues",
    "accounting-payments": "payments",
    revenue: "revenues",
    "received-payments": "payments",
    "cash-collections": "encaissements",
    banks: "banks",
    "stock-valuation": "statements",
    "financial-report": "statements",
    income: "statements",
    cashflow: "statements",
    balance: "statements",
    ledger: "statements",
    margins: "statements",
    profits: "statements",
    "monthly-result": "statements",
    "counted-damages": "expenses",
    "expense-analytics": "expense-analytics",
    "spending-analytics": "expense-analytics",
  };
  return aliases[mode] || "dashboard";
}
