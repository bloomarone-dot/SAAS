import {
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  CreditCard,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { money } from "../shared/format";
import { Panel, Stat } from "../shared/ui";

const sections = [
  ["accounts", "Plan comptable", BookOpen],
  ["journals", "Journaux", ReceiptText],
  ["entries", "Écritures", Calculator],
  ["expenses", "Dépenses", Wallet],
  ["encaissements", "Encaissements", CreditCard],
  ["revenues", "Recettes manuelles", CreditCard],
  ["payments", "Paiements", CreditCard],
  ["cash", "Caisses", Wallet],
  ["banks", "Banques", Landmark],
  ["statements", "États financiers", Building2],
  ["food-cost", "Coût matière", BarChart3],
];

export function Dashboard({ summary, entryTotals, onNavigate }) {
  const gap = Number(entryTotals.debit || 0) - Number(entryTotals.credit || 0);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Stat label="Recettes" value={money(summary?.revenue)} />
        <Stat label="Dépenses" value={money(summary?.expenses)} />
        <Stat label="Solde caisse" value={money(summary?.cash_balance)} />
        <Stat label="Solde banque" value={money(summary?.bank_balance)} />
        <Stat label="Résultat" value={money(summary?.net_profit)} />
      </div>

      <Panel
        title="Accès rapide"
        description="Ouvrez une section comptable sans utiliser le menu latéral."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sections.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate?.(key)}
              className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-black text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <Icon size={16} className="shrink-0 text-slate-500" />
              {label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Contrôle des écritures"
        description="Vérifiez rapidement l'équilibre entre les débits et les crédits saisis."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Débits écritures" value={money(entryTotals.debit)} />
          <Stat label="Crédits écritures" value={money(entryTotals.credit)} />
          <Stat label="Écart" value={money(gap)} />
        </div>
      </Panel>
    </section>
  );
}
