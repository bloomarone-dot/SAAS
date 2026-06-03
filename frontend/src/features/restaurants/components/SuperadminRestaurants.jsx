import { useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { RestaurantProvisionForm } from "./RestaurantProvisionForm";
import { RestaurantTable } from "./RestaurantTable";

export function SuperadminRestaurants({
  restaurants,
  form,
  onChange,
  onSubmit,
  isLoading,
  showForm,
  onToggleForm,
  onViewRestaurant,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filteredRestaurants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return restaurants.filter((restaurant) => {
      const matchesQuery =
        !normalizedQuery ||
        restaurant.name.toLowerCase().includes(normalizedQuery) ||
        restaurant.slug.toLowerCase().includes(normalizedQuery) ||
        restaurant.currency.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        status === "all" ||
        (status === "active" && restaurant.is_active) ||
        (status === "inactive" && !restaurant.is_active);

      return matchesQuery && matchesStatus;
    });
  }, [restaurants, query, status]);

  const activeCount = restaurants.filter((restaurant) => restaurant.is_active).length;
  const branchCount = restaurants.reduce(
    (total, restaurant) => total + Number(restaurant.branches_count || 1),
    0
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-normal text-[#f04438]">
            Super administration
          </p>
          <h1 className="text-3xl font-black text-[#07133d] md:text-4xl">
            Restaurants
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#64708b]">
            Créez les restaurants, leurs propriétaires et suivez uniquement les tenants de la plateforme.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleForm}
          className={`flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-black transition-all ${
            showForm
              ? "border border-slate-200 bg-white text-[#07133d] hover:border-[#f04438] hover:text-[#f04438]"
              : "bg-[#f04438] text-white shadow-[0_12px_30px_rgba(240,68,56,0.18)] hover:bg-[#d92d20]"
          }`}
        >
          <DashboardIcon name={showForm ? "FileText" : "Plus"} size={17} />
          {showForm ? "Fermer" : "Ajouter un restaurant"}
        </button>
      </div>

      {!showForm && (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.04)] xl:grid-cols-[1fr_auto_auto]">
          <label className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4">
            <DashboardIcon name="Search" size={18} className="text-[#667085]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom, slug ou devise..."
              className="w-full bg-transparent text-sm font-semibold text-[#172033] outline-none placeholder:text-[#98a2b3]"
            />
          </label>

          <label className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4">
            <DashboardIcon name="SlidersHorizontal" size={18} className="text-[#f04438]" />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="bg-transparent text-sm font-black text-[#172033] outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </select>
          </label>

          <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-slate-200 text-center text-xs font-black">
            <div className="px-4 py-2">
              <p className="text-[#98a2b3]">Restaurants</p>
              <p className="mt-1 text-base text-[#07133d]">{restaurants.length}</p>
            </div>
            <div className="border-l border-slate-200 px-4 py-2">
              <p className="text-[#98a2b3]">Branches</p>
              <p className="mt-1 text-base text-[#f04438]">{branchCount}</p>
            </div>
            <div className="border-l border-slate-200 px-4 py-2">
              <p className="text-[#98a2b3]">Actifs</p>
              <p className="mt-1 text-base text-emerald-600">{activeCount}</p>
            </div>
            <div className="border-l border-slate-200 px-4 py-2">
              <p className="text-[#98a2b3]">Filtrés</p>
              <p className="mt-1 text-base text-[#07133d]">{filteredRestaurants.length}</p>
            </div>
          </div>
        </div>
      )}

      {showForm ? (
        <RestaurantProvisionForm
          value={form}
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={isLoading}
        />
      ) : (
        <RestaurantTable
          restaurants={filteredRestaurants}
          hasRestaurants={restaurants.length > 0}
          hasFilters={query.trim() !== "" || status !== "all"}
          onAdd={onToggleForm}
          onView={onViewRestaurant}
          onClearFilters={() => {
            setQuery("");
            setStatus("all");
          }}
        />
      )}
    </section>
  );
}
