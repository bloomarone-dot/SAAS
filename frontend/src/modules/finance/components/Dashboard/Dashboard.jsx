import { money } from "../shared/format";
import { Panel, Stat } from "../shared/ui";

export function Dashboard({ summary, entryTotals }) {
  const gap = Number(entryTotals.debit || 0) - Number(entryTotals.credit || 0);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Recettes" value={money(summary?.revenue)} />
        <Stat label="Dépenses" value={money(summary?.expenses)} />
        <Stat label="Solde caisse" value={money(summary?.cash_balance)} />
        <Stat label="Solde banque" value={money(summary?.bank_balance)} />
        <Stat label="Résultat" value={money(summary?.net_profit)} />
      </div>
      <Panel
        title="Contrôle des écritures"
        description="Vérifiez rapidement l'équilibre entre les débits et les crédits saisis."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Débits écritures" value={money(entryTotals.debit)} />
          <Stat label="Crédits écritures" value={money(entryTotals.credit)} />
          <Stat label="Écart" value={money(gap)} />
        </div>
      </Panel>
    </section>
  );
}
