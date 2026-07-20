import { ACCOUNTING_MODULE_GROUPS } from "../shared/moduleCatalog";
import { money } from "../shared/format";

function KpiCard({ label, value, hint, tone = "white" }) {
  const tones = {
    white: "border-slate-200 bg-white text-slate-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    danger: "border-rose-200 bg-rose-50 text-rose-950",
  };
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${tones[tone] || tones.white}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black tabular-nums leading-none">{value}</p>
      {hint && <p className="mt-2 text-xs font-semibold text-slate-500">{hint}</p>}
    </div>
  );
}

function ModuleButton({ module, onNavigate }) {
  const Icon = module.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(module.key)}
      className="group flex h-full min-h-[132px] flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${module.tone}`}>
        <Icon size={20} />
      </span>
      <span className="mt-4 text-base font-black text-slate-950">{module.label}</span>
      <span className="mt-2 text-sm font-medium leading-5 text-slate-500">{module.description}</span>
      <span className="mt-auto pt-4 text-xs font-black uppercase tracking-wide text-[#078d50] opacity-0 transition group-hover:opacity-100">
        Ouvrir
      </span>
    </button>
  );
}

export function Dashboard({ summary, entryTotals, counts = {}, onNavigate }) {
  const netProfit = Number(summary?.net_profit || 0);

  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0b3d2e] p-6 text-white shadow-lg lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200/80">Comptabilité simple</p>
            <h2 className="mt-2 text-3xl font-black">L'argent de votre restaurant</h2>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-300">
              Pas besoin d'être comptable : enregistrez ce que vous payez dans « Sorties d'argent », consultez les ventes dans « Entrées d'argent », et vérifiez le solde dans « Ma caisse ».
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-xs font-bold text-slate-300">Sorties enregistrées</p>
              <p className="mt-1 text-xl font-black">{counts.expenses ?? 0}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-xs font-bold text-slate-300">Solde caisse</p>
              <p className="mt-1 text-xl font-black">{money(summary?.cash_balance)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-xs font-bold text-slate-300">Résultat</p>
              <p className="mt-1 text-xl font-black">{money(summary?.net_profit)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Entrées (ventes)" value={money(summary?.revenue)} hint="Argent rentré" tone="success" />
        <KpiCard label="Sorties (dépenses)" value={money(summary?.expenses)} hint="Argent payé" tone="danger" />
        <KpiCard label="Solde caisse" value={money(summary?.cash_balance)} hint="Disponible maintenant" />
        <KpiCard
          label="Gain ou perte"
          value={money(summary?.net_profit)}
          hint={netProfit >= 0 ? "Restaurant en positif" : "Plus de sorties que d'entrées"}
          tone={netProfit >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="space-y-8">
        {ACCOUNTING_MODULE_GROUPS.map((group) => (
          <section key={group.key} className="space-y-4">
            <div>
              <h3 className="text-lg font-black text-slate-950">{group.label}</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">{group.description}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.modules.map((module) => (
                <ModuleButton key={module.key} module={module} onNavigate={onNavigate} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
