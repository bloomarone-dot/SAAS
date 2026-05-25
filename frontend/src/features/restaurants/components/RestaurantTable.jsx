import { useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { nextSort, SortButton, sortRows } from "@/utils/sort";

export function RestaurantTable({
  restaurants,
  hasRestaurants = restaurants.length > 0,
  hasFilters = false,
  onAdd,
  onClearFilters,
}) {
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const sortedRestaurants = useMemo(
    () =>
      sortRows(restaurants, sort, {
        name: (restaurant) => restaurant.name,
        slug: (restaurant) => restaurant.slug,
        branches: (restaurant) => Number(restaurant.branches_count || 1),
        currency: (restaurant) => restaurant.currency,
        status: (restaurant) => Number(restaurant.is_active),
        created_at: (restaurant) => restaurant.created_at,
      }),
    [restaurants, sort]
  );

  if (!restaurants.length) {
    return (
      <div className="overflow-hidden border border-[#eadfd7] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <div className="border-b border-[#eadfd7] bg-[#fffaf5] px-6 py-4">
          <div className="grid grid-cols-6 gap-4 text-xs font-black uppercase text-[#9a3412]">
            <span>Restaurant</span>
            <span>Slug</span>
            <span>Branches</span>
            <span>Propriétaire</span>
            <span>Statut</span>
            <span>Création</span>
          </div>
        </div>

        <div className="grid min-h-[260px] place-items-center px-6 py-10">
          <div className="max-w-xl border border-[#eadfd7] bg-white p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-[#fed7aa] bg-[#fff4ed] text-[#f04438]">
              <DashboardIcon name={hasFilters ? "Search" : "Store"} size={24} />
            </div>
            <h2 className="text-xl font-black text-[#07133d]">
              {hasFilters ? "Aucun résultat trouvé" : "Aucun restaurant créé"}
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#64708b]">
              {hasFilters
                ? "Modifiez votre recherche ou réinitialisez les filtres pour afficher plus de résultats."
                : "Commencez par créer un restaurant et son compte administrateur propriétaire."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {hasFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="h-10 border border-[#eadfd7] bg-white px-4 text-sm font-black text-[#172033] transition-all hover:bg-[#fffaf5]"
                >
                  Réinitialiser les filtres
                </button>
              )}
              {!hasRestaurants && (
                <button
                  type="button"
                  onClick={onAdd}
                  className="h-10 bg-[#f04438] px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(240,68,56,0.18)] transition-all hover:bg-[#d92d20]"
                >
                  Ajouter un restaurant
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between border-b border-[#eadfd7] px-6 py-4">
        <div>
          <h2 className="text-lg font-black text-[#07133d]">Restaurants créés</h2>
          <p className="mt-1 text-xs font-semibold text-[#64708b]">
            Liste des tenants disponibles sur la plateforme.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="h-10 rounded-lg bg-[#f04438] px-4 text-sm font-black text-white transition-all hover:bg-[#d92d20]"
        >
          Ajouter
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-6 py-4"><SortButton label="Nom" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
              <th className="px-6 py-4"><SortButton label="Slug" column="slug" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
              <th className="px-6 py-4"><SortButton label="Branches" column="branches" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
              <th className="px-6 py-4"><SortButton label="Devise" column="currency" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
              <th className="px-6 py-4"><SortButton label="Statut" column="status" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
              <th className="px-6 py-4"><SortButton label="Création" column="created_at" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRestaurants.map((restaurant) => (
              <tr key={restaurant.id} className="text-[#64708b] hover:bg-slate-50">
                <td className="px-6 py-4 font-black text-[#07133d]">{restaurant.name}</td>
                <td className="px-6 py-4">{restaurant.slug}</td>
                <td className="px-6 py-4">
                  <span className="rounded-lg bg-[#f04438]/10 px-3 py-1 text-xs font-black text-[#f04438]">
                    {Number(restaurant.branches_count || 1)}
                  </span>
                </td>
                <td className="px-6 py-4">{restaurant.currency}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 text-xs font-black ${
                      restaurant.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {restaurant.is_active ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {new Date(restaurant.created_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="border border-[#eadfd7] px-3 py-1.5 text-xs font-black text-[#172033] hover:border-[#f04438] hover:text-[#f04438]">
                    Voir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
