import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { PeriodFilterBar, periodToApiDates } from "@/components/shared/PeriodFilterBar";
import { DashboardSection, FilterBar } from "@/modules/admin/components/AdminUi";
import { apiFetch } from "@/config/http";
import { matchesPeriod } from "@/utils/greeting";
import { orderApi } from "../services/orderApi";
import { InvoiceHistoryPanel } from "./InvoiceHistoryPanel";

const STATUS_COLORS = {
  Nouvelle: "bg-sky-50 text-sky-700",
  Acceptée: "bg-blue-50 text-blue-700",
  Acceptee: "bg-blue-50 text-blue-700",
  "En préparation": "bg-orange-50 text-orange-700",
  "En preparation": "bg-orange-50 text-orange-700",
  Prête: "bg-emerald-50 text-emerald-700",
  Prette: "bg-emerald-50 text-emerald-700",
  Livrée: "bg-violet-50 text-violet-700",
  Livree: "bg-violet-50 text-violet-700",
  Payée: "bg-slate-100 text-slate-700",
  Payee: "bg-slate-100 text-slate-700",
};

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DeliveryAdminPanel({ onMessage }) {
  const [orders, setOrders] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("week");
  const [customPeriod, setCustomPeriod] = useState({ start: "", end: "" });
  const [cashierFilter, setCashierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadDeliveries, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    loadPerformance();
  }, [period, customPeriod, cashierFilter]);

  async function loadDeliveries() {
    try {
      const data = await orderApi.list({ fulfillment_type: "Livraison", limit: 300 });
      setOrders(Array.isArray(data) ? data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : []);
    } catch (error) {
      onMessage?.(error.message || "Impossible de charger les livraisons.");
      setOrders([]);
    }
  }

  async function loadPerformance() {
    try {
      const params = new URLSearchParams({ period: period === "all" ? "year" : period });
      if (cashierFilter) params.set("cashier_id", cashierFilter);
      const data = await apiFetch(`/api/v1/dashboard/cashier-performance?${params}`, {
        fallback: "Performance caisse indisponible.",
      });
      setPerformance(data);
    } catch {
      setPerformance(null);
    }
  }

  async function loadData() {
    setLoading(true);
    await Promise.all([loadDeliveries(), loadPerformance()]);
    try {
      const users = await apiFetch("/api/v1/users", { fallback: "Personnel indisponible." });
      setCashiers((users || []).filter((user) => user.role === "CAISSE" && user.is_active));
    } catch {
      setCashiers([]);
    }
    setLoading(false);
  }

  const statuses = useMemo(
    () => [...new Set(orders.map((order) => order.status).filter(Boolean))].sort(),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        !query ||
        [order.order_number, order.customer_name, order.customer_phone, order.delivery_area_name, order.created_by_cashier_name, order.cashier_name]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesStatus = !statusFilter || order.status === statusFilter;
      const matchesCashier =
        !cashierFilter ||
        order.created_by_cashier_id === cashierFilter ||
        order.cashier_id === cashierFilter;
      const matchesDate = matchesPeriod(order.created_at, period, customPeriod);
      return matchesSearch && matchesStatus && matchesCashier && (period === "all" || matchesDate);
    });
  }, [orders, search, statusFilter, cashierFilter, period, customPeriod]);

  const deliveryTotal = filteredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const perfRows = performance?.ranking ?? [];
  const perfKpis = performance?.kpis ?? {};

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Livraisons suivies" value={filteredOrders.length} hint="Sur la période filtrée" />
        <MetricCard label="Montant livraisons" value={money(deliveryTotal)} hint="Total commandes filtrées" />
        <MetricCard label="CA caisse (période)" value={money(perfKpis.total_collected)} hint={`${perfKpis.payments_validated || 0} paiement(s)`} />
        <MetricCard label="Ticket moyen caisse" value={money(perfKpis.average_ticket)} hint="Performance caissières" />
      </div>

      <DashboardSection
        title="État des livraisons"
        description="Suivi en lecture seule : statut, caissier et mode de paiement (non modifiable côté admin)."
      >
        <FilterBar className="mb-4">
          <PeriodFilterBar period={period} onPeriodChange={setPeriod} customPeriod={customPeriod} onCustomPeriodChange={setCustomPeriod} />
          <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)} className="form-control h-10 min-w-44">
            <option value="">Toutes les caissières</option>
            {cashiers.map((user) => (
              <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-control h-10 min-w-40">
            <option value="">Tous les statuts</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
            <DashboardIcon name="Search" size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, téléphone, n° commande..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </label>
        </FilterBar>

        {loading ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Chargement…</p>
        ) : filteredOrders.length ? (
          <div className="overflow-x-auto">
            <table className="lte-table w-full min-w-[1100px]">
              <thead>
                <tr>
                  <th>Commande</th>
                  <th>Client</th>
                  <th>Quartier</th>
                  <th>Statut</th>
                  <th>Caissier(ère)</th>
                  <th>Mode paiement</th>
                  <th>Plats</th>
                  <th className="text-right">Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="align-top hover:bg-slate-50">
                    <td className="font-black text-slate-900">{order.order_number}</td>
                    <td>
                      <p className="font-semibold text-slate-800">{order.customer_name}</p>
                      <p className="text-xs text-slate-500">{order.customer_phone}</p>
                    </td>
                    <td className="text-sm font-semibold text-slate-600">{order.delivery_area_name || "-"}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${STATUS_COLORS[order.status] || "bg-slate-100 text-slate-600"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="text-sm font-semibold text-slate-700">
                      {order.created_by_cashier_name || order.cashier_name || "Non renseigné"}
                    </td>
                    <td>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-500" title="Lecture seule admin">
                        {order.payment_method}
                      </span>
                    </td>
                    <td className="max-w-[220px] text-xs font-semibold text-slate-600">
                      {(order.items || []).map((item) => `${item.quantity}x ${item.name}`).join(", ") || "-"}
                    </td>
                    <td className="text-right font-black tabular-nums text-slate-900">{money(order.total_amount)}</td>
                    <td className="text-sm font-semibold text-slate-500">{formatDateTime(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Aucune livraison pour ces filtres.
          </p>
        )}
      </DashboardSection>

      <DashboardSection title="Performance caissières" description="Chiffre d'affaires encaissé par caissier sur la période sélectionnée.">
        {perfRows.length ? (
          <div className="overflow-x-auto">
            <table className="lte-table w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Caissier(ère)</th>
                  <th className="text-right">Total encaissé</th>
                  <th className="text-right">Paiements</th>
                  <th className="text-right">Espèces</th>
                  <th className="text-right">Mobile Money</th>
                  <th className="text-right">Ticket moyen</th>
                </tr>
              </thead>
              <tbody>
                {perfRows.map((row) => (
                  <tr key={row.cashier_id || row.rank}>
                    <td className="font-black text-slate-700">{row.rank}</td>
                    <td className="font-semibold text-slate-800">{row.name}</td>
                    <td className="text-right font-black tabular-nums text-emerald-700">{money(row.total_collected)}</td>
                    <td className="text-right tabular-nums">{row.payments_validated}</td>
                    <td className="text-right tabular-nums">{money(row.cash_payments)}</td>
                    <td className="text-right tabular-nums">{money(row.mobile_money_payments)}</td>
                    <td className="text-right tabular-nums">{money(row.average_ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm font-semibold text-slate-500">Aucune performance caisse sur cette période.</p>
        )}
      </DashboardSection>

      <InvoiceHistoryPanel
        title="Historique des factures"
        description="Factures payées avec détails et remboursement."
        allowRefund
        onMessage={onMessage}
      />
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-black tabular-nums leading-tight text-slate-950 sm:text-2xl">{value}</p>
      {hint && <p className="mt-2 text-sm font-semibold text-slate-500">{hint}</p>}
    </div>
  );
}
