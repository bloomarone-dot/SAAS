import {
  DashboardHeader,
  DonutChart,
  KpiGrid,
  Legend,
  Panel,
  SimpleRows,
} from "../DashboardPrimitives";

export function CaisseDashboard({ overrides = {} }) {
  const kpis = [
    { label: "Encaissements", value: "2,450,000 FCFA", trend: "Aujourd'hui", icon: "Wallet", tone: "pink" },
    { label: "Tickets émis", value: "312", trend: "48 en attente", icon: "ReceiptText", tone: "blue" },
    { label: "Paiements carte", value: "1,120,000 FCFA", trend: "46%", icon: "BarChart3", tone: "green" },
    { label: "Clôture prévue", value: overrides.Clôture ?? "18:00", trend: "Caisse active", icon: "Clock3", tone: "orange" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader
        title="Tableau de bord"
        subtitle="Suivi des encaissements, tickets, paiements et clôture de caisse."
        right="Aujourd'hui"
      />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Derniers paiements" link="Voir tout">
          <SimpleRows
            rows={[
              ["#PAY-00421", "85,000 FCFA", "Carte"],
              ["#PAY-00420", "42,500 FCFA", "Cash"],
              ["#PAY-00419", "18,000 FCFA", "Mobile Money"],
              ["#PAY-00418", "61,000 FCFA", "Carte"],
            ]}
          />
        </Panel>
        <Panel title="Répartition des paiements" action="Ce jour">
          <div className="grid gap-6 md:grid-cols-[180px_1fr]">
            <DonutChart total="312" label="Tickets" segments={["#f04438", "#31b86f", "#2f80ed"]} />
            <Legend
              items={[
                ["Cash", "38%", "bg-[#f04438]"],
                ["Carte", "46%", "bg-[#31b86f]"],
                ["Mobile Money", "16%", "bg-[#2f80ed]"],
              ]}
            />
          </div>
        </Panel>
      </div>
      <div className="rounded-lg border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
        Vérifiez les paiements en attente avant la clôture de caisse.
      </div>
    </section>
  );
}
