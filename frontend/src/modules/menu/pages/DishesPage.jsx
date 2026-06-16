import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AdminCard, AdminKpis, AdminPage, EmptyState, Field, IconButton, PrimaryAction, SearchBox, SecondaryAction, StatusPill, TableFooter } from "@/modules/admin/components/AdminUi";
import { orderApi } from "@/modules/orders/services/orderApi";
import { menuApi } from "../services/menuApi";

const emptyDish = { category_id: "", name: "", description: "", price: "", cost_per_dish: "", image_url: "", is_available: true };

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export default function DishesPage({ restaurantId, role, activeOrderId, showCreateOnMount = false, initialAvailabilityFilter = "ALL" }) {
  const [categories, setCategories] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [form, setForm] = useState(emptyDish);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [availabilityFilter, setAvailabilityFilter] = useState(initialAvailabilityFilter);
  const [showForm, setShowForm] = useState(showCreateOnMount);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createOnly = showCreateOnMount && !activeOrderId;

  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active !== false),
    [categories]
  );
  const visibleDishes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dishes.filter((dish) => {
      const category = categoryNameById.get(dish.category_id) ?? "";
      const matchesSearch = !query || [dish.name, dish.description, category].join(" ").toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "ALL" || dish.category_id === categoryFilter;
      const matchesAvailability =
        availabilityFilter === "ALL" ||
        (availabilityFilter === "AVAILABLE" && dish.is_available) ||
        (availabilityFilter === "UNAVAILABLE" && !dish.is_available);
      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [availabilityFilter, categoryFilter, categoryNameById, dishes, search]);

  const averagePrice = dishes.length ? dishes.reduce((total, dish) => total + Number(dish.price || 0), 0) / dishes.length : 0;
  const topDishes = dishes.slice(0, 4);

  useEffect(() => {
    loadMenu();
  }, [restaurantId]);

  useEffect(() => {
    setShowForm(showCreateOnMount);
  }, [showCreateOnMount]);

  useEffect(() => {
    setAvailabilityFilter(initialAvailabilityFilter);
  }, [initialAvailabilityFilter]);

  useEffect(() => {
    if (!activeOrderId) {
      setActiveOrder(null);
      return;
    }
    loadActiveOrder();
  }, [activeOrderId]);

  async function loadMenu() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const fetchedCategories = await menuApi.getCategories(restaurantId);
      const results = await Promise.all(fetchedCategories.map((category) => menuApi.getDishesByCategory(category.id)));
      const availableCategories = fetchedCategories.filter((category) => category.is_active !== false);
      setCategories(fetchedCategories);
      setDishes(results.flat());
      setForm((current) => {
        const isCurrentActive = availableCategories.some((category) => category.id === current.category_id);
        return { ...current, category_id: isCurrentActive ? current.category_id : availableCategories[0]?.id || "" };
      });
      setCategoryFilter((current) => {
        if (current === "ALL") return current;
        return availableCategories.some((category) => category.id === current) ? current : "ALL";
      });
    } catch {
      setError("Erreur lors du chargement des plats.");
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveOrder() {
    try {
      setActiveOrder(await orderApi.get(activeOrderId));
    } catch (err) {
      setError(err.message || "Commande introuvable.");
    }
  }

  function updateForm(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setForm((current) => ({ ...current, image_url: "" }));
      const imageUrl = await menuApi.uploadImage(file);
      setForm((current) => ({ ...current, image_url: imageUrl }));
    } catch (err) {
      setError(err.message || "Import image impossible.");
    } finally {
      event.target.value = "";
    }
  }

  async function createDish(event) {
    event.preventDefault();
    try {
      const created = await menuApi.createDish({
        ...form,
        price: Number(form.price),
        cost_per_dish: Number(form.cost_per_dish || 0),
        description: form.description || null,
        image_url: form.image_url || null,
      });
      setDishes((current) => [created, ...current]);
      setForm({ ...emptyDish, category_id: form.category_id });
      if (!createOnly) {
        setShowForm(false);
      }
    } catch (err) {
      setError(err.message || "Ajout du plat impossible.");
    }
  }

  async function toggleDish(dish) {
    const updated = await menuApi.toggleDishAvailability(dish.id);
    setDishes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function deleteDish(dish) {
    if (!window.confirm(`Archiver "${dish.name}" ?\n\nLe plat restera en base de données.`)) return;
    await menuApi.softDeleteDish(dish.id);
    setDishes((current) => current.filter((item) => item.id !== dish.id));
  }

  async function updateOrderItems(items) {
    if (!activeOrderId) return;
    try {
      const updated = await orderApi.update(activeOrderId, { items });
      setActiveOrder(updated);
      setError("");
      setNotice("");
    } catch (err) {
      setError(err.message || "Mise à jour de la commande impossible.");
    }
  }

  function addDishToOrder(dish) {
    const currentItems = activeOrder?.items ?? [];
    const nextItemsById = new Map(
      currentItems
        .filter((item) => item.menu_item_id)
        .map((item) => [item.menu_item_id, { menu_item_id: item.menu_item_id, quantity: Number(item.quantity || 0) }])
    );
    const existing = nextItemsById.get(dish.id);
    nextItemsById.set(dish.id, {
      menu_item_id: dish.id,
      quantity: existing ? existing.quantity + 1 : 1,
    });
    updateOrderItems([...nextItemsById.values()]);
  }

  function changeOrderItemQuantity(menuItemId, quantity) {
    const nextItems = (activeOrder?.items ?? [])
      .filter((item) => item.menu_item_id)
      .map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.menu_item_id === menuItemId ? quantity : Number(item.quantity || 0),
      }))
      .filter((item) => item.quantity > 0);
    updateOrderItems(nextItems);
  }

  async function sendToKitchen() {
    if (!activeOrderId) return;
    try {
      const updated = await orderApi.sendToKitchen(activeOrderId);
      setActiveOrder(updated);
      setError("");
      setNotice("Commande envoyée en cuisine.");
    } catch (err) {
      setError(err.message || "Envoi en cuisine impossible.");
    }
  }

  if (loading) return <div className="p-6 text-sm font-semibold text-slate-500">Chargement des plats...</div>;

  return (
    <AdminPage
      eyebrow={role === "CUISINE" ? "Cuisine" : "Plats"}
      title={createOnly ? "Créer un plat" : "Gestion des plats"}
      subtitle={activeOrderId ? "Ajoutez les plats à la commande de table puis envoyez-les en cuisine." : createOnly ? "Renseignez les informations du plat à ajouter à la carte." : "Gérez votre carte, les tarifs, la disponibilité et les performances des plats."}
      action={!createOnly && (
        <div className="flex flex-wrap gap-3">
          {!activeOrderId && <PrimaryAction icon="Plus" onClick={() => setShowForm((value) => !value)}>{showForm ? "Fermer" : "Nouveau plat"}</PrimaryAction>}
          <SecondaryAction icon="Download" onClick={() => exportCsv(visibleDishes, categoryNameById)}>Exporter</SecondaryAction>
        </div>
      )}
    >
      {error && <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{notice}</div>}

      {activeOrderId && (
        <OrderCart
          order={activeOrder}
          onQuantityChange={changeOrderItemQuantity}
          onSendToKitchen={sendToKitchen}
        />
      )}

      {!createOnly && <AdminKpis items={[
        { label: "Plats disponibles", value: dishes.filter((dish) => dish.is_available).length, icon: "UtensilsCrossed", trend: "à jour" },
        { label: "Indisponibles", value: dishes.filter((dish) => !dish.is_available).length, icon: "Power", tone: "warn" },
        { label: "Catégories couvertes", value: activeCategories.length, icon: "ClipboardList" },
        { label: "Prix moyen", value: money(averagePrice), icon: "Wallet" },
      ]} />}

      {showForm && (
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <AdminCard>
            <DishEditor form={form} categories={activeCategories} onChange={updateForm} onUpload={uploadImage} onSubmit={createDish} />
          </AdminCard>
          <DishPreview dish={form} categoryName={categoryNameById.get(form.category_id)} />
        </div>
      )}

      {!createOnly && <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <AdminCard>
          <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
            <SearchBox value={search} onChange={setSearch} placeholder="Rechercher un plat..." />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="form-control">
              <option value="ALL">Toutes</option>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} className="form-control">
              <option value="ALL">Tous statuts</option>
              <option value="AVAILABLE">Disponibles</option>
              <option value="UNAVAILABLE">Indisponibles</option>
            </select>
            <SecondaryAction icon="Activity" onClick={loadMenu}>Actualiser</SecondaryAction>
          </div>
          <DishesTable
            dishes={visibleDishes}
            categoryNameById={categoryNameById}
            role={role}
            orderMode={Boolean(activeOrderId)}
            onAddToOrder={addDishToOrder}
            onToggle={toggleDish}
            onDelete={deleteDish}
          />
        </AdminCard>

        <div className="space-y-5">
          <AdminCard title="Insights rapides">
            <Insight label="Taux de disponibilité" value={`${percent(dishes.filter((dish) => dish.is_available).length, dishes.length)}%`} />
            <Insight label="Catégorie la plus remplie" value={mostUsedCategory(dishes, categoryNameById)} />
            <Insight label="Évolution du prix moyen" value={money(averagePrice)} />
          </AdminCard>
          <AdminCard title="Top plats">
            <div className="space-y-3">
              {topDishes.map((dish, index) => (
                <div key={dish.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-50 text-xs font-black text-orange-600">{index + 1}</span>
                  <img src={dish.image_url || "/Images/ImageLogin.jpg"} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-950">{dish.name}</p>
                    <p className="text-xs font-semibold text-slate-500">{money(dish.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
      </div>}
    </AdminPage>
  );
}

function DishEditor({ form, categories, onChange, onUpload, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center">
          <DashboardIcon name="Plus" size={30} className="text-[var(--dashboard-primary)]" />
          <span className="mt-2 text-sm font-black text-slate-700">Ajouter une image</span>
          <span className="mt-1 text-xs font-semibold text-slate-400">PNG, JPG ou WEBP</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} className="hidden" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="name" label="Nom du plat" required value={form.name} onChange={onChange} placeholder="Ex. Poulet braisé" />
          <Field label="Catégorie" required>
            <select name="category_id" value={form.category_id} onChange={onChange} required className="form-control">
              <option value="">Sélectionner une catégorie</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field name="price" label="Prix de vente (FCFA)" required type="number" min="1" value={form.price} onChange={onChange} />
          <Field name="cost_per_dish" label="Coût par plat (FCFA)" type="number" min="0" value={form.cost_per_dish} onChange={onChange} />
          <label className="flex h-10 items-center gap-3 self-end rounded border border-slate-300 px-3 text-sm font-semibold text-slate-700">
            <input name="is_available" type="checkbox" checked={form.is_available} onChange={onChange} />
            Disponible
          </label>
        </div>
      </div>
      <Field name="description" label="Description" as="textarea" rows={3} value={form.description} onChange={onChange} className="mt-4" placeholder="Décrivez votre plat..." />
      <Field name="image_url" label="URL image" value={form.image_url} onChange={onChange} placeholder="https://..." />
      <div className="mt-2 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <PrimaryAction icon="Plus" type="submit">Enregistrer</PrimaryAction>
      </div>
    </form>
  );
}

function DishPreview({ dish, categoryName }) {
  return (
    <AdminCard title="Aperçu du plat">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <img src={dish.image_url || "/Images/ImageLogin.jpg"} alt="" className="h-56 w-full object-cover" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-black text-slate-950">{dish.name || "Nom du plat"}</h3>
            <p className="font-black text-[var(--dashboard-primary)]">{money(dish.price)}</p>
          </div>
          <StatusPill tone={dish.is_available ? "green" : "red"}>{dish.is_available ? "Disponible" : "Indisponible"}</StatusPill>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{dish.description || "Description du plat visible par les clients."}</p>
          <p className="mt-4 text-sm font-bold text-slate-600">Catégorie: {categoryName || "Non définie"}</p>
        </div>
      </div>
    </AdminCard>
  );
}

function OrderCart({ order, onQuantityChange, onSendToKitchen }) {
  if (!order) {
    return <AdminCard title="Commande en cours"><p className="text-sm font-semibold text-slate-500">Chargement de la facture...</p></AdminCard>;
  }

  const visibleItems = order.items.filter((item) => item.sale_channel !== "EMBALLAGE");
  const subtotal = visibleItems.reduce((total, item) => total + Number(item.line_total || 0), 0);
  return (
    <AdminCard
      title={`Commande ${order.order_number}`}
      action={<PrimaryAction icon="ChefHat" onClick={onSendToKitchen} disabled={!order.items.length}>Envoyer en cuisine</PrimaryAction>}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="divide-y divide-slate-100">
          {visibleItems.length === 0 && <p className="py-3 text-sm font-semibold text-slate-500">Aucun plat dans cette commande.</p>}
          {visibleItems.map((item) => (
            <div key={item.id || item.menu_item_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-black text-slate-950">{item.name}</p>
                <p className="text-xs font-semibold text-slate-500">{money(item.unit_price)} x {item.quantity}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onQuantityChange(item.menu_item_id, Number(item.quantity || 1) - 1)} className="h-9 w-9 rounded-lg border border-slate-200 text-sm font-black">-</button>
                <span className="w-8 text-center text-sm font-black">{item.quantity}</span>
                <button type="button" onClick={() => onQuantityChange(item.menu_item_id, Number(item.quantity || 0) + 1)} className="h-9 w-9 rounded-lg border border-slate-200 text-sm font-black">+</button>
                <strong className="ml-3 min-w-[110px] text-right text-sm text-slate-900">{money(item.line_total)}</strong>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-500">Statut</p>
          <div className="mt-2"><StatusBadge status={order.status} /></div>
          <p className="mt-5 text-xs font-black uppercase text-slate-500">Sous-total</p>
          <p className="mt-1 text-xl font-black text-slate-950">{money(subtotal)}</p>
          <p className="mt-5 text-xs font-black uppercase text-slate-500">Total facture</p>
          <p className="mt-1 text-2xl font-black text-[var(--dashboard-primary)]">{money(order.total_amount)}</p>
        </div>
      </div>
    </AdminCard>
  );
}

function DishesTable({ dishes, categoryNameById, role, orderMode, onAddToOrder, onToggle, onDelete }) {
  if (!dishes.length) return <EmptyState icon="UtensilsCrossed" title="Aucun plat trouvé" text="Créez un plat ou ajustez vos filtres." />;
  return (
    <>
    <div className="overflow-x-auto">
      <table className="lte-table min-w-[980px]">
        <thead>
          <tr>
            <th>Plat</th>
            <th>Catégorie</th>
            <th>Prix</th>
            <th>Coût</th>
            <th>Disponibilité</th>
            <th>Créé le</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {dishes.map((dish) => (
            <tr key={dish.id}>
              <td>
                <div className="flex items-center gap-3">
                  <img src={dish.image_url || "/Images/ImageLogin.jpg"} alt="" className="h-10 w-10 rounded object-cover" />
                  <div>
                    <p className="font-semibold text-slate-800">{dish.name}</p>
                    <p className="max-w-xs truncate text-xs text-slate-500">{dish.description || "Sans description"}</p>
                  </div>
                </div>
              </td>
              <td><StatusPill tone="green">{categoryNameById.get(dish.category_id) ?? "Sans catégorie"}</StatusPill></td>
              <td className="font-semibold text-slate-800">{money(dish.price)}</td>
              <td>{money(dish.cost_per_dish)}</td>
              <td><StatusPill tone={dish.is_available ? "green" : "red"}>{dish.is_available ? "Disponible" : "Indisponible"}</StatusPill></td>
              <td className="text-slate-500">{new Date(dish.created_at).toLocaleDateString("fr-FR")}</td>
              <td className="text-right">
                {orderMode ? (
                  <button
                    type="button"
                    disabled={!dish.is_available}
                    onClick={() => onAddToOrder(dish)}
                    className="lte-btn lte-btn-primary lte-btn-sm"
                  >
                    Ajouter
                  </button>
                ) : (
                  <>
                    <IconButton icon={dish.is_available ? "Eye" : "EyeOff"} title={dish.is_available ? "Marquer indisponible" : "Marquer disponible"} onClick={() => onToggle(dish)} />
                    {role !== "CUISINE" && <IconButton icon="Trash2" title="Supprimer" tone="red" onClick={() => onDelete(dish)} className="ml-2" />}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {!orderMode && <TableFooter count={dishes.length} label="plat" />}
    </>
  );
}

function Insight({ label, value }) {
  return <div className="flex items-center justify-between border-b border-slate-100 py-3 text-sm"><span className="font-semibold text-slate-500">{label}</span><strong className="text-slate-950">{value}</strong></div>;
}

function StatusBadge({ status }) {
  const tones = {
    Nouvelle: "blue",
    Acceptée: "green",
    "En préparation": "orange",
    Prête: "green",
    Livrée: "slate",
    Payée: "green",
    Annulée: "red",
  };
  return <StatusPill tone={tones[status] ?? "slate"}>{status}</StatusPill>;
}

function percent(value, total) {
  return total ? Number((value / total) * 100).toFixed(1) : "0.0";
}

function mostUsedCategory(dishes, categoryNameById) {
  const counts = dishes.reduce((acc, dish) => ({ ...acc, [dish.category_id]: (acc[dish.category_id] || 0) + 1 }), {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? `${categoryNameById.get(top[0]) ?? "Sans catégorie"} (${top[1]})` : "-";
}

function exportCsv(rows, categoryNameById) {
  const csv = ["Plat;Catégorie;Prix;Coût;Statut", ...rows.map((dish) => `${dish.name};${categoryNameById.get(dish.category_id) ?? ""};${dish.price};${dish.cost_per_dish || 0};${dish.is_available ? "Disponible" : "Indisponible"}`)].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "plats.csv";
  link.click();
}
