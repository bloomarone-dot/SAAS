import { useEffect, useMemo, useState } from "react";

import { DashboardHeader, KpiGrid, Panel } from "../DashboardPrimitives";
import { DashboardIcon } from "../icons";
import { orderApi } from "@/modules/orders/services/orderApi";
import { enqueueOfflineAction, isNetworkError } from "@/utils/network";
import { useAutoRefresh } from "@/utils/useAutoRefresh";

const paymentMethods = [
  { label: "Espèces", icon: "Wallet" },
  { label: "Mobile Money", icon: "Phone" },
  { label: "Carte", icon: "ReceiptText" },
];

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function orderCustomerLabel(order) {
  if (order?.table_id) return `${order.table_room ? `${order.table_room} · ` : ""}Table ${order.table_name || order.table_id}`;
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
    average_ticket: 0,
    by_payment_method: {},
    pending_orders: [],
    receipts: [],
  };
}

export function CaisseDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;
  const activeView = overrides.__activeView || "dashboard";
  const [report, setReport] = useState(emptyReport);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Espèces");
  const [mobileOperator, setMobileOperator] = useState("MTN");
  const [mobilePhone, setMobilePhone] = useState("");
  const [mobileReference, setMobileReference] = useState("");
  const [discount, setDiscount] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadCashierReport();
  }, []);

  useEffect(() => {
    const methodByView = {
      cash: "Espèces",
      mobile: "Mobile Money",
      card: "Carte",
    };
    if (methodByView[activeView]) setPaymentMethod(methodByView[activeView]);
  }, [activeView]);

  useAutoRefresh(() => loadCashierReport({ silent: true }), 10000, []);

  async function loadCashierReport({ silent = false } = {}) {
    if (!silent) {
      setIsLoading(true);
      setMessage("");
    }
    try {
      const data = await orderApi.cashierReport();
      setReport(data);
      setSelectedOrderId((current) => current || data.pending_orders?.[0]?.id || "");
      setSelectedReceiptId((current) => current || data.receipts?.[0]?.id || "");
    } catch (error) {
      if (!silent) setMessage(error.message || "Impossible de charger la caisse.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  const query = search.trim().toLowerCase();
  const pendingOrders = useMemo(
    () => (report.pending_orders ?? []).filter((order) => {
      if (!query) return true;
      return [order.order_number, order.customer_name, orderCustomerLabel(order), order.status]
        .join(" ")
        .toLowerCase()
        .includes(query);
    }),
    [report.pending_orders, query]
  );
  const receipts = report.receipts ?? [];
  const selectedOrder = pendingOrders.find((order) => order.id === selectedOrderId) || pendingOrders[0] || null;
  const selectedReceipt = receipts.find((order) => order.id === selectedReceiptId) || receipts[0] || null;
  const mobileMoneyTotal = Object.entries(report.by_payment_method ?? {})
    .filter(([method]) => method.toLowerCase().includes("mobile"))
    .reduce((total, [, amount]) => total + Number(amount || 0), 0);
  const viewCopy = getCashierViewCopy(activeView);
  const showSearch = ["dashboard", "cashier", "payments", "unpaid-orders", "cash-order-detail", "discounts", "payment-method", "cash", "mobile", "card", "payment-validation"].includes(activeView);
  const showKpis = ["dashboard", "cashier", "payments", "closing", "cash-closing", "cash-report", "payment-totals", "payment-history"].includes(activeView);
  const showPaymentArea = ["dashboard", "cashier", "payments", "unpaid-orders", "cash-order-detail", "discounts", "payment-method", "cash", "mobile", "card", "payment-validation"].includes(activeView);
  const showReceiptArea = ["dashboard", "cashier", "receipts", "print-receipt", "cancel-payment", "payment-history"].includes(activeView);
  const showClosingArea = ["dashboard", "cashier", "closing", "cash-closing", "cash-report", "payment-totals", "payment-history"].includes(activeView);
  const paymentGridClass = activeView === "unpaid-orders" ? "grid gap-4" : "grid gap-4 xl:grid-cols-[0.95fr_1fr]";

  const kpis = [
    { label: "Commandes non payées", value: report.pending_orders_count ?? pendingOrders.length, trend: "À encaisser", icon: "ClipboardList", tone: "green" },
    { label: "Total encaissé", value: money(report.total_collected), trend: "Service du jour", icon: "Wallet", tone: "green" },
    { label: "Paiements Mobile Money", value: money(mobileMoneyTotal), trend: "Service du jour", icon: "Phone", tone: "purple" },
    { label: "Reçus imprimables", value: report.receipts_count ?? receipts.length, trend: "Commandes payées", icon: "ReceiptText", tone: "orange" },
  ];

  async function validatePayment() {
    if (!selectedOrder) return;
    setIsLoading(true);
    setMessage("");
    const discountAmount = Number(discount || selectedOrder.discount_amount || 0);
    const payload = { payment_method: paymentMethod, discount_amount: discountAmount };
    const isMobileMoney = paymentMethod === "Mobile Money";
    if (isMobileMoney && (!mobilePhone.trim() || !mobileReference.trim())) {
      setMessage("Renseignez le numéro Mobile Money et la référence de transaction.");
      setIsLoading(false);
      return;
    }
    try {
      const paid = isMobileMoney
        ? await orderApi.validateMobileMoneyPayment(selectedOrder.id, {
            operator: mobileOperator,
            phone: mobilePhone.trim(),
            transaction_reference: mobileReference.trim(),
            discount_amount: discountAmount,
          })
        : await orderApi.validatePayment(selectedOrder.id, payload);
      setDiscount("");
      setMobilePhone("");
      setMobileReference("");
      setSelectedOrderId("");
      setSelectedReceiptId(paid.id);
      setMessage(`Paiement validé pour ${paid.order_number}.`);
      await loadCashierReport();
      printReceipt(paid);
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueOfflineAction({
          label: `Paiement ${selectedOrder.order_number}`,
          requests: [{
            path: `/api/v1/orders/${selectedOrder.id}/payment`,
            method: "POST",
            requiresAuth: true,
            body: payload,
          }],
        });
        setDiscount("");
        setSelectedOrderId("");
        setMessage("Connexion indisponible. Le paiement est mis en attente et sera synchronisé automatiquement.");
      } else {
        setMessage(error.message || "Validation du paiement impossible.");
      }
    } finally {
      setIsLoading(false);
    }
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

  function printReceipt(order) {
    if (!order) return;
    orderApi.logReceiptPrint(order.id).catch(() => {});
    openPrintWindow(receiptHtml(order), `Reçu ${order.order_number}`);
  }

  function printCashReport() {
    openPrintWindow(reportHtml(report, currentUser), "Rapport de caisse");
  }

  return (
    <section className="space-y-4">
      <DashboardHeader
        title={viewCopy.title}
        subtitle={viewCopy.subtitle || `Bienvenue${currentUser?.first_name ? `, ${currentUser.first_name}` : ""} ! Gérez vos encaissements en toute simplicité.`}
      />

      {showSearch && <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm">
          <DashboardIcon name="Search" size={17} className="text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une commande, un client..."
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
          />
        </label>
        <button type="button" onClick={loadCashierReport} disabled={isLoading} className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-60">
          Actualiser
        </button>
      </div>}

      {showKpis && <KpiGrid kpis={kpis} />}

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {showPaymentArea && <div className={paymentGridClass}>
        <Panel title="Commandes à encaisser" link={`${pendingOrders.length} en attente`}>
          <OrdersTable
            orders={pendingOrders}
            selectedOrderId={selectedOrder?.id}
            onSelect={(order) => {
              setSelectedOrderId(order.id);
              setDiscount(order.discount_amount ? String(order.discount_amount) : "");
            }}
          />
        </Panel>

        {activeView !== "unpaid-orders" && <Panel title="Détail de la commande" action={selectedOrder?.order_number ?? "Aucune"}>
          {selectedOrder ? (
            <div>
              <OrderDetail order={selectedOrder} discountPreview={discount} />
              <div className="mt-5">
                <p className="text-sm font-black text-slate-950">Choisir le mode de paiement</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.label}
                      type="button"
                      onClick={() => setPaymentMethod(method.label)}
                      className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-black ${
                        paymentMethod === method.label
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 text-slate-700"
                      }`}
                    >
                      <DashboardIcon name={method.icon} size={18} />
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>
              {paymentMethod === "Mobile Money" && (
                <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm font-black text-slate-950">Paiement en ligne Mobile Money</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <select
                      value={mobileOperator}
                      onChange={(event) => setMobileOperator(event.target.value)}
                      className="h-11 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-black text-slate-700 outline-none"
                    >
                      <option value="MTN">MTN Mobile Money</option>
                      <option value="ORANGE">Orange Money</option>
                    </select>
                    <input
                      value={mobilePhone}
                      onChange={(event) => setMobilePhone(event.target.value)}
                      placeholder="Numéro client"
                      className="h-11 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-black text-slate-700 outline-none"
                    />
                    <input
                      value={mobileReference}
                      onChange={(event) => setMobileReference(event.target.value)}
                      placeholder="Référence transaction"
                      className="h-11 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-black text-slate-700 outline-none"
                    />
                  </div>
                </div>
              )}
              <label className="mt-4 block">
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
              <div className="mt-4">
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
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button disabled={isLoading} onClick={validatePayment} className="h-12 rounded-lg bg-emerald-700 font-black text-white disabled:opacity-60">
                  Valider paiement
                </button>
                <button type="button" onClick={() => printReceipt(selectedOrder)} className="h-12 rounded-lg border border-emerald-200 font-black text-emerald-700">
                  Imprimer reçu
                </button>
              </div>
            </div>
          ) : (
            <EmptyState text="Aucune commande prête ou servie à encaisser." />
          )}
        </Panel>}
      </div>}

      {showClosingArea && <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <Panel title="Clôture de caisse">
          <div className="rounded-lg bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-slate-600">Total du service aujourd'hui</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{money(report.total_collected)}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Transactions" value={Number(report.paid_orders_count || 0).toLocaleString("fr-FR")} />
            <Metric label="Panier moyen" value={money(report.average_ticket)} />
          </div>
          <div className="mt-4 space-y-2">
            {Object.entries(report.by_payment_method ?? {}).map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="font-bold text-slate-600">{method}</span>
                <span className="font-black text-slate-950">{money(amount)}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={printCashReport} className="mt-5 h-11 w-full rounded-lg bg-emerald-700 font-black text-white">
            Générer rapport de caisse
          </button>
        </Panel>

        {showReceiptArea ? (
        <Panel title="Derniers reçus" action={selectedReceipt?.order_number ?? ""}>
          <ReceiptsTable
            receipts={receipts}
            selectedReceiptId={selectedReceipt?.id}
            onSelect={(order) => setSelectedReceiptId(order.id)}
            onPrint={printReceipt}
            onCancel={cancelPayment}
            isLoading={isLoading}
          />
        </Panel>
        ) : (
          <Panel title="Totaux par mode de paiement">
            <PaymentTotals rows={report.by_payment_method ?? {}} />
          </Panel>
        )}
      </div>}

      {showReceiptArea && !showClosingArea && (
        <Panel title={activeView === "cancel-payment" ? "Annuler un paiement" : "Derniers reçus"} action={selectedReceipt?.order_number ?? ""}>
          <ReceiptsTable
            receipts={receipts}
            selectedReceiptId={selectedReceipt?.id}
            onSelect={(order) => setSelectedReceiptId(order.id)}
            onPrint={printReceipt}
            onCancel={cancelPayment}
            isLoading={isLoading}
          />
        </Panel>
      )}
    </section>
  );
}

function getCashierViewCopy(view) {
  const copy = {
    dashboard: ["Dashboard Caissier", ""],
    cashier: ["Dashboard Caissier", ""],
    payments: ["Paiements", "Encaissez les commandes prêtes, choisissez le mode de paiement et appliquez les remises autorisées."],
    "unpaid-orders": ["Commandes non payées", "Liste des commandes prêtes ou servies en attente d'encaissement."],
    "cash-order-detail": ["Commande à encaisser", "Sélectionnez une commande et contrôlez son détail avant validation."],
    discounts: ["Remise autorisée", "Appliquez une remise validée ou un code promotionnel avant paiement."],
    "payment-method": ["Mode paiement", "Choisissez le canal d'encaissement adapté à la commande."],
    cash: ["Paiement espèces", "Encaissez rapidement une commande en espèces."],
    mobile: ["Paiement Mobile Money", "Renseignez l'opérateur, le numéro et la référence de transaction."],
    card: ["Paiement carte", "Encaissez une commande par carte bancaire ou terminal."],
    "payment-validation": ["Validation paiement", "Validez le paiement et générez le reçu client."],
    receipts: ["Derniers reçus", "Retrouvez les tickets générés pendant le service."],
    "print-receipt": ["Impression reçu", "Réimprimez le ticket d'une commande déjà payée."],
    "cancel-payment": ["Annuler paiement", "Annulez un paiement pour remettre la commande à encaisser."],
    closing: ["Clôture", "Contrôlez les encaissements avant la clôture du service."],
    "cash-closing": ["Clôture caisse", "Préparez le récapitulatif de clôture de caisse."],
    "cash-report": ["Rapport caisse", "Générez un rapport imprimable des encaissements."],
    "payment-totals": ["Totaux paiement", "Comparez les montants encaissés par mode de paiement."],
    "payment-history": ["Historique paiements", "Consultez les paiements et reçus du service."],
  };
  const [title, subtitle] = copy[view] || copy.dashboard;
  return { title, subtitle };
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

function OrdersTable({ orders, selectedOrderId, onSelect }) {
  if (!orders.length) return <EmptyState text="Aucune commande à encaisser." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-xs font-black uppercase text-slate-400">
          <tr>
            <th className="py-3">N° Commande</th>
            <th className="py-3">Client / Table</th>
            <th className="py-3">Origine</th>
            <th className="py-3">Montant</th>
            <th className="py-3">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => (
            <tr
              key={order.id}
              onClick={() => onSelect(order)}
              className={`cursor-pointer ${selectedOrderId === order.id ? "bg-emerald-50" : "hover:bg-slate-50"}`}
            >
              <td className="py-3 font-black text-slate-950">{order.order_number}</td>
              <td className="py-3 font-semibold text-slate-600">{orderCustomerLabel(order)}</td>
              <td className="py-3">
                <span className={`rounded-full px-3 py-1 text-xs font-black ${order.order_source === "En ligne" ? "bg-purple-50 text-purple-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {order.order_source || order.fulfillment_type}
                </span>
              </td>
              <td className="py-3 font-black text-slate-900">{money(order.total_amount)}</td>
              <td className="py-3"><StatusBadge status={order.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptsTable({ receipts, selectedReceiptId, onSelect, onPrint, onCancel, isLoading }) {
  if (!receipts.length) return <EmptyState text="Aucun reçu généré aujourd'hui." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
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
              <td className="py-3 text-right">
                <button type="button" onClick={(event) => { event.stopPropagation(); onPrint(order); }} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-black text-emerald-700">
                  Imprimer
                </button>
                <button type="button" disabled={isLoading} onClick={(event) => { event.stopPropagation(); onCancel(order); }} className="ml-2 rounded-md border border-red-200 px-3 py-1.5 text-xs font-black text-red-600 disabled:opacity-60">
                  Annuler
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderDetail({ order, discountPreview }) {
  const visibleItems = (order.items ?? []).filter((item) => item.sale_channel !== "EMBALLAGE");
  const subtotal = orderSubtotal(order);
  const discount = Number(discountPreview || order.discount_amount || 0);
  const total = Math.max(0, subtotal + Number(order.delivery_fee || 0) - discount);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs font-black uppercase text-slate-400">
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

function receiptHtml(order) {
  const rows = order.items.filter((item) => item.sale_channel !== "EMBALLAGE").map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td style="text-align:center;">${item.quantity}</td>
      <td style="text-align:right;">${money(item.unit_price)}</td>
      <td style="text-align:right;">${money(item.line_total)}</td>
    </tr>
  `).join("");
  return `<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Reçu ${escapeHtml(order.order_number)}</title>
        <style>
          body { margin: 0; padding: 18px; color: #111827; font-family: Arial, sans-serif; }
          .receipt { width: 320px; margin: 0 auto; }
          h1 { margin: 0; font-size: 18px; text-align: center; }
          .muted { color: #6b7280; font-size: 12px; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
          th, td { border-bottom: 1px dashed #d1d5db; padding: 7px 0; }
          th { text-align: left; font-size: 11px; color: #374151; }
          .line { margin-top: 10px; border-top: 1px dashed #9ca3af; padding-top: 10px; }
          .total { display: flex; justify-content: space-between; margin-top: 14px; font-size: 16px; font-weight: 800; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h1>Le Bon Coin</h1>
          <p class="muted">Reçu de paiement</p>
          <p class="muted">${formatDateTime(order.updated_at || new Date().toISOString())}</p>
          <div class="line">
            <p><strong>Commande:</strong> ${escapeHtml(order.order_number)}</p>
            <p><strong>Client:</strong> ${escapeHtml(orderCustomerLabel(order))}</p>
            <p><strong>Paiement:</strong> ${escapeHtml(order.payment_method || "Non renseigné")}</p>
          </div>
          <table>
            <thead><tr><th>Article</th><th>Qté</th><th>PU</th><th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="total"><span>Total</span><span>${money(order.total_amount)}</span></div>
          <p class="muted line">Merci pour votre visite.</p>
        </div>
        <script>window.print(); window.onafterprint = () => window.close();</script>
      </body>
    </html>`;
}

function reportHtml(report, user) {
  const methodRows = Object.entries(report.by_payment_method ?? {}).map(([method, amount]) => `
    <tr><td>${escapeHtml(method)}</td><td style="text-align:right;">${money(amount)}</td></tr>
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
          <div class="box">Transactions<strong>${Number(report.paid_orders_count || 0).toLocaleString("fr-FR")}</strong></div>
          <div class="box">Panier moyen<strong>${money(report.average_ticket)}</strong></div>
        </div>
        <h2>Modes de paiement</h2>
        <table><tbody>${methodRows || "<tr><td>Aucun paiement</td><td></td></tr>"}</tbody></table>
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
  const popup = window.open("", "_blank", "width=840,height=760");
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
