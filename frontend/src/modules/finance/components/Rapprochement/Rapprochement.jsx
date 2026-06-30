import { useEffect, useState } from "react";

import { money } from "../shared/format";
import { Input, Panel, Select, Stat } from "../shared/ui";

export function Rapprochement({ api, accounts, onMessage }) {
  const treasury = (accounts || []).filter((account) =>
    /^5/.test(account.code || ""),
  );
  const [accountId, setAccountId] = useState("");
  const [statement, setStatement] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!accountId && treasury.length) setAccountId(treasury[0].id);
  }, [accounts]);

  async function run() {
    if (!accountId) return;
    try {
      const query = `account_id=${accountId}${statement !== "" ? `&statement_balance=${statement}` : ""}`;
      setReport(
        await api(`/api/v1/finance/reports/bank-reconciliation?${query}`),
      );
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  async function pointer(lineId) {
    try {
      await api(
        `/api/v1/finance/entry-lines/${lineId}/reconcile?reconciled=true`,
        { method: "PATCH" },
      );
      await run();
    } catch (error) {
      onMessage?.(error.message);
    }
  }

  return (
    <section className="space-y-4">
      <Panel
        title="Rapprochement bancaire"
        description="Comparez le solde comptable avec le relevé et pointez les lignes rapprochées."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Select
            label="Compte trésorerie"
            required
            value={accountId}
            onChange={setAccountId}
            options={treasury.map((a) => [a.id, `${a.code} - ${a.name}`])}
          />
          <Input
            label="Solde du relevé"
            type="number"
            value={statement}
            onChange={setStatement}
          />
          <div className="self-end">
            <button
              type="button"
              onClick={run}
              className="lte-btn lte-btn-primary"
            >
              Rapprocher
            </button>
          </div>
        </div>
      </Panel>
      {report && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Solde comptable" value={money(report.book_balance)} />
            <Stat
              label="Solde pointé"
              value={money(report.reconciled_balance)}
            />
            <Stat label="Non pointé" value={money(report.unreconciled_total)} />
            <Stat
              label="Écart vs relevé"
              value={report.gap == null ? "—" : money(report.gap)}
            />
          </div>
          <Panel
            title="Lignes non pointées"
            description={`${(report.unreconciled_lines || []).length.toLocaleString("fr-FR")} ligne(s) à rapprocher`}
          >
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="lte-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>N°</th>
                    <th>Libellé</th>
                    <th>Débit</th>
                    <th>Crédit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(report.unreconciled_lines || []).map((line) => (
                    <tr key={line.line_id}>
                      <td>{String(line.entry_date || "").slice(0, 10)}</td>
                      <td>{line.entry_number}</td>
                      <td>{line.label}</td>
                      <td>{money(line.debit)}</td>
                      <td>{money(line.credit)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => pointer(line.line_id)}
                          className="lte-btn lte-btn-primary lte-btn-sm"
                        >
                          Pointer
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!(report.unreconciled_lines || []).length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-sm font-semibold text-emerald-700"
                      >
                        Tout est pointé.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </section>
  );
}
