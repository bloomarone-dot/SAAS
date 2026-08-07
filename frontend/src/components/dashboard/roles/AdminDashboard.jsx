import { useCallback, useEffect, useState } from "react";

import { DashboardIcon } from "../icons";
import { apiFetch } from "@/config/http";
import { DashboardSection, ErrorState, FilterBar, PageContainer, SecondaryAction, StatCard } from "@/modules/admin/components/AdminUi";
import { DailyReportModal } from "@/modules/admin/components/DailyReportModal";
import { InsightsCarousel } from "@/modules/admin/components/InsightsCarousel";
import { RestaurantLogoUploader } from "@/modules/admin/components/RestaurantLogoUploader";
import { getTimeGreeting } from "@/utils/greeting";
import { buildRestaurantTheme } from "@/utils/restaurantTheme";
import { useAutoRefresh } from "@/utils/useAutoRefresh";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatVariation(value) {
  if (value == null) return "—";
  const number = Number(value || 0);
  const sign = number >= 0 ? "+" : "";
  return `${sign}${number.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const PERIODS = [
  ["today", "Aujourd'hui"],
  ["yesterday", "Hier"],
  ["week", "Semaine"],
  ["month", "Mois"],
];

const CATEGORIES = [
  ["all", "Tous"],
  ["meal", "Repas"],
  ["drink", "Boisson"],
];

function periodBounds(period, custom) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  if (period === "today") return [startOfDay(now), endOfDay(now)];
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return [startOfDay(y), endOfDay(y)];
  }
  if (period === "week") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return [startOfDay(s), endOfDay(now)];
  }
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)];
  return [startOfDay(now), endOfDay(now)];
}

export function AdminDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;
  const theme = overrides.theme;
  const onThemeChange = overrides.__onThemeChange;
  const greetingTitle = `${getTimeGreeting()}${currentUser?.first_name ? `, ${currentUser.first_name}` : ""}`;
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const [period, setPeriod] = useState("today");
  const [category, setCategory] = useState("all");
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersModal, setOrdersModal] = useState(null);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [insightCards, setInsightCards] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightTimeLabel, setInsightTimeLabel] = useState("");
  const [recentActivities, setRecentActivities] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [insightsError, setInsightsError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [start, end] = periodBounds(period, {});
      const query = new URLSearchParams({ start_date: start.toISOString(), end_date: end.toISOString() });
      if (category !== "all") query.set("category", category);
      if (branchId) query.set("branch_id", branchId);
      setData(await apiFetch(`/api/v1/dashboard/analytics?${query}`, {
        fallback: "Impossible de charger les analyses du tableau de bord.",
      }));
    } catch (error) {
      setData(null);
      setLoadError(error.message || "Impossible de charger les analyses du tableau de bord.");
    } finally {
      setIsLoading(false);
    }
  }, [period, category, branchId]);

  const loadInsights = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setInsightsLoading(true);
    if (!silent) setInsightsError("");
    try {
      const query = new URLSearchParams();
      if (branchId) query.set("branch_id", branchId);
      const suffix = query.toString() ? `?${query}` : "";
      const [payload, summary] = await Promise.all([
        apiFetch(`/api/v1/dashboard/home-insights${suffix}`, {
          fallback: "Impossible de charger les comparaisons du tableau de bord.",
        }),
        apiFetch("/api/v1/dashboard/admin-summary", {
          fallback: "Impossible de charger l'activité récente.",
        }).catch(() => null),
      ]);
      setInsightCards(Array.isArray(payload?.cards) ? payload.cards : []);
      setInsightTimeLabel(payload?.time_label || "");
      setRecentActivities(Array.isArray(summary?.recent_activities) ? summary.recent_activities : []);
    } catch (error) {
      if (!silent) {
        setInsightCards([]);
        setInsightTimeLabel("");
        setRecentActivities([]);
        setInsightsError(error.message || "Impossible de charger les comparaisons du tableau de bord.");
      }
    } finally {
      if (!silent) setInsightsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadInsights({ silent: false });
  }, [loadInsights]);

  // Recalcule l'heure courante et les fenêtres de comparaison (pas figé).
  useAutoRefresh(() => loadInsights({ silent: true }), 30_000, [loadInsights]);

  const kpi = data?.kpis ?? {};
  const realtime = data?.realtime_orders ?? {};
  const branchOptions = (data?.branches ?? []).filter((branch) => branch.id);
  const meal = Number(data?.meal_vs_drink?.meal || 0);
  const drink = Number(data?.meal_vs_drink?.drink || 0);
  const mealShare = meal + drink ? Math.round((meal / (meal + drink)) * 100) : 0;

  function exportDashboardData() {
    const rows = [
      ["Graphique", "Libellé", "Valeur"],
      ...(data?.hourly_sales ?? []).map((row) => ["Chiffre d'affaires", row.hour, row.revenue]),
      ...(data?.payment_methods ?? []).map((row) => ["Paiements", row.method, row.amount]),
      ...(data?.top_products ?? []).map((row) => ["Produits", row.name, row.revenue]),
      ...(data?.employee_performance ?? []).map((row) => ["Performance serveur", row.name, row.revenue]),
    ];
    downloadCsv("dashboard-export.csv", rows);
  }

  return (
    <PageContainer className="space-y-5">
      <InsightsCarousel
        variant="dark"
        greeting={greetingTitle}
        dateLabel={dateLabel}
        timeLabel={insightTimeLabel}
        loading={insightsLoading}
        cards={insightCards}
        action={
          <>
            <SecondaryAction icon="FileText" onClick={() => setShowDailyReport(true)}>
              Rapport du jour
            </SecondaryAction>
            <SecondaryAction icon="Download" onClick={exportDashboardData}>
              Exporter
            </SecondaryAction>
          </>
        }
      />

      <RestaurantLogoUploader
        currentUser={currentUser}
        logoUrl={theme?.logoUrl}
        restaurantName={theme?.name}
        restaurantSlug={theme?.slug}
        primaryColor={theme?.primary}
        onUpdated={(restaurant) => onThemeChange?.(buildRestaurantTheme(restaurant))}
      />

      {(loadError || insightsError) && (
        <ErrorState
          title="Indicateurs indisponibles"
          text={loadError || insightsError}
          action={
            <button
              type="button"
              onClick={() => {
                load();
                loadInsights({ silent: false });
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white"
            >
              Réessayer
            </button>
          }
        />
      )}

      <FilterBar
        right={
          <>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-control h-9 w-32 text-xs">
              {CATEGORIES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {branchOptions.length > 0 && (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="form-control h-9 w-40 text-xs">
                <option value="">Toutes branches</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            )}
          </>
        }
      >
        {PERIODS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={`h-8 rounded-md px-3 text-xs font-bold transition ${
              period === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </FilterBar>

      {recentActivities.length > 0 && (
        <DashboardSection title="Activité récente" action={<span className="text-xs font-semibold text-slate-500">{recentActivities.length} événement(s)</span>}>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {recentActivities.map((activity, index) => (
              <div key={`${activity.label}-${activity.time}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-black text-slate-900">{activity.label}</p>
                  <p className="text-xs font-semibold text-slate-600">{activity.value}</p>
                </div>
                <span className="text-xs font-semibold text-slate-400">{activity.time}</span>
              </div>
            ))}
          </div>
        </DashboardSection>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Chiffre d'affaires" value={money(kpi.revenue)} trend={`${formatVariation(kpi.revenue_variation)} vs période préc.`} icon="ShoppingCart" tone="success" />
        <StatCard label="Commandes" value={Number(kpi.orders_count || 0).toLocaleString("fr-FR")} trend={`${formatVariation(kpi.orders_variation)} vs période préc.`} icon="ClipboardList" tone="info" />
        <StatCard label="Ticket moyen" value={money(kpi.average_ticket)} trend={`Marge ${Number(kpi.margin_rate || 0).toFixed(1)} %`} icon="ReceiptText" tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <DashboardSection title="Ventes par heure" description="Activité sur la période sélectionnée.">
          <HourlyChart rows={data?.hourly_sales ?? []} />
        </DashboardSection>

        <DashboardSection title="Service en direct" description="Cliquez pour voir le détail.">
          <div className="grid grid-cols-2 gap-2">
            <RealtimeStat label="En cours" value={realtime.in_progress} tone="blue" onClick={() => setOrdersModal({ title: "Commandes en cours", statuses: ["Nouvelle", "Acceptée", "En préparation", "Prête"] })} />
            <RealtimeStat label="Cuisine" value={realtime.preparing} tone="orange" onClick={() => setOrdersModal({ title: "En préparation", statuses: ["En préparation"] })} />
            <RealtimeStat label="Prêtes" value={realtime.ready} tone="green" onClick={() => setOrdersModal({ title: "Commandes prêtes", statuses: ["Prête"] })} />
            <RealtimeStat label="Annulées" value={realtime.cancelled} tone="red" onClick={() => setOrdersModal({ title: "Commandes annulées", statuses: ["Annulée"] })} />
          </div>
        </DashboardSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardSection title="Meilleures ventes">
          <TopProducts rows={(data?.top_products ?? []).slice(0, 5)} />
        </DashboardSection>

        <DashboardSection title="Encaissements">
          <PaymentMethods rows={data?.payment_methods ?? []} />
          {(meal > 0 || drink > 0) && <DonutSplit mealShare={mealShare} />}
        </DashboardSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardSection title="Équipe">
          <EmployeeTable rows={(data?.employee_performance ?? []).slice(0, 5)} />
        </DashboardSection>

        <DashboardSection title="Alertes">
          <StockAlerts rows={(data?.stock_alerts ?? []).slice(0, 4)} />
        </DashboardSection>
      </div>

      {isLoading && !data && (
        <p className="text-center text-sm font-semibold text-slate-400">Chargement des données...</p>
      )}

      {ordersModal && (
        <OrdersModal title={ordersModal.title} statuses={ordersModal.statuses} onClose={() => setOrdersModal(null)} />
      )}

      <DailyReportModal open={showDailyReport} onClose={() => setShowDailyReport(false)} branchId={branchId} />
    </PageContainer>
  );
}

function RealtimeStat({ label, value, tone, onClick }) {
  const colors = { blue: "text-cyan-600", orange: "text-amber-600", green: "text-emerald-600", red: "text-red-600" };
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center transition hover:border-[var(--dashboard-primary)] hover:bg-white">
      <p className={`text-2xl font-black ${colors[tone] ?? "text-slate-700"}`}>{Number(value || 0)}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </button>
  );
}

function OrdersModal({ title, statuses, onClose }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch("/api/v1/orders?limit=100", {
          fallback: "Impossible de charger les commandes.",
        }).catch(() => []);
        if (active) setOrders((data || []).filter((order) => statuses.includes(order.status)));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [statuses]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="lte-card mb-0 flex max-h-[85vh] w-full max-w-2xl flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="lte-card-header">
          <h2 className="lte-card-title">
            <DashboardIcon name="ClipboardList" size={17} /> {title} ({orders.length})
          </h2>
          <div className="lte-card-tools">
            <button type="button" onClick={onClose} className="lte-tool-btn">
              <DashboardIcon name="X" size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-3">
          {loading ? (
            <p className="py-6 text-center text-sm font-semibold text-slate-400">Chargement…</p>
          ) : orders.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-slate-400">Aucune commande.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {orders.map((order) => {
                const expanded = openId === order.id;
                const label = order.table_id
                  ? `${order.table_room ? `${order.table_room} · ` : ""}Table ${order.table_name || order.table_id}`
                  : order.customer_name || "Client";
                return (
                  <div key={order.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(expanded ? null : order.id)}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">
                          {order.order_number} · {label}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {order.server_name || "—"} · {new Date(order.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">{money(order.total_amount)}</p>
                        <p className="text-xs font-semibold text-slate-500">{order.status}</p>
                      </div>
                    </button>
                    {expanded && (
                      <div className="mb-2 rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="divide-y divide-slate-100">
                          {(order.items || []).map((item) => (
                            <div key={item.id || item.name} className="flex justify-between py-1">
                              <span className="text-slate-700">
                                {item.quantity} × {item.name}
                              </span>
                              <span className="font-semibold text-slate-800">{money(item.line_total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HourlyChart({ rows }) {
  if (!rows.length) return <Empty text="Aucune vente sur cette période." />;
  const max = Math.max(...rows.map((r) => Number(r.revenue || 0)), 1);
  return (
    <div className="flex h-[180px] items-end gap-1 overflow-x-auto">
      {rows.map((row) => (
        <div key={row.hour} className="flex min-w-[24px] flex-1 flex-col items-center gap-1">
          <div className="flex h-[150px] w-full items-end">
            <span
              className="w-full rounded-t bg-[var(--dashboard-primary)]"
              style={{ height: `${Math.max(4, (Number(row.revenue || 0) / max) * 140)}px` }}
              title={`${row.hour}: ${money(row.revenue)}`}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-400">{row.hour}</span>
        </div>
      ))}
    </div>
  );
}

function TopProducts({ rows }) {
  if (!rows.length) return <Empty text="Aucun produit vendu." />;
  return (
    <table className="lte-table">
      <thead>
        <tr>
          <th>Produit</th>
          <th>Qté</th>
          <th className="text-right">CA</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="font-semibold text-slate-800">{row.name}</td>
            <td>{row.quantity}</td>
            <td className="text-right font-semibold text-slate-800">{money(row.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaymentMethods({ rows }) {
  if (!rows.length) return <Empty text="Aucun encaissement." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.method}>
          <div className="flex justify-between text-xs font-semibold text-slate-600">
            <span>{row.method}</span>
            <span>
              {money(row.amount)} · {row.share}%
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
            <span className="block h-1.5 rounded-full bg-[var(--dashboard-primary)]" style={{ width: `${row.share}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutSplit({ mealShare }) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex h-2 overflow-hidden rounded-full">
        <span className="bg-[var(--dashboard-primary)]" style={{ width: `${mealShare}%` }} />
        <span className="bg-amber-400" style={{ width: `${100 - mealShare}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-semibold text-slate-500">
        <span>Repas {mealShare}%</span>
        <span>Boissons {100 - mealShare}%</span>
      </div>
    </div>
  );
}

function StockAlerts({ rows }) {
  if (!rows.length) return <Empty text="Aucune alerte stock." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2">
          <span className="text-sm font-semibold text-red-800">{row.name}</span>
          <span className="text-xs font-black text-red-600">
            {row.current_stock} / min {row.minimum_stock}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmployeeTable({ rows }) {
  if (!rows.length) return <Empty text="Aucune vente enregistrée." />;
  return (
    <table className="lte-table">
      <thead>
        <tr>
          <th>Employé</th>
          <th>CA</th>
          <th className="text-right">Commandes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="font-semibold text-slate-800">{row.name}</td>
            <td className="font-semibold text-slate-800">{money(row.revenue)}</td>
            <td className="text-right">{row.orders}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ text }) {
  return <p className="py-5 text-center text-sm font-semibold text-slate-400">{text}</p>;
}
