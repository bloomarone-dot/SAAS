import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import CategoryForm from "../components/CategoryForm";
import DishCard from "../components/DishCard";
import { menuApi } from "../services/menuApi";

export default function CategoriesPage({ restaurantId, role }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [dishes, setDishes] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingDishes, setLoadingDishes] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId),
    [categories, selectedCategoryId]
  );

  const stats = useMemo(
    () => [
      { label: "Catégories", value: categories.length, icon: "ClipboardList" },
      { label: "Plats affichés", value: dishes.length, icon: "UtensilsCrossed" },
      { label: "Disponibles", value: dishes.filter((dish) => dish.is_available).length, icon: "CheckCircle2" },
    ],
    [categories.length, dishes]
  );

  useEffect(() => {
    loadCategories();
  }, [restaurantId]);

  // Charger les plats quand la catégorie sélectionnée change
  useEffect(() => {
    if (!selectedCategoryId) return;

    async function loadDishes() {
      setLoadingDishes(true);
      try {
        const data = await menuApi.getDishesByCategory(selectedCategoryId);
        setDishes(data);
      } catch (err) {
        setError("Erreur lors du chargement des plats.");
      } finally {
        setLoadingDishes(false);
      }
    }
    loadDishes();
  }, [selectedCategoryId]);

  async function loadCategories() {
    setLoadingCategories(true);
    setError("");
    try {
      const data = await menuApi.getCategories(restaurantId);
      setCategories(data);
      if (data.length > 0) {
        setSelectedCategoryId((current) => current || data[0].id);
      }
    } catch (err) {
      setError("Impossible de charger les catégories du restaurant.");
    } finally {
      setLoadingCategories(false);
    }
  }

  const handleCategoryCreated = (newCategory) => {
    setCategories((prev) => [newCategory, ...prev]);
    setSelectedCategoryId(newCategory.id);
    setShowCategoryForm(false);
  };

  const handleDishUpdated = (updatedDish) => {
    setDishes((prev) =>
      prev.map((d) => (d.id === updatedDish.id ? updatedDish : d))
    );
  };

  const handleDishDeleted = (dishId) => {
    setDishes((prev) => prev.filter((d) => d.id !== dishId));
  };

  if (loadingCategories) {
    return <div className="p-6 text-sm font-semibold text-slate-500">Chargement du menu...</div>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-[#f04438]">
            {role === "CUISINE" ? "Cuisine" : "Administration restaurant"}
          </p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Catégories de la carte</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            {role === "CUISINE"
              ? "Consultez et créez les familles de plats utilisées dans la carte vendable."
              : "Structurez la carte par familles avant d’y rattacher les plats vendables."}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setShowCategoryForm((value) => !value)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20]"
          >
            <DashboardIcon name={showCategoryForm ? "ChevronDown" : "Plus"} size={17} />
            {showCategoryForm ? "Masquer le formulaire" : "Créer une catégorie"}
          </button>
          <button
            type="button"
            onClick={loadCategories}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition-all hover:border-[#f04438] hover:text-[#f04438]"
          >
            <DashboardIcon name="Activity" size={17} />
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <div key={item.label} className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
              <DashboardIcon name={item.icon} size={19} />
            </div>
            <p className="mt-5 text-sm font-bold text-slate-500">{item.label}</p>
            <p className="mt-1 text-3xl font-black text-[#070528]">{item.value}</p>
          </div>
        ))}
      </div>

      {showCategoryForm && (
          <CategoryForm
            restaurantId={restaurantId}
            onCategoryCreated={handleCategoryCreated}
          />
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-2xl font-black text-[#070528]">Liste des catégories</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Sélectionnez une catégorie pour voir les plats rattachés.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {categories.length > 0 ? (
              categories.map((category) => {
                const isActive = category.id === selectedCategoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={`flex w-full items-center justify-between gap-4 p-5 text-left transition-all ${
                      isActive ? "bg-[#fff4ed]" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      {category.image_url ? (
                        <img src={category.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
                          <DashboardIcon name="ClipboardList" size={18} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[#070528]">{category.name}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                          {category.description || "Sans description"}
                        </span>
                      </span>
                    </div>
                    <span className={`rounded px-3 py-1 text-xs font-black ${isActive ? "bg-[#f04438] text-white" : "bg-slate-100 text-slate-600"}`}>
                      {isActive ? "Sélectionnée" : "Voir"}
                    </span>
                  </button>
                );
              })
            ) : (
              <EmptyState
                icon="ClipboardList"
                title="Aucune catégorie créée"
                text="Créez une catégorie pour organiser les plats de la carte."
              />
            )}
          </div>
        </div>

        <div className="border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-black text-[#070528]">Plats par catégorie</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {selectedCategory ? selectedCategory.name : "Sélectionnez une catégorie"}
                </p>
              </div>
              {categories.length > 0 && (
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="h-12 border border-slate-200 bg-white px-4 text-sm font-black outline-none transition-all focus:border-[#f04438] focus:ring-4 focus:ring-[#fee4e2] md:min-w-[240px]"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="p-5">
            {loadingDishes ? (
              <div className="py-12 text-center text-sm font-semibold text-slate-500">Mise à jour de la liste...</div>
            ) : dishes.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {dishes.map((dish) => (
                  <DishCard
                    key={dish.id}
                    dish={dish}
                    onDishUpdated={handleDishUpdated}
                    onDishDeleted={handleDishDeleted}
                    canDelete={role !== "CUISINE"}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="UtensilsCrossed"
                title="Aucun plat dans cette catégorie"
                text="Ajoutez les plats depuis le menu Plats vendables ou sélectionnez une autre catégorie."
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ icon = "UtensilsCrossed", title, text }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
        <DashboardIcon name={icon} size={23} />
      </div>
      <p className="mt-4 text-lg font-black text-[#070528]">{title}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}
