import {
  BarChart,
  DashboardHeader,
  formatTodayDate,
  KpiGrid,
  LowStockRows,
  Panel,
  SimpleRows,
  SummaryCard,
} from "../DashboardPrimitives";

export function StockDashboard({ overrides = {} }) {
  const kpis = [
    { label: "Valeur du stock", value: "4,850,000 FCFA", trend: "12.0% vs mois dernier", icon: "Package", tone: "blue" },
    { label: "Produits en stock", value: overrides.Produits ?? "156", trend: "Références", icon: "Box", tone: "green" },
    { label: "Stock faible", value: "12", trend: "Articles", icon: "AlertTriangle", tone: "orange" },
    { label: "Dépenses (mois)", value: "2,450,000 FCFA", trend: "8.4% vs mois dernier", icon: "Wallet", tone: "purple" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader title="Tableau de bord" subtitle="Vue d'ensemble des stocks et finances" />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.3fr]">
        <Panel title="Produits en stock faible" link="Voir tout">
          <LowStockRows />
        </Panel>
        <Panel title="Dépenses vs Revenus" action="Ce mois">
          <BarChart />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.3fr]">
        <Panel title="Derniers mouvements de stock" link="Voir tout">
          <SimpleRows rows={[["Tomate", "-5 Kg", "Sortie"], ["Cuisine", formatTodayDate(), "10:20"]]} />
        </Panel>
        <Panel title="Résumé comptable (Ce mois)">
          <div className="grid gap-4 md:grid-cols-2">
            <SummaryCard label="Revenus" value="8,965,000 FCFA" trend="15.2%" tone="green" />
            <SummaryCard label="Dépenses" value="2,450,000 FCFA" trend="5.4%" tone="pink" />
          </div>
        </Panel>
      </div>
    </section>
  );
}
