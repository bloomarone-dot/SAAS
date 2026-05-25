import {
  DashboardHeader,
  DonutChart,
  KpiGrid,
  Legend,
  Panel,
  SimpleRows,
} from "../DashboardPrimitives";

export function ManagerDashboard({ overrides = {} }) {
  const kpis = [
    { label: "Commandes du jour", value: overrides.Commandes ?? "186", trend: "Objectif 240", icon: "ClipboardList", tone: "pink" },
    { label: "Tables occupées", value: "21", trend: "74% capacité", icon: "Table2", tone: "blue" },
    { label: "Équipe active", value: "16", trend: "4 services", icon: "Users", tone: "green" },
    { label: "Satisfaction", value: "92%", trend: "Avis clients", icon: "TrendingUp", tone: "purple" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader
        title="Tableau de bord"
        subtitle="Vue opérationnelle du restaurant, des équipes et du service."
      />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Priorités opérationnelles" link="Voir tout">
          <SimpleRows
            rows={[
              ["Renforcer le service terrasse", "2 serveurs", "Urgent"],
              ["Préparer le rush déjeuner", "12:00", "Planifié"],
              ["Contrôler les ruptures", "5 articles", "Stock"],
              ["Valider la clôture caisse", "18:00", "Finance"],
            ]}
          />
        </Panel>
        <Panel title="Répartition des activités" action="Ce jour">
          <div className="grid gap-6 md:grid-cols-[180px_1fr]">
            <DonutChart total="186" label="Actions" segments={["#f04438", "#2f80ed", "#31b86f", "#ff9b21"]} />
            <Legend
              items={[
                ["Service", "45%", "bg-[#f04438]"],
                ["Cuisine", "28%", "bg-[#2f80ed]"],
                ["Stock", "17%", "bg-[#31b86f]"],
                ["Caisse", "10%", "bg-[#ff9b21]"],
              ]}
            />
          </div>
        </Panel>
      </div>
      <Panel title="Suivi d'équipe">
        <SimpleRows
          rows={[
            ["Marie Claire", "Service", "Présente"],
            ["Paul Chef", "Cuisine", "Présent"],
            ["Jean Dupont", "Stock", "Présent"],
          ]}
        />
      </Panel>
    </section>
  );
}
