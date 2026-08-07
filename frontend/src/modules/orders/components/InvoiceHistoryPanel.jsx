import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { PeriodFilterBar, periodToApiDates } from "@/components/shared/PeriodFilterBar";
import { AdminFormModal, DashboardSection, FilterBar } from "@/modules/admin/components/AdminUi";
import { apiFetch } from "@/config/http";
import { orderApi } from "../services/orderApi";
import { loadCashierReportMerged } from "@/offline/ops";
import { cancelLocalPayment } from "@/offline/cashSession";
import { isNetworkError, shouldPreferLocalData } from "@/utils/network";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function orderLabel(order) {
  if (order.fulfillment_type === "Livraison") {
    return [order.customer_name, order.delivery_area_name].filter(Boolean).join(" · ");
  }
  if (order.table_id) return `Table ${order.table_name || order.table_id}`;
  return order.customer_name || "Client";
}

function filterReceiptsByPeriod(receipts, period, customPeriod) {
  const { start_date, end_date } = periodToApiDates(period, customPeriod);
  if (!start_date && !end_date) return receipts;
  const start = start_date ? Date.parse(start_date) : 0;
  const end = end_date ? Date.parse(end_date) : Number.MAX_SAFE_INTEGER;
  return receipts.filter((order) => {
    const paidAt = Date.parse(order.paid_at || order.updated_at || order.created_at || 0);
    return paidAt >= start && paidAt <= end;
  });
}

export function InvoiceHistoryPanel({
  title = "Historique des factures",
  description = "Consultez les paiements encaissés, les détails et les remboursements.",
  allowRefund = false,
  adminReviewOnly = false,
  onMessage,
  restaurantId = null,
  currentUser = null,
  localReceipts = null,
}) {
  const [orders, setOrders] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [offlineSource, setOfflineSource] = useState(false);
  const [period, setPeriod] = useState("today");
  const [customPeriod, setCustomPeriod] = useState({ start: "", end: "" });
  const [cashierFilter, setCashierFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    if (shouldPreferLocalData()) return;
    apiFetch("/api/v1/users", { fallback: "Impossible de charger le personnel." })
      .then((rows) => setCashiers((rows || []).filter((user) => user.role === "CAISSE" && user.is_active)))
      .catch(() => setCashiers([]));
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [period, customPeriod, cashierFilter, paymentFilter, restaurantId, localReceipts]);

  useEffect(() => {
    function refresh() {
      if (restaurantId) loadInvoices();
    }
    window.addEventListener("cash-analytics-changed", refresh);
    window.addEventListener("cash-session-changed", refresh);
    return () => {
      window.removeEventListener("cash-analytics-changed", refresh);
      window.removeEventListener("cash-session-changed", refresh);
    };
  }, [period, customPeriod, cashierFilter, paymentFilter, restaurantId]);

  async function loadLocalInvoices() {
    if (!restaurantId) return [];
    const base = Array.isArray(localReceipts)
      ? localReceipts
      : (await loadCashierReportMerged(restaurantId)).receipts || [];
    let rows = filterReceiptsByPeriod(base, period, customPeriod);
    if (cashierFilter) {
      rows = rows.filter((order) => String(order.cashier_id || order.assigned_cashier_id) === String(cashierFilter));
    }
    if (paymentFilter) {
      rows = rows.filter((order) => String(order.payment_method || "").includes(paymentFilter));
    }
    return rows.sort(
      (a, b) => new Date(b.paid_at || b.updated_at || 0) - new Date(a.paid_at || a.updated_at || 0),
    );
  }

  async function loadInvoices() {
    setLoading(true);
    try {
      if (shouldPreferLocalData() && restaurantId) {
        const local = await loadLocalInvoices();
        setOrders(local);
        setOfflineSource(true);
        return;
      }
      const params = {
        ...periodToApiDates(period, customPeriod),
        ...(cashierFilter ? { cashier_id: cashierFilter } : {}),
        ...(paymentFilter ? { payment_method: paymentFilter } : {}),
      };
      const data = await orderApi.completedPayments(params);
      setOrders(Array.isArray(data) ? data : []);
      setOfflineSource(false);
    } catch (error) {
      if (isNetworkError(error) && restaurantId) {
        try {
          setOrders(await loadLocalInvoices());
          setOfflineSource(true);
        } catch {
          onMessage?.(error.message || "Impossible de charger l'historique des factures.");
          setOrders([]);
        }
      } else {
        onMessage?.(error.message || "Impossible de charger l'historique des factures.");
        setOrders([]);
      }
    } finally {
      setLoading(false);
    }
  }

  const paymentMethods = useMemo(
    () => [...new Set(orders.map((order) => order.payment_method).filter(Boolean))].sort(),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (!query) return true;
      return [order.order_number, order.customer_name, order.cashier_name, order.created_by_cashier_name, order.payment_method]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [orders, search]);

  const totalCollected = filteredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  async function refundOrder(order) {
    if (!window.confirm(`Rembourser la facture ${order.order_number} (${money(order.total_amount)}) ?`)) return;
    setBusyId(order.id);
    try {
      if (shouldPreferLocalData() || String(order.id).startsWith("local_")) {
        await cancelLocalPayment(order, { restaurantId, cashier: currentUser });
      } else {
        try {
          await orderApi.cancelPayment(order.id);
        } catch (error) {
          if (isNetworkError(error) && restaurantId) {
            await cancelLocalPayment(order, { restaurantId, cashier: currentUser });
          } else {
            throw error;
          }
        }
      }
      onMessage?.(`Remboursement enregistré pour ${order.order_number}.`);
      setSelectedOrder(null);
      await loadInvoices();
    } catch (error) {
      onMessage?.(error.message || "Remboursement impossible.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-4">
      <DashboardSection
        title={title}
        description={description}
        action={
          <span className="text-sm font-black tabular-nums text-emerald-700">
            Total : {money(totalCollected)} · {filteredOrders.length} facture(s)
            {offlineSource ? " · cache local" : ""}
          </span>
        }
      >
        <FilterBar className="mb-4">
          <PeriodFilterBar
            period={period}
            onPeriodChange={setPeriod}
            customPeriod={customPeriod}
            onCustomPeriodChange={setCustomPeriod}
          />
          <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)} className="form-control h-10 min-w-44">
            <option value="">Toutes les caissières</option>
            {cashiers.map((user) => (
              <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>
            ))}
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="form-control h-10 min-w-44">
            <option value="">Tous les paiements</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
          <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
            <DashboardIcon name="Search" size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° facture, client, caissier..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </label>
        </FilterBar>

        {loading ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Chargement…</p>
        ) : filteredOrders.length ? (
          <div className="overflow-x-auto">
            <table className="lte-table w-full min-w-[960px]">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Caissier(ère)</th>
                  <th>Paiement</th>
                  <th className="text-right">Montant</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="font-black text-slate-900">{order.order_number}</td>
                    <td className="text-sm font-semibold text-slate-600">{formatDateTime(order.paid_at || order.updated_at)}</td>
                    <td className="text-sm font-semibold text-slate-700">{orderLabel(order)}</td>
                    <td className="text-sm font-semibold text-slate-600">{order.cashier_name || order.created_by_cashier_name || "-"}</td>
                    <td>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                        {order.payment_method}
                      </span>
                    </td>
                    <td className="text-right font-black tabular-nums text-slate-900">{money(order.total_amount)}</td>
                    <td className="text-right">
                      <button type="button" onClick={() => setSelectedOrder(order)} className="lte-btn lte-btn-default lte-btn-sm">
                        Détails
                      </button>
                      {allowRefund && !adminReviewOnly && (
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => refundOrder(order)}
                          className="lte-btn lte-btn-danger lte-btn-sm ml-2"
                        >
                          Rembourser
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Aucune facture pour cette période.
          </p>
        )}
      </DashboardSection>

      {selectedOrder && (
        <AdminFormModal
          open={Boolean(selectedOrder)}
          title={`Facture ${selectedOrder.order_number}`}
          description={`${orderLabel(selectedOrder)} · ${formatDateTime(selectedOrder.paid_at || selectedOrder.updated_at)}`}
          size="lg"
          onClose={() => setSelectedOrder(null)}
          footer={
            <>
              <button type="button" onClick={() => setSelectedOrder(null)} className="lte-btn lte-btn-default">Fermer</button>
              {allowRefund && !adminReviewOnly && (
                <button
                  type="button"
                  disabled={busyId === selectedOrder.id}
                  onClick={() => refundOrder(selectedOrder)}
                  className="lte-btn lte-btn-danger"
                >
                  Rembourser
                </button>
              )}
            </>
          }
        >
          <InvoiceDetail order={selectedOrder} />
        </AdminFormModal>
      )}
    </div>
  );
}

