import { DashboardHeader, KpiGrid, Panel, SimpleRows } from "../DashboardPrimitives";

export function SuperadminDashboard({ overrides = {} }) {
  const restaurants = overrides.__restaurants ?? [];
  const kpis = [
    { label: "Restaurants créés", value: overrides.Restaurants ?? "0", trend: "Tenants plateforme", icon: "Store", tone: "pink" },
    { label: "Branches", value: overrides.Branches ?? "0", trend: "Points de vente", icon: "MapPin", tone: "blue" },
    { label: "Restaurants actifs", value: overrides.Actifs ?? "0", trend: "En service", icon: "Activity", tone: "green" },
    { label: "Propriétaires", value: overrides.Utilisateurs ?? "0", trend: "Comptes owners", icon: "Users", tone: "purple" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader
        title="Tableau de bord"
        subtitle="Vue plateforme: restaurants, propriétaires, abonnements et santé globale."
      />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Restaurants récemment créés" link="Voir tout">
          <SimpleRows
            rows={restaurants.length ? restaurants.slice(0, 5).map((restaurant) => [
              restaurant.name,
              restaurant.is_active ? "Tenant actif" : "Désactivé",
              `${Number(restaurant.branches_count || 0)} branche(s)`,
            ]) : [["Aucun restaurant", "-", "Créer un tenant"]]}
          />
        </Panel>
        <Panel title="Santé de la plateforme">
          <div className="space-y-4">
            {[
              ["API", "Opérationnelle", "bg-emerald-500"],
              ["Base de données", "Synchronisée", "bg-emerald-500"],
              ["Paiements", "Non configuré", "bg-amber-400"],
            ].map(([label, value, dot]) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-[#ffead5] px-4 py-3">
                <span className="flex items-center gap-3 text-sm font-black text-[#07133d]">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  {label}
                </span>
                <span className="text-sm font-bold text-[#64708b]">{value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Actions superadmin">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Créer un restaurant", "Provisionner un tenant et son propriétaire"],
            ["Gérer les owners", "Contrôler les comptes administrateurs"],
            ["Paramètres plateforme", "Configurer les règles globales"],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-[#ffead5] bg-white p-5">
              <p className="font-black text-[#07133d]">{title}</p>
              <p className="mt-2 text-sm font-medium leading-6 text-[#64708b]">{text}</p>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
