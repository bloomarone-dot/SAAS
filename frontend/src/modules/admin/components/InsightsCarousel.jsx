import { useEffect, useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function formatVariation(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

const TAB_LABELS = {
  today_vs_yesterday: "vs Hier",
  today_vs_last_week: "vs Semaine",
  today_vs_prev_month_week: "vs Mois",
  daily_goal: "Objectif",
  recent_trend: "Tendance",
};

function VariationPill({ value, tone }) {
  const formatted = formatVariation(value);
  if (!formatted) {
    return <span className="text-xs font-semibold text-slate-400">Pas de comparaison</span>;
  }
  const positive = tone === "positive";
  const negative = tone === "negative";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${
        positive ? "bg-emerald-100 text-emerald-800" : negative ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      <DashboardIcon name={positive ? "TrendingUp" : negative ? "TrendingDown" : "Activity"} size={14} />
      {formatted}
    </span>
  );
}

function ComparisonInsight({ card }) {
  const positive = card.tone === "positive";
  const negative = card.tone === "negative";
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-500">{card.subtitle}</p>
        <h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{card.title}</h2>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Chiffre d'affaires actuel</p>
          <p className="mt-1 text-3xl font-black text-slate-950 sm:text-4xl">{money(card.current_value)}</p>
        </div>
        <VariationPill value={card.variation_pct} tone={card.tone} />
        <div className="sm:text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Période de référence</p>
          <p className={`mt-1 text-xl font-black ${positive ? "text-emerald-700" : negative ? "text-red-600" : "text-slate-700"}`}>
            {money(card.comparison_value)}
          </p>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500">
        {positive && "Votre activité progresse par rapport à la référence."}
        {negative && "Votre activité est en dessous de la référence à cette heure."}
        {!positive && !negative && "Activité comparable à la période de référence."}
      </p>
    </div>
  );
}

function GoalInsight({ card }) {
  const progress = Math.min(100, Number(card.progress_pct || 0));
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-500">{card.subtitle}</p>
        <h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{card.title}</h2>
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">Réalisé</p>
          <p className="mt-1 text-3xl font-black text-slate-950">{money(card.current_value)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">Objectif estimé</p>
          <p className="mt-1 text-xl font-black text-slate-700">{money(card.goal_amount)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">Reste à faire</p>
          <p className="mt-1 text-xl font-black text-[var(--dashboard-primary)]">{money(card.remaining_amount)}</p>
        </div>
      </div>
      <div>
        <div className="mb-2 flex justify-between text-xs font-black text-slate-600">
          <span>{progress.toLocaleString("fr-FR")} % de l'objectif</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              card.tone === "positive" ? "bg-emerald-600" : card.tone === "negative" ? "bg-red-500" : "bg-amber-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TrendInsight({ card }) {
  const max = Math.max(...(card.series ?? [0]), 1);
  const labels = ["J-4", "J-3", "J-2", "Hier", "Auj."];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-500">{card.subtitle}</p>
        <h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{card.title}</h2>
      </div>
      <p
        className={`text-lg font-black ${
          card.tone === "positive" ? "text-emerald-700" : card.tone === "negative" ? "text-red-600" : "text-slate-700"
        }`}
      >
        {card.message}
      </p>
      <div className="flex h-20 items-end gap-3">
        {(card.series ?? []).map((value, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-14 w-full items-end">
              <div
                className="w-full rounded-t-md bg-[var(--dashboard-primary)]"
                style={{ height: `${Math.max(6, (Number(value) / max) * 100)}%`, opacity: index === card.series.length - 1 ? 1 : 0.55 }}
              />
            </div>
            <span className="text-[10px] font-bold text-slate-400">{labels[index] ?? `J${index}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightContent({ card }) {
  if (card.key === "daily_goal") return <GoalInsight card={card} />;
  if (card.key === "recent_trend") return <TrendInsight card={card} />;
  return <ComparisonInsight card={card} />;
}

export function InsightsCarousel({ cards = [], loading = false, greeting, dateLabel, action }) {
  const [index, setIndex] = useState(0);
  const slides = cards.length ? cards : [];

  useEffect(() => {
    setIndex(0);
  }, [cards]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const active = slides[index] ?? slides[0];

  return (
    <header className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{greeting}</h1>
          {dateLabel && <p className="mt-1 text-sm font-medium text-slate-500">{dateLabel}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>

      {loading && !slides.length ? (
        <div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">Chargement du pilotage...</div>
      ) : !slides.length ? (
        <div className="px-5 py-8">
          <p className="text-sm font-medium text-slate-500">
            Les indicateurs comparatifs apparaîtront dès les premières ventes enregistrées.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-100 px-4 py-2.5 sm:px-5">
            {slides.map((card, slideIndex) => (
              <button
                key={card.key}
                type="button"
                onClick={() => setIndex(slideIndex)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                  slideIndex === index
                    ? "bg-slate-950 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {TAB_LABELS[card.key] || card.title}
              </button>
            ))}
            <div className="ml-auto hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)}
                className="lte-tool-btn"
                aria-label="Précédent"
              >
                <DashboardIcon name="ChevronDown" size={15} className="rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((current) => (current + 1) % slides.length)}
                className="lte-tool-btn"
                aria-label="Suivant"
              >
                <DashboardIcon name="ChevronDown" size={15} className="-rotate-90" />
              </button>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-5 sm:py-6">
            <InsightContent card={active} />
          </div>
        </>
      )}
    </header>
  );
}