function InvoiceDetail({ order }) {
  const items = (order.items || []).filter((item) => item.sale_channel !== "EMBALLAGE");
  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Statut" value={order.status} />
        <Info label="Mode de paiement" value={order.payment_method} />
        {order.cash_paid_amount != null && order.mobile_paid_amount != null && (
          <>
            <Info label="Part espèces" value={money(order.cash_paid_amount)} />
            <Info label="Part Mobile Money" value={money(order.mobile_paid_amount)} />
          </>
        )}
        <Info label="Caissier(ère)" value={order.cashier_name || "-"} />
        <Info label="Prise en charge" value={order.created_by_cashier_name || order.cashier_name || "-"} />
        <Info label="Téléphone" value={order.customer_phone || "-"} />
        <Info label="Quartier" value={order.delivery_area_name || "-"} />
      </div>
      <table className="lte-table w-full">
        <thead>
          <tr>
            <th>Article</th>
            <th className="text-center">Qté</th>
            <th className="text-right">P.U.</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="font-semibold text-slate-800">{item.name}</td>
              <td className="text-center">{item.quantity}</td>
              <td className="text-right tabular-nums">{money(item.unit_price)}</td>
              <td className="text-right font-black tabular-nums">{money(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-1 text-sm font-semibold text-slate-700">
        <div className="flex justify-between"><span>Sous-total</span><span>{money(subtotal)}</span></div>
        <div className="flex justify-between"><span>Livraison</span><span>{money(order.delivery_fee)}</span></div>
        <div className="flex justify-between"><span>Réduction</span><span className="text-red-600">- {money(order.discount_amount)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-black text-slate-950">
          <span>Total TTC</span><span>{money(order.total_amount)}</span>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}
