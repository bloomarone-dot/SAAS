import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminFormModal, DashboardSection, FilterBar, SecondaryAction } from "@/modules/admin/components/AdminUi";
import { menuApi } from "@/modules/menu/services/menuApi";
import { orderApi } from "@/modules/orders/services/orderApi";
import { cacheMenuCatalog, getCachedMenuCatalog } from "@/utils/offlineCache";
import { enqueueOfflineAction, isNetworkError } from "@/utils/network";

const CLOSED_STATUSES = new Set(["Payée", "Payee", "Annulée", "Annulee", "Archivée", "Archivee"]);
const KITCHEN_SEND_STATUSES = new Set(["Nouvelle", "Acceptée", "Acceptee", "En préparation", "En preparation"]);

const PAYMENT_OPTIONS = [
  "Paiement avant livraison",
  "Paiement pendant la livraison",
  "Paiement à la livraison",
  "Dépôt Orange Money",
  "Dépôt MTN Mobile Money",
  "Espèces",
];

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

function buildCartLines(cart, dishes) {
  return [...cart.entries()].map(([menuItemId, quantity]) => {
    const dish = dishes.find((item) => item.id === menuItemId);
    const unitPrice = Number(dish?.price || 0);
    return {
      menu_item_id: menuItemId,
      name: dish?.name || "Plat",
      quantity,
      unit_price: unitPrice,
      line_total: unitPrice * quantity,
    };
  });
}

