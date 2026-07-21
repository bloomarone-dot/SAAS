import { useMemo, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { FilterBar, PageContainer, PageHeader, StatCard } from "@/modules/admin/components/AdminUi";
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
  logoFile = null,
  logoPreviewUrl = "",
  onLogoFileChange,
  logoError = "",
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
        (restaurant.subdomain || "").toLowerCase().includes(normalizedQuery) ||
        (restaurant.custom_domain || "").toLowerCase().includes(normalizedQuery) ||
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
    <PageContainer>
      <PageHeader
        eyebrow="Plateforme"
        title={showForm ? "Créer un restaurant" : "Restaurants"}
        subtitle={showForm ? "Provisionnez un tenant, sa branche initiale et son propriétaire." : "Pilotez les tenants disponibles sur la plateforme."}
        primaryAction={
          <button
            type="button"
            onClick={onToggleForm}
            className={showForm ? "lte-btn lte-btn-default" : "lte-btn lte-btn-primary"}
          >
            <DashboardIcon name={showForm ? "FileText" : "Plus"} size={17} />
            {showForm ? "Retour à la liste" : "Ajouter un restaurant"}
          </button>
        }
      />

      {!showForm && (
        <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Restaurants" value={restaurants.length} icon="Store" tone="info" />
          <StatCard label="Branches" value={branchCount} icon="MapPin" tone="default" />
          <StatCard label="Actifs" value={activeCount} icon="Activity" tone="success" />
          <StatCard label="Filtrés" value={filteredRestaurants.length} icon="Filter" tone="warning" />
        </div>
        <FilterBar>
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
        </FilterBar>
        </>
      )}

      {showForm ? (
        <RestaurantProvisionForm
          value={form}
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={isLoading}
          logoFile={logoFile}
          logoPreviewUrl={logoPreviewUrl}
          onLogoFileChange={onLogoFileChange}
          logoError={logoError}
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
    </PageContainer>
  );
}
