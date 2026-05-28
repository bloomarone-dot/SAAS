import {
  DashboardHeader,
  DonutChart,
  KpiGrid,
  Legend,
  Panel,
  SimpleRows,
} from "../DashboardPrimitives";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

export function AdminDashboard({ overrides = {} }) {
  const summary = overrides.__summary;
  const branches = summary?.branches ?? [];
  const weeklyRevenue = summary?.weekly_revenue ?? [];
  const recentActivities = summary?.recent_activities ?? [];
  const topBranches = summary?.top_branches ?? [];
  const cashRegisters = summary?.cash_registers ?? [];
  const branchSegments = ["#f04438", "#2f80ed", "#31b86f", "#ff9b21"];

  const kpis = [
    { label: "Chiffre d'affaires", value: money(summary?.revenue), trend: "Données en temps réel", icon: "ShoppingCart", tone: "pink" },
    { label: "Bénéfice estimé", value: money(summary?.profit), trend: "Après coûts recettes", icon: "Wallet", tone: "green" },
    { label: "Commandes", value: Number(summary?.orders_count || 0).toLocaleString("fr-FR"), trend: "Commandes enregistrées", icon: "ClipboardList", tone: "blue" },
    { label: "Branches", value: Number(summary?.branches_count || 0).toLocaleString("fr-FR"), trend: "Points de vente actifs", icon: "Package", tone: "green" },
  ];

  return (
    <section className="space-y-4">
      <DashboardHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble dynamique de votre activité"
      />
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 md:grid-cols-2">
        {(cashRegisters.length ? cashRegisters : [
          { key: "REPAS", label: "Caisse repas", revenue: 0, profit: 0, orders_count: 0, share: 0 },
          { key: "BOISSON", label: "Caisse boisson", revenue: 0, profit: 0, orders_count: 0, share: 0 },
        ]).map((register) => (
          <Panel key={register.key} title={register.label} action={`${Number(register.share || 0).toFixed(1)}% du CA`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Chiffre d'affaires" value={money(register.revenue)} />
              <Metric label="Bénéfice estimé" value={money(register.profit)} />
              <Metric label="Commandes" value={Number(register.orders_count || 0).toLocaleString("fr-FR")} />
            </div>
          </Panel>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1.15fr]">
        <Panel title="Évolution du chiffre d'affaires" action="7 derniers jours">
          <RevenueTrend points={weeklyRevenue} />
        </Panel>
        <Panel title="Répartition par branche">
          <div className="grid gap-5 md:grid-cols-[180px_1fr]">
            <DonutChart
              total={Number(summary?.revenue || 0).toLocaleString("fr-FR")}
              label="FCFA"
              segments={branchSegments}
            />
            <Legend
              items={(branches.length ? branches : [{ name: "Aucune branche", share: 0, revenue: 0 }]).slice(0, 4).map((branch, index) => [
                branch.name,
                `${Number(branch.share || 0).toFixed(1)}% · ${money(branch.revenue)}`,
                segmentClass(index),
              ])}
            />
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1.15fr]">
        <Panel title="Branches les plus performantes" link="Voir tout">
          <SimpleRows
            rows={(topBranches.length ? topBranches : branches).slice(0, 3).map((branch) => [
              branch.city ? `${branch.name} · ${branch.city}` : branch.name,
              `${money(branch.revenue)} · bénéfice ${money(branch.profit)}`,
              `${Number(branch.orders_count || 0)} commandes`,
            ])}
          />
        </Panel>
        <Panel title="Activités récentes">
          <SimpleRows
            rows={(recentActivities.length ? recentActivities : [{ label: "Aucune activité récente", value: "-", time: "-" }]).map((activity) => [
              activity.label,
              activity.value,
              activity.time,
            ])}
          />
        </Panel>
      </div>
      <Panel title="Fonctionnement par branche">
        <BranchTable branches={branches} />
      </Panel>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function BranchTable({ branches }) {
  const rows = branches?.length ? branches : [];
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-slate-200 p-6 text-sm font-semibold text-slate-500">Aucune branche active.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-[#fff8f3] text-xs font-black uppercase text-[#b42318]">
          <tr>
            <th className="px-4 py-3">Branche</th>
            <th className="px-4 py-3">CA total</th>
            <th className="px-4 py-3">Repas</th>
            <th className="px-4 py-3">Boisson</th>
            <th className="px-4 py-3">Bénéfice estimé</th>
            <th className="px-4 py-3">Commandes</th>
            <th className="px-4 py-3">Équipe active</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((branch) => (
            <tr key={branch.id ?? branch.name}>
              <td className="px-4 py-3 font-black text-slate-900">{branch.city ? `${branch.name} · ${branch.city}` : branch.name}</td>
              <td className="px-4 py-3 font-black text-slate-800">{money(branch.revenue)}</td>
              <td className="px-4 py-3 font-semibold text-slate-600">{money(branch.meal_revenue)}</td>
              <td className="px-4 py-3 font-semibold text-slate-600">{money(branch.drink_revenue)}</td>
              <td className="px-4 py-3 font-black text-emerald-700">{money(branch.profit)}</td>
              <td className="px-4 py-3 font-semibold text-slate-600">{Number(branch.orders_count || 0).toLocaleString("fr-FR")}</td>
              <td className="px-4 py-3 font-semibold text-slate-600">{Number(branch.active_users_count || 0).toLocaleString("fr-FR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueTrend({ points }) {
  const rows = points?.length ? points : [
    { label: "Lun", revenue: 0, orders_count: 0 },
    { label: "Mar", revenue: 0, orders_count: 0 },
    { label: "Mer", revenue: 0, orders_count: 0 },
    { label: "Jeu", revenue: 0, orders_count: 0 },
    { label: "Ven", revenue: 0, orders_count: 0 },
    { label: "Sam", revenue: 0, orders_count: 0 },
    { label: "Dim", revenue: 0, orders_count: 0 },
  ];
  const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1);

  return (
    <div className="h-[240px]">
      <div className="flex h-[200px] items-end gap-3 border-b border-slate-100 px-2">
        {rows.map((row) => {
          const height = Math.max(8, (Number(row.revenue || 0) / maxRevenue) * 180);
          return (
            <div key={row.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-[180px] w-full items-end justify-center">
                <span
                  className="w-full max-w-[42px] rounded-t-lg bg-[#f04438]"
                  style={{ height }}
                  title={`${money(row.revenue)} · ${row.orders_count} commandes`}
                />
              </div>
              <span className="text-xs font-black text-slate-500">{row.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-xs font-bold text-slate-500">
        <span>Total 7 jours</span>
        <span>{money(rows.reduce((total, row) => total + Number(row.revenue || 0), 0))}</span>
      </div>
    </div>
  );
}

function segmentClass(index) {
  return ["bg-[#f04438]", "bg-[#2f80ed]", "bg-[#31b86f]", "bg-[#ff9b21]"][index] ?? "bg-slate-400";
}
