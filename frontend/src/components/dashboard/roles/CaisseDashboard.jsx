import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "../icons";
import { AdminFormModal, DashboardSection, FilterBar, PageContainer, PageHeader, SecondaryAction, StatCard } from "@/modules/admin/components/AdminUi";
import { orderApi } from "@/modules/orders/services/orderApi";
import { DeliveryCashierPanel } from "@/modules/orders/components/DeliveryCashierPanel";
import { CashierReportAnalytics } from "@/modules/orders/components/CashierReportAnalytics";
import { InvoiceHistoryPanel } from "@/modules/orders/components/InvoiceHistoryPanel";
import { CashDrawerSessionPanel } from "@/modules/orders/components/CashDrawerSession";
import { paymentApi } from "@/modules/orders/services/paymentApi";
import { getApiBaseUrl } from "@/config/api";
import { apiFetch } from "@/config/http";
import { isNetworkError, shouldPreferLocalData } from "@/utils/network";
import { loadCachedBranding } from "@/offline/sessionCache";
import { getCachedRestaurantMetaAsync } from "@/utils/offlineCache";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { useAutoClearMessage } from "@/utils/useAutoClearMessage";
import { PeriodFilterBar, periodToApiDates } from "@/components/shared/PeriodFilterBar";
import { orderTakerDisplay, orderTakerGroupKey, orderTakerRole, isDeliveryOrder } from "@/modules/orders/utils/orderLabels";
import {
  buildCashierReportText,
  downloadTextFile,
  shareReportOnWhatsApp,
  toCsv,
} from "@/utils/roleReportShare";
import {
  loadCashierReportMerged,
  mirrorCashierReport,
  OFFLINE_CASH_METHODS,
  payLocalCashOrder,
  scopeCashierReport,
  claimLocalOrderForCashier,
  onRestaurantRealtime,
  isCashierRealtimeEvent,
} from "@/offline";

const paymentMethods = [
  { label: "Espèces", icon: "Wallet" },
  { label: "Mobile Money", icon: "Phone" },
  { label: "Carte", icon: "ReceiptText" },
];

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function isPaidStatus(status) {
  return ["Payée", "Payee"].includes(String(status || "").trim());
}

function orderCustomerLabel(order) {
  if (order?.table_id) return `${order.table_room ? `${order.table_room} · ` : ""}Table ${order.table_name || order.table_id}`;
  if (order?.fulfillment_type === "Livraison") {
    return [order.customer_name, order.customer_phone, order.delivery_area_name].filter(Boolean).join(" · ");
  }
  return order?.customer_name || "Client";
}

