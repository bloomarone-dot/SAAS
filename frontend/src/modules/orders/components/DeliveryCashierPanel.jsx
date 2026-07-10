import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminFormModal, DashboardSection, FilterBar, SecondaryAction } from "@/modules/admin/components/AdminUi";
import { menuApi } from "@/modules/menu/services/menuApi";
import { orderApi } from "@/modules/orders/services/orderApi";
import { cacheMenuCatalog, getCachedMenuCatalog } from "@/utils/offlineCache";
import { enqueueOfflineAction, isNetworkError } from "@/utils/network";

const PAYMENT_OPTIONS = [
  "Dépôt Orange Money",
  "Dépôt MTN Mobile Money",
  "Paiement à la livraison",
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
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  useEffect(() => {
    loadAreas();
    loadDeliveries();
    loadMenu();
  }, [restaurantId]);

  async function loadAreas() {
    try {
      const data = await orderApi.listDeliveryAreas();
      setAreas(data);
      if (!form.delivery_area_id && data[0]?.id) {
        setForm((current) => ({ ...current, delivery_area_id: data[0].id }));
      }
    } catch {
      setAreas([]);
    }
  }

  async function loadDeliveries() {
    try {
      const data = await orderApi.list({ fulfillment_type: "Livraison", limit: 200 });
      const active = data.filter((order) => !["Payée", "Payee", "Annulée", "Annulee", "Archivée", "Archivee"].includes(order.status));
      setOrders(active.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch {
      // liste silencieuse si réseau coupé
    }
  }

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

  const visibleDishes = useMemo(() => {
    if (categoryFilter === "ALL") return dishes;
    return dishes.filter((dish) => dish.category_id === categoryFilter);
  }, [categoryFilter, dishes]);

  const query = search.trim().toLowerCase();
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!query) return true;
        return [order.order_number, order.customer_name, order.customer_phone, order.delivery_area_name, order.payment_method]
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [orders, query]
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
      try {
        await orderApi.sendToKitchen(created.id);
      } catch {
        // la commande est créée même si l'envoi cuisine échoue temporairement
      }
      onMessage?.(`Livraison ${created.order_number} enregistrée et envoyée en cuisine.`);
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
            {filteredOrders.map((order) => (
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
                  <p><DashboardIcon name="Phone" size={12} className="mr-1 inline" />{order.payment_method}</p>
                  <p>{money(order.total_amount)} · {formatDateTime(order.created_at)}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Aucune livraison active. Créez une nouvelle commande avec le bouton ci-dessus.
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
              <span className="lte-label">Quartier <span className="req">*</span></span>
              <select
                value={form.delivery_area_id}
                onChange={(event) => setForm((current) => ({ ...current, delivery_area_id: event.target.value }))}
                className="form-control"
              >
                <option value="">Choisir un quartier</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name} ({money(area.delivery_fee)})
                  </option>
                ))}
              </select>
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
              <span className="lte-label">Adresse complémentaire</span>
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
