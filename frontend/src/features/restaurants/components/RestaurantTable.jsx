import { useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { DashboardSection } from "@/modules/admin/components/AdminUi";
import { nextSort, SortButton, sortRows } from "@/utils/sort";

export function RestaurantTable({
  restaurants,
  hasRestaurants = restaurants.length > 0,
  hasFilters = false,
  onAdd,
  onView,
  onClearFilters,
}) {
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const sortedRestaurants = useMemo(
    () =>
      sortRows(restaurants, sort, {
        name: (restaurant) => restaurant.name,
        slug: (restaurant) => restaurant.slug,
        subdomain: (restaurant) => restaurant.subdomain || restaurant.slug,
        branches: (restaurant) => Number(restaurant.branches_count || 1),
        currency: (restaurant) => restaurant.currency,
        status: (restaurant) => Number(restaurant.is_active),
        created_at: (restaurant) => restaurant.created_at,
      }),
    [restaurants, sort]
  );

  if (!restaurants.length) {
    return (
      <DashboardSection title="Restaurants créés" description="Liste des tenants disponibles sur la plateforme.">
        <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10">
          <div className="max-w-xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-[#fed7aa] bg-[#fff4ed] text-[#f04438]">
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
                  className="lte-btn lte-btn-default"
                >
                  Réinitialiser les filtres
                </button>
              )}
              {!hasRestaurants && (
                <button
                  type="button"
                  onClick={onAdd}
                  className="lte-btn lte-btn-primary"
                >
                  Ajouter un restaurant
                </button>
              )}
            </div>
          </div>
        </div>
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      title="Restaurants créés"
      description="Liste des tenants disponibles sur la plateforme."
      action={
        <button
          type="button"
          onClick={onAdd}
          className="lte-btn lte-btn-primary lte-btn-sm"
        >
          Ajouter
        </button>
      }
    >

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-6 py-4"><SortButton label="Nom" column="name" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
              <th className="px-6 py-4"><SortButton label="Adresse publique" column="subdomain" sort={sort} onSort={(key) => setSort((current) => nextSort(current, key))} /></th>
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
                <td className="px-6 py-4">
                  <div className="font-bold text-[#07133d]">{restaurant.subdomain || restaurant.slug}.bloomarone.com</div>
                  <div className="text-xs font-semibold text-slate-400">slug: {restaurant.slug}</div>
                </td>
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
                  <button
                    type="button"
                    onClick={() => onView?.(restaurant)}
                    className="lte-btn lte-btn-default lte-btn-sm"
                  >
                    Voir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardSection>
  );
}
