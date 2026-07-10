import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { apiFetch } from "@/config/http";
import { AdminFormModal, PageHeader, StatusPill } from "@/modules/admin/components/AdminUi";

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

const TABS = [
  { key: "server", label: "Serveurs", icon: "Users" },
  { key: "cashier", label: "Caissiers", icon: "CreditCard" },
];

function variationLabel(value) {
  if (typeof value !== "number") return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

export function PerformanceAdmin({ initialTab = "server", onMessage }) {
  const [activeTab, setActiveTab] = useState(initialTab === "cashier" ? "cashier" : "server");
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const isCashier = activeTab === "cashier";
  const rows = data?.ranking ?? [];
  const kpis = data?.kpis ?? {};

  useEffect(() => {
    setActiveTab(initialTab === "cashier" ? "cashier" : "server");
  }, [initialTab]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setSelectedRow(null);
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

  const chartRows = useMemo(() => rows.slice(0, 6), [rows]);
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
    <section className="space-y-6">
      <PageHeader
        eyebrow="Performance"
        title="Performances équipe"
        subtitle="Consultez les résultats par serveur ou caissier. Cliquez sur une ligne pour ouvrir la fiche détaillée."
        primaryAction={
          <button type="button" onClick={downloadCsv} className="lte-btn lte-btn-primary">
            <DashboardIcon name="Download" size={16} />
            Export CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black transition ${
                activeTab === tab.key
                  ? "bg-[var(--dashboard-primary)] text-white"
                  : "border border-slate-200 text-slate-600 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
              }`}
            >
              <DashboardIcon name={tab.icon} size={16} />
              {tab.label}
            </button>
          ))}
        </div>
        <select value={period} onChange={(event) => setPeriod(event.target.value)} className="form-control ml-auto h-10 w-40">
          <option value="week">Semaine</option>
          <option value="month">Mois</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label={isCashier ? "Total encaissé" : "Chiffre d'affaires"} value={money(isCashier ? kpis.total_collected : kpis.revenue)} icon="Wallet" />
        <Kpi label={isCashier ? "Paiements validés" : "Commandes prises"} value={Number(isCashier ? kpis.payments_validated : kpis.orders_taken || 0).toLocaleString("fr-FR")} icon="ClipboardList" />
        <Kpi label="Panier moyen" value={money(kpis.average_ticket)} icon="ReceiptText" />
      </div>

      <div className="border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-[var(--dashboard-secondary)]">
            Classement {isCashier ? "caissiers" : "serveurs"}
          </h2>
          <p className="text-sm font-medium text-slate-500">
            {rows.length} collaborateur(s) · cliquez sur une ligne pour la fiche
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="lte-table min-w-[900px]">
            <thead>
              <tr>
                <th>Rang</th>
                <th>{isCashier ? "Caissier" : "Serveur"}</th>
                <th>{isCashier ? "Total encaissé" : "CA généré"}</th>
                <th>{isCashier ? "Paiements" : "Commandes prises"}</th>
                <th>{isCashier ? "Mobile Money" : "Commandes servies"}</th>
                <th>{isCashier ? "Espèces" : "Clients servis"}</th>
                <th>Évolution</th>
                <th className="text-right">Fiche</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowId = row.cashier_id || row.server_id;
                const mainValue = isCashier ? row.total_collected : row.revenue;
                const variation = isCashier ? row.collected_variation : row.revenue_variation;
                return (
                  <tr
                    key={rowId}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedRow(row)}
                  >
                    <td className="font-black text-[var(--dashboard-primary)]">#{row.rank}</td>
                    <td className="font-black text-slate-900">{row.name}</td>
                    <td className="font-black">{money(mainValue)}</td>
                    <td>{isCashier ? row.payments_validated : row.orders_taken}</td>
                    <td>{isCashier ? money(row.mobile_money_payments) : row.orders_served}</td>
                    <td>{isCashier ? money(row.cash_payments) : row.clients_served}</td>
                    <td>
                      <StatusPill tone={typeof variation === "number" && variation >= 0 ? "green" : "orange"}>
                        {variationLabel(variation)}
                      </StatusPill>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRow(row);
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                      >
                        <DashboardIcon name="Eye" size={15} />
                        Détail
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              {loading ? "Chargement..." : "Aucune performance sur cette période."}
            </div>
          )}
        </div>
      </div>

      {chartRows.length > 0 && (
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Comparatif rapide</h2>
          <div className="mt-4 space-y-3">
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
          </div>
        </div>
      )}

      <AdminFormModal
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title={selectedRow ? `Fiche · ${selectedRow.name}` : ""}
        description={isCashier ? "Performance caissier sur la période sélectionnée." : "Performance serveur sur la période sélectionnée."}
        size="lg"
        footer={
          <button type="button" onClick={() => setSelectedRow(null)} className="lte-btn lte-btn-default">
            Fermer
          </button>
        }
      >
        {selectedRow && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--dashboard-primary)] text-xl font-black text-white">
                #{selectedRow.rank}
              </span>
              <div>
                <p className="text-xl font-black text-slate-900">{selectedRow.name}</p>
                <p className="text-sm font-semibold text-slate-500">
                  {isCashier ? "Caissier" : "Serveur"} · {period === "week" ? "Cette semaine" : "Ce mois"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {isCashier ? (
                <>
                  <DetailMetric label="Total encaissé" value={money(selectedRow.total_collected)} highlight />
                  <DetailMetric label="Paiements validés" value={selectedRow.payments_validated} />
                  <DetailMetric label="Espèces" value={money(selectedRow.cash_payments)} />
                  <DetailMetric label="Mobile Money" value={money(selectedRow.mobile_money_payments)} />
                  <DetailMetric label="Carte" value={money(selectedRow.card_payments)} />
                  <DetailMetric label="Reçus imprimés" value={selectedRow.printed_receipts} />
                  <DetailMetric label="Ticket moyen" value={money(selectedRow.average_ticket)} />
                  <DetailMetric label="Évolution encaissements" value={variationLabel(selectedRow.collected_variation)} />
                </>
              ) : (
                <>
                  <DetailMetric label="Chiffre d'affaires" value={money(selectedRow.revenue)} highlight />
                  <DetailMetric label="Commandes prises" value={selectedRow.orders_taken} />
                  <DetailMetric label="Commandes servies" value={selectedRow.orders_served} />
                  <DetailMetric label="Clients servis" value={selectedRow.clients_served} />
                  <DetailMetric label="Tables gérées" value={selectedRow.tables_count} />
                  <DetailMetric label="Annulations" value={selectedRow.cancelled_orders} />
                  <DetailMetric label="Panier moyen" value={money(selectedRow.average_ticket)} />
                  <DetailMetric label="Évolution CA" value={variationLabel(selectedRow.revenue_variation)} />
                </>
              )}
            </div>
          </div>
        )}
      </AdminFormModal>
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
      <p className="mt-3 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function DetailMetric({ label, value, highlight = false }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className={`mt-2 text-lg font-black ${highlight ? "text-[var(--dashboard-primary)]" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
