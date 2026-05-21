import { useEffect, useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import DishForm from "../components/DishForm";
import { menuApi } from "../services/menuApi";

export default function DishesPage({ restaurantId, role }) {
  const [categories, setCategories] = useState([]);
  const [allDishes, setAllDishes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDishForm, setShowDishForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const stats = useMemo(
    () => [
      { label: "Plats", value: allDishes.length, icon: "UtensilsCrossed" },
      { label: "Catégories", value: categories.length, icon: "ClipboardList" },
      { label: "Disponibles", value: allDishes.filter((dish) => dish.is_available).length, icon: "CheckCircle2" },
      { label: "Indisponibles", value: allDishes.filter((dish) => !dish.is_available).length, icon: "Power" },
    ],
    [allDishes, categories.length]
  );

  useEffect(() => {
    loadAllMenuData();
  }, [restaurantId]);

  async function loadAllMenuData() {
    setLoading(true);
    setError("");
    try {
      const fetchedCategories = await menuApi.getCategories(restaurantId);
      setCategories(fetchedCategories);

      const dishPromises = fetchedCategories.map((cat) =>
        menuApi.getDishesByCategory(cat.id)
      );
      const results = await Promise.all(dishPromises);
      setAllDishes(results.flat());
    } catch (err) {
      setError("Erreur lors du chargement global des plats.");
    } finally {
      setLoading(false);
    }
  }

  const handleDishUpdated = (updatedDish) => {
    setAllDishes((prev) =>
      prev.map((d) => (d.id === updatedDish.id ? updatedDish : d))
    );
  };

  const handleDishDeleted = (dishId) => {
    setAllDishes((prev) => prev.filter((d) => d.id !== dishId));
  };

  const handleDishCreated = (newDish) => {
    setAllDishes((prev) => [newDish, ...prev]);
    setShowDishForm(false);
  };

  const filteredDishes = allDishes.filter((dish) =>
    dish.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dish.description ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (categoryNameById.get(dish.category_id) ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="p-6 text-sm font-semibold text-slate-500">Chargement global du menu...</div>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-[#f04438]">
            {role === "CUISINE" ? "Cuisine" : "Administration restaurant"}
          </p>
          <h1 className="mt-2 text-4xl font-black text-[#070528]">Plats menu</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            {role === "CUISINE"
              ? "Consultez les plats et basculez leur disponibilité selon les ruptures ou reprises en cuisine."
              : "Consultez rapidement tous les plats, leur catégorie et leur disponibilité à la vente."}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setShowDishForm((value) => !value)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#f04438] px-5 text-sm font-black text-white shadow-lg shadow-[#fecdca] transition-all hover:bg-[#d92d20]"
          >
            <DashboardIcon name="Plus" size={17} />
            Ajouter un plat
          </button>
          <button
            type="button"
            onClick={loadAllMenuData}
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      {showDishForm && (
        <DishForm categories={categories} onDishCreated={handleDishCreated} />
      )}

      <div className="border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex h-12 items-center gap-3 border border-slate-200 bg-white px-4">
            <DashboardIcon name="Search" size={17} className="text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un plat, une description ou une catégorie..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
          />
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredDishes.length > 0 ? (
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead className="bg-[#fff8f3] text-xs font-black uppercase text-[#b42318]">
                <tr>
                  <th className="px-5 py-4">Plat</th>
                  <th className="px-5 py-4">Catégorie</th>
                  <th className="px-5 py-4">Prix</th>
                  <th className="px-5 py-4">Statut</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDishes.map((dish) => (
                  <tr key={dish.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {dish.image_url ? (
                          <img src={dish.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#fff4ed] text-[#f04438]">
                            <DashboardIcon name="UtensilsCrossed" size={18} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-black text-[#070528]">{dish.name}</p>
                          <p className="max-w-sm truncate text-xs font-semibold text-slate-500">
                            {dish.description || "Sans description"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-700">
                      {categoryNameById.get(dish.category_id) ?? "Sans catégorie"}
                    </td>
                    <td className="px-5 py-4 text-sm font-black text-[#070528]">
                      {Number(dish.price || 0).toLocaleString("fr-FR")} FCFA
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded px-3 py-1 text-xs font-black ${
                        dish.is_available ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                      }`}>
                        {dish.is_available ? "Disponible" : "Indisponible"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => menuApi.toggleDishAvailability(dish.id).then(handleDishUpdated)}
                          className="border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:border-[#f04438] hover:text-[#f04438]"
                        >
                          {dish.is_available ? "Retirer" : "Activer"}
                        </button>
                        {role !== "CUISINE" && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Voulez-vous vraiment supprimer "${dish.name}" ?`)) return;
                              menuApi.softDeleteDish(dish.id).then(() => handleDishDeleted(dish.id));
                            }}
                            className="border border-red-100 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title={searchTerm ? "Aucun plat trouvé" : "Aucun plat disponible"}
              text={searchTerm ? "Ajustez la recherche pour élargir les résultats." : "Créez des catégories et ajoutez vos premiers plats."}
            />
          )}
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
