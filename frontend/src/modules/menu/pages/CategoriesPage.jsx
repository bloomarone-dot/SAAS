import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import CategoryForm from "../components/CategoryForm";
import DishCard from "../components/DishCard";
import DishForm from "../components/DishForm";
import { menuApi } from "../services/menuApi";

export default function CategoriesPage({ restaurantId, role }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [dishes, setDishes] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingDishes, setLoadingDishes] = useState(false);
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
    setCategories((prev) => [...prev, newCategory]);
    setSelectedCategoryId(newCategory.id);
  };

  const handleDishCreated = (newDish) => {
    if (newDish.category_id === selectedCategoryId) {
      setDishes((prev) => [...prev, newDish]);
    }
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
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Catégories menu</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            {role === "CUISINE"
              ? "Créez les catégories de repas, ajoutez les plats et gérez leur disponibilité depuis la cuisine."
              : "Structurez la carte par catégories et vérifiez les plats rattachés à chaque famille."}
          </p>
        </div>
        <button
          type="button"
          onClick={loadCategories}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition-all hover:border-[#f04438] hover:text-[#f04438]"
        >
          <DashboardIcon name="Activity" size={17} />
          Actualiser
        </button>
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

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <CategoryForm
            restaurantId={restaurantId}
            onCategoryCreated={handleCategoryCreated}
          />
          <DishForm
            categories={categories}
            onDishCreated={handleDishCreated}
          />
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
                title="Aucun plat dans cette catégorie"
                text="Ajoutez un plat depuis le formulaire ou sélectionnez une autre catégorie."
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
        <DashboardIcon name="UtensilsCrossed" size={23} />
      </div>
      <p className="mt-4 text-lg font-black text-[#070528]">{title}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}
