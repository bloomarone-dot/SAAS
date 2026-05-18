import {
  DashboardHeader,
  DonutChart,
  KitchenTable,
  KpiGrid,
  Legend,
  Panel,
} from "../DashboardPrimitives";

export function CuisineDashboard({ overrides = {} }) {
  const kpis = [
    { label: "Commandes à préparer", value: overrides["À préparer"] ?? "18", trend: "En attente", icon: "ClipboardList", tone: "pink" },
    { label: "En préparation", value: "12", trend: "En cours", icon: "Clock3", tone: "orange" },
    { label: "Prêtes à servir", value: "8", trend: "Prêtes", icon: "Package", tone: "green" },
    { label: "Commandes servies", value: "45", trend: "Aujourd'hui", icon: "Table2", tone: "blue" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader title="Tableau de bord" subtitle="Bienvenue Chef. Préparez des plats délicieux." right="Aujourd'hui" />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Commandes en attente" link="Voir tout">
          <KitchenTable />
        </Panel>
        <Panel title="Répartition par catégorie" action="Aujourd'hui">
          <div className="grid gap-6 md:grid-cols-[180px_1fr]">
            <DonutChart total="45" label="Commandes" segments={["#31b86f", "#2f80ed", "#ff9b21"]} />
            <Legend
              items={[
                ["Plats", "55.6%", "bg-[#31b86f]"],
                ["Boissons", "24.4%", "bg-[#2f80ed]"],
                ["Accompagnements", "20.0%", "bg-[#ff9b21]"],
              ]}
            />
          </div>
        </Panel>
      </div>
      <Panel title="Articles populaires aujourd'hui">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Burger Classic", "18 commandes"],
            ["Poulet DG", "15 commandes"],
            ["Pizza Reine", "12 commandes"],
            ["Jus Naturel", "10 commandes"],
          ].map(([name, count]) => (
            <div key={name} className="rounded-lg bg-gradient-to-r from-amber-50 to-indigo-50 p-4">
              <div className="mb-3 h-12 w-12 rounded-full bg-white shadow-sm" />
              <p className="text-sm font-black text-slate-900">{name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{count}</p>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
