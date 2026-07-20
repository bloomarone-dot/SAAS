import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { PeriodFilterBar, periodToApiDates } from "@/components/shared/PeriodFilterBar";
import { apiFetch } from "@/config/http";
import { money } from "../shared/format";

function variationLabel(value) {
  if (typeof value !== "number") return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function VariationBadge({ value }) {
  if (typeof value !== "number") {
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400"><Minus size={14} /> N/A</span>;
  }
  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  const tone = positive ? "text-red-600" : negative ? "text-emerald-600" : "text-slate-500";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-black ${tone}`}>
      <Icon size={14} />
      {variationLabel(value)} vs période préc.
    </span>
  );
}

function StatCard({ label, value, variation, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="mt-2 block text-xl font-black tabular-nums text-slate-950">{value}</strong>
      {variation !== undefined && <div className="mt-2"><VariationBadge value={variation} /></div>}
      {hint && <p className="mt-2 text-xs font-medium text-slate-500">{hint}</p>}
    </div>
  );
}

export function ExpenseAnalytics({ onMessage, embedded = false }) {
  const [period, setPeriod] = useState("month");
  const [customPeriod, setCustomPeriod] = useState({ start: "", end: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const dates = periodToApiDates(period, customPeriod);
        const params = new URLSearchParams();
        if (period === "custom" && dates.start_date && dates.end_date) {
          params.set("start_date", dates.start_date);
          params.set("end_date", dates.end_date);
        } else if (period !== "all") {
          params.set("period", period);
        } else {
          params.set("period", "year");
        }
        const payload = await apiFetch(`/api/v1/finance/reports/spending-analytics?${params}`, {
          fallback: "Impossible de charger l'analyse des dépenses.",
        });
        if (mounted) setData(payload);
      } catch (error) {
        if (mounted) {
          setData(null);
          onMessage?.(error.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (period === "custom" && (!customPeriod.start || !customPeriod.end)) return undefined;
    load();
    return () => {
      mounted = false;
    };
  }, [customPeriod.end, customPeriod.start, onMessage, period]);

  const timeline = data?.timeline ?? [];
  const maxTimeline = useMemo(
    () => Math.max(...timeline.map((row) => Number(row.total || 0)), 1),
    [timeline],
  );

  const totals = data?.totals ?? {};

  const analyticsBody = (
    <>
      {loading && <p className="text-sm font-semibold text-slate-500">Chargement de l'analyse…</p>}
      {!loading && data && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total sorties"
              value={money(totals.all_spending)}
              variation={totals.all_spending_variation_pct}
              hint={`${data.current_period.label} · écart ${money(totals.difference_amount)}`}
            />
            <StatCard
              label="Dépenses restaurant"
              value={money(totals.restaurant_expenses)}
              variation={totals.restaurant_expenses_variation_pct}
            />
            <StatCard
              label="Achats stock"
              value={money(totals.stock_purchases)}
              variation={totals.stock_purchases_variation_pct}
            />
            <StatCard
              label="Période précédente"
              value={money(totals.previous_all_spending)}
              hint={data.previous_period.label}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-black text-slate-950">Répartition par source</h4>
              <div className="mt-4 space-y-3">
                {(data.by_source ?? []).map((row) => (
                  <div key={row.key} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{row.label}</p>
                        <p className="mt-1 text-xs text-slate-500">Avant : {money(row.previous)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-950">{money(row.current)}</p>
                        <VariationBadge value={row.variation_pct} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-black text-slate-950">Évolution dans la période</h4>
              <div className="mt-4 space-y-2">
                {timeline.map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-600">
                      <span>{row.label}</span>
                      <span>{money(row.total)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#078d50]"
                        style={{ width: `${Math.max(6, (Number(row.total || 0) / maxTimeline) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {!timeline.length && (
                  <p className="text-sm font-medium text-slate-500">Aucune sortie sur cette période.</p>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Catégorie / type</th>
                  <th className="px-4 py-3">Période actuelle</th>
                  <th className="px-4 py-3">Période précédente</th>
                  <th className="px-4 py-3">Évolution</th>
                  <th className="px-4 py-3">Part</th>
                </tr>
              </thead>
              <tbody>
                {(data.by_category ?? []).map((row) => (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-900">{row.label}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{money(row.current)}</td>
                    <td className="px-4 py-3 text-slate-500">{money(row.previous)}</td>
                    <td className="px-4 py-3"><VariationBadge value={row.variation_pct} /></td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{row.share_pct ?? 0}%</td>
                  </tr>
                ))}
                {!data.by_category?.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm font-medium text-slate-500">
                      Aucune dépense ni achat enregistré sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  const periodFilter = (
    <PeriodFilterBar
      period={period}
      onPeriodChange={setPeriod}
      customPeriod={customPeriod}
      onCustomPeriodChange={setCustomPeriod}
    />
  );

  if (embedded) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">Analyse des dépenses et achats</h3>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
              Comparez les sorties d'argent par période avec l'évolution par rapport à la période précédente.
            </p>
          </div>
          {periodFilter}
        </div>
        <div className="mt-5">{analyticsBody}</div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-end">
        {periodFilter}
      </div>
      {analyticsBody}
    </section>
  );
}