export function DeliveryCashierPanel({ restaurantId, currentUser, onMessage }) {
  const [areas, setAreas] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    delivery_area_id: "",
    payment_method: PAYMENT_OPTIONS[0],
    notes: "",
  });
  const [cart, setCart] = useState(new Map());
  const [areaSearch, setAreaSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [kitchenBusyId, setKitchenBusyId] = useState("");

  useEffect(() => {
    loadAreas();
    loadDeliveries();
    loadMenu();
    const timer = window.setInterval(loadDeliveries, 12000);
    return () => window.clearInterval(timer);
  }, [restaurantId]);

  async function loadAreas() {
    try {
      const data = await orderApi.listDeliveryAreas();
      setAreas(data.sort((a, b) => a.name.localeCompare(b.name, "fr")));
    } catch {
      setAreas([]);
    }
  }

  async function loadDeliveries() {
    try {
      const data = await orderApi.list({ fulfillment_type: "Livraison", limit: 200 });
      const rows = Array.isArray(data) ? data : [];
      const sorted = rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setOrders(sorted);
    } catch (error) {
      onMessage?.(error.message || "Impossible de charger les livraisons.");
      setOrders([]);
    }
  }

  const activeOrders = useMemo(
    () => orders.filter((order) => !CLOSED_STATUSES.has(order.status)),
    [orders],
  );
  const recentOrders = useMemo(() => orders.slice(0, 30), [orders]);

  async function loadMenu() {
    if (!restaurantId) return;
    try {
      const fetchedCategories = await menuApi.getCategories(restaurantId);
      const groups = await Promise.all(
        fetchedCategories.map((category) =>
          menuApi.getDishesByCategory(category.id, false).catch(() => [])
        )
      );
      const nextCategories = fetchedCategories.filter((item) => item.is_active !== false);
      const nextDishes = groups.flat().filter((dish) => dish.is_available !== false);
      setCategories(nextCategories);
      setDishes(nextDishes);
      cacheMenuCatalog(restaurantId, nextCategories, nextDishes);
    } catch {
      const cached = getCachedMenuCatalog(restaurantId);
      if (cached) {
        setCategories(cached.categories || []);
        setDishes(cached.dishes || []);
      }
    }
  }

  const selectedArea = areas.find((area) => area.id === form.delivery_area_id);
  const cartLines = useMemo(() => buildCartLines(cart, dishes), [cart, dishes]);
  const subtotal = cartLines.reduce((total, line) => total + line.line_total, 0);
  const deliveryFee = Number(selectedArea?.delivery_fee || 0);
  const total = subtotal + deliveryFee;

  const filteredAreas = useMemo(() => {
    const query = areaSearch.trim().toLowerCase();
    if (!query) return areas;
    return areas.filter((area) => area.name.toLowerCase().includes(query));
  }, [areaSearch, areas]);

  const visibleDishes = useMemo(() => {
    if (categoryFilter === "ALL") return dishes;
    return dishes.filter((dish) => dish.category_id === categoryFilter);
  }, [categoryFilter, dishes]);

  const query = search.trim().toLowerCase();
  const filteredOrders = useMemo(
    () =>
      activeOrders.filter((order) => {
        if (!query) return true;
        return [order.order_number, order.customer_name, order.customer_phone, order.delivery_area_name, order.payment_method]
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [activeOrders, query]
  );

  function addDish(dish) {
    setCart((current) => {
      const next = new Map(current);
      next.set(dish.id, (next.get(dish.id) || 0) + 1);
      return next;
    });
  }

  function changeQuantity(menuItemId, quantity) {
    setCart((current) => {
      const next = new Map(current);
      if (quantity <= 0) next.delete(menuItemId);
      else next.set(menuItemId, quantity);
      return next;
    });
  }

  function resetForm() {
    setForm({
      customer_name: "",
      customer_phone: "",
      customer_address: "",
      delivery_area_id: areas[0]?.id || "",
      payment_method: PAYMENT_OPTIONS[0],
      notes: "",
    });
    setCart(new Map());
    setCategoryFilter("ALL");
    setAreaSearch("");
  }

  async function submitDelivery() {
    if (!form.customer_name.trim() || !form.customer_phone.trim() || !form.delivery_area_id) {
      onMessage?.("Nom, téléphone et quartier sont obligatoires.");
      return;
    }
    if (!cartLines.length) {
      onMessage?.("Ajoutez au moins un plat à la livraison.");
      return;
    }

    const payload = {
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      customer_address: form.customer_address.trim() || null,
      delivery_area_id: form.delivery_area_id,
      payment_method: form.payment_method,
      notes: form.notes.trim() || null,
      items: cartLines.map((line) => ({
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
      })),
    };

    setBusy(true);
    try {
      const created = await orderApi.createCashierDelivery(payload);
      onMessage?.(`Livraison ${created.order_number} enregistrée. Envoyez-la en cuisine quand vous êtes prêt.`);
      setShowForm(false);
      resetForm();
      await loadDeliveries();
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueOfflineAction({
          label: `Livraison ${form.customer_phone}`,
          requests: [
            {
              path: "/api/v1/orders/cashier-delivery",
              method: "POST",
              requiresAuth: true,
              body: payload,
            },
          ],
        });
        onMessage?.("Connexion indisponible. La livraison sera synchronisée dès que le réseau revient.");
        setShowForm(false);
        resetForm();
      } else {
        onMessage?.(error.message || "Création de la livraison impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendOrderToKitchen(order) {
    setKitchenBusyId(order.id);
    try {
      const updated = await orderApi.sendToKitchen(order.id);
      onMessage?.(`Commande ${order.order_number} envoyée en cuisine.`);
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
    } catch (error) {
      onMessage?.(error.message || "Envoi en cuisine impossible.");
    } finally {
      setKitchenBusyId("");
    }
  }

  function renderOrderCard(order, showKitchenAction = true) {
    const canSendToKitchen = showKitchenAction && KITCHEN_SEND_STATUSES.has(order.status) && !order.is_closed;
    const itemsLabel = (order.items || []).length
      ? order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")
      : "Aucun plat listé";

    return (
      <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900">{order.order_number}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{order.customer_name}</p>
            <p className="text-xs font-semibold text-slate-500">{order.customer_phone}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-700">
            {order.status}
          </span>
        </div>
        <div className="mt-3 space-y-1 text-xs font-semibold text-slate-600">
          <p><DashboardIcon name="MapPin" size={12} className="mr-1 inline" />{order.delivery_area_name || "Quartier non renseigné"}</p>
          <p><DashboardIcon name="User" size={12} className="mr-1 inline" />Caissier(ère) : {order.created_by_cashier_name || order.cashier_name || "Non renseigné"}</p>
          <p><DashboardIcon name="Phone" size={12} className="mr-1 inline" />{order.payment_method}</p>
          <p className="line-clamp-2">{itemsLabel}</p>
          <p>{money(order.total_amount)} · {formatDateTime(order.created_at)}</p>
        </div>
        {canSendToKitchen && (
          <button
            type="button"
            disabled={kitchenBusyId === order.id}
            onClick={() => sendOrderToKitchen(order)}
            className="lte-btn lte-btn-primary lte-btn-sm mt-3 w-full"
          >
            {kitchenBusyId === order.id ? "Envoi…" : "Envoyer en cuisine"}
          </button>
        )}
      </article>
    );
  }

  return (
    <div className="space-y-5">
      <FilterBar
        right={
          <SecondaryAction icon="Plus" onClick={() => setShowForm(true)}>
            Nouvelle livraison
          </SecondaryAction>
        }
      >
        <label className="flex h-10 min-w-[260px] flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm focus-within:border-emerald-600">
          <DashboardIcon name="Search" size={17} className="text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher client, téléphone, quartier..."
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
          />
        </label>
      </FilterBar>

      <DashboardSection
        title="Livraisons en cours"
        action={<span className="text-xs font-black text-slate-500">{filteredOrders.length} commande(s)</span>}
      >
        {filteredOrders.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredOrders.map((order) => renderOrderCard(order))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Aucune livraison active. Créez une nouvelle commande avec le bouton ci-dessus.
          </p>
        )}
      </DashboardSection>

      <DashboardSection
        title="Livraisons enregistrées"
        description="Historique récent des livraisons créées (y compris clôturées)."
        action={<span className="text-xs font-black text-slate-500">{recentOrders.length} livraison(s)</span>}
      >
        {recentOrders.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentOrders.map((order) => renderOrderCard(order, false))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Aucune livraison enregistrée pour le moment.
          </p>
        )}
      </DashboardSection>

      {showForm && (
        <AdminFormModal
          open={showForm}
          title="Nouvelle livraison"
          size="xl"
          onClose={() => !busy && setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} disabled={busy} className="lte-btn lte-btn-default">
                Annuler
              </button>
              <button type="button" onClick={submitDelivery} disabled={busy} className="ml-auto lte-btn lte-btn-primary">
                {busy ? "Enregistrement…" : "Créer la livraison"}
              </button>
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="lte-form-group">
              <span className="lte-label">Nom du client <span className="req">*</span></span>
              <input
                value={form.customer_name}
                onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))}
                className="form-control"
                placeholder="Ex. Marie Nguema"
              />
            </label>
            <label className="lte-form-group">
              <span className="lte-label">Téléphone <span className="req">*</span></span>
              <input
                value={form.customer_phone}
                onChange={(event) => setForm((current) => ({ ...current, customer_phone: event.target.value }))}
                className="form-control"
                placeholder="Ex. 6XX XX XX XX"
              />
            </label>
            <label className="lte-form-group">
              <span className="lte-label">Quartier (Yaoundé) <span className="req">*</span></span>
              <input
                value={areaSearch}
                onChange={(event) => setAreaSearch(event.target.value)}
                className="form-control mb-2"
                placeholder="Rechercher un quartier..."
              />
              <select
                value={form.delivery_area_id}
                onChange={(event) => setForm((current) => ({ ...current, delivery_area_id: event.target.value }))}
                className="form-control"
                size={Math.min(8, Math.max(4, filteredAreas.length))}
              >
                <option value="">Choisir un quartier</option>
                {filteredAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name} ({money(area.delivery_fee)})
                  </option>
                ))}
              </select>
              <span className="lte-help">{areas.length} quartier(s) disponibles à Yaoundé</span>
            </label>
            <label className="lte-form-group">
              <span className="lte-label">Paiement</span>
              <select
                value={form.payment_method}
                onChange={(event) => setForm((current) => ({ ...current, payment_method: event.target.value }))}
                className="form-control"
              >
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="lte-form-group md:col-span-2">
              <span className="lte-label">Adresse complémentaire (optionnel)</span>
              <input
                value={form.customer_address}
                onChange={(event) => setForm((current) => ({ ...current, customer_address: event.target.value }))}
                className="form-control"
                placeholder="Rue, immeuble, repère..."
              />
            </label>
            <label className="lte-form-group md:col-span-2">
              <span className="lte-label">Note cuisine / livreur</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="form-control"
                rows={2}
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("ALL")}
                  className={`rounded-full px-3 py-1 text-xs font-black ${categoryFilter === "ALL" ? "bg-emerald-700 text-white" : "bg-white text-slate-600"}`}
                >
                  Tout
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryFilter(category.id)}
                    className={`rounded-full px-3 py-1 text-xs font-black ${categoryFilter === category.id ? "bg-emerald-700 text-white" : "bg-white text-slate-600"}`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                {visibleDishes.map((dish) => (
                  <button
                    key={dish.id}
                    type="button"
                    onClick={() => addDish(dish)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-emerald-600"
                  >
                    <p className="text-sm font-black text-slate-900">{dish.name}</p>
                    <p className="text-xs font-semibold text-emerald-700">{money(dish.price)}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-black text-slate-900">Panier livraison</p>
              <div className="mt-3 space-y-2">
                {cartLines.length ? cartLines.map((line) => (
                  <div key={line.menu_item_id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{line.name}</p>
                      <p className="text-xs text-slate-500">{money(line.unit_price)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => changeQuantity(line.menu_item_id, line.quantity - 1)} className="lte-tool-btn">-</button>
                      <span className="min-w-6 text-center text-sm font-black">{line.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(line.menu_item_id, line.quantity + 1)} className="lte-tool-btn">+</button>
                    </div>
                  </div>
                )) : (
                  <p className="text-xs font-semibold text-slate-500">Ajoutez des plats depuis le menu.</p>
                )}
              </div>
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-700">
                <div className="flex justify-between"><span>Sous-total</span><span>{money(subtotal)}</span></div>
                <div className="flex justify-between"><span>Frais livraison</span><span>{money(deliveryFee)}</span></div>
                <div className="flex justify-between text-base font-black text-slate-900"><span>Total</span><span>{money(total)}</span></div>
              </div>
            </div>
          </div>
        </AdminFormModal>
      )}
    </div>
  );
}
