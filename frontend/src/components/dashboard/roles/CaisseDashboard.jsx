import { useEffect, useMemo, useState } from "react";

import { DashboardHeader, KpiGrid, Panel, SimpleRows } from "../DashboardPrimitives";
import { orderApi } from "@/modules/orders/services/orderApi";
import { enqueueOfflineAction, isNetworkError } from "@/utils/network";

const payableStatuses = new Set(["Prête", "Livrée"]);
const paidStatuses = new Set(["Payée", "Payee"]);

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function isToday(value) {
  if (!value) return false;
  return new Date(value).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function CaisseDashboard({ overrides = {} }) {
  const currentUser = overrides.__currentUser;
  const apiBaseUrl = overrides.__apiBaseUrl;
  const [orders, setOrders] = useState([]);
  const [registers, setRegisters] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Espèces");
  const [discount, setDiscount] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOrders();
    loadCashierSummary();
  }, []);

  async function loadOrders() {
    setIsLoading(true);
    setMessage("");
    try {
      const data = await orderApi.list();
      setOrders(data);
      setSelectedOrderId((current) => current || data.find((order) => payableStatuses.has(order.status))?.id || "");
    } catch (error) {
      setMessage(error.message || "Impossible de charger les commandes à encaisser.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCashierSummary() {
    if (!apiBaseUrl) return;
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${apiBaseUrl}/api/v1/dashboard/cashier-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => []);
      if (response.ok) setRegisters(data);
    } catch {
      setRegisters([]);
    }
  }

  const payableOrders = useMemo(
    () => orders.filter((order) => payableStatuses.has(order.status)),
    [orders]
  );
  const paidToday = useMemo(
    () => orders.filter((order) => paidStatuses.has(order.status) && isToday(order.updated_at || order.created_at)),
    [orders]
  );
  const selectedOrder = useMemo(
    () => payableOrders.find((order) => order.id === selectedOrderId) || payableOrders[0] || null,
    [payableOrders, selectedOrderId]
  );
  const mobileMoneyTotal = paidToday
    .filter((order) => String(order.payment_method || "").toLowerCase().includes("mobile"))
    .reduce((total, order) => total + Number(order.total_amount || 0), 0);
  const totalCollected = paidToday.reduce((total, order) => total + Number(order.total_amount || 0), 0);

  const kpis = [
    { label: "Commandes non payées", value: payableOrders.length, trend: "Prêtes ou servies", icon: "ClipboardList", tone: "green" },
    { label: "Total encaissé", value: money(totalCollected), trend: "Aujourd'hui", icon: "Wallet", tone: "green" },
    { label: "Paiements Mobile Money", value: money(mobileMoneyTotal), trend: "Aujourd'hui", icon: "Phone", tone: "purple" },
    { label: "Reçus générés", value: paidToday.length, trend: "Commandes payées", icon: "ReceiptText", tone: "orange" },
  ];

  async function validatePayment() {
    if (!selectedOrder) return;
    setIsLoading(true);
    setMessage("");
    try {
      const discountAmount = Number(discount || 0);
      if (discountAmount > 0) {
        await orderApi.update(selectedOrder.id, {
          payment_method: paymentMethod,
          discount_amount: discountAmount,
        });
      } else {
        await orderApi.update(selectedOrder.id, { payment_method: paymentMethod });
      }
      const paid = await orderApi.updateStatus(selectedOrder.id, "Payée");
      setOrders((current) => current.map((order) => (order.id === paid.id ? paid : order)));
      setSelectedOrderId("");
      setDiscount("");
      setMessage(`Paiement validé pour ${paid.order_number}.`);
      printReceipt(paid);
      await loadOrders();
      await loadCashierSummary();
    } catch (error) {
      if (isNetworkError(error)) {
        const discountAmount = Number(discount || 0);
        enqueueOfflineAction({
          label: `Paiement ${selectedOrder.order_number}`,
          requests: [
            {
              path: `/api/v1/orders/${selectedOrder.id}`,
              method: "PATCH",
              requiresAuth: true,
              body: discountAmount > 0
                ? { payment_method: paymentMethod, discount_amount: discountAmount }
                : { payment_method: paymentMethod },
            },
            {
              path: `/api/v1/orders/${selectedOrder.id}/status`,
              method: "PATCH",
              requiresAuth: true,
              body: { status: "Payée" },
            },
          ],
        });
        setSelectedOrderId("");
        setDiscount("");
        setMessage("Connexion indisponible. Le paiement est mis en attente et sera synchronisé automatiquement.");
      } else {
        setMessage(error.message || "Validation du paiement impossible.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function cancelPayment(order) {
    setIsLoading(true);
    setMessage("");
    try {
      const updated = await orderApi.updateStatus(order.id, "Livrée");
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Paiement annulé pour ${order.order_number}.`);
      await loadOrders();
      await loadCashierSummary();
    } catch (error) {
      setMessage(error.message || "Annulation du paiement impossible.");
    } finally {
      setIsLoading(false);
    }
  }

  function printReceipt(order) {
    const rows = order.items.map((item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td style="text-align:center;">${item.quantity}</td>
        <td style="text-align:right;">${money(item.unit_price)}</td>
        <td style="text-align:right;">${money(item.line_total)}</td>
      </tr>
    `).join("");
    const html = `<!doctype html>
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
            .total { display: flex; justify-content: space-between; margin-top: 14px; font-size: 16px; font-weight: 800; }
            .line { margin-top: 10px; border-top: 1px dashed #9ca3af; padding-top: 10px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="receipt">
            <h1>Le Bon Coin</h1>
            <p class="muted">Reçu de paiement</p>
            <p class="muted">${new Date().toLocaleString("fr-FR")}</p>
            <div class="line">
              <p><strong>Commande:</strong> ${escapeHtml(order.order_number)}</p>
              <p><strong>Client:</strong> ${escapeHtml(order.customer_name)}</p>
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
    const popup = window.open("", "_blank", "width=420,height=680");
    if (!popup) {
      setMessage("Impression bloquée par le navigateur. Autorisez les pop-up puis réessayez.");
      return;
    }
    orderApi.logReceiptPrint(order.id).catch(() => {});
    popup.document.write(html);
    popup.document.close();
  }

  return (
    <section className="space-y-4">
      <DashboardHeader
        title="Dashboard Caissier"
        subtitle={`Encaissements réels${currentUser?.first_name ? ` de ${currentUser.first_name}` : ""}, reçus et clôture de service.`}
      />
      <KpiGrid kpis={kpis} />

      <div className="grid gap-4 md:grid-cols-2">
        {(registers.length ? registers : [
          { key: "REPAS", label: "Caisse repas", revenue: 0, profit: 0, orders_count: 0, share: 0 },
          { key: "BOISSON", label: "Caisse boisson", revenue: 0, profit: 0, orders_count: 0, share: 0 },
        ]).map((register) => (
          <Panel key={register.key} title={register.label} action={`${Number(register.share || 0).toFixed(1)}% du CA`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Chiffre d'affaires" value={money(register.revenue)} />
              <Metric label="Bénéfice estimé" value={money(register.profit)} />
              <Metric label="Commandes" value={Number(register.orders_count || 0).toLocaleString("fr-FR")} />
            </div>
          </Panel>
        ))}
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1fr]">
        <Panel title="Commandes à encaisser" link={`${payableOrders.length} en attente`}>
          <SimpleRows
            rows={payableOrders.length ? payableOrders.slice(0, 6).map((order) => [
              `${order.order_number} · ${order.table_id ? `Table ${order.table_id}` : order.customer_name}`,
              money(order.total_amount),
              order.status,
            ]) : [["Aucune commande", "0 FCFA", "À jour"]]}
          />
        </Panel>

        <Panel title="Détail de la commande" action={selectedOrder?.order_number ?? "Aucune"}>
          {selectedOrder ? (
            <>
              <select
                value={selectedOrder.id}
                onChange={(event) => setSelectedOrderId(event.target.value)}
                className="mb-4 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700"
              >
                {payableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} · {money(order.total_amount)}
                  </option>
                ))}
              </select>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {selectedOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 font-semibold text-slate-700">{item.name}</td>
                        <td className="py-3 font-semibold text-slate-600">x{item.quantity}</td>
                        <td className="py-3 font-semibold text-slate-600">{money(item.unit_price)}</td>
                        <td className="py-3 text-right font-black text-slate-900">{money(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 space-y-2 text-sm font-bold">
                <p className="flex justify-between"><span>Remise actuelle</span><span>{money(selectedOrder.discount_amount)}</span></p>
                <p className="flex justify-between border-t border-dashed border-slate-200 pt-4 text-2xl font-black text-slate-950">
                  <span>Total à payer</span><span>{money(selectedOrder.total_amount)}</span>
                </p>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_160px]">
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-12 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700">
                  <option>Espèces</option>
                  <option>Mobile Money</option>
                  <option>Carte</option>
                </select>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  placeholder="Remise"
                  className="h-12 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700"
                />
              </div>
              <button disabled={isLoading} onClick={validatePayment} className="mt-4 h-12 w-full rounded-lg bg-emerald-700 font-black text-white disabled:opacity-60">
                Valider paiement
              </button>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
              Aucune commande prête ou servie à encaisser.
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <Panel title="Clôture de caisse">
          <p className="text-sm font-semibold text-slate-500">Total du service aujourd'hui</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{money(totalCollected)}</p>
          <button type="button" onClick={() => window.print()} className="mt-5 h-11 w-full rounded-lg bg-emerald-700 font-black text-white">
            Imprimer rapport de caisse
          </button>
        </Panel>
        <Panel title="Derniers reçus">
          <SimpleRows
            rows={paidToday.length ? paidToday.slice(0, 6).map((order) => [
              order.order_number,
              `${order.customer_name} · ${order.payment_method}`,
              money(order.total_amount),
            ]) : [["Aucun reçu", "-", "0 FCFA"]]}
          />
          {paidToday[0] && (
            <button type="button" onClick={() => printReceipt(paidToday[0])} className="mt-4 h-11 w-full rounded-lg border border-emerald-200 font-black text-emerald-700">
              Imprimer le dernier reçu
            </button>
          )}
          {paidToday[0] && currentUser?.role === "ADMIN" && (
            <button type="button" onClick={() => cancelPayment(paidToday[0])} className="mt-4 h-11 w-full rounded-lg border border-red-200 font-black text-red-600">
              Annuler le dernier paiement (admin)
            </button>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
