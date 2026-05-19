import {
  DashboardHeader,
  DonutChart,
  KpiGrid,
  Legend,
  LineChart,
  Panel,
  SimpleRows,
} from "../DashboardPrimitives";

export function AdminDashboard({ overrides = {} }) {
  const kpis = [
    { label: "Chiffre d'affaires", value: overrides["Chiffre d'affaires"] ?? "0 FCFA", trend: "Données réelles", icon: "ShoppingCart", tone: "pink" },
    { label: "Commandes", value: overrides.Commandes ?? "0", trend: "Données réelles", icon: "ClipboardList", tone: "blue" },
    { label: "Restaurants", value: overrides.Restaurants ?? "0", trend: "Actifs", icon: "Package", tone: "green" },
    { label: "Utilisateurs", value: overrides.Utilisateurs ?? "0", trend: `${overrides["Utilisateurs actifs"] ?? "0"} actifs`, icon: "Users", tone: "purple" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de votre activité"
        right="17 Mai 2026"
      />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1.15fr]">
        <Panel title="Évolution du chiffre d'affaires" action="Cette semaine">
          <LineChart />
        </Panel>
        <Panel title="Répartition par restaurant">
          <div className="grid gap-5 md:grid-cols-[180px_1fr]">
            <DonutChart total="12,450,000" label="FCFA" segments={["#f04438", "#2f80ed", "#31b86f", "#ff9b21"]} />
            <Legend
              items={[
                ["Restaurant Central", "40%", "bg-[#f04438]"],
                ["Resto Akwa", "25%", "bg-[#2f80ed]"],
                ["Resto Bastos", "20%", "bg-[#31b86f]"],
                ["Resto Douala", "15%", "bg-[#ff9b21]"],
              ]}
            />
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1.15fr]">
        <Panel title="Restaurants les plus performants" link="Voir tout">
          <SimpleRows
            rows={[
              ["Restaurant Central", "6,250,000 FCFA", "20.6%"],
              ["Resto Akwa", "3,100,000 FCFA", "15.2%"],
              ["Resto Bastos", "2,450,000 FCFA", "11.8%"],
            ]}
          />
        </Panel>
        <Panel title="Activités récentes">
          <SimpleRows
            rows={[
              ["Nouvel utilisateur ajouté", "Jean Dupont", "10:25"],
              ["Commande importante", "#CMD-00125", "09:40"],
              ["Stock faible détecté", "Mayonnaise", "Hier"],
            ]}
          />
        </Panel>
      </div>
    </section>
  );
}