function orderSubtotal(order) {
  return (order?.items ?? [])
    .filter((item) => item.sale_channel !== "EMBALLAGE")
    .reduce((total, item) => total + Number(item.line_total || 0), 0);
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

function emptyReport() {
  return {
    pending_orders_count: 0,
    paid_orders_count: 0,
    receipts_count: 0,
    total_collected: 0,
    total_discounts: 0,
    discounted_orders_count: 0,
    discount_lines: [],
    average_ticket: 0,
    by_payment_method: {},
    pending_orders: [],
    receipts: [],
  };
}

const CASHIER_TABS = [
  { key: "overview", label: "Tableau de bord", icon: "LayoutDashboard" },
  { key: "deliveries", label: "Livraisons", icon: "Truck" },
  { key: "pending", label: "À encaisser", icon: "ClipboardList" },
  { key: "receipts", label: "Encaissés", icon: "ReceiptText" },
  { key: "closing", label: "Clôture", icon: "Clock3" },
];

function resolveCashierTab(activeView) {
  if (["deliveries", "delivery-create", "delivery-orders"].includes(activeView)) {
    return "deliveries";
  }
  if (["payments", "unpaid-orders", "cash-order-detail", "discounts", "payment-method", "cash", "mobile", "card", "payment-validation"].includes(activeView)) {
    return "pending";
  }
  if (["receipts", "print-receipt", "cancel-payment", "completed-payments", "payment-history"].includes(activeView)) {
    return "receipts";
  }
  if (["closing", "cash-closing", "cash-report", "payment-totals"].includes(activeView)) {
    return "closing";
  }
  return "overview";
}

export function CaisseDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;
  const activeView = overrides.__activeView || "dashboard";
  const adminReviewOnly = overrides.__adminReviewOnly === true;
  const [report, setReport] = useState(emptyReport);
  const [restaurant, setRestaurant] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Espèces");
  const [mobileOperator, setMobileOperator] = useState("MTN");
  const [discount, setDiscount] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  useAutoClearMessage(message, setMessage);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [requestActionId, setRequestActionId] = useState("");
  const [activeTab, setActiveTab] = useState(resolveCashierTab(activeView));
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPeriod, setReportPeriod] = useState("today");
  const [reportCustomPeriod, setReportCustomPeriod] = useState({ start: "", end: "" });
  const [offlineHint, setOfflineHint] = useState("");
  const [activePaymentRequest, setActivePaymentRequest] = useState(null);
  const [methodChosen, setMethodChosen] = useState(false);
  const [lastPaidOrder, setLastPaidOrder] = useState(null);
  const [loyaltyPreview, setLoyaltyPreview] = useState(null);
  const restaurantId = currentUser?.restaurant_id;
  const cashierScopeId = adminReviewOnly ? null : currentUser?.id || null;

  useEffect(() => {
    setActiveTab(resolveCashierTab(activeView));
  }, [activeView]);

  useEffect(() => {
    loadCashierReport();
    loadRestaurant();
    loadPaymentRequests();
  }, [reportPeriod, reportCustomPeriod]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return undefined;
    const wsBase = getApiBaseUrl().replace(/^http/, "ws");
    const socket = new WebSocket(`${wsBase}/api/v1/payments/ws?token=${encodeURIComponent(token)}`);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data || "{}");
      if (payload.event?.startsWith("payment_request")) loadPaymentRequests();
      if (payload.event?.startsWith("payment_")) loadCashierReport({ silent: true });
    };
    return () => socket.close();
  }, []);

  useEffect(() => {
    const methodByView = {
      cash: "Espèces",
      mobile: "Mobile Money",
      card: "Carte",
    };
    if (methodByView[activeView]) {
      setPaymentMethod(methodByView[activeView]);
      setMethodChosen(true);
    }
  }, [activeView]);

  useAutoRefresh(() => loadCashierReport({ silent: true }), 10000, [reportPeriod, reportCustomPeriod]);

  useEffect(() => {
    return onRestaurantRealtime((payload) => {
      if (!isCashierRealtimeEvent(payload?.event)) return;
      loadCashierReport({ silent: true });
      loadPaymentRequests();
    });
  }, [reportPeriod, reportCustomPeriod]);

  async function loadCashierReport({ silent = false } = {}) {
    if (!silent) {
      setIsLoading(true);
      setMessage("");
    }

    async function applyLocal() {
      if (!restaurantId) return false;
      const local = await loadCashierReportMerged(restaurantId, null, { cashierUserId: cashierScopeId });
      setReport(local);
      setSelectedOrderId((current) => current || local.pending_orders?.[0]?.id || "");
      setSelectedReceiptId((current) => current || local.receipts?.[0]?.id || "");
      setOfflineHint("Mode hors ligne : caisse locale (espèces / carte uniquement).");
      if (!silent) setMessage("");
      return true;
    }

    if (shouldPreferLocalData() && restaurantId) {
      try {
        await applyLocal();
      } catch {
        if (!silent) setMessage("Impossible de charger la caisse locale.");
      } finally {
        if (!silent) setIsLoading(false);
      }
      return;
    }

    try {
      const data = await orderApi.cashierReport(periodToApiDates(reportPeriod, reportCustomPeriod));
      const scoped = scopeCashierReport(data, cashierScopeId);
      setReport(scoped);
      setSelectedOrderId((current) => current || scoped.pending_orders?.[0]?.id || "");
      setSelectedReceiptId((current) => current || scoped.receipts?.[0]?.id || "");
      setOfflineHint("");
      if (restaurantId) mirrorCashierReport(scoped, restaurantId).catch(() => {});
    } catch (error) {
      if (isNetworkError(error) && restaurantId) {
        try {
          await applyLocal();
        } catch {
          if (!silent) setMessage(error.message || "Impossible de charger la caisse.");
        }
      } else if (!silent) {
        setMessage(error.message || "Impossible de charger la caisse.");
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  async function loadRestaurant() {
    if (shouldPreferLocalData() && restaurantId) {
      const cached = loadCachedBranding(restaurantId);
      const meta = await getCachedRestaurantMetaAsync(restaurantId);
      setRestaurant(cached || meta?.branding || meta?.settings || null);
      return;
    }

    try {
      // /me exige RESTAURANT_SETTINGS_READ (souvent absent pour la caisse).
      // /me/branding est accessible à tout le personnel tenant (nom + logo reçu).
      setRestaurant(await apiFetch("/api/v1/restaurants/me/branding", {
        fallback: "Impossible de charger les informations du restaurant.",
        timeout: 5_000,
      }));
    } catch (error) {
      if (isNetworkError(error) && restaurantId) {
        const cached = loadCachedBranding(restaurantId);
        const meta = await getCachedRestaurantMetaAsync(restaurantId);
        setRestaurant(cached || meta?.branding || meta?.settings || null);
        return;
      }
      try {
        setRestaurant(await apiFetch("/api/v1/restaurants/me", {
          fallback: "Impossible de charger les informations du restaurant.",
          timeout: 5_000,
        }));
      } catch {
        setRestaurant(null);
      }
    }
  }

  async function loadPaymentRequests() {
    try {
      setPaymentRequests(await paymentApi.listRequests("PENDING"));
    } catch {
      // chargement silencieux des demandes serveur
    }
  }

  async function validatePaymentRequest(req) {
    setRequestActionId(req.id);
    setMessage("");
    try {
      const result = await paymentApi.validateRequest(req.id);
      setMessage(result.message || "Demande de paiement validée.");
      await Promise.all([loadPaymentRequests(), loadCashierReport({ silent: true })]);
    } catch (error) {
      setMessage(error.message || "Validation de la demande impossible.");
    } finally {
      setRequestActionId("");
    }
  }

  async function rejectPaymentRequest(req) {
    setRequestActionId(req.id);
    try {
      await paymentApi.rejectRequest(req.id);
      await loadPaymentRequests();
    } catch (error) {
      setMessage(error.message || "Rejet de la demande impossible.");
    } finally {
      setRequestActionId("");
    }
  }

  const query = search.trim().toLowerCase();
  const pendingOrders = useMemo(
    () => (report.pending_orders ?? []).filter((order) => {
      if (!query) return true;
      return [order.order_number, order.customer_name, orderCustomerLabel(order), orderTakerDisplay(order), order.status]
        .join(" ")
        .toLowerCase()
        .includes(query);
    }),
    [report.pending_orders, query]
  );
  const receipts = report.receipts ?? [];
  const selectedOrder = pendingOrders.find((order) => order.id === selectedOrderId) || pendingOrders[0] || null;
  const selectedReceipt = receipts.find((order) => order.id === selectedReceiptId) || receipts[0] || null;

  useEffect(() => {
    if (!selectedOrder?.id || !selectedOrder?.customer_phone) {
      setLoyaltyPreview(null);
      return undefined;
    }
    let cancelled = false;
    apiFetch(`/api/v1/loyalty/preview/${selectedOrder.id}`, {
      fallback: "Carte fidélité indisponible.",
    })
      .then((data) => {
        if (!cancelled) setLoyaltyPreview(data);
      })
      .catch(() => {
        if (!cancelled) setLoyaltyPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrder?.id, selectedOrder?.customer_phone, selectedOrder?.discount_amount]);
  const mobileMoneyTotal = Object.entries(report.by_payment_method ?? {})
    .filter(([method]) => /mobile|orange|mtn/i.test(method))
    .reduce((total, [, amount]) => total + Number(amount || 0), 0);

  const ordersByStaff = useMemo(() => {
    const groups = new Map();
    for (const order of pendingOrders) {
      const key = orderTakerGroupKey(order);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [pendingOrders]);

  const kpis = [
    { label: "Commandes non payées", value: report.pending_orders_count ?? pendingOrders.length, trend: "À encaisser", icon: "ClipboardList", tone: "warning" },
    { label: "Total encaissé", value: money(report.total_collected), trend: "Service du jour", icon: "Wallet", tone: "success" },
    { label: "Mobile Money", value: money(mobileMoneyTotal), trend: "Service du jour", icon: "Phone", tone: "info" },
    { label: "Reçus imprimables", value: report.receipts_count ?? receipts.length, trend: "Commandes payées", icon: "ReceiptText", tone: "default" },
  ];

  function mapRequestMethodToUi(method) {
    if (method === "CASH") return "Espèces";
    if (method === "ORANGE" || method === "MTN") return "Mobile Money";
    return "";
  }

  function mapOrderMethodToUi(method) {
    const value = String(method || "");
    if (/espèce|espece|cash/i.test(value)) return "Espèces";
    if (/orange|mtn|mobile/i.test(value)) return "Mobile Money";
    if (/carte|card/i.test(value)) return "Carte";
    return "";
  }

  async function openPaymentModal(order, request = null) {
    if (!adminReviewOnly && cashierScopeId) {
      try {
        if (shouldPreferLocalData() || isLocalIdSafe(order.id)) {
          await claimLocalOrderForCashier(order, restaurantId, currentUser);
        } else {
          await orderApi.claimForCashier(order.id);
        }
      } catch (error) {
        setMessage(error.message || "Cette commande est déjà prise en charge par une autre caissière.");
        return;
      }
    }
    setSelectedOrderId(order.id);
    setDiscount(order.discount_amount ? String(order.discount_amount) : "");
    setActivePaymentRequest(request);
    const suggested = request
      ? mapRequestMethodToUi(request.method)
      : mapOrderMethodToUi(order.payment_method);
    setPaymentMethod(suggested);
    setMethodChosen(Boolean(suggested));
    if (request?.method === "ORANGE" || request?.method === "MTN") {
      setMobileOperator(request.method === "ORANGE" ? "ORANGE" : "MTN");
    }
    setShowPaymentModal(true);
    setLastPaidOrder(null);
  }

  async function openPaymentRequest(req) {
    setRequestActionId(req.id);
    setMessage("");
    try {
      const order = await orderApi.get(req.order_id);
      openPaymentModal(order, req);
    } catch (error) {
      setMessage(error.message || "Impossible d'ouvrir la facture de cette demande.");
    } finally {
      setRequestActionId("");
    }
  }

  function resolveMobileMoneyLabel() {
    if (activePaymentRequest?.method === "ORANGE") return "Orange Money";
    if (activePaymentRequest?.method === "MTN") return "MTN Mobile Money";
    return mobileOperator === "ORANGE" ? "Orange Money" : "MTN Mobile Money";
  }

  async function validatePayment() {
    if (!selectedOrder) return;
    if (!methodChosen || !paymentMethod) {
      setMessage("Sélectionnez d'abord le mode de paiement (Espèces, Mobile Money ou Carte).");
      return;
    }
    setIsLoading(true);
    setMessage("");
    const discountAmount = Number(discount || selectedOrder.discount_amount || 0);
    const isMobileMoney = paymentMethod === "Mobile Money";
    const actualMethod = isMobileMoney ? resolveMobileMoneyLabel() : paymentMethod;
    const payload = { payment_method: actualMethod, discount_amount: discountAmount };

    async function settleOffline() {
      if (!OFFLINE_CASH_METHODS.has(actualMethod)) {
        throw new Error("Mode de paiement non pris en charge hors ligne.");
      }
      const result = await payLocalCashOrder(selectedOrder, {
        payment_method: actualMethod,
        discount_amount: discountAmount,
        restaurantId,
        cashier: currentUser,
      });
      setReport(result.report);
      setDiscount("");
      setSelectedOrderId("");
      setSelectedReceiptId(result.order.id);
      setActivePaymentRequest(null);
      setLastPaidOrder(result.order);
      setOfflineHint("Paiement enregistré localement. Sync à la reconnexion.");
      setMessage(`Paiement local validé pour ${result.order.order_number} · ${actualMethod}.`);
      setShowPaymentModal(false);
      setActiveTab("receipts");
    }

    if (shouldPreferLocalData() || isLocalIdSafe(selectedOrder.id)) {
      try {
        await settleOffline();
      } catch (error) {
        setMessage(error.message || "Paiement local impossible.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const paid = await orderApi.validatePayment(selectedOrder.id, payload);
      setDiscount("");
      setSelectedOrderId("");
      setSelectedReceiptId(paid.id);
      setActivePaymentRequest(null);
      setLastPaidOrder(paid);
      setMessage(`Paiement validé pour ${paid.order_number} · ${paid.payment_method || actualMethod}.`);
      await Promise.all([loadPaymentRequests(), loadCashierReport()]);
      setShowPaymentModal(false);
      setActiveTab("receipts");
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          await settleOffline();
        } catch (localErr) {
          setMessage(localErr.message || "Validation du paiement impossible.");
        }
      } else {
        setMessage(error.message || "Validation du paiement impossible.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function isLocalIdSafe(id) {
    return String(id || "").startsWith("local_");
  }

  async function applyPromo() {
    if (!selectedOrder || !promoCode.trim()) return;
    setIsLoading(true);
    setMessage("");
    try {
      const updated = await orderApi.applyPromo(selectedOrder.id, promoCode);
      setDiscount(updated.discount_amount ? String(updated.discount_amount) : "");
      setPromoCode("");
      setReport((current) => ({
        ...current,
        pending_orders: (current.pending_orders ?? []).map((order) => (order.id === updated.id ? updated : order)),
      }));
      setMessage(`Code promo appliqué sur ${updated.order_number}.`);
    } catch (error) {
      setMessage(error.message || "Application du code promo impossible.");
    } finally {
      setIsLoading(false);
    }
  }

  async function cancelPayment(order) {
    if (!order) return;
    setIsLoading(true);
    setMessage("");
    try {
      const updated = await orderApi.cancelPayment(order.id);
      setSelectedOrderId(updated.id);
      setSelectedReceiptId("");
      setMessage(`Paiement annulé pour ${order.order_number}. La commande revient à encaisser.`);
      await loadCashierReport();
    } catch (error) {
      setMessage(error.message || "Annulation du paiement impossible.");
    } finally {
      setIsLoading(false);
    }
  }

  async function printReceipt(order) {
    if (!order) return;
    const printable = await orderApi.logReceiptPrint(order.id).catch(() => order);
    openPrintWindow(receiptHtml(printable, restaurant, currentUser), `Reçu ${order.order_number}`);
  }

  function printCashReport() {
    openPrintWindow(reportHtml(report, currentUser), "Rapport de caisse");
  }

  function shareCashReportWhatsApp() {
    const text = buildCashierReportText({
      name: [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ") || currentUser?.username,
      report,
    });
    shareReportOnWhatsApp(text, restaurant?.whatsapp_phone);
  }

  function exportCashReportCsv() {
    const rows = [
      ["Indicateur", "Valeur"],
      ["Total encaissé", report.total_collected],
      ["Réductions", report.total_discounts],
      ["Transactions", report.paid_orders_count],
      [],
      ["Mode de paiement", "Montant"],
      ...Object.entries(report.by_payment_method || {}).map(([method, amount]) => [method, amount]),
    ];
    downloadTextFile(`rapport-caisse-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${toCsv(rows)}`);
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={adminReviewOnly ? "Administration" : "Caisse"}
        title={adminReviewOnly ? "Suivi caisse" : "Mon espace caissière"}
        subtitle={
          adminReviewOnly
            ? "Consultez les paiements et validez uniquement les annulations de facture."
            : `Bienvenue${currentUser?.first_name ? `, ${currentUser.first_name}` : ""}. Vos commandes à encaisser et vos encaissements — les autres caissières ne voient pas votre activité.`
        }
        primaryAction={
          !adminReviewOnly && (
            <SecondaryAction icon="BarChart3" onClick={() => setShowReportModal(true)}>
              Rapport caisse
            </SecondaryAction>
          )
        }
        meta={[
          <span key="orders">{pendingOrders.length.toLocaleString("fr-FR")} commande(s) à encaisser</span>,
          <span key="receipts">{receipts.length.toLocaleString("fr-FR")} reçu(s)</span>,
        ]}
      />

      {offlineHint && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {offlineHint}
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        {CASHIER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black transition ${
              activeTab === tab.key
                ? "bg-emerald-700 text-white"
                : "border border-slate-200 text-slate-600 hover:border-emerald-600 hover:text-emerald-700"
            }`}
          >
            <DashboardIcon name={tab.icon} size={16} />
            {tab.label}
            {tab.key === "pending" && pendingOrders.length > 0 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{pendingOrders.length}</span>
            )}
          </button>
        ))}
      </div>

      {(activeTab === "overview" || activeTab === "pending") && (
        <FilterBar right={isLoading ? <span className="text-xs font-black uppercase text-slate-400">Synchronisation...</span> : null}>
          <label className="flex h-10 min-w-[260px] flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm focus-within:border-emerald-600">
            <DashboardIcon name="Search" size={17} className="text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher commande, table, serveur..."
              className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
            />
          </label>
        </FilterBar>
      )}

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((item) => (
              <StatCard key={item.label} {...item} />
            ))}
          </div>

          <CashDrawerSessionPanel
            key={`drawer-${report.paid_orders_count || 0}-${report.total_collected || 0}`}
            adminReviewOnly={adminReviewOnly}
            onMessage={setMessage}
          />

          {!adminReviewOnly && paymentRequests.length > 0 && (
            <DashboardSection title="Demandes de paiement serveur" action={<SmallMeta>{paymentRequests.length} en attente</SmallMeta>}>
              <PaymentRequestsList
                requests={paymentRequests}
                actionId={requestActionId}
                onValidate={openPaymentRequest}
                onReject={rejectPaymentRequest}
              />
            </DashboardSection>
          )}

          <DashboardSection
            title="Commandes en attente"
            action={
              <button type="button" onClick={() => setActiveTab("pending")} className="text-xs font-black text-emerald-700 hover:underline">
                Voir tout →
              </button>
            }
          >
            <PendingOrdersByStaff
              groups={ordersByStaff.slice(0, 4)}
              onSelect={openPaymentModal}
              compact
            />
          </DashboardSection>
        </div>
      )}

      {activeTab === "deliveries" && !adminReviewOnly && (
        <DeliveryCashierPanel
          restaurantId={currentUser?.restaurant_id}
          currentUser={currentUser}
          onMessage={setMessage}
        />
      )}

      {activeTab === "pending" && (
        <DashboardSection title="Commandes à encaisser" action={<SmallMeta>{pendingOrders.length} en attente</SmallMeta>}>
          <PendingOrdersByStaff groups={ordersByStaff} onSelect={openPaymentModal} />
        </DashboardSection>
      )}

      {activeTab === "receipts" && (
        <>
          {lastPaidOrder && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              <span>
                Transaction enregistrée · {lastPaidOrder.order_number} · {lastPaidOrder.payment_method || "—"} · {money(lastPaidOrder.total_amount)}
              </span>
              <button
                type="button"
                onClick={() => printReceipt(lastPaidOrder)}
                className="lte-btn lte-btn-primary lte-btn-sm"
              >
                Imprimer le reçu
              </button>
            </div>
          )}
          <FilterBar className="mb-4">
            <PeriodFilterBar
              period={reportPeriod}
              onPeriodChange={setReportPeriod}
              customPeriod={reportCustomPeriod}
              onCustomPeriodChange={setReportCustomPeriod}
            />
          </FilterBar>
          <InvoiceHistoryPanel
            key={`${reportPeriod}-${lastPaidOrder?.id || "none"}-${report.paid_orders_count || 0}`}
            allowRefund={!adminReviewOnly}
            adminReviewOnly={adminReviewOnly}
            onMessage={setMessage}
          />
        </>
      )}

      {activeTab === "closing" && (
        <div className="grid gap-5 md:grid-cols-2">
          <CashDrawerSessionPanel
            key={`drawer-close-${report.paid_orders_count || 0}-${report.total_collected || 0}`}
            adminReviewOnly={adminReviewOnly}
            onMessage={setMessage}
          />

          <DashboardSection title="Récapitulatif du service">
            <div className="rounded-lg bg-emerald-50 p-6">
              <p className="text-sm font-semibold text-slate-600">Total encaissé aujourd'hui</p>
              <p className="mt-2 text-4xl font-black text-slate-950">{money(report.total_collected)}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Transactions" value={Number(report.paid_orders_count || 0).toLocaleString("fr-FR")} />
              <Metric label="Panier moyen" value={money(report.average_ticket)} />
            </div>
            <button type="button" onClick={() => setShowReportModal(true)} className="mt-5 h-11 w-full rounded-lg bg-emerald-700 font-black text-white">
              Ouvrir le rapport de caisse
            </button>
          </DashboardSection>

          <DashboardSection title="Répartition par mode de paiement">
            <PaymentTotals rows={report.by_payment_method ?? {}} />
          </DashboardSection>

          {(report.discounted_orders_count || 0) > 0 && (
            <DashboardSection title="Réductions du service" action={<SmallMeta>{report.discounted_orders_count} remise(s)</SmallMeta>}>
              <div className="mb-4 rounded-lg bg-red-50 p-4">
                <p className="text-sm font-semibold text-slate-600">Total des réductions accordées</p>
                <p className="mt-1 text-2xl font-black text-red-600">- {money(report.total_discounts)}</p>
              </div>
              <DiscountLinesTable lines={report.discount_lines ?? []} />
            </DashboardSection>
          )}
        </div>
      )}

      <AdminFormModal
        open={showPaymentModal && Boolean(selectedOrder)}
        onClose={() => {
          setShowPaymentModal(false);
          setActivePaymentRequest(null);
        }}
        title={selectedOrder ? `Facture · ${selectedOrder.order_number}` : ""}
        description={selectedOrder ? `${orderCustomerLabel(selectedOrder)}${orderTakerDisplay(selectedOrder, "") ? ` · ${orderTakerRole(selectedOrder)} ${orderTakerDisplay(selectedOrder)}` : ""}` : ""}
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setShowPaymentModal(false);
                setActivePaymentRequest(null);
              }}
              className="lte-btn lte-btn-default"
            >
              Fermer
            </button>
            {!adminReviewOnly && (
              <button
                type="button"
                disabled={isLoading || selectedOrder?.payment_locked || !methodChosen}
                onClick={validatePayment}
                className="lte-btn lte-btn-primary"
              >
                {selectedOrder?.payment_locked
                  ? "Paiement en attente"
                  : "Valider le paiement"}
              </button>
            )}
          </>
        }
      >
        {selectedOrder && (
          <div className="space-y-5">
            <OrderDetail order={selectedOrder} discountPreview={discount} paymentRequest={activePaymentRequest} />
            {loyaltyPreview && (
              <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                loyaltyPreview.free_dishes > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-100 bg-amber-50 text-amber-900"
              }`}
              >
                <p className="font-black">Carte fidélité · 9 plats → 10e offert</p>
                <p className="mt-1">{loyaltyPreview.message}</p>
                {loyaltyPreview.free_dishes > 0 && (
                  <p className="mt-1 font-black">
                    Remise fidélité prévue : −{Number(loyaltyPreview.discount_amount || 0).toLocaleString("fr-FR")} FCFA
                  </p>
                )}
              </div>
            )}
            {!adminReviewOnly && (
              <>
                <div>
                  <p className="text-sm font-black text-slate-950">Mode de paiement</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Vérifiez puis sélectionnez le mode avant de valider. L&apos;impression se fait après validation.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.label}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(method.label);
                          setMethodChosen(true);
                        }}
                        className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-black ${
                          methodChosen && paymentMethod === method.label
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 text-slate-700"
                        }`}
                      >
                        <DashboardIcon name={method.icon} size={18} />
                        {method.label}
                      </button>
                    ))}
                  </div>
                  {!methodChosen && (
                    <p className="mt-2 text-xs font-bold text-amber-700">Sélectionnez un mode de paiement pour activer la validation.</p>
                  )}
                </div>
                {paymentMethod === "Mobile Money" && (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-sm font-black text-slate-950">Opérateur Mobile Money</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      Vérifiez le dépôt reçu sur le téléphone, puis validez. Aucun push USSD n&apos;est envoyé.
                    </p>
                    <select
                      value={mobileOperator}
                      onChange={(event) => setMobileOperator(event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-black text-slate-700 outline-none"
                    >
                      <option value="MTN">MTN Mobile Money</option>
                      <option value="ORANGE">Orange Money</option>
                    </select>
                  </div>
                )}
                <label className="block">
                  <span className="text-xs font-black uppercase text-slate-500">Réduction autorisée</span>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    placeholder="0"
                    className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 outline-none focus:border-emerald-600"
                  />
                </label>
                <div>
                  <span className="text-xs font-black uppercase text-slate-500">Code promo</span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={promoCode}
                      onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                      placeholder="Ex. BIENVENUE"
                      className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 outline-none focus:border-emerald-600"
                    />
                    <button type="button" disabled={isLoading || !promoCode.trim()} onClick={applyPromo} className="h-11 rounded-lg border border-emerald-200 px-4 text-sm font-black text-emerald-700 disabled:opacity-60">
                      Appliquer
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => printReceipt(selectedOrder)}
                  disabled={!isPaidStatus(selectedOrder.status)}
                  className="h-11 w-full rounded-lg border border-emerald-200 font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPaidStatus(selectedOrder.status) ? "Imprimer le reçu" : "Imprimer après validation du paiement"}
                </button>
              </>
            )}
          </div>
        )}
      </AdminFormModal>

      <AdminFormModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        title="Rapport de caisse"
        description="Vision complète des encaissements, écarts, performances et alertes."
        size="xl"
        footer={
          <>
            <button type="button" onClick={() => setShowReportModal(false)} className="lte-btn lte-btn-default">
              Fermer
            </button>
            <button type="button" onClick={exportCashReportCsv} className="lte-btn lte-btn-default">
              <DashboardIcon name="Download" size={16} />
              Exporter CSV
            </button>
            <button type="button" onClick={shareCashReportWhatsApp} className="lte-btn lte-btn-default">
              <DashboardIcon name="Phone" size={16} />
              WhatsApp
            </button>
            <button type="button" onClick={printCashReport} className="lte-btn lte-btn-primary">
              <DashboardIcon name="ReceiptText" size={16} />
              Imprimer le rapport
            </button>
          </>
        }
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <CashierReportAnalytics report={report} />
          <div>
            <p className="mb-3 text-sm font-black text-slate-900">Derniers reçus</p>
            <ReceiptsTable
              receipts={receipts.slice(0, 5)}
              selectedReceiptId=""
              onSelect={() => {}}
              onPrint={printReceipt}
              onCancel={cancelPayment}
              isLoading={isLoading}
              adminReviewOnly={adminReviewOnly}
              hideActions={adminReviewOnly}
            />
          </div>
        </div>
      </AdminFormModal>
    </PageContainer>
  );
}

function PendingOrdersByStaff({ groups, onSelect, compact = false }) {
  if (!groups.length) return <EmptyState text="Aucune commande prête ou servie à encaisser." />;

  return (
    <div className="space-y-6">
      {groups.map(([staffName, orders]) => (
        <div key={staffName} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <DashboardIcon name="User" size={16} className="text-emerald-700" />
              <p className="text-sm font-black text-slate-900">{staffName}</p>
            </div>
            <SmallMeta>{orders.length} commande(s)</SmallMeta>
          </div>
          <div className="overflow-x-auto">
            <table className="lte-table min-w-[760px]">
              <thead>
                <tr>
                  <th className="py-3">N° Commande</th>
                  <th className="py-3">Table / Client</th>
                  <th className="py-3">Montant</th>
                  <th className="py-3">Statut</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(compact ? orders.slice(0, 3) : orders).map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="py-3 font-black text-slate-950">{order.order_number}</td>
                    <td className="py-3 font-semibold text-slate-600">{orderCustomerLabel(order)}</td>
                    <td className="py-3 font-black text-slate-900">{money(order.total_amount)}</td>
                    <td className="py-3"><StatusBadge status={order.status} /></td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelect(order)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                      >
                        <DashboardIcon name="Wallet" size={14} />
                        Ouvrir la facture
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiscountLinesTable({ lines }) {
  if (!lines.length) {
    return <EmptyState text="Aucune réduction appliquée sur cette période." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[680px]">
        <thead>
          <tr>
            <th>Commande</th>
            <th>Serveur</th>
            <th>Caissier</th>
            <th>Réduction</th>
            <th>Total payé</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line) => (
            <tr key={line.order_id}>
              <td className="py-3 font-black text-slate-950">{line.order_number}</td>
              <td className="py-3 font-semibold text-slate-600">{line.server_name || "—"}</td>
              <td className="py-3 font-semibold text-slate-600">{line.cashier_name || "—"}</td>
              <td className="py-3 font-black text-red-600">- {money(line.discount_amount)}</td>
              <td className="py-3 font-black text-slate-900">{money(line.total_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentTotals({ rows }) {
  const entries = Object.entries(rows);
  if (!entries.length) return <EmptyState text="Aucun paiement validé pour le moment." />;
  const total = entries.reduce((sum, [, amount]) => sum + Number(amount || 0), 0);
  return (
    <div className="space-y-3">
      {entries.map(([method, amount]) => (
        <div key={method} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm">
          <span className="font-black text-slate-700">{method}</span>
          <span className="font-black text-slate-950">{money(amount)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-4 text-sm">
        <span className="font-black uppercase text-emerald-700">Total</span>
        <span className="text-lg font-black text-emerald-900">{money(total)}</span>
      </div>
    </div>
  );
}

function SmallMeta({ children }) {
  if (!children) return null;
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-500">
      {children}
    </span>
  );
}

const REQUEST_METHOD_LABELS = { ORANGE: "Orange Money", MTN: "MTN Mobile Money", CASH: "Espèces" };

function PaymentRequestsList({ requests, actionId, onValidate, onReject }) {
  return (
    <div className="divide-y divide-slate-100">
      {requests.map((req) => {
        const busy = actionId === req.id;
        return (
          <div key={req.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-black text-slate-950">
                {req.order_number || req.order_id} · {money(req.amount)}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {REQUEST_METHOD_LABELS[req.method] || req.method}
                {req.payer_msisdn ? ` · ${req.payer_msisdn}` : ""}
                {req.requested_by_name ? ` · par ${req.requested_by_name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onValidate(req)}
                disabled={busy}
                className="lte-btn lte-btn-primary lte-btn-sm"
              >
                <DashboardIcon name="CheckCircle2" size={15} />
                {busy ? "..." : "Ouvrir la facture"}
              </button>
              <button
                type="button"
                onClick={() => onReject(req)}
                disabled={busy}
                className="lte-btn lte-btn-danger lte-btn-sm"
              >
                Rejeter
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReceiptsTable({ receipts, selectedReceiptId, onSelect, onPrint, onCancel, isLoading, adminReviewOnly = false, hideActions = false }) {
  if (!receipts.length) return <EmptyState text="Aucun reçu généré aujourd'hui." />;

  return (
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[760px]">
        <tbody className="divide-y divide-slate-100">
          {receipts.slice(0, 8).map((order) => (
            <tr
              key={order.id}
              onClick={() => onSelect(order)}
              className={`cursor-pointer ${selectedReceiptId === order.id ? "bg-emerald-50" : "hover:bg-slate-50"}`}
            >
              <td className="py-3 font-black text-slate-950">{order.order_number}</td>
              <td className="py-3 font-semibold text-slate-500">{formatDateTime(order.updated_at)}</td>
              <td className="py-3 font-semibold text-slate-600">{orderCustomerLabel(order)}</td>
              <td className="py-3 font-black text-slate-950">{money(order.total_amount)}</td>
              {!hideActions && (
              <td className="py-3 text-right">
                <button type="button" onClick={(event) => { event.stopPropagation(); onPrint(order); }} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-black text-emerald-700">
                  {adminReviewOnly ? "Consulter" : "Imprimer"}
                </button>
                <button type="button" disabled={isLoading} onClick={(event) => { event.stopPropagation(); onCancel(order); }} className="ml-2 rounded-md border border-red-200 px-3 py-1.5 text-xs font-black text-red-600 disabled:opacity-60">
                  {adminReviewOnly ? "Valider annulation" : "Annuler"}
                </button>
              </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderDetail({ order, discountPreview, paymentRequest = null }) {
  const visibleItems = (order.items ?? []).filter((item) => item.sale_channel !== "EMBALLAGE");
  const subtotal = orderSubtotal(order);
  const discount = Number(discountPreview || order.discount_amount || 0);
  const total = Math.max(0, subtotal + Number(order.delivery_fee || 0) - discount);
  const suggestedMethod = paymentRequest
    ? (REQUEST_METHOD_LABELS[paymentRequest.method] || paymentRequest.method)
    : order.payment_method;

  return (
    <div>
      <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600 sm:grid-cols-2">
        <p><span className="font-black text-slate-800">Statut :</span> {order.status}</p>
        <p><span className="font-black text-slate-800">Mode suggéré :</span> {suggestedMethod || "À choisir"}</p>
        {paymentRequest?.payer_msisdn && (
          <p><span className="font-black text-slate-800">N° Mobile Money :</span> {paymentRequest.payer_msisdn}</p>
        )}
        {paymentRequest?.requested_by_name && (
          <p><span className="font-black text-slate-800">Demandé par :</span> {paymentRequest.requested_by_name}</p>
        )}
        {order.notes && (
          <p className="sm:col-span-2"><span className="font-black text-slate-800">Commentaire :</span> {order.notes}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="lte-table min-w-[520px]">
          <thead>
            <tr>
              <th className="py-3">Article</th>
              <th className="py-3 text-center">Qté</th>
              <th className="py-3 text-right">Prix unitaire</th>
              <th className="py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td className="py-3 font-semibold text-slate-700">{item.name}</td>
                <td className="py-3 text-center font-semibold text-slate-600">{item.quantity}</td>
                <td className="py-3 text-right font-semibold text-slate-600">{money(item.unit_price)}</td>
                <td className="py-3 text-right font-black text-slate-900">{money(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 space-y-2 text-sm font-bold">
        <p className="flex justify-between"><span>Sous-total</span><span>{money(subtotal)}</span></p>
        <p className="flex justify-between"><span>Réduction</span><span className="text-red-500">- {money(discount)}</span></p>
        <p className="flex justify-between border-t border-dashed border-slate-200 pt-4 text-2xl font-black text-slate-950">
          <span>Total à payer</span><span>{money(total)}</span>
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    "Prête": "bg-emerald-50 text-emerald-700",
    "Livrée": "bg-blue-50 text-blue-700",
    "Payée": "bg-violet-50 text-violet-700",
    "En préparation": "bg-orange-50 text-orange-600",
  };
  return <span className={`rounded-md px-3 py-1 text-xs font-black ${colors[status] ?? "bg-slate-50 text-slate-600"}`}>{status}</span>;
}

function EmptyState({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function receiptHtml(order, restaurant, currentUser) {
  const VAT_RATE = 0.1925;
  const currency = restaurant?.currency || "XAF";
  const receiptMoney = (value) => {
    const amount = Number(value || 0).toLocaleString("fr-FR");
    return currency === "XAF" ? `${amount} FCFA` : `${amount} ${currency}`;
  };
  const restaurantName = (restaurant?.name || restaurant?.legal_name || "").trim() || "Établissement";
  const legalName = (restaurant?.legal_name || "").trim();
  const showLegalName = legalName && legalName.toLowerCase() !== restaurantName.toLowerCase();
  const rawLogo = restaurant?.logo_url || "";
  const logoUrl = rawLogo && !/^https?:\/\//i.test(rawLogo)
    ? `${getApiBaseUrl()}${rawLogo.startsWith("/") ? "" : "/"}${rawLogo}`
    : rawLogo;
  const cashierName = order.cashier_name
    || order.created_by_cashier_name
    || order.order_taker_name
    || [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ")
    || currentUser?.username
    || "Non renseigné";
  const staffName = isDeliveryOrder(order)
    ? (order.order_taker_name || order.created_by_cashier_name || order.cashier_name || "Non renseignée")
    : (order.server_name || "Non assigné");
  const items = order.items ?? [];
  const subtotal = items.reduce((total, item) => total + Number(item.line_total || 0), 0);
  const totalTtc = Number(order.total_amount || 0);
  const totalHt = totalTtc / (1 + VAT_RATE);
  const totalTva = totalTtc - totalHt;
  const printCount = Number(order.print_count || 1);
  const receiptNumber = `${order.order_number}-${String(printCount).padStart(3, "0")}`;
  const rows = items.map((item) => `
    <tr>
      <td class="item">${escapeHtml(item.name)}</td>
      <td class="qty">${item.quantity}</td>
      <td class="amount">${receiptMoney(item.line_total)}</td>
    </tr>
    <tr class="unit-row">
      <td colspan="3">${item.quantity} x ${receiptMoney(item.unit_price)}</td>
    </tr>
  `).join("");
  const restaurantLines = [
    restaurant?.address,
    [restaurant?.city, restaurant?.country].filter(Boolean).join(", "),
    restaurant?.postal_box ? `B.P. ${restaurant.postal_box}` : "",
    restaurant?.phone ? `Tél. ${restaurant.phone}` : "",
    restaurant?.email,
    restaurant?.website_url,
  ].filter(Boolean);
  return `<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Reçu ${escapeHtml(order.order_number)}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html, body {
            width: 80mm;
            margin: 0;
            padding: 0;
            color: #000;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            line-height: 1.35;
            font-weight: 700;
            -webkit-font-smoothing: none;
            text-rendering: geometricPrecision;
          }
          .receipt { width: 76mm; margin: 0 auto; padding: 1mm 2mm; }
          h1 {
            margin: 0 0 4px;
            font-size: 18px;
            line-height: 1.15;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 0.2px;
          }
          p { margin: 3px 0; color: #000; }
          .center { text-align: center; }
          .muted { font-size: 12px; font-weight: 700; color: #000; }
          .logo { max-height: 40px; max-width: 48mm; object-fit: contain; image-rendering: crisp-edges; }
          .separator { margin: 8px 0; border-top: 2px dashed #000; }
          .meta { display: grid; grid-template-columns: 26mm 1fr; gap: 3px 2mm; font-size: 12px; }
          .meta strong { white-space: nowrap; font-weight: 800; }
          .title { font-size: 15px; font-weight: 800; letter-spacing: 0.3px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th {
            padding: 4px 0;
            border-bottom: 2px solid #000;
            text-align: left;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
          }
          td { padding: 5px 0 0; vertical-align: top; font-size: 13px; font-weight: 700; color: #000; }
          .item { width: auto; padding-right: 2mm; overflow-wrap: anywhere; }
          .qty { width: 9mm; text-align: center; font-weight: 800; }
          .amount { width: 24mm; text-align: right; white-space: nowrap; font-weight: 800; }
          .unit-row td {
            padding: 0 0 4px;
            border-bottom: 1px solid #000;
            color: #000;
            font-size: 11px;
            font-weight: 700;
          }
          .summary { margin-top: 8px; font-size: 13px; }
          .summary-row { display: flex; justify-content: space-between; gap: 4mm; margin: 3px 0; font-weight: 700; }
          .total {
            margin-top: 6px;
            padding-top: 6px;
            border-top: 3px solid #000;
            font-size: 16px;
            font-weight: 900;
          }
          .footer { margin-top: 10px; border-top: 2px dashed #000; padding-top: 8px; text-align: center; font-size: 12px; }
          @media screen { body { margin: 12px auto; } }
          @media print {
            html, body { width: 80mm; }
            .receipt { width: 76mm; }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          ${logoUrl ? `<p class="center"><img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(restaurantName)}" /></p>` : ""}
          <h1>${escapeHtml(restaurantName)}</h1>
          ${showLegalName ? `<p class="center muted">${escapeHtml(legalName)}</p>` : ""}
          ${restaurantLines.map((line) => `<p class="center muted">${escapeHtml(line)}</p>`).join("")}
          ${restaurant?.nui ? `<p class="center"><strong>NUI : ${escapeHtml(restaurant.nui)}</strong></p>` : ""}
          ${restaurant?.tax_id ? `<p class="center muted">RC/ID fiscal : ${escapeHtml(restaurant.tax_id)}</p>` : ""}
          <div class="separator"></div>
          <p class="center title">REÇU DE PAIEMENT</p>
          <p class="center muted">N° reçu : ${escapeHtml(receiptNumber)}${printCount > 1 ? ` · Duplicata ${printCount}` : ""}</p>
          <p class="center muted">Créée le ${formatDateTime(order.created_at || order.updated_at || new Date().toISOString())}</p>
          <div class="separator"></div>
          <div class="meta">
            <strong>Commande</strong><span>${escapeHtml(order.order_number)}</span>
            <strong>Restaurant</strong><span>${escapeHtml(restaurant?.name || restaurantName)}</span>
            <strong>Client</strong><span>${escapeHtml(order.customer_name || orderCustomerLabel(order) || "Client anonyme")}</span>
            ${isDeliveryOrder(order)
              ? `<strong>Quartier</strong><span>${escapeHtml(order.delivery_area_name || "-")}</span>
            <strong>Prise en charge</strong><span>${escapeHtml(staffName)}</span>`
              : `<strong>Table</strong><span>${escapeHtml(order.table_id ? `${order.table_room || "Salle"} · Table ${order.table_name || order.table_id}` : "-")}</span>
            <strong>Serveur</strong><span>${escapeHtml(staffName)}</span>
            <strong>Caissier</strong><span>${escapeHtml(cashierName)}</span>`}
            <strong>Paiement</strong><span>${escapeHtml(order.payment_method || "Non renseigné")}</span>
            ${order.notes && String(order.notes).includes("Fidélité")
              ? `<strong>Fidélité</strong><span>${escapeHtml(String(order.notes).split("|").map((p) => p.trim()).find((p) => p.startsWith("Fidélité")) || "Plat offert")}</span>`
              : ""}
            <strong>Encaissement</strong><span>${escapeHtml(formatDateTime(order.paid_at || order.updated_at || new Date().toISOString()))}</span>
            <strong>Impression</strong><span>${escapeHtml(formatDateTime(order.printed_at || new Date().toISOString()))}</span>
            ${order.transaction_id ? `<strong>Transaction</strong><span>${escapeHtml(order.transaction_id)}</span>` : ""}
          </div>
          <div class="separator"></div>
          <table>
            <thead><tr><th>Article</th><th class="qty">Qté</th><th class="amount">Montant</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="summary">
            <div class="summary-row"><span>Sous-total articles</span><span>${receiptMoney(subtotal)}</span></div>
            ${Number(order.discount_amount || 0) > 0 ? `<div class="summary-row"><span>Remise</span><span>-${receiptMoney(order.discount_amount)}</span></div>` : ""}
            ${Number(order.delivery_fee || 0) > 0 ? `<div class="summary-row"><span>Livraison</span><span>${receiptMoney(order.delivery_fee)}</span></div>` : ""}
            <div class="summary-row"><span>Total HT</span><span>${receiptMoney(totalHt)}</span></div>
            <div class="summary-row"><span>TVA (19,25 %)</span><span>${receiptMoney(totalTva)}</span></div>
            <div class="summary-row total"><span>TOTAL TTC</span><span>${receiptMoney(totalTtc)}</span></div>
          </div>
          <div class="footer">
            <p><strong>Merci pour votre visite.</strong></p>
            ${restaurant?.opening_hours ? `<p class="muted">${escapeHtml(restaurant.opening_hours)}</p>` : ""}
            ${restaurant?.website_url ? `<p class="muted">${escapeHtml(restaurant.website_url)}</p>` : ""}
          </div>
        </div>
        <script>window.print(); window.onafterprint = () => window.close();</script>
      </body>
    </html>`;
}

function reportHtml(report, user) {
  const methodRows = Object.entries(report.by_payment_method ?? {}).map(([method, amount]) => `
    <tr><td>${escapeHtml(method)}</td><td style="text-align:right;">${money(amount)}</td></tr>
  `).join("");
  const discountRows = (report.discount_lines ?? []).map((line) => `
    <tr>
      <td>${escapeHtml(line.order_number)}</td>
      <td>${escapeHtml(line.server_name || "-")}</td>
      <td>${escapeHtml(line.cashier_name || "-")}</td>
      <td style="text-align:right; color:#dc2626;">-${money(line.discount_amount)}</td>
      <td style="text-align:right;">${money(line.total_amount)}</td>
    </tr>
  `).join("");
  const receiptRows = (report.receipts ?? []).map((order) => `
    <tr>
      <td>${escapeHtml(order.order_number)}</td>
      <td>${escapeHtml(orderCustomerLabel(order))}</td>
      <td>${escapeHtml(order.payment_method)}</td>
      <td style="text-align:right;">${money(order.total_amount)}</td>
    </tr>
  `).join("");
  return `<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Rapport de caisse</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; padding: 28px; }
          h1 { margin: 0; font-size: 24px; }
          .muted { color: #6b7280; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 22px 0; }
          .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
          .box strong { display: block; margin-top: 6px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 0; text-align: left; }
          th { color: #374151; font-size: 11px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <h1>Rapport de caisse</h1>
        <p class="muted">Caissier: ${escapeHtml(user?.first_name || user?.username || "-")} · Généré le ${formatDateTime(new Date().toISOString())}</p>
        <div class="grid">
          <div class="box">Total encaissé<strong>${money(report.total_collected)}</strong></div>
          <div class="box">Réductions<strong style="color:#dc2626;">-${money(report.total_discounts)}</strong></div>
          <div class="box">Transactions<strong>${Number(report.paid_orders_count || 0).toLocaleString("fr-FR")}</strong></div>
        </div>
        <h2>Modes de paiement</h2>
        <table><tbody>${methodRows || "<tr><td>Aucun paiement</td><td></td></tr>"}</tbody></table>
        <h2>Réductions accordées (${Number(report.discounted_orders_count || 0)})</h2>
        <table>
          <thead><tr><th>Commande</th><th>Serveur</th><th>Caissier</th><th style="text-align:right;">Réduction</th><th style="text-align:right;">Total payé</th></tr></thead>
          <tbody>${discountRows || "<tr><td colspan=\"5\">Aucune réduction</td></tr>"}</tbody>
        </table>
        <h2>Reçus</h2>
        <table>
          <thead><tr><th>Commande</th><th>Client/Table</th><th>Paiement</th><th style="text-align:right;">Montant</th></tr></thead>
          <tbody>${receiptRows || "<tr><td>Aucun reçu</td><td></td><td></td><td></td></tr>"}</tbody>
        </table>
        <script>window.print(); window.onafterprint = () => window.close();</script>
      </body>
    </html>`;
}

function openPrintWindow(html, title) {
  // Fenêtre étroite (~80mm) pour éviter le rétrécissement flou à l'impression.
  const popup = window.open("", "_blank", "width=340,height=760");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
