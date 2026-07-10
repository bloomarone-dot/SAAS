import { DashboardIcon } from "@/components/dashboard/icons";
import { DashboardSection } from "@/modules/admin/components/AdminUi";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function pct(value) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function toneForComparison(value) {
  if (value == null) return "text-slate-500";
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-600";
  return "text-slate-500";
}

export function CashierReportAnalytics({ report, showNetwork = false }) {
  const analytics = report?.analytics;
  if (!analytics) return null;

  const comparisons = analytics.comparisons ?? {};
  const performanceRows = showNetwork
    ? analytics.restaurant_performance ?? []
    : analytics.branch_performance ?? [];

  return (
    <div className="space-y-5">
      <DashboardSection title="1. Synthèse globale de caisse">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Chiffre d'affaires total" value={money(report.total_collected)} />
          <Metric label="Transactions" value={Number(report.paid_orders_count || 0).toLocaleString("fr-FR")} />
          <Metric label="Ticket moyen" value={money(report.average_ticket)} />
          <Metric label="Restaurants / sites" value={String(analytics.restaurants_count || 1)} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Montant théorique" value={money(analytics.theoretical_amount)} />
          <Metric label="Montant déclaré" value={money(analytics.declared_amount)} />
          <Metric label="Écart global" value={money(analytics.global_variance)} danger={analytics.global_variance !== 0} />
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs font-bold text-slate-600">
          <span>vs hier : <span className={toneForComparison(comparisons.yesterday)}>{pct(comparisons.yesterday)}</span></span>
          <span>vs semaine passée : <span className={toneForComparison(comparisons.last_week)}>{pct(comparisons.last_week)}</span></span>
          <span>vs mois passé : <span className={toneForComparison(comparisons.last_month)}>{pct(comparisons.last_month)}</span></span>
        </div>
      </DashboardSection>

      <DashboardSection title="2. Performance par restaurant / site">
        <PerformanceTable
          rows={performanceRows}
          nameKey={showNetwork ? "restaurant_name" : "branch_name"}
        />
      </DashboardSection>

      <DashboardSection title="3. Répartition des encaissements">
        <PaymentBreakdownTable rows={analytics.payment_breakdown ?? []} />
      </DashboardSection>

      <DashboardSection title="4. Contrôle et rapprochement de caisse">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Théorique attendu" value={money(analytics.theoretical_amount)} />
          <Metric label="Réellement encaissé" value={money(analytics.declared_amount)} />
          <Metric label="Écart constaté" value={money(analytics.variance_amount)} danger={analytics.variance_amount !== 0} />
        </div>
        <VarianceHistory rows={analytics.variance_history ?? []} />
      </DashboardSection>

      <DashboardSection title="5. Analyse des transactions">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Transactions payées" value={Number(report.paid_orders_count || 0).toLocaleString("fr-FR")} />
          <Metric label="Annulations" value={String(analytics.cancelled_transactions || 0)} />
          <Metric label="Remboursements caisse" value={String(analytics.refunded_transactions || 0)} />
        </div>
        <HourlySalesChart rows={analytics.hourly_sales ?? []} />
      </DashboardSection>

      {!showNetwork && (
        <DashboardSection title="6. Suivi des caissiers">
          <CashierPerformanceTable rows={analytics.cashier_performance ?? []} />
        </DashboardSection>
      )}

      <DashboardSection title="7. Alertes et observations">
        <div className="space-y-2">
          {(analytics.alerts ?? []).map((alert) => (
            <div
              key={`${alert.title}-${alert.message}`}
              className={`rounded-lg border px-4 py-3 text-sm ${
                alert.level === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <p className="font-black">{alert.title}</p>
              <p className="mt-1 font-semibold">{alert.message}</p>
            </div>
          ))}
        </div>
      </DashboardSection>
    </div>
  );
}

function Metric({ label, value, danger = false }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-black ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function PerformanceTable({ rows, nameKey }) {
  if (!rows.length) {
    return <p className="text-sm font-semibold text-slate-500">Aucune donnée de performance sur la période.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-black uppercase text-slate-500">
            <th className="py-2 pr-3">Rang</th>
            <th className="py-2 pr-3">Nom</th>
            <th className="py-2 pr-3">CA</th>
            <th className="py-2 pr-3">Transactions</th>
            <th className="py-2 pr-3">Ticket moyen</th>
            <th className="py-2 pr-3">vs hier</th>
            <th className="py-2 pr-3">vs semaine</th>
            <th className="py-2">vs mois</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.rank}-${row[nameKey]}`} className="border-b border-slate-100">
              <td className="py-3 pr-3 font-black text-slate-700">#{row.rank}</td>
              <td className="py-3 pr-3 font-bold text-slate-900">{row[nameKey]}</td>
              <td className="py-3 pr-3 font-semibold">{money(row.revenue)}</td>
              <td className="py-3 pr-3">{row.transactions}</td>
              <td className="py-3 pr-3">{money(row.average_ticket)}</td>
              <td className={`py-3 pr-3 font-bold ${toneForComparison(row.comparison_yesterday)}`}>{pct(row.comparison_yesterday)}</td>
              <td className={`py-3 pr-3 font-bold ${toneForComparison(row.comparison_last_week)}`}>{pct(row.comparison_last_week)}</td>
              <td className={`py-3 font-bold ${toneForComparison(row.comparison_last_month)}`}>{pct(row.comparison_last_month)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentBreakdownTable({ rows }) {
  if (!rows.length) return <p className="text-sm font-semibold text-slate-500">Aucun encaissement.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.method} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-black text-slate-900">{row.method}</p>
            <p className="text-xs font-semibold text-slate-500">{row.percentage}% du total</p>
          </div>
          <p className="text-sm font-black text-emerald-700">{money(row.amount)}</p>
        </div>
      ))}
    </div>
  );
}

function CashierPerformanceTable({ rows }) {
  if (!rows.length) return <p className="text-sm font-semibold text-slate-500">Aucun encaissement caissier sur la période.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-black uppercase text-slate-500">
            <th className="py-2 pr-3">Caissier</th>
            <th className="py-2 pr-3">Site</th>
            <th className="py-2 pr-3">Transactions</th>
            <th className="py-2 pr-3">Encaissé</th>
            <th className="py-2">Annulations</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cashier_id || row.cashier_name} className="border-b border-slate-100">
              <td className="py-3 pr-3 font-bold text-slate-900">{row.cashier_name}</td>
              <td className="py-3 pr-3 text-slate-600">{row.branch_name || "—"}</td>
              <td className="py-3 pr-3">{row.transactions}</td>
              <td className="py-3 pr-3 font-semibold text-emerald-700">{money(row.amount_collected)}</td>
              <td className="py-3">{row.cancellations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VarianceHistory({ rows }) {
  if (!rows.length) {
    return <p className="mt-3 text-sm font-semibold text-slate-500">Aucun écart ou remboursement enregistré.</p>;
  }
  return (
    <div className="mt-3 space-y-2">
      {rows.map((row) => (
        <div key={`${row.label}-${row.created_at}`} className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-slate-900">{row.label}</p>
            <p className="font-black text-red-600">{money(row.amount)}</p>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{row.reason}</p>
        </div>
      ))}
    </div>
  );
}

function HourlySalesChart({ rows }) {
  if (!rows.length) {
    return <p className="mt-3 text-sm font-semibold text-slate-500">Pas encore de ventes horaires sur la période.</p>;
  }
  const peak = Math.max(...rows.map((row) => row.revenue), 1);
  return (
    <div className="mt-4 grid gap-2">
      {rows.map((row) => (
        <div key={row.hour} className="grid grid-cols-[56px_1fr_auto] items-center gap-3">
          <span className="text-xs font-black text-slate-500">{String(row.hour).padStart(2, "0")}h</span>
          <div className="h-3 rounded-full bg-slate-100">
            <div
              className="h-3 rounded-full bg-emerald-600"
              style={{ width: `${Math.max(8, (row.revenue / peak) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-slate-700">
            {row.transactions} tx · {money(row.revenue)}
          </span>
        </div>
      ))}
    </div>
  );
}
