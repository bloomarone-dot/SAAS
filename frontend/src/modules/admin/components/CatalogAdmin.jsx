import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";

const emptyCategory = { name: "", description: "" };
const emptyItem = {
  category_id: "",
  name: "",
  description: "",
  price: "",
  cost_per_dish: "",
  image_url: "",
  is_available: true,
};

function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export function CatalogAdmin({ apiBaseUrl, onMessage }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [availabilityFilter, setAvailabilityFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [isLoading, setIsLoading] = useState(false);

  const token = localStorage.getItem("access_token");

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = items.filter((item) => {
      const category = categories.find((entry) => entry.id === item.category_id);
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.description ?? "").toLowerCase().includes(query) ||
        (category?.name ?? "").toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "ALL" || item.category_id === categoryFilter;
      const matchesAvailability =
        availabilityFilter === "ALL" ||
        (availabilityFilter === "AVAILABLE" && item.is_available) ||
        (availabilityFilter === "UNAVAILABLE" && !item.is_available);
      return matchesSearch && matchesCategory && matchesAvailability;
    });
    return sortRows(rows, sort, {
      name: (item) => item.name,
      category: (item) => categories.find((category) => category.id === item.category_id)?.name ?? "",
      price: (item) => Number(item.price),
      cost: (item) => Number(item.cost_per_dish || 0),
      status: (item) => Number(item.is_available),
      created_at: (item) => item.created_at,
    });
  }, [availabilityFilter, categories, categoryFilter, items, search, sort]);

  const stats = useMemo(
    () => [
      { label: "Catégories", value: categories.length, icon: "ClipboardList" },
      { label: "Plats", value: items.length, icon: "UtensilsCrossed" },
      { label: "Disponibles", value: items.filter((item) => item.is_available).length, icon: "CheckCircle2" },
      { label: "Prix moyen", value: formatPrice(average(items.map((item) => item.price))), icon: "Wallet" },
    ],
    [categories.length, items]
  );

  useEffect(() => {
    loadCatalog();
  }, []);

  async function api(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail ?? "Opération impossible.");
    return data;
  }

  async function loadCatalog() {
    setIsLoading(true);
    try {
      const [categoryData, itemData] = await Promise.all([
        api("/api/v1/catalog/categories"),
        api("/api/v1/catalog/items"),
      ]);
      setCategories(categoryData);
      setItems(itemData);
      setItemForm((current) => ({ ...current, category_id: current.category_id || categoryData[0]?.id || "" }));
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateCategoryField(event) {
    const { name, value } = event.target;
    setCategoryForm((current) => ({ ...current, [name]: value }));
  }

  function updateItemField(event) {
    const { name, value, type, checked } = event.target;
    setItemForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function createCategory(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const created = await api("/api/v1/catalog/categories", {
        method: "POST",
        body: JSON.stringify({ ...categoryForm, description: categoryForm.description || null }),
      });
      setCategories((current) => [created, ...current]);
      setItemForm((current) => ({ ...current, category_id: current.category_id || created.id }));
      setCategoryForm(emptyCategory);
      onMessage(`Catégorie "${created.name}" créée.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function createItem(event) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const created = await api("/api/v1/catalog/items", {
        method: "POST",
        body: JSON.stringify({
          ...itemForm,
          price: Number(itemForm.price),
          cost_per_dish: Number(itemForm.cost_per_dish || 0),
          image_url: itemForm.image_url || null,
          description: itemForm.description || null,
        }),
      });
      setItems((current) => [created, ...current]);
      setItemForm({ ...emptyItem, category_id: itemForm.category_id });
      onMessage(`Plat "${created.name}" ajouté au menu.`);
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleAvailability(item) {
    setIsLoading(true);
    try {
      const updated = await api(`/api/v1/catalog/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      onMessage(updated.is_available ? "Plat remis en vente." : "Plat retiré temporairement.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Archiver le plat ${item.name} ?\n\nLe plat restera en base de données et pourra être remis en vente.`)) return;
    setIsLoading(true);
    try {
      await api(`/api/v1/catalog/items/${item.id}`, { method: "DELETE" });
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, is_available: false } : entry)));
      onMessage("Plat archivé du catalogue.");
    } catch (error) {
      onMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase text-[#f04438]">Administrateur / Propriétaire</p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Carte</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            Gérez les plats et produits visibles à la vente. Les ingrédients et marchandises sont suivis dans Stock &gt; Produits stock.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCatalog}
          className="inline-flex h-12 items-center justify-center gap-2 border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm hover:border-[#f04438] hover:text-[#f04438]"
        >
          <DashboardIcon name="Activity" size={17} />
          Actualiser
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center bg-[#fff4ed] text-[#f04438]">
              <DashboardIcon name={item.icon} size={19} />
            </div>
            <p className="mt-5 text-sm font-bold text-slate-500">{item.label}</p>
            <p className="mt-1 text-3xl font-black text-[#070528]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <form onSubmit={createCategory} className="border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle title="Créer une catégorie" icon="ClipboardList" />
            <div className="mt-5 grid gap-4">
              <Field name="name" label="Nom de la catégorie" value={categoryForm.name} onChange={updateCategoryField} required />
              <Field
                name="description"
                label="Description"
                value={categoryForm.description}
                onChange={updateCategoryField}
                placeholder="Ex: Burgers, pizzas, boissons..."
              />
            </div>
            <PrimaryButton disabled={isLoading} icon="Plus">Ajouter la catégorie</PrimaryButton>
          </form>

          <form onSubmit={createItem} className="border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle title="Créer un plat" icon="UtensilsCrossed" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field name="name" label="Nom du plat" value={itemForm.name} onChange={updateItemField} required />
              <Field name="price" label="Prix de vente" type="number" min="0" value={itemForm.price} onChange={updateItemField} required />
              <Field name="cost_per_dish" label="Coût par plat" type="number" min="0" value={itemForm.cost_per_dish} onChange={updateItemField} />
              <label className="block">
                <span className="text-xs font-black text-[#070528]">
                  Catégorie <span className="text-red-500">*</span>
                </span>
                <select
                  name="category_id"
                  value={itemForm.category_id}
                  onChange={updateItemField}
                  required
                  className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
                >
                  <option value="">Choisir</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <Field name="image_url" label="Image du plat" value={itemForm.image_url} onChange={updateItemField} />
              <label className="md:col-span-2">
                <span className="text-xs font-black text-[#070528]">Description</span>
                <textarea
                  name="description"
                  value={itemForm.description}
                  onChange={updateItemField}
                  rows={3}
                  className="mt-2 w-full border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
                />
              </label>
              <label className="flex items-center gap-3 text-sm font-black text-slate-700">
                <input name="is_available" type="checkbox" checked={itemForm.is_available} onChange={updateItemField} />
                Disponible à la vente
              </label>
            </div>
            <PrimaryButton disabled={isLoading || !categories.length} icon="Plus">Ajouter le plat</PrimaryButton>
          </form>
        </div>

        <div className="border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="grid gap-3 xl:grid-cols-[1fr_200px_190px]">
              <div className="flex h-12 items-center gap-3 border border-slate-200 bg-white px-4">
                <DashboardIcon name="Search" size={17} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un plat, une catégorie..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-12 border border-slate-200 bg-white px-4 text-sm font-black outline-none"
              >
                <option value="ALL">Toutes catégories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
                className="h-12 border border-slate-200 bg-white px-4 text-sm font-black outline-none"
              >
                <option value="ALL">Tous statuts</option>
                <option value="AVAILABLE">Disponibles</option>
                <option value="UNAVAILABLE">Indisponibles</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="bg-[#fff8f3] text-xs font-black uppercase text-[#b42318]">
                <tr>
                  <th className="px-5 py-4"><SortButton label="Plat" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th className="px-5 py-4"><SortButton label="Catégorie" column="category" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th className="px-5 py-4"><SortButton label="Prix" column="price" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th className="px-5 py-4"><SortButton label="Coût" column="cost" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th className="px-5 py-4"><SortButton label="Statut" column="status" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-black text-[#070528]">{item.name}</p>
                      <p className="max-w-sm truncate text-xs font-semibold text-slate-500">{item.description || "Sans description"}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-700">
                      {categories.find((category) => category.id === item.category_id)?.name ?? "-"}
                    </td>
                    <td className="px-5 py-4 text-sm font-black text-[#070528]">{formatPrice(item.price)}</td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-700">{formatPrice(item.cost_per_dish)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-3 py-1 text-xs font-black ${item.is_available ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        {item.is_available ? "Disponible" : "Indisponible"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => toggleAvailability(item)} className="border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:border-[#f04438] hover:text-[#f04438]">
                          {item.is_available ? "Retirer" : "Activer"}
                        </button>
                        <button type="button" onClick={() => deleteItem(item)} className="border border-red-100 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50">
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredItems.length && (
              <EmptyState title="Aucun plat trouvé" text="Ajoutez vos premiers plats ou ajustez les filtres." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + Number(value || 0), 0) / values.length;
}

function SectionTitle({ title, icon }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-[#070528]">{title}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Information directement exploitable par le restaurant.</p>
      </div>
      <div className="flex h-11 w-11 items-center justify-center bg-[#f04438] text-white">
        <DashboardIcon name={icon} size={19} />
      </div>
    </div>
  );
}

function Field({ label, required, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#070528]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        {...props}
        required={required}
        className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition-all placeholder:text-slate-400 focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2]"
      />
    </label>
  );
}

function PrimaryButton({ children, icon, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-6 inline-flex h-12 items-center justify-center gap-2 bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <DashboardIcon name={icon} size={17} />
      {children}
    </button>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#fff4ed] text-[#f04438]">
        <DashboardIcon name="UtensilsCrossed" size={23} />
      </div>
      <p className="mt-4 text-lg font-black text-[#070528]">{title}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}
