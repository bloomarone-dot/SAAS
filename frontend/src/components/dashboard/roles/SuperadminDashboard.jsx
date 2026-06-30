import { DashboardIcon } from "@/components/dashboard/icons";
import { DashboardSection, PageContainer, PageHeader, StatCard } from "@/modules/admin/components/AdminUi";

export function SuperadminDashboard({ overrides = {}, onNavigate }) {
  const restaurants = overrides.__restaurants ?? [];
  const kpis = [
    { label: "Restaurants créés", value: overrides.Restaurants ?? "0", trend: "Tenants plateforme", icon: "Store", tone: "info" },
    { label: "Branches", value: overrides.Branches ?? "0", trend: "Points de vente", icon: "MapPin", tone: "default" },
    { label: "Restaurants actifs", value: overrides.Actifs ?? "0", trend: "En service", icon: "Activity", tone: "success" },
    { label: "Propriétaires", value: overrides.Utilisateurs ?? "0", trend: "Comptes propriétaires", icon: "Users", tone: "warning" },
  ];
  const displayedRestaurants = restaurants.length
    ? restaurants.slice(0, 5).map((restaurant) => ({
        name: restaurant.name,
        status: restaurant.is_active ? "Tenant actif" : "Désactivé",
        branches: `${Number(restaurant.branches_count || 0)} branche(s)`,
      }))
    : [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Superadmin"
        title="Tableau de bord"
        subtitle="Vue plateforme: restaurants, propriétaires, abonnements et santé globale."
        primaryAction={
          <button type="button" onClick={() => onNavigate?.("create-restaurant")} className="lte-btn lte-btn-primary">
            <DashboardIcon name="Plus" size={17} />
            Créer un restaurant
          </button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <StatCard key={kpi.label} {...kpi} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <DashboardSection
          title="Restaurants récemment créés"
          description="Derniers tenants provisionnés sur la plateforme."
          action={<button type="button" onClick={() => onNavigate?.("restaurants")} className="text-xs font-bold text-[var(--dashboard-primary)]">Voir tout</button>}
        >
          {displayedRestaurants.length ? (
            <div className="divide-y divide-slate-100">
              {displayedRestaurants.map((restaurant) => (
                <div key={`${restaurant.name}-${restaurant.branches}`} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <span className="font-bold text-slate-800">{restaurant.name}</span>
                  <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-black ${restaurant.status === "Tenant actif" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {restaurant.status}
                  </span>
                  <span className="font-semibold text-slate-500">{restaurant.branches}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
              Aucun restaurant créé pour le moment.
            </div>
          )}
        </DashboardSection>
        <DashboardSection title="Santé de la plateforme" description="Suivi rapide des services critiques.">
          <div className="space-y-4">
            {[
              ["API", "Opérationnelle", "bg-emerald-500"],
              ["Base de données", "Synchronisée", "bg-emerald-500"],
              ["Paiements", "Non configuré", "bg-amber-400"],
            ].map(([label, value, dot]) => (
              <div key={label} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-3 text-sm font-black text-[#07133d]">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  {label}
                </span>
                <span className="text-sm font-bold text-[#64708b]">{value}</span>
              </div>
            ))}
          </div>
        </DashboardSection>
      </div>
      <DashboardSection title="Actions superadmin" description="Accès rapides aux tâches de pilotage plateforme.">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Créer un restaurant", "Provisionner un tenant et son propriétaire", "Store", "create-restaurant"],
            ["Gérer les propriétaires", "Contrôler les comptes administrateurs", "Users", "owners"],
            ["Paramètres plateforme", "Configurer les règles globales", "Settings", "settings"],
          ].map(([title, text, icon, view]) => (
            <button key={title} type="button" onClick={() => onNavigate?.(view)} className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-[var(--dashboard-primary)] hover:bg-slate-50">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                <DashboardIcon name={icon} size={18} />
              </span>
              <p className="font-black text-[#07133d]">{title}</p>
              <p className="mt-2 text-sm font-medium leading-6 text-[#64708b]">{text}</p>
            </button>
          ))}
        </div>
      </DashboardSection>
    </PageContainer>
  );
}
