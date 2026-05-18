import {
  DashboardHeader,
  DonutChart,
  KpiGrid,
  Legend,
  OrdersTable,
  Panel,
} from "../DashboardPrimitives";

export function ServerDashboard({ overrides = {} }) {
  const kpis = [
    { label: "Commandes prises", value: overrides.Commandes ?? "24", trend: "5 vs hier", icon: "ShoppingCart", tone: "pink" },
    { label: "Chiffre d'affaires", value: "485,000 FCFA", trend: "12.6% vs hier", icon: "BarChart3", tone: "green" },
    { label: "Pourboires", value: "45,000 FCFA", trend: "8.3% vs hier", icon: "Wallet", tone: "purple" },
    { label: "Tables servies", value: "12", trend: "3 vs hier", icon: "Table2", tone: "orange" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader title="Tableau de bord" subtitle="Bienvenue, Marie. Prêt(e) à servir vos clients." right="Aujourd'hui" />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Mes commandes récentes" link="Voir tout">
          <OrdersTable />
        </Panel>
        <Panel title="Commandes par statut" action="Cette semaine">
          <div className="grid gap-6 md:grid-cols-[180px_1fr]">
            <DonutChart total="128" label="Commandes" segments={["#2f80ed", "#31b86f", "#7c3aed"]} />
            <Legend
              items={[
                ["En cours", "45 (35.2%)", "bg-[#2f80ed]"],
                ["Servies", "60 (46.9%)", "bg-[#31b86f]"],
                ["Payées", "23 (18.0%)", "bg-[#7c3aed]"],
              ]}
            />
          </div>
        </Panel>
      </div>
      <div className="rounded-lg border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-500">
        N'oubliez pas de vérifier les commandes en cours et de maintenir à jour les statuts.
      </div>
    </section>
  );
}
