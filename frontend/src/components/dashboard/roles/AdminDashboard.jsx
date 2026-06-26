import { useCallback, useEffect, useState } from "react";

import { DashboardIcon } from "../icons";
import { Panel } from "../DashboardPrimitives";
import { apiFetch } from "@/config/http";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
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
  ["week", "Cette semaine"],
  ["month", "Ce mois"],
  ["year", "Cette année"],
  ["custom", "Personnalisée"],
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
    const y = new Date(now); y.setDate(now.getDate() - 1);
    return [startOfDay(y), endOfDay(y)];
  }
  if (period === "week") {
    const s = new Date(now); s.setDate(now.getDate() - 6);
    return [startOfDay(s), endOfDay(now)];
  }
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)];
  if (period === "year") return [new Date(now.getFullYear(), 0, 1), endOfDay(now)];
  if (period === "custom" && custom.start && custom.end) {
    return [new Date(`${custom.start}T00:00:00`), new Date(`${custom.end}T23:59:59`)];
  }
  return [startOfDay(now), endOfDay(now)];
}

export function AdminDashboard({ overrides = {} }) {
  const apiBaseUrl = overrides.__apiBaseUrl;
  const [period, setPeriod] = useState("today");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [category, setCategory] = useState("all");
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersModal, setOrdersModal] = useState(null);

  const load = useCallback(async () => {
    if (!apiBaseUrl) return;
    setIsLoading(true);
    try {
      const [start, end] = periodBounds(period, custom);
      const query = new URLSearchParams({ start_date: start.toISOString(), end_date: end.toISOString() });
      if (category !== "all") query.set("category", category);
      if (branchId) query.set("branch_id", branchId);
      setData(await apiFetch(`/api/v1/dashboard/analytics?${query}`, {
        fallback: "Impossible de charger les analyses du tableau de bord.",
      }));
    } catch {
      // le dashboard ne doit pas casser sur une erreur réseau
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, period, category, custom, branchId]);

  function openOrders(title, statuses) {
    setOrdersModal({ title, statuses });
  }

  useEffect(() => {
    if (period !== "custom" || (custom.start && custom.end)) load();
  }, [load, period, custom]);

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
      ...(data?.sales_chart ?? []).map((row) => ["Ventes par période", row.label, row.revenue]),
      ...(data?.payment_methods ?? []).map((row) => ["Paiements", row.method, row.amount]),
      ...(data?.top_products ?? []).map((row) => ["Produits", row.name, row.revenue]),
      ...(data?.employee_performance ?? []).map((row) => ["Performance serveur", row.name, row.revenue]),
      ...(data?.stock_alerts ?? []).map((row) => ["Stock", row.name, row.current_stock]),
    ];
    downloadCsv("dashboard-graphiques.csv", rows);
  }

  return (
    <section className="space-y-4">
      {/* Filtres globaux */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setPeriod(key)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${period === key ? "bg-[var(--dashboard-primary)] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-1">
            <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className="h-8 rounded border border-slate-300 px-2 text-xs" />
            <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className="h-8 rounded border border-slate-300 px-2 text-xs" />
          </div>
        )}
        {branchOptions.length > 0 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-8 rounded border border-slate-300 px-2 text-xs font-semibold text-slate-600">
            <option value="">Toutes les branches</option>
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={exportDashboardData} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            Exporter graphiques
          </button>
          {CATEGORIES.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setCategory(key)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${category === key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Ligne 1 : KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Chiffre d'affaires" value={money(kpi.revenue)} variation={kpi.revenue_variation} icon="ShoppingCart" tone="pink" />
        <KpiCard label="Bénéfice" value={money(kpi.profit)} icon="Wallet" tone="green" />
        <KpiCard label="Commandes" value={Number(kpi.orders_count || 0).toLocaleString("fr-FR")} variation={kpi.orders_variation} icon="ClipboardList" tone="blue" />
        <KpiCard label="Ticket moyen" value={money(kpi.average_ticket)} variation={kpi.average_ticket_variation} icon="ReceiptText" tone="orange" />
        <KpiCard label="Taux de marge" value={`${Number(kpi.margin_rate || 0).toFixed(1)}%`} icon="TrendingUp" tone="green" />
        <KpiCard label="Clients servis" value={Number(kpi.clients_served || 0).toLocaleString("fr-FR")} icon="Users" tone="blue" />
      </div>

      {/* Ligne 2 : CA par heure + commandes temps réel */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Chiffre d'affaires par heure">
          <HourlyChart rows={data?.hourly_sales ?? []} />
        </Panel>
        <Panel title="Commandes en temps réel">
          <div className="grid grid-cols-2 gap-2">
            <RealtimeStat label="En cours" value={realtime.in_progress} tone="blue" onClick={() => openOrders("Commandes en cours", ["Nouvelle", "Acceptée", "En préparation", "Prête"])} />
            <RealtimeStat label="En préparation" value={realtime.preparing} tone="orange" onClick={() => openOrders("En préparation", ["En préparation"])} />
            <RealtimeStat label="Prêtes" value={realtime.ready} tone="green" onClick={() => openOrders("Commandes prêtes", ["Prête"])} />
            <RealtimeStat label="Livrées" value={realtime.delivered} tone="blue" onClick={() => openOrders("Commandes livrées", ["Livrée"])} />
            <RealtimeStat label="Payées" value={realtime.paid} tone="green" onClick={() => openOrders("Commandes payées", ["Payée", "Payee"])} />
            <RealtimeStat label="Annulées" value={realtime.cancelled} tone="red" onClick={() => openOrders("Commandes annulées", ["Annulée"])} />
          </div>
        </Panel>
      </div>

      {/* Ligne 3 : top produits + paiements + alertes stock */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Produits les plus vendus">
          <TopProducts rows={data?.top_products ?? []} />
        </Panel>
        <Panel title="Modes de paiement">
          <PaymentMethods rows={data?.payment_methods ?? []} />
          <DonutSplit mealShare={mealShare} meal={meal} drink={drink} />
        </Panel>
        <Panel title="Alertes stock">
          <StockAlerts rows={data?.stock_alerts ?? []} />
        </Panel>
      </div>

      {/* Ligne 4 : employés + branches */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Performance des employés">
          <EmployeeTable rows={data?.employee_performance ?? []} />
        </Panel>
        <Panel title="Performance des branches">
          <BranchTable rows={(data?.branches ?? []).filter((branch) => !branchId || branch.id === branchId)} />
        </Panel>
      </div>

      {isLoading && !data && <p className="text-center text-sm font-semibold text-slate-400">Chargement…</p>}

      {ordersModal && (
        <OrdersModal title={ordersModal.title} statuses={ordersModal.statuses} onClose={() => setOrdersModal(null)} />
      )}
    </section>
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
    return () => { active = false; };
  }, [statuses]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="lte-card mb-0 flex max-h-[85vh] w-full max-w-2xl flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="lte-card-header">
          <h2 className="lte-card-title"><DashboardIcon name="ClipboardList" size={17} /> {title} ({orders.length})</h2>
          <div className="lte-card-tools"><button type="button" onClick={onClose} className="lte-tool-btn"><DashboardIcon name="X" size={14} /></button></div>
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
                const label = order.table_id ? `${order.table_room ? `${order.table_room} · ` : ""}Table ${order.table_name || order.table_id}` : (order.customer_name || "Client");
                return (
                  <div key={order.id}>
                    <button type="button" onClick={() => setOpenId(expanded ? null : order.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">{order.order_number} · {label}</p>
                        <p className="text-xs font-semibold text-slate-500">{order.server_name || "—"} · {new Date(order.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">{money(order.total_amount)}</p>
                        <p className="text-xs font-semibold text-slate-500">{order.status}</p>
                      </div>
                    </button>
                    {expanded && (
                      <div className="mb-2 rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                          <span>Paiement : {order.payment_method || "—"}</span>
                          <span>Statut : {order.status}</span>
                          <span>Articles : {order.items?.length || 0}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {(order.items || []).map((item) => (
                            <div key={item.id || item.name} className="flex justify-between py-1">
                              <span className="text-slate-700">{item.quantity} × {item.name}</span>
                              <span className="font-semibold text-slate-800">{money(item.line_total)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-black text-slate-900">
                          <span>Total</span><span>{money(order.total_amount)}</span>
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

function KpiCard({ label, value, variation, icon, tone }) {
  const colors = { pink: "bg-[var(--dashboard-primary)]", green: "bg-emerald-600", blue: "bg-cyan-500", orange: "bg-amber-500" };
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded text-white ${colors[tone] ?? colors.pink}`}>
          <DashboardIcon name={icon} size={16} />
        </span>
        {variation != null && <VariationBadge value={variation} />}
      </div>
      <p className="mt-2 truncate text-lg font-black text-slate-900">{value}</p>
      <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function VariationBadge({ value }) {
  const positive = value >= 0;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-black ${positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
      {positive ? "↗" : "↘"} {Math.abs(value)}%
    </span>
  );
}

function HourlyChart({ rows }) {
  if (!rows.length) return <Empty text="Aucune vente sur cette période." />;
  const max = Math.max(...rows.map((r) => Number(r.revenue || 0)), 1);
  return (
    <div className="flex h-[200px] items-end gap-1 overflow-x-auto">
      {rows.map((row) => (
        <div key={row.hour} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
          <div className="flex h-[170px] w-full items-end">
            <span className="w-full rounded-t bg-[var(--dashboard-primary)]" style={{ height: `${Math.max(4, (Number(row.revenue || 0) / max) * 160)}px` }} title={`${row.hour}: ${money(row.revenue)}`} />
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
      <thead><tr><th>Produit</th><th>Qté</th><th className="text-right">CA</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="font-semibold text-slate-800">{row.name}<span className="ml-1 text-[10px] font-bold text-slate-400">{row.category === "BOISSON" ? "🥤" : "🍽"}</span></td>
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
            <span>{money(row.amount)} · {row.share}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <span className="block h-2 rounded-full bg-[var(--dashboard-primary)]" style={{ width: `${row.share}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutSplit({ mealShare, meal, drink }) {
  if (!meal && !drink) return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="mb-2 text-xs font-black uppercase text-slate-400">Repas / Boissons</p>
      <div className="flex h-3 overflow-hidden rounded-full">
        <span className="bg-[var(--dashboard-primary)]" style={{ width: `${mealShare}%` }} />
        <span className="bg-amber-400" style={{ width: `${100 - mealShare}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-semibold text-slate-600">
        <span>🍽 Repas {mealShare}%</span>
        <span>🥤 Boissons {100 - mealShare}%</span>
      </div>
    </div>
  );
}

function StockAlerts({ rows }) {
  if (!rows.length) return <Empty text="Aucun stock faible. ✅" />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2">
          <span className="text-sm font-semibold text-red-800">{row.name}</span>
          <span className="text-xs font-black text-red-600">{row.current_stock} (min {row.minimum_stock})</span>
        </div>
      ))}
    </div>
  );
}

function EmployeeTable({ rows }) {
  if (!rows.length) return <Empty text="Aucune vente par employé." />;
  return (
    <table className="lte-table">
      <thead><tr><th>Employé</th><th>CA</th><th>Cmd</th><th className="text-right">Ticket moyen</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="font-semibold text-slate-800">{row.name}</td>
            <td className="font-semibold text-slate-800">{money(row.revenue)}</td>
            <td>{row.orders}</td>
            <td className="text-right">{money(row.average_ticket)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BranchTable({ rows }) {
  if (!rows.length) return <Empty text="Aucune branche." />;
  return (
    <table className="lte-table">
      <thead><tr><th>Branche</th><th>CA</th><th>Cmd</th><th className="text-right">Part</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id ?? row.name}>
            <td className="font-semibold text-slate-800">{row.city ? `${row.name} · ${row.city}` : row.name}</td>
            <td className="font-semibold text-slate-800">{money(row.revenue)}</td>
            <td>{row.orders_count}</td>
            <td className="text-right">{Number(row.share || 0).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ text }) {
  return <p className="py-6 text-center text-sm font-semibold text-slate-400">{text}</p>;
}
