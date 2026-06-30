import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { DashboardSection, EmptyState as AdminEmptyState, FilterBar, PageHeader } from "@/modules/admin/components/AdminUi";
import { nextSort, SortButton, sortRows } from "@/utils/sort";
import { formatApiError } from "@/utils/network";
import { validationFor } from "@/utils/validation";

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

function optionalText(value) {
  const trimmed = typeof value === "string" ? value.trim() : value;
  return trimmed || null;
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

  useEffect(() => {
    loadCatalog();
  }, []);

  async function api(path, options = {}) {
    const fallback = options.fallback || "Action catalogue impossible.";
    const { fallback: _fallback, ...requestOptions } = options;
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(requestOptions.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(formatApiError(data.detail ?? data.message ?? data.error, fallback));
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
        body: JSON.stringify({
          ...categoryForm,
          name: categoryForm.name.trim(),
          description: optionalText(categoryForm.description),
        }),
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
          name: itemForm.name.trim(),
          price: Number(itemForm.price),
          cost_per_dish: Number(itemForm.cost_per_dish || 0),
          image_url: optionalText(itemForm.image_url),
          description: optionalText(itemForm.description),
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
      <PageHeader
        eyebrow="Catalogue"
        title="Carte"
        subtitle="Gérez les catégories, les plats, les prix et la disponibilité affichée au service."
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <form onSubmit={createCategory} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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

          <form onSubmit={createItem} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
                  className="mt-2 form-control"
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
                  className="mt-2 form-control"
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

        <DashboardSection title="Plats" description="Liste filtrable des plats disponibles dans la carte.">
          <FilterBar>
              <div className="flex h-12 min-w-[260px] flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4">
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
                className="form-control"
              >
                <option value="ALL">Toutes catégories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
                className="form-control"
              >
                <option value="ALL">Tous statuts</option>
                <option value="AVAILABLE">Disponibles</option>
                <option value="UNAVAILABLE">Indisponibles</option>
              </select>
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="lte-table min-w-[820px]">
              <thead>
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
                        <button type="button" onClick={() => toggleAvailability(item)} className="lte-btn lte-btn-default lte-btn-sm">
                          {item.is_available ? "Retirer" : "Activer"}
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
        </DashboardSection>
      </div>
    </section>
  );
}

function SectionTitle({ title, icon }) {
  return (
    <div className="border-b border-slate-100 pb-4">
      <h2 className="text-2xl font-black text-[#070528]">{title}</h2>
      <p className="mt-1 text-sm font-medium text-slate-500">Information directement exploitable par le restaurant.</p>
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
        {...validationFor(props.name)}
        required={required}
        className="mt-2 form-control"
      />
    </label>
  );
}

function PrimaryButton({ children, icon, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-6 lte-btn lte-btn-primary"
    >
      <DashboardIcon name={icon} size={17} />
      {children}
    </button>
  );
}

function EmptyState({ title, text }) {
  return <AdminEmptyState icon="UtensilsCrossed" title={title} text={text} />;
}
