import {
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  CalendarClock,
  CheckCheck,
  CreditCard,
  Landmark,
  Percent,
  ReceiptText,
  Wallet,
} from "lucide-react";

export const tabs = [
  ["dashboard", "Tableau de bord", BarChart3],
  ["accounts", "Plan comptable", BookOpen],
  ["journals", "Journaux", ReceiptText],
  ["entries", "Écritures", Calculator],
  ["expenses", "Dépenses", Wallet],
  ["revenues", "Recettes", CreditCard],
  ["payments", "Paiements", CreditCard],
  ["cash", "Caisses", Wallet],
  ["banks", "Banques", Landmark],
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
    "accounting-dashboard": "dashboard",
    "accounting-entries": "entries",
    "accounting-expenses": "expenses",
    "accounting-revenues": "revenues",
    "accounting-payments": "payments",
    revenue: "revenues",
    "received-payments": "payments",
    "cash-collections": "cash",
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
  };
  return aliases[mode] || "dashboard";
}
