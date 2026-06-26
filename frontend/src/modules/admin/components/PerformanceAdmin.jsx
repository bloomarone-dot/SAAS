import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { apiFetch } from "@/config/http";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function exportCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function PerformanceAdmin({ type = "server", onMessage }) {
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const isCashier = type === "cashier";
  const rows = data?.ranking ?? [];
  const kpis = data?.kpis ?? {};

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch(`/api/v1/dashboard/${isCashier ? "cashier" : "server"}-performance?period=${period}`, {
      fallback: "Impossible de charger les performances.",
    })
      .then((payload) => {
        if (mounted) setData(payload);
      })
      .catch((error) => onMessage?.(error.message))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isCashier, onMessage, period]);

  const chartRows = useMemo(() => rows.slice(0, 8), [rows]);
  const maxValue = Math.max(...chartRows.map((row) => Number(isCashier ? row.total_collected : row.revenue) || 0), 1);

  function downloadCsv() {
    const header = isCashier
      ? ["Rang", "Caissier", "Total encaissé", "Paiements", "Espèces", "Mobile Money", "Carte", "Reçus imprimés", "Ticket moyen"]
      : ["Rang", "Serveur", "CA", "Commandes prises", "Commandes servies", "Clients", "Tables", "Annulations", "Panier moyen"];
    const body = rows.map((row) => isCashier
      ? [row.rank, row.name, row.total_collected, row.payments_validated, row.cash_payments, row.mobile_money_payments, row.card_payments, row.printed_receipts, row.average_ticket]
      : [row.rank, row.name, row.revenue, row.orders_taken, row.orders_served, row.clients_served, row.tables_count, row.cancelled_orders, row.average_ticket]);
    exportCsv(`${isCashier ? "performance-caissiers" : "performance-serveurs"}-${period}.csv`, [header, ...body]);
    onMessage?.("Export CSV généré.");
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-[var(--dashboard-primary)]">Performance</p>
          <h1 className="mt-1 text-3xl font-black text-[#070528]">{isCashier ? "Performance des caissiers" : "Performance des serveurs"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={period} onChange={(event) => setPeriod(event.target.value)} className="form-control h-11 w-40">
            <option value="week">Semaine</option>
            <option value="month">Mois</option>
          </select>
          <button type="button" onClick={downloadCsv} className="lte-btn lte-btn-primary">
            <DashboardIcon name="Download" size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label={isCashier ? "Total encaissé" : "Chiffre d'affaires"} value={money(isCashier ? kpis.total_collected : kpis.revenue)} icon="Wallet" />
        <Kpi label={isCashier ? "Paiements validés" : "Commandes prises"} value={Number(isCashier ? kpis.payments_validated : kpis.orders_taken || 0).toLocaleString("fr-FR")} icon="ClipboardList" />
        <Kpi label="Panier moyen" value={money(kpis.average_ticket)} icon="ReceiptText" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-[#070528]">Évolution comparative</h2>
          <div className="mt-5 space-y-3">
            {chartRows.map((row) => {
              const value = Number(isCashier ? row.total_collected : row.revenue) || 0;
              return (
                <div key={row.cashier_id || row.server_id}>
                  <div className="mb-1 flex justify-between text-xs font-black text-slate-600">
                    <span>{row.rank}. {row.name}</span>
                    <span>{money(value)}</span>
                  </div>
                  <div className="h-3 rounded bg-slate-100">
                    <div className="h-full rounded bg-[var(--dashboard-primary)]" style={{ width: `${Math.max(4, (value / maxValue) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {!chartRows.length && <p className="text-sm font-semibold text-slate-500">Aucune donnée sur cette période.</p>}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
          <table className="lte-table min-w-[900px]">
            <thead>
              <tr>
                <th>Rang</th>
                <th>{isCashier ? "Caissier" : "Serveur"}</th>
                <th>{isCashier ? "Total encaissé" : "CA généré"}</th>
                <th>{isCashier ? "Paiements" : "Commandes prises"}</th>
                <th>{isCashier ? "Mobile Money" : "Commandes servies"}</th>
                <th>{isCashier ? "Espèces" : "Clients"}</th>
                <th>{isCashier ? "Reçus" : "Tables"}</th>
                <th>Comparaison</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cashier_id || row.server_id}>
                  <td className="font-black">#{row.rank}</td>
                  <td className="font-black text-[#070528]">{row.name}</td>
                  <td>{money(isCashier ? row.total_collected : row.revenue)}</td>
                  <td>{isCashier ? row.payments_validated : row.orders_taken}</td>
                  <td>{isCashier ? money(row.mobile_money_payments) : row.orders_served}</td>
                  <td>{isCashier ? money(row.cash_payments) : row.clients_served}</td>
                  <td>{isCashier ? row.printed_receipts : row.tables_count}</td>
                  <td className="text-xs font-black text-slate-500">
                    {isCashier ? row.collected_variation : row.revenue_variation}
                    {typeof (isCashier ? row.collected_variation : row.revenue_variation) === "number" ? "%" : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="p-10 text-center text-sm font-semibold text-slate-500">{loading ? "Chargement..." : "Aucune performance trouvée."}</div>}
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, icon }) {
  return (
    <div className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase text-slate-400">{label}</p>
        <DashboardIcon name={icon} size={18} className="text-[var(--dashboard-primary)]" />
      </div>
      <p className="mt-3 text-2xl font-black text-[#070528]">{value}</p>
    </div>
  );
}
