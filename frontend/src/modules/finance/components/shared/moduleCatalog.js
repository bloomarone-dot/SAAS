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

export const ACCOUNTING_MODULE_GROUPS = [
  {
    key: "daily",
    label: "Au quotidien",
    description: "Enregistrez l'argent qui sort et consultez l'argent qui rentre. Pas besoin d'être comptable.",
    modules: [
      {
        key: "expenses",
        label: "Sorties d'argent",
        description: "Transport, livreur, loyer, électricité, fournisseur payé sur place… L'argent est retiré de la caisse.",
        icon: Wallet,
        tone: "bg-rose-50 text-rose-700 border-rose-100",
      },
      {
        key: "encaissements",
        label: "Entrées d'argent",
        description: "Les ventes encaissées : tables, livraisons payées, caisse du jour.",
        icon: CreditCard,
        tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
      },
      {
        key: "cash",
        label: "Ma caisse",
        description: "Combien il reste dans la caisse du restaurant après entrées et sorties.",
        icon: Wallet,
        tone: "bg-orange-50 text-orange-700 border-orange-100",
      },
      {
        key: "expense-analytics",
        label: "Où part l'argent ?",
        description: "Vue simple : transport, achats stock, charges… comparé à la période précédente.",
        icon: TrendingDown,
        tone: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
      },
    ],
  },
  {
    key: "reports",
    label: "Résumés",
    description: "Comprendre si le restaurant gagne ou perd de l'argent sur une période.",
    modules: [
      {
        key: "food-cost",
        label: "Coût des plats",
        description: "Combien coûtent les ingrédients par rapport au prix de vente.",
        icon: Percent,
        tone: "bg-lime-50 text-lime-700 border-lime-100",
      },
      {
        key: "statements",
        label: "Bilan simplifié",
        description: "Total des recettes, total des dépenses et résultat du restaurant.",
        icon: Building2,
        tone: "bg-slate-100 text-slate-800 border-slate-200",
      },
    ],
  },
  {
    key: "expert",
    label: "Comptabilité avancée",
    description: "Réservé aux comptables ou à la clôture officielle (plan comptable, écritures, journaux).",
    modules: [
      {
        key: "accounts",
        label: "Plan comptable",
        description: "Liste technique des comptes utilisés par le logiciel.",
        icon: BookOpen,
        tone: "bg-sky-50 text-sky-700 border-sky-100",
      },
      {
        key: "journals",
        label: "Journaux",
        description: "Registres comptables (caisse, achats, ventes…).",
        icon: ReceiptText,
        tone: "bg-indigo-50 text-indigo-700 border-indigo-100",
      },
      {
        key: "entries",
        label: "Écritures",
        description: "Mouvements comptables détaillés (débit / crédit).",
        icon: Calculator,
        tone: "bg-violet-50 text-violet-700 border-violet-100",
      },
      {
        key: "revenues",
        label: "Recettes manuelles",
        description: "Revenus exceptionnels hors ventes caisse (rare).",
        icon: CreditCard,
        tone: "bg-teal-50 text-teal-700 border-teal-100",
      },
      {
        key: "payments",
        label: "Paiements fournisseurs",
        description: "Règlements de factures fournisseurs déjà enregistrées au stock.",
        icon: CreditCard,
        tone: "bg-amber-50 text-amber-700 border-amber-100",
      },
      {
        key: "echeancier",
        label: "Échéancier",
        description: "Dates prévues pour payer des factures.",
        icon: CalendarClock,
        tone: "bg-cyan-50 text-cyan-700 border-cyan-100",
      },
      {
        key: "rapprochement",
        label: "Contrôle caisse",
        description: "Vérifier que le solde théorique correspond à la caisse réelle.",
        icon: CheckCheck,
        tone: "bg-stone-100 text-stone-800 border-stone-200",
      },
    ],
  },
];

export const ACCOUNTING_TAB_LABELS = Object.fromEntries(
  ACCOUNTING_MODULE_GROUPS.flatMap((group) => group.modules.map((module) => [module.key, module.label])),
);

ACCOUNTING_TAB_LABELS.dashboard = "Tableau de bord";

export function getAccountingModuleMeta(key) {
  for (const group of ACCOUNTING_MODULE_GROUPS) {
    const module = group.modules.find((item) => item.key === key);
    if (module) return { ...module, groupLabel: group.label };
  }
  if (key === "dashboard") {
    return {
      key: "dashboard",
      label: "Tableau de bord",
      description: "Argent entré, argent sorti, solde caisse — en langage simple.",
      icon: BarChart3,
      groupLabel: "Accueil",
    };
  }
  return null;
}
