import { money } from "../shared/format";
import { ExportActions } from "../shared/exports";
import { Panel, Stat } from "../shared/ui";

export function Statements({ data, onExport }) {
  const income = data?.income_statement || {};
  const balance = data?.balance_sheet || {};
  const cashFlow = data?.cash_flow || {};
  const trialBalance = data?.trial_balance || {};
  const exportRows = [
    { section: "Compte de résultat", label: "Produits", amount: money(income.total_products) },
    { section: "Compte de résultat", label: "Charges", amount: money(income.total_charges) },
    { section: "Compte de résultat", label: "Résultat net", amount: money(income.net_result) },
    { section: "Bilan", label: "Total actif", amount: money(balance.total_assets) },
    { section: "Bilan", label: "Total passif", amount: money(balance.total_liabilities) },
    { section: "Flux de trésorerie", label: "Encaissements", amount: money(cashFlow.cash_in) },
    { section: "Flux de trésorerie", label: "Décaissements", amount: money(cashFlow.cash_out) },
    { section: "Flux de trésorerie", label: "Flux net", amount: money(cashFlow.net_cash_flow) },
    { section: "Flux de trésorerie", label: "Solde final", amount: money(cashFlow.final_balance) },
    { section: "Balance générale", label: "Total débit", amount: money(trialBalance.total_debit) },
    { section: "Balance générale", label: "Total crédit", amount: money(trialBalance.total_credit) },
  ];
  const exportColumns = [
    ["section", "Section"],
    ["label", "Indicateur"],
    ["amount", "Montant"],
  ];

  return (
    <section className="space-y-4">
      <Panel
        title="Exports états financiers"
        description="Générez des fichiers exploitables avec les indicateurs financiers consolidés."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-500">
            Export complet du compte de résultat, bilan, flux de trésorerie et
            balance générale.
          </p>
          <ExportActions
            title="États financiers"
            filename="etats-financiers"
            rows={exportRows}
            columns={exportColumns}
            onExport={(format) => onExport?.("financial-statements", format)}
          />
        </div>
      </Panel>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Résultat net" value={money(income.net_result)} />
        <Stat label="Total actif" value={money(balance.total_assets)} />
        <Stat label="Trésorerie finale" value={money(cashFlow.final_balance)} />
        <Stat
          label="Balance équilibrée"
          value={balance.is_balanced ? "Oui" : "Non"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Compte de résultat"
          description="Produits, charges et résultat net sur la période calculée."
        >
          <StatementRows
            rows={[
              ["Produits", money(income.total_products)],
              ["Charges", money(income.total_charges)],
              [
                "Résultat net",
                money(income.net_result),
                income.net_result >= 0 ? "positive" : "negative",
              ],
            ]}
          />
          <StatementDetails title="Détail produits" rows={income.products} />
          <StatementDetails title="Détail charges" rows={income.charges} />
        </Panel>

        <Panel
          title="Bilan"
          description="Synthèse actif, passif et équilibre comptable."
        >
          <StatementRows
            rows={[
              ["Total actif", money(balance.total_assets)],
              ["Total passif", money(balance.total_liabilities)],
              ["Résultat net", money(balance.net_result)],
              [
                "Équilibre",
                balance.is_balanced ? "Bilan équilibré" : "Écart à contrôler",
                balance.is_balanced ? "positive" : "negative",
              ],
            ]}
          />
          <StatementDetails title="Actifs" rows={balance.assets} />
          <StatementDetails title="Passifs" rows={balance.liabilities} />
        </Panel>

        <Panel
          title="Flux de trésorerie"
          description="Encaissements, décaissements et solde final."
        >
          <StatementRows
            rows={[
              ["Solde initial", money(cashFlow.initial_balance)],
              ["Encaissements", money(cashFlow.cash_in), "positive"],
              ["Décaissements", money(cashFlow.cash_out), "negative"],
              [
                "Flux net",
                money(cashFlow.net_cash_flow),
                cashFlow.net_cash_flow >= 0 ? "positive" : "negative",
              ],
              ["Solde final", money(cashFlow.final_balance)],
            ]}
          />
          <StatementDetails title="Mouvements" rows={cashFlow.movements} />
        </Panel>

        <Panel
          title="Balance générale"
          description="Contrôle des totaux débit/crédit par compte."
        >
          <StatementRows
            rows={[
              ["Total débit", money(trialBalance.total_debit)],
              ["Total crédit", money(trialBalance.total_credit)],
              [
                "Écart",
                money(
                  Number(trialBalance.total_debit || 0) -
                    Number(trialBalance.total_credit || 0),
                ),
              ],
            ]}
          />
          <StatementDetails title="Comptes" rows={trialBalance.rows} />
        </Panel>
      </div>
    </section>
  );
}

function StatementRows({ rows }) {
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/50">
      {rows.map(([label, value, tone]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 px-3 py-3 text-sm"
        >
          <span className="font-bold text-slate-600">{label}</span>
          <strong
            className={
              tone === "positive"
                ? "text-emerald-700"
                : tone === "negative"
                  ? "text-red-600"
                  : "text-slate-950"
            }
          >
            {value}
          </strong>
        </div>
      ))}
    </div>
  );
}

function StatementDetails({ title, rows }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
        {title}: aucune ligne.
      </p>
    );
  }
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-black text-slate-700">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="lte-table">
          <tbody>
            {list.map((row, index) => (
              <tr key={row.id || row.code || index}>
                <td className="font-bold text-slate-700">
                  {row.name ||
                    row.label ||
                    row.account_name ||
                    row.code ||
                    `Ligne ${index + 1}`}
                </td>
                <td className="text-right font-black text-slate-950">
                  {money(
                    row.amount ??
                      row.balance ??
                      row.value ??
                      row.debit ??
                      row.credit,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
