import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { apiFetch } from "@/config/http";
import { AdminCard, AdminKpis, AdminPage, DataTable, SecondaryAction } from "./AdminUi";

const reportTabs = [
  { key: "reports", label: "Vue rapports", icon: "BarChart3" },
  { key: "sales-report", label: "Rapports ventes", icon: "TrendingUp" },
  { key: "profit-report", label: "Rapports bénéfices", icon: "Wallet" },
  { key: "server-report", label: "Rapports serveurs", icon: "Users" },
];

const periodOptions = [
  ["week", "Semaine"],
  ["month", "Mois"],
];

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function percent(value) {
  return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
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

function resolveReportView(view) {
  return reportTabs.some((tab) => tab.key === view) ? view : "reports";
}

export function AdminReports({ initialView = "reports", onNavigate, onMessage }) {
  const [view, setView] = useState(resolveReportView(initialView));
  const [period, setPeriod] = useState("week");
  const [analytics, setAnalytics] = useState(null);
  const [serverPerformance, setServerPerformance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setView(resolveReportView(initialView));
  }, [initialView]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    Promise.all([
      apiFetch("/api/v1/dashboard/analytics", { fallback: "Impossible de charger les rapports." }),
      apiFetch(`/api/v1/dashboard/server-performance?period=${period}`, { fallback: "Impossible de charger les rapports serveurs." }),
    ])
      .then(([analyticsData, serverData]) => {
        if (!mounted) return;
        setAnalytics(analyticsData);
        setServerPerformance(serverData);
      })
      .catch((error) => onMessage?.(error.message))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [onMessage, period]);

  const kpis = analytics?.kpis ?? {};
  const topProducts = analytics?.top_products ?? [];
  const paymentMethods = analytics?.payment_methods ?? [];
  const branches = analytics?.branches ?? [];
  const employees = analytics?.employee_performance ?? [];
  const serverRows = serverPerformance?.ranking ?? [];

  const currentRows = useMemo(() => {
    if (view === "sales-report") {
      return topProducts.map((row) => [
        row.name || row.label || "Produit",
        Number(row.quantity || row.orders_count || 0).toLocaleString("fr-FR"),
        money(row.revenue),
        money(row.profit),
      ]);
    }
    if (view === "profit-report") {
      return branches.map((row) => [
        row.name || "Restaurant principal",
        money(row.revenue),
        money(row.profit),
        percent(row.revenue ? (Number(row.profit || 0) / Number(row.revenue || 1)) * 100 : 0),
      ]);
    }
    if (view === "server-report") {
      return serverRows.map((row) => [
        `#${row.rank}`,
        row.name,
        money(row.revenue),
        Number(row.orders_taken || 0).toLocaleString("fr-FR"),
        Number(row.orders_served || 0).toLocaleString("fr-FR"),
        money(row.average_ticket),
      ]);
    }
    return [
      ["Chiffre d'affaires", money(kpis.revenue), percent(kpis.revenue_variation), "Ventes validées"],
      ["Bénéfice estimé", money(kpis.profit), percent(kpis.margin_rate), "Marge globale"],
      ["Commandes", Number(kpis.orders_count || 0).toLocaleString("fr-FR"), percent(kpis.orders_variation), "Période courante"],
      ["Panier moyen", money(kpis.average_ticket), percent(kpis.average_ticket_variation), "Par commande"],
    ];
  }, [branches, kpis, serverRows, topProducts, view]);

  const tableHead = {
    reports: ["Indicateur", "Valeur", "Variation / taux", "Description"],
    "sales-report": ["Produit", "Quantité", "Chiffre d'affaires", "Bénéfice"],
    "profit-report": ["Branche", "Chiffre d'affaires", "Bénéfice", "Marge"],
    "server-report": ["Rang", "Serveur", "CA généré", "Commandes", "Servies", "Panier moyen"],
  }[view];

  function changeView(nextView) {
    setView(nextView);
    onNavigate?.(nextView);
  }

  function downloadCsv() {
    exportCsv(`${view}-${new Date().toISOString().slice(0, 10)}.csv`, [tableHead, ...currentRows]);
    onMessage?.("Export CSV généré.");
  }

  return (
    <AdminPage
      title={reportTabs.find((tab) => tab.key === view)?.label || "Rapports"}
      action={
        <div className="flex flex-wrap gap-2">
          <select value={period} onChange={(event) => setPeriod(event.target.value)} className="form-control h-10 w-36">
            {periodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <SecondaryAction icon="Download" onClick={downloadCsv}>Exporter CSV</SecondaryAction>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        {reportTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => changeView(tab.key)}
            className={`lte-btn ${view === tab.key ? "lte-btn-primary" : "lte-btn-default"}`}
          >
            <DashboardIcon name={tab.icon} size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <AdminKpis
        items={[
          { label: "Chiffre d'affaires", value: money(kpis.revenue), trend: percent(kpis.revenue_variation), icon: "TrendingUp" },
          { label: "Bénéfice", value: money(kpis.profit), trend: percent(kpis.margin_rate), icon: "Wallet" },
          { label: "Commandes", value: Number(kpis.orders_count || 0).toLocaleString("fr-FR"), trend: percent(kpis.orders_variation), icon: "ClipboardList" },
          { label: "Panier moyen", value: money(kpis.average_ticket), trend: percent(kpis.average_ticket_variation), icon: "ReceiptText" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <AdminCard title={reportTabs.find((tab) => tab.key === view)?.label} icon="BarChart3">
          <DataTable head={tableHead} minWidth={view === "server-report" ? 850 : 720}>
            {currentRows.map((row, index) => (
              <tr key={`${view}-${index}`}>
                {row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex === 0 ? "font-semibold text-slate-900" : undefined}>{cell}</td>)}
              </tr>
            ))}
          </DataTable>
          {!currentRows.length && (
            <div className="p-8 text-center text-sm font-semibold text-slate-500">
              {isLoading ? "Chargement des rapports..." : "Aucune donnée disponible pour ce rapport."}
            </div>
          )}
        </AdminCard>

        <AdminCard title="Moyens de paiement" icon="CreditCard">
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div key={method.method || method.label} className="rounded border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-slate-700">{method.method || method.label || "Paiement"}</span>
                  <span className="font-black text-slate-950">{money(method.amount || method.revenue)}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">{Number(method.count || method.orders_count || 0).toLocaleString("fr-FR")} transaction(s)</p>
              </div>
            ))}
            {!paymentMethods.length && <p className="text-sm font-semibold text-slate-500">Aucun paiement trouvé.</p>}
          </div>
        </AdminCard>
      </div>

      {view === "reports" && (
        <AdminCard title="Performance équipe" icon="Users">
          <DataTable head={["Serveur", "Chiffre d'affaires", "Commandes", "Panier moyen"]} minWidth={720}>
            {employees.map((row) => (
              <tr key={row.server_id || row.name}>
                <td className="font-semibold text-slate-900">{row.name}</td>
                <td>{money(row.revenue)}</td>
                <td>{Number(row.orders || row.orders_taken || 0).toLocaleString("fr-FR")}</td>
                <td>{money(row.average_ticket)}</td>
              </tr>
            ))}
          </DataTable>
          {!employees.length && <div className="p-8 text-center text-sm font-semibold text-slate-500">Aucune performance serveur trouvée.</div>}
        </AdminCard>
      )}
    </AdminPage>
  );
}
