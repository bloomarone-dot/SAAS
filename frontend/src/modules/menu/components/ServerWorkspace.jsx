import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { PageHeader } from "@/modules/admin/components/AdminUi";
import { useAutoRefresh } from "@/utils/useAutoRefresh";
import { menuApi } from "../services/menuApi";
import { orderApi } from "@/modules/orders/services/orderApi";
import { paymentApi } from "@/modules/orders/services/paymentApi";
import TableGrid from "./TableGrid";
import TableSessionModal from "./TableSessionModal";

const money = (value) => `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
const PAID_STATUSES = ["Payée", "Payee", "Annulée", "Annulee"];
const PAYMENT_READY_STATUSES = ["Prête", "Prete", "Livrée", "Livree", "Servie"];

function normalizeStatus(status) {
  const value = String(status || "").trim();
  if (value === "Prete") return "Prête";
  if (value === "Livree") return "Livrée";
  return value;
}

function isPaid(status) {
  return PAID_STATUSES.includes(normalizeStatus(status));
}

function isReadyStatus(status) {
  return normalizeStatus(status) === "Prête";
}

function isServedStatus(status) {
  return ["Livrée", "Servie"].includes(normalizeStatus(status));
}

function canPayOrder(order) {
  if (!order || isPaid(order.status)) return false;
  if (Number(order.total_amount || 0) <= 0) return false;
  return order.is_closed || PAYMENT_READY_STATUSES.includes(normalizeStatus(order.status));
}

const STEPS = [
  { key: "table", label: "Table" },
  { key: "order", label: "Commande" },
  { key: "kitchen", label: "Cuisine" },
  { key: "serve", label: "Service" },
  { key: "payment", label: "Paiement" },
];

function formatMsisdn(raw) {
  return String(raw || "")
    .replace(/\D/g, "")
    .replace(/^(?:237|00237)/, "")
    .slice(0, 9);
}

function activeStep(order) {
  if (!order) return "table";
  if (isPaid(order.status)) return "payment";
  if (canPayOrder(order) && order.is_closed) return "payment";
  if (isServedStatus(order.status)) return "serve";
  if (isReadyStatus(order.status)) return "serve";
  if (["En préparation", "Acceptée"].includes(normalizeStatus(order.status))) return "kitchen";
  return "order";
}

export default function ServerWorkspace({ restaurantId, currentUser }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [session, setSession] = useState(null);
  const [order, setOrder] = useState(null);
  const [categories, setCategories] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [menuMode, setMenuMode] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [readyAlert, setReadyAlert] = useState(false);
  const [dailyStats, setDailyStats] = useState(null);

  const loadOrder = useCallback(async (orderId) => {
    if (!orderId) return;
    try {
      const data = await orderApi.get(orderId);
      setOrder(data);
      const status = normalizeStatus(data.status);
      if (isReadyStatus(status) || (isServedStatus(status) && !isPaid(status) && !data.is_closed)) {
        setReadyAlert(true);
      }
    } catch (err) {
      setError(err.message || "Impossible de charger la commande.");
    }
  }, []);

  const loadMenu = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const fetchedCategories = await menuApi.getCategories(restaurantId);
      const groups = await Promise.all(
        fetchedCategories.map((category) =>
          menuApi.getDishesByCategory(category.id, false).catch(() => [])
        )
      );
      setCategories(fetchedCategories.filter((item) => item.is_active !== false));
      setDishes(groups.flat().filter((dish) => dish.is_available !== false));
    } catch {
      setError("Impossible de charger le menu.");
    }
  }, [restaurantId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    if (!session?.orderId) return;
    loadOrder(session.orderId);
  }, [session?.orderId, loadOrder]);

  useAutoRefresh(() => {
    if (session?.orderId) loadOrder(session.orderId);
  }, session?.orderId ? 5000 : 0, [session?.orderId, loadOrder]);

  useEffect(() => {
    if (session || !currentUser?.id) return;
    orderApi
      .list({ server_id: currentUser.id, limit: 200 })
      .then((orders) => {
        const today = new Date().toDateString();
        const mineToday = orders.filter(
          (item) =>
            item.server_id === currentUser.id &&
            new Date(item.created_at).toDateString() === today &&
            !["Annulée", "Annulee"].includes(normalizeStatus(item.status))
        );
        const clients = mineToday.reduce(
          (total, item) => total + Math.max(1, Number(item.party_size || 1)),
          0
        );
        const sales = mineToday.reduce((total, item) => total + Number(item.total_amount || 0), 0);
        const paid = mineToday.filter((item) => isPaid(item.status)).length;
        setDailyStats({
          orders: mineToday.length,
          clients,
          sales,
          paid,
          recent: mineToday.slice(0, 6),
        });
      })
      .catch(() => setDailyStats(null));
  }, [session, currentUser?.id]);

  const visibleDishes = useMemo(() => {
    if (categoryFilter === "ALL") return dishes;
    return dishes.filter((dish) => dish.category_id === categoryFilter);
  }, [categoryFilter, dishes]);

  const visibleItems = useMemo(
    () => (order?.items ?? []).filter((item) => item.sale_channel !== "EMBALLAGE"),
    [order?.items]
  );

  const orderStatus = normalizeStatus(order?.status);
  const currentStep = session ? activeStep(order) : "table";
  const canEditOrder = order && !order.is_closed && !isPaid(order?.status);
  const showMenu = menuMode && canEditOrder;
  const hasItems = visibleItems.length > 0;
  const canSendKitchen =
    canEditOrder &&
    hasItems &&
    ["Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée"].includes(orderStatus);
  const isReady = isReadyStatus(order?.status);
  const isServed = isServedStatus(order?.status);
  const canRequestPayment = canPayOrder(order);
  const waitingKitchen = ["En préparation", "Acceptée"].includes(orderStatus) && !isReady && !isServed;

  function openOrder(orderId, tableName, tableRoom) {
    setSession({ orderId, tableName, tableRoom: tableRoom || "Rez-de-chaussée" });
    setSelectedTable(null);
    setMenuMode(true);
    setMessage("");
    setError("");
    setReadyAlert(false);
  }

  function backToTables() {
    setSession(null);
    setOrder(null);
    setSelectedTable(null);
    setMenuMode(true);
    setMessage("");
    setError("");
    setReadyAlert(false);
  }

  async function updateOrderItems(items) {
    if (!session?.orderId || !canEditOrder) return;
    setBusy("items");
    setError("");
    try {
      const updated = await orderApi.update(session.orderId, { items });
      setOrder(updated);
    } catch (err) {
      setError(err.message || "Mise à jour impossible.");
    } finally {
      setBusy("");
    }
  }

  function addDish(dish) {
    const currentItems = order?.items ?? [];
    const nextItemsById = new Map(
      currentItems
        .filter((item) => item.menu_item_id)
        .map((item) => [
          item.menu_item_id,
          { menu_item_id: item.menu_item_id, quantity: Number(item.quantity || 0) },
        ])
    );
    const existing = nextItemsById.get(dish.id);
    nextItemsById.set(dish.id, {
      menu_item_id: dish.id,
      quantity: existing ? existing.quantity + 1 : 1,
    });
    updateOrderItems([...nextItemsById.values()]);
  }

  function changeQuantity(menuItemId, quantity) {
    const nextItems = (order?.items ?? [])
      .filter((item) => item.menu_item_id)
      .map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.menu_item_id === menuItemId ? quantity : Number(item.quantity || 0),
      }))
      .filter((item) => item.quantity > 0);
    updateOrderItems(nextItems);
  }

  async function sendToKitchen() {
    if (!session?.orderId) return;
    setBusy("kitchen");
    setError("");
    try {
      const updated = await orderApi.sendToKitchen(session.orderId);
      setOrder(updated);
      setMenuMode(false);
      setMessage("Commande envoyée en cuisine. Attendez la notification « prête ».");
    } catch (err) {
      setError(err.message || "Envoi en cuisine impossible.");
    } finally {
      setBusy("");
    }
  }

  async function markServed() {
    if (!session?.orderId) return;
    setBusy("served");
    setError("");
    try {
      const updated = await orderApi.updateStatus(session.orderId, "Livrée");
      setOrder(updated);
      setReadyAlert(false);
      setMessage("Commande servie au client.");
    } catch (err) {
      setError(err.message || "Impossible de marquer comme servie.");
    } finally {
      setBusy("");
    }
  }

  async function closeOrderForBill() {
    if (!session?.orderId) return;
    setBusy("close");
    setError("");
    try {
      const updated = await orderApi.close(session.orderId);
      setOrder(updated);
      setMenuMode(false);
      setMessage("Commande clôturée. Vous pouvez demander le paiement en caisse.");
    } catch (err) {
      setError(err.message || "Clôture impossible.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Service"
        title={session ? `${session.tableRoom} · Table ${session.tableName}` : "Choisissez une table"}
        subtitle={session ? "Gérez la commande active, l’envoi cuisine et la demande de paiement." : "Ouvrez ou reprenez une table pour démarrer la prise de commande."}
        primaryAction={session ? (
            <button
              type="button"
              onClick={backToTables}
              className="lte-btn lte-btn-default"
            >
              <DashboardIcon name="ChevronDown" size={16} className="rotate-90" />
              Changer de table
            </button>
          ) : null}
        meta={<StepBar current={currentStep} />}
      />

      {(message || error || readyAlert) && (
        <div className="space-y-2">
          {readyAlert && (isReady || isServed) && !isPaid(order?.status) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <DashboardIcon name="Bell" size={18} />
                </span>
                <div>
                  <p className="text-sm font-black text-emerald-900">
                    {isReady && !isServed ? "Commande prête en cuisine" : "Étape suivante : paiement"}
                  </p>
                  <p className="text-xs font-semibold text-emerald-700">
                    {isReady && !isServed
                      ? "Récupérez les plats, servez le client puis validez ou demandez directement le paiement."
                      : "Le client peut régler. Envoyez la demande à la caisse."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isReady && !isServed && (
                  <button type="button" onClick={markServed} disabled={busy === "served"} className="lte-btn lte-btn-default">
                    {busy === "served" ? "Validation…" : "Marquer servie"}
                  </button>
                )}
                {canRequestPayment && (
                  <button type="button" onClick={() => setPaymentOrder(order)} className="lte-btn lte-btn-primary">
                    Demander le paiement
                  </button>
                )}
              </div>
            </div>
          )}
          {waitingKitchen && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Commande en cuisine — vous serez notifiée dès que les plats seront prêts.
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}
        </div>
      )}

      {!session ? (
        <>
          {dailyStats && <ServerDailyStats stats={dailyStats} name={currentUser?.first_name} />}
          <TableGrid
            restaurantId={restaurantId}
            readOnly
            onSelectTable={setSelectedTable}
          />
          {selectedTable && (
            <TableSessionModal
              table={selectedTable}
              currentUser={currentUser}
              onClose={() => setSelectedTable(null)}
              onOpenMenuForOrder={openOrder}
              primaryActionLabel="Commande"
            />
          )}
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <MenuPanel
            hidden={!showMenu}
            categories={categories}
            dishes={visibleDishes}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            onAddDish={addDish}
            disabled={!canEditOrder || busy === "items"}
          />

          <OrderPanel
            order={order}
            session={session}
            items={visibleItems}
            showMenu={showMenu}
            menuMode={menuMode}
            canEditOrder={canEditOrder}
            canSendKitchen={canSendKitchen}
            isReady={isReady}
            isServed={isServed}
            canRequestPayment={canRequestPayment}
            waitingKitchen={waitingKitchen}
            orderStatus={orderStatus}
            busy={busy}
            onQuantityChange={changeQuantity}
            onSendKitchen={sendToKitchen}
            onMarkServed={markServed}
            onCompleteOrder={() => {
              setMenuMode(true);
              setMessage("Ajoutez les plats demandés par le client sur la même facture.");
            }}
            onCloseForBill={closeOrderForBill}
            onRequestPayment={() => setPaymentOrder(order)}
            onShowMenu={() => setMenuMode(true)}
            onHideMenu={() => setMenuMode(false)}
          />
        </div>
      )}

      {paymentOrder && (
        <PaymentRequestModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onDone={(text) => {
            setPaymentOrder(null);
            setMessage(text);
            loadOrder(session?.orderId);
          }}
        />
      )}
    </section>
  );
}

function StepBar({ current }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.key}
            className={`rounded-lg border px-3 py-2 text-center text-xs font-black ${
              active
                ? "border-[var(--dashboard-primary)] bg-[color-mix(in_srgb,var(--dashboard-primary)_10%,white)] text-[var(--dashboard-primary)]"
                : done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wide">{index + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

function MenuPanel({ hidden, categories, dishes, categoryFilter, onCategoryChange, onAddDish, disabled }) {
  if (hidden) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
        <DashboardIcon name="UtensilsCrossed" size={28} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-500">
          Le menu est masqué. Cliquez sur « Compléter la commande » pour ajouter des plats.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">Menu</h2>
          <p className="text-xs font-semibold text-slate-500">Sélectionnez les plats et les quantités</p>
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
        >
          <option value="ALL">Toutes les catégories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
        {dishes.length === 0 && (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Aucun plat disponible.</p>
        )}
        {dishes.map((dish) => (
          <div
            key={dish.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{dish.name}</p>
              <p className="text-xs font-semibold text-slate-500">{money(dish.price)}</p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddDish(dish)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-primary)] text-white disabled:opacity-50"
            >
              <DashboardIcon name="Plus" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServerDailyStats({ stats, name }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase text-slate-500">Vos ventes du jour{name ? ` · ${name}` : ""}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <StatChip label="Commandes" value={stats.orders} />
        <StatChip label="Clients servis" value={stats.clients} />
        <StatChip label="Encaissées" value={stats.paid} />
        <StatChip label="Total du jour" value={money(stats.sales)} highlight />
      </div>
      {stats.recent.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-black uppercase text-slate-500">Dernières commandes</p>
          <div className="mt-2 space-y-2">
            {stats.recent.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-bold text-slate-800">{item.order_number}</span>
                <span className="font-semibold text-slate-500">{normalizeStatus(item.status)}</span>
                <span className="font-black text-slate-900">{money(item.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, highlight = false }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${highlight ? "text-[var(--dashboard-primary)]" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}

function OrderPanel({
  order,
  session,
  items,
  showMenu,
  menuMode,
  canEditOrder,
  canSendKitchen,
  isReady,
  isServed,
  canRequestPayment,
  waitingKitchen,
  orderStatus,
  busy,
  onQuantityChange,
  onSendKitchen,
  onMarkServed,
  onCompleteOrder,
  onCloseForBill,
  onRequestPayment,
  onShowMenu,
  onHideMenu,
}) {
  const subtotal = items.reduce((total, item) => total + Number(item.line_total || 0), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <p className="text-xs font-black uppercase text-slate-500">Récapitulatif</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">
          {order?.order_number ? `Commande ${order.order_number}` : "Chargement…"}
        </h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Table {session.tableName} · {orderStatus || "…"}
          {order?.is_closed ? " · Clôturée" : " · Ouverte"}
        </p>
      </div>

      {waitingKitchen && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          En attente de la cuisine…
        </p>
      )}

      {(isReady || isServed) && canRequestPayment && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {isServed
            ? "Client servi : vous pouvez demander le paiement à la caisse."
            : "Plats prêts : servez le client puis demandez le paiement."}
        </p>
      )}

      <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto">
        {items.length === 0 && (
          <p className="py-6 text-center text-sm font-semibold text-slate-500">
            Aucun plat pour le moment. Ajoutez depuis le menu.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id || item.menu_item_id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{item.name}</p>
              <p className="text-xs font-semibold text-slate-500">
                {money(item.unit_price)} × {item.quantity}
              </p>
            </div>
            {canEditOrder && showMenu ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onQuantityChange(item.menu_item_id, Number(item.quantity || 1) - 1)} className="h-8 w-8 rounded border border-slate-200 text-sm font-black">-</button>
                <span className="w-6 text-center text-sm font-black">{item.quantity}</span>
                <button type="button" onClick={() => onQuantityChange(item.menu_item_id, Number(item.quantity || 0) + 1)} className="h-8 w-8 rounded border border-slate-200 text-sm font-black">+</button>
              </div>
            ) : (
              <strong className="text-sm font-black text-slate-900">{money(item.line_total)}</strong>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
          <span>Sous-total</span>
          <span>{money(subtotal)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="text-sm font-black text-slate-900">Total</span>
          <span className="text-xl font-black text-[var(--dashboard-primary)]">
            {money(order?.total_amount ?? subtotal)}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {canEditOrder && showMenu && canSendKitchen && (
          <button
            type="button"
            onClick={onSendKitchen}
            disabled={busy === "kitchen" || items.length === 0}
            className="lte-btn lte-btn-primary w-full"
          >
            <DashboardIcon name="ChefHat" size={16} />
            {busy === "kitchen" ? "Envoi…" : "Envoyer en cuisine"}
          </button>
        )}

        {canEditOrder && !showMenu && (
          <button type="button" onClick={onShowMenu} className="lte-btn lte-btn-default w-full">
            <DashboardIcon name="Plus" size={16} />
            Compléter la commande
          </button>
        )}

        {canEditOrder && showMenu && !menuMode && (
          <button type="button" onClick={onHideMenu} className="lte-btn lte-btn-default w-full">
            Masquer le menu
          </button>
        )}

        {isReady && !isServed && (
          <button type="button" onClick={onMarkServed} disabled={busy === "served"} className="lte-btn lte-btn-default w-full">
            <DashboardIcon name="CheckCircle2" size={16} />
            {busy === "served" ? "Validation…" : "Marquer comme servie"}
          </button>
        )}

        {canRequestPayment && (
          <button type="button" onClick={onRequestPayment} className="lte-btn lte-btn-primary w-full">
            <DashboardIcon name="Wallet" size={16} />
            Demander le paiement (caisse)
          </button>
        )}

        {(isServed || isReady) && canEditOrder && (
          <button type="button" onClick={onCompleteOrder} className="lte-btn lte-btn-default w-full">
            <DashboardIcon name="UtensilsCrossed" size={16} />
            Compléter la commande
          </button>
        )}

        {canEditOrder && !order?.is_closed && (isServed || isReady) && (
          <button
            type="button"
            onClick={onCloseForBill}
            disabled={busy === "close"}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-black text-slate-700"
          >
            {busy === "close" ? "Clôture…" : "Verrouiller la commande (plus d'ajout)"}
          </button>
        )}
      </div>
    </div>
  );
}

function PaymentRequestModal({ order, onClose, onDone }) {
  const [method, setMethod] = useState("ORANGE");
  const [msisdn, setMsisdn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isMobile = method === "ORANGE" || method === "MTN";

  async function submit() {
    setError("");
    const cleaned = formatMsisdn(msisdn);
    if (isMobile && cleaned.length < 8) {
      setError("Numéro Mobile Money du client invalide (ex: 690 000 000).");
      return;
    }
    setSubmitting(true);
    try {
      await paymentApi.createRequest({
        order_id: order.id,
        method,
        payer_msisdn: isMobile ? cleaned : null,
      });
      onDone(`Demande de paiement envoyée à la caisse pour ${order.order_number}.`);
    } catch (err) {
      setError(err.message || "Envoi de la demande impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  const methods = [
    { value: "ORANGE", label: "Orange Money" },
    { value: "MTN", label: "MTN Mobile Money" },
    { value: "CASH", label: "Espèces" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="lte-card mb-0 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
        <div className="lte-card-header">
          <h2 className="lte-card-title">
            <DashboardIcon name="Wallet" size={17} /> Demander le paiement
          </h2>
          <div className="lte-card-tools">
            <button type="button" onClick={onClose} className="lte-tool-btn">
              <DashboardIcon name="X" size={14} />
            </button>
          </div>
        </div>
        <div className="lte-card-body space-y-4">
          <p className="text-sm font-semibold text-slate-600">
            Commande <strong>{order.order_number}</strong> · {money(order.total_amount)}
          </p>
          <div>
            <span className="lte-label">Mode de paiement choisi par le client</span>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMethod(item.value)}
                  className={`rounded border px-2 py-2 text-xs font-semibold transition ${
                    method === item.value
                      ? "border-[var(--dashboard-primary)] bg-[color-mix(in_srgb,var(--dashboard-primary)_10%,white)] text-[var(--dashboard-primary)]"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {isMobile && (
            <label className="lte-form-group">
              <span className="lte-label">
                Numéro {method === "ORANGE" ? "Orange" : "MTN"} du client <span className="req">*</span>
              </span>
              <input
                type="tel"
                value={msisdn}
                onChange={(event) => setMsisdn(event.target.value)}
                placeholder="6XX XXX XXX"
                className="form-control"
                autoFocus
              />
            </label>
          )}
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
        </div>
        <div className="lte-card-footer">
          <button type="button" onClick={onClose} className="lte-btn lte-btn-default">
            Annuler
          </button>
          <button type="button" onClick={submit} disabled={submitting} className="ml-auto lte-btn lte-btn-primary">
            {submitting ? "Envoi…" : "Envoyer à la caisse"}
          </button>
        </div>
      </div>
    </div>
  );
}
