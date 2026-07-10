import { Fragment, useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import {
  AdminFormModal,
  EmptyState,
  ModuleFilterBar,
  PageHeader,
  StatusPill,
  TableFooter,
} from "@/modules/admin/components/AdminUi";
import { menuApi } from "../services/menuApi";

const emptyCategory = { name: "", description: "", image_url: "" };
const emptyDish = {
  name: "",
  description: "",
  price: "",
  cost_per_dish: "",
  image_url: "",
  is_available: true,
};

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function buildDishPayload(categoryId, dishForm) {
  return {
    category_id: categoryId,
    name: dishForm.name.trim(),
    price: Number(dishForm.price),
    cost_per_dish: Number(dishForm.cost_per_dish || 0),
    description: dishForm.description.trim() || null,
    image_url: dishForm.image_url.trim() || null,
    is_available: dishForm.is_available,
    requires_kitchen: null,
  };
}

export default function MenuCatalogAdmin({ restaurantId, role, onMessage }) {
  const [categories, setCategories] = useState([]);
  const [dishesByCategory, setDishesByCategory] = useState({});
  const [expandedCategoryId, setExpandedCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDishModal, setShowDishModal] = useState(false);
  const [dishModalCategoryId, setDishModalCategoryId] = useState("");
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [dishForm, setDishForm] = useState(emptyDish);
  const [extraDishForm, setExtraDishForm] = useState(emptyDish);
  const [uploadingImage, setUploadingImage] = useState(false);

  const readOnly = role === "CUISINE";

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories.filter((category) => {
      if (!query) return true;
      const categoryMatch = [category.name, category.description]
        .join(" ")
        .toLowerCase()
        .includes(query);
      const dishMatch = (dishesByCategory[category.id] ?? []).some((dish) =>
        [dish.name, dish.description].join(" ").toLowerCase().includes(query)
      );
      return categoryMatch || dishMatch;
    });
  }, [categories, dishesByCategory, search]);

  function dishesForCategory(categoryId) {
    return (dishesByCategory[categoryId] ?? []).filter((dish) => {
      const matchesAvailability =
        availabilityFilter === "ALL" ||
        (availabilityFilter === "AVAILABLE" && dish.is_available) ||
        (availabilityFilter === "UNAVAILABLE" && !dish.is_available);
      return matchesAvailability;
    });
  }

  useEffect(() => {
    loadCatalog();
  }, [restaurantId]);

  async function loadCatalog() {
    setLoading(true);
    setError("");
    try {
      const data = await menuApi.getCategories(restaurantId);
      const entries = await Promise.all(
        data.map(async (category) => [category.id, await menuApi.getDishesByCategory(category.id)])
      );
      setCategories(data);
      setDishesByCategory(Object.fromEntries(entries));
    } catch {
      setError("Impossible de charger le catalogue.");
    } finally {
      setLoading(false);
    }
  }

  function updateCategoryForm(event) {
    const { name, value } = event.target;
    setCategoryForm((current) => ({ ...current, [name]: value }));
  }

  function updateDishForm(event) {
    const { name, value, type, checked } = event.target;
    setDishForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  function updateExtraDishForm(event) {
    const { name, value, type, checked } = event.target;
    setExtraDishForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function uploadImage(event, setter) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError("");
    try {
      const imageUrl = await menuApi.uploadImage(file);
      setter((current) => ({ ...current, image_url: imageUrl }));
      onMessage?.("Image importée avec succès.");
    } catch (err) {
      const text = err.message || "Import image impossible.";
      setError(text);
      onMessage?.(text);
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  function resetCreateModal() {
    setShowCreateModal(false);
    setCategoryForm(emptyCategory);
    setDishForm(emptyDish);
  }

  async function createCategoryWithDish(event) {
    event.preventDefault();
    if (!dishForm.name.trim() || !dishForm.price) {
      setError("Renseignez au moins le nom et le prix du premier plat.");
      return;
    }
    try {
      const createdCategory = await menuApi.createCategory({
        restaurant_id: restaurantId,
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        image_url: categoryForm.image_url.trim() || null,
      });
      const createdDish = await menuApi.createDish(buildDishPayload(createdCategory.id, dishForm));
      setCategories((current) => [createdCategory, ...current]);
      setDishesByCategory((current) => ({
        ...current,
        [createdCategory.id]: [createdDish],
      }));
      setExpandedCategoryId(createdCategory.id);
      resetCreateModal();
      setError("");
      onMessage?.(`Catégorie « ${createdCategory.name} » et plat créés.`);
    } catch (err) {
      setError(err.message || "Création du catalogue impossible.");
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Archiver la catégorie "${category.name}" ?`)) return;
    await menuApi.deleteCategory(category.id);
    setCategories((current) => current.filter((item) => item.id !== category.id));
    setDishesByCategory((current) => {
      const next = { ...current };
      delete next[category.id];
      return next;
    });
    if (expandedCategoryId === category.id) setExpandedCategoryId("");
  }

  function openAddDishModal(categoryId) {
    setDishModalCategoryId(categoryId);
    setExtraDishForm(emptyDish);
    setShowDishModal(true);
  }

  async function createExtraDish(event) {
    event.preventDefault();
    if (!dishModalCategoryId) return;
    try {
      const created = await menuApi.createDish(buildDishPayload(dishModalCategoryId, extraDishForm));
      setDishesByCategory((current) => ({
        ...current,
        [dishModalCategoryId]: [created, ...(current[dishModalCategoryId] ?? [])],
      }));
      setShowDishModal(false);
      setExtraDishForm(emptyDish);
      setExpandedCategoryId(dishModalCategoryId);
      onMessage?.(`Plat « ${created.name} » ajouté.`);
    } catch (err) {
      setError(err.message || "Ajout du plat impossible.");
    }
  }

  async function toggleDish(dish) {
    const updated = await menuApi.toggleDishAvailability(dish.id);
    setDishesByCategory((current) => ({
      ...current,
      [dish.category_id]: (current[dish.category_id] ?? []).map((item) =>
        item.id === updated.id ? updated : item
      ),
    }));
  }

  async function deleteDish(dish) {
    if (!window.confirm(`Archiver "${dish.name}" ?`)) return;
    await menuApi.softDeleteDish(dish.id);
    setDishesByCategory((current) => ({
      ...current,
      [dish.category_id]: (current[dish.category_id] ?? []).filter((item) => item.id !== dish.id),
    }));
  }

  function toggleExpanded(categoryId) {
    setExpandedCategoryId((current) => (current === categoryId ? "" : categoryId));
  }

  if (loading) {
    return <div className="p-6 text-sm font-semibold text-slate-500">Chargement du catalogue...</div>;
  }

  const dishModalCategory = categories.find((category) => category.id === dishModalCategoryId);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Catalogue"
        subtitle="Créez une catégorie et son premier plat en une seule étape. La liste s'affiche ensuite en pleine largeur."
        primaryAction={
          !readOnly && (
            <button type="button" onClick={() => setShowCreateModal(true)} className="lte-btn lte-btn-primary">
              <DashboardIcon name="Plus" size={17} />
              Catégorie + plat
            </button>
          )
        }
      />

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      <ModuleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher une catégorie ou un plat..."
        showPeriod={false}
        showBranch={false}
      >
        <select
          value={availabilityFilter}
          onChange={(event) => setAvailabilityFilter(event.target.value)}
          className="form-control h-10 w-44"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="AVAILABLE">Disponibles</option>
          <option value="UNAVAILABLE">Indisponibles</option>
        </select>
      </ModuleFilterBar>

      <div className="border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-[var(--dashboard-secondary)]">Catalogue complet</h2>
          <p className="text-sm font-medium text-slate-500">
            {visibleCategories.length} catégorie(s) · cliquez sur une ligne pour voir ses plats
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="lte-table min-w-[900px]">
            <thead>
              <tr>
                <th>Catégorie / Plat</th>
                <th>Prix</th>
                <th>Plats</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleCategories.map((category) => {
                const dishes = dishesForCategory(category.id);
                const expanded = expandedCategoryId === category.id;
                return (
                  <Fragment key={category.id}>
                    <tr
                      key={category.id}
                      className={`${expanded ? "bg-[#fff4ed]" : "hover:bg-slate-50"}`}
                    >
                      <td>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(category.id)}
                          className="flex w-full items-center gap-3 text-left"
                        >
                          <DashboardIcon
                            name="ChevronDown"
                            size={16}
                            className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                          <div>
                            <p className="font-black text-slate-900">{category.name}</p>
                            <p className="text-xs font-semibold text-slate-400">
                              {category.description || "Sans description"}
                            </p>
                          </div>
                        </button>
                      </td>
                      <td className="text-sm font-semibold text-slate-400">—</td>
                      <td className="font-semibold text-[var(--dashboard-primary)]">
                        {dishesByCategory[category.id]?.length || 0}
                      </td>
                      <td>
                        <StatusPill tone={category.is_active ? "green" : "red"}>
                          {category.is_active ? "Active" : "Inactive"}
                        </StatusPill>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => openAddDishModal(category.id)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
                            >
                              <DashboardIcon name="Plus" size={15} />
                              Plat
                            </button>
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => deleteCategory(category)}
                              className="lte-btn lte-btn-danger lte-btn-sm"
                              title="Archiver"
                            >
                              <DashboardIcon name="Archive" size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded && (
                      <tr key={`${category.id}-dishes`}>
                        <td colSpan={5} className="bg-slate-50 px-5 py-4">
                          {dishes.length ? (
                            <div className="space-y-2">
                              {dishes.map((dish) => (
                                <div
                                  key={dish.id}
                                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
                                >
                                  {dish.image_url ? (
                                    <img src={dish.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                                  ) : (
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-[var(--dashboard-primary)]">
                                      <DashboardIcon name="Utensils" size={16} />
                                    </span>
                                  )}
                                  <div className="min-w-[180px] flex-1">
                                    <p className="font-black text-slate-900">{dish.name}</p>
                                    <p className="text-xs font-semibold text-slate-500">
                                      {dish.description || "Sans description"}
                                    </p>
                                  </div>
                                  <p className="text-sm font-black text-slate-800">{money(dish.price)}</p>
                                  <StatusPill tone={dish.is_available ? "green" : "orange"}>
                                    {dish.is_available ? "Dispo" : "Indispo"}
                                  </StatusPill>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleDish(dish)}
                                      className="lte-tool-btn"
                                      title={dish.is_available ? "Rendre indisponible" : "Rendre disponible"}
                                    >
                                      <DashboardIcon name="Power" size={15} />
                                    </button>
                                    {!readOnly && (
                                      <button
                                        type="button"
                                        onClick={() => deleteDish(dish)}
                                        className="lte-tool-btn text-red-600"
                                        title="Archiver"
                                      >
                                        <DashboardIcon name="Archive" size={15} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <EmptyState
                              title="Aucun plat"
                              text={readOnly ? "Aucun plat dans cette catégorie." : "Ajoutez un plat à cette catégorie."}
                            />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {!visibleCategories.length && (
            <EmptyState title="Aucune catégorie" text="Créez une catégorie avec son premier plat pour commencer." />
          )}
        </div>

        {Boolean(visibleCategories.length) && (
          <TableFooter count={visibleCategories.length} label="catégorie" plural="catégories" />
        )}
      </div>

      <AdminFormModal
        open={showCreateModal}
        onClose={resetCreateModal}
        title="Catégorie + premier plat"
        description="Créez la catégorie et son premier plat ou boisson en une seule fois."
        size="xl"
        footer={
          <>
            <button type="button" onClick={resetCreateModal} className="lte-btn lte-btn-default">
              Annuler
            </button>
            <button type="submit" form="catalog-create-form" className="lte-btn lte-btn-primary">
              Créer catégorie et plat
            </button>
          </>
        }
      >
        <form id="catalog-create-form" onSubmit={createCategoryWithDish} className="space-y-6">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-[var(--dashboard-primary)]">
              1. Catégorie
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="lte-form-group md:col-span-2">
                <span className="lte-label">Nom de la catégorie <span className="req">*</span></span>
                <input
                  required
                  name="name"
                  value={categoryForm.name}
                  onChange={updateCategoryForm}
                  className="form-control"
                  placeholder="Ex : Entrées, Boissons..."
                />
              </label>
              <label className="lte-form-group md:col-span-2">
                <span className="lte-label">Description</span>
                <textarea
                  name="description"
                  rows={2}
                  value={categoryForm.description}
                  onChange={updateCategoryForm}
                  className="form-control"
                />
              </label>
              <label className="lte-form-group md:col-span-2">
                <span className="lte-label">Image catégorie</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => uploadImage(event, setCategoryForm)}
                  className="form-control"
                  disabled={uploadingImage}
                />
                {uploadingImage && <span className="lte-help">Import en cours…</span>}
                {categoryForm.image_url ? (
                  <img src={categoryForm.image_url} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                ) : null}
              </label>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <p className="mb-3 text-xs font-black uppercase tracking-wide text-[var(--dashboard-primary)]">
              2. Premier plat / boisson
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="lte-form-group md:col-span-2">
                <span className="lte-label">Nom du plat <span className="req">*</span></span>
                <input
                  required
                  name="name"
                  value={dishForm.name}
                  onChange={updateDishForm}
                  className="form-control"
                  placeholder="Ex : Poulet braisé, Coca-Cola..."
                />
              </label>
              <label className="lte-form-group">
                <span className="lte-label">Prix (FCFA) <span className="req">*</span></span>
                <input
                  required
                  type="number"
                  min="0"
                  name="price"
                  value={dishForm.price}
                  onChange={updateDishForm}
                  className="form-control"
                />
              </label>
              <label className="lte-form-group">
                <span className="lte-label">Coût unitaire</span>
                <input
                  type="number"
                  min="0"
                  name="cost_per_dish"
                  value={dishForm.cost_per_dish}
                  onChange={updateDishForm}
                  className="form-control"
                />
              </label>
              <label className="lte-form-group md:col-span-2">
                <span className="lte-label">Description</span>
                <textarea
                  name="description"
                  rows={2}
                  value={dishForm.description}
                  onChange={updateDishForm}
                  className="form-control"
                />
              </label>
              <label className="lte-form-group">
                <span className="lte-label">Image plat</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => uploadImage(event, setDishForm)}
                  className="form-control"
                  disabled={uploadingImage}
                />
                {dishForm.image_url ? (
                  <img src={dishForm.image_url} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                ) : null}
              </label>
              <label className="flex items-center gap-2 self-end text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  name="is_available"
                  checked={dishForm.is_available}
                  onChange={updateDishForm}
                />
                Disponible à la vente
              </label>
            </div>
          </div>
        </form>
      </AdminFormModal>

      <AdminFormModal
        open={showDishModal}
        onClose={() => {
          setShowDishModal(false);
          setExtraDishForm(emptyDish);
        }}
        title={`Ajouter un plat — ${dishModalCategory?.name ?? ""}`}
        description="Ajoutez un autre plat ou boisson à cette catégorie."
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setShowDishModal(false);
                setExtraDishForm(emptyDish);
              }}
              className="lte-btn lte-btn-default"
            >
              Annuler
            </button>
            <button type="submit" form="catalog-extra-dish-form" className="lte-btn lte-btn-primary">
              Ajouter le plat
            </button>
          </>
        }
      >
        <form id="catalog-extra-dish-form" onSubmit={createExtraDish} className="grid gap-4 md:grid-cols-2">
          <label className="lte-form-group md:col-span-2">
            <span className="lte-label">Nom <span className="req">*</span></span>
            <input required name="name" value={extraDishForm.name} onChange={updateExtraDishForm} className="form-control" />
          </label>
          <label className="lte-form-group">
            <span className="lte-label">Prix (FCFA) <span className="req">*</span></span>
            <input required type="number" min="0" name="price" value={extraDishForm.price} onChange={updateExtraDishForm} className="form-control" />
          </label>
          <label className="lte-form-group">
            <span className="lte-label">Coût unitaire</span>
            <input type="number" min="0" name="cost_per_dish" value={extraDishForm.cost_per_dish} onChange={updateExtraDishForm} className="form-control" />
          </label>
          <label className="lte-form-group md:col-span-2">
            <span className="lte-label">Description</span>
            <textarea name="description" rows={2} value={extraDishForm.description} onChange={updateExtraDishForm} className="form-control" />
          </label>
          <label className="lte-form-group md:col-span-2">
            <span className="lte-label">Image plat</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => uploadImage(event, setExtraDishForm)}
              className="form-control"
              disabled={uploadingImage}
            />
            {extraDishForm.image_url ? (
              <img src={extraDishForm.image_url} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
            ) : null}
          </label>
          <label className="flex items-center gap-2 self-end text-sm font-semibold text-slate-700 md:col-span-2">
            <input type="checkbox" name="is_available" checked={extraDishForm.is_available} onChange={updateExtraDishForm} />
            Disponible à la vente
          </label>
        </form>
      </AdminFormModal>
    </section>
  );
}
