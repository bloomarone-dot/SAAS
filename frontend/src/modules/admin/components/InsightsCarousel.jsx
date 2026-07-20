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
  today_vs_yesterday: "Par jour",
  today_vs_last_week: "Par semaine",
  today_vs_prev_month_week: "Par mois",
  daily_goal: "Objectif",
  recent_trend: "Tendance",
};

function VariationPill({ value, tone, dark = false }) {
  const formatted = formatVariation(value);
  if (!formatted) {
    return (
      <span className={`text-xs font-semibold ${dark ? "text-slate-400" : "text-slate-400"}`}>
        Pas de comparaison
      </span>
    );
  }
  const positive = tone === "positive";
  const negative = tone === "negative";
  if (dark) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${
          positive
            ? "bg-emerald-400/20 text-emerald-200"
            : negative
              ? "bg-red-400/20 text-red-200"
              : "bg-white/10 text-slate-200"
        }`}
      >
        <DashboardIcon name={positive ? "TrendingUp" : negative ? "TrendingDown" : "Activity"} size={14} />
        {formatted}
      </span>
    );
  }
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

function ComparisonInsight({ card, dark = false }) {
  const positive = card.tone === "positive";
  const negative = card.tone === "negative";
  const muted = dark ? "text-slate-300" : "text-slate-500";
  const title = dark ? "text-white" : "text-slate-900";
  const value = dark ? "text-white" : "text-slate-950";
  const refTone = dark
    ? positive
      ? "text-emerald-200"
      : negative
        ? "text-red-200"
        : "text-slate-200"
    : positive
      ? "text-emerald-700"
      : negative
        ? "text-red-600"
        : "text-slate-700";
  const currentLabel = card.current_period_label || "Période actuelle";
  const comparisonLabel = card.comparison_period_label || "Période de référence";

  return (
    <div className="space-y-4">
      <div>
        <p className={`text-sm font-semibold ${muted}`}>{card.subtitle}</p>
        <h2 className={`mt-1 text-xl font-black sm:text-2xl ${title}`}>{card.title}</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.2fr_auto_1fr] lg:items-end">
        <div className={dark ? "rounded-xl bg-white/10 px-4 py-3 backdrop-blur" : ""}>
          <p className={`text-xs font-bold uppercase tracking-wide ${dark ? "text-slate-300" : "text-slate-400"}`}>
            {currentLabel}
          </p>
          <p className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${value}`}>{money(card.current_value)}</p>
          <div className="mt-2">
            <VariationPill value={card.variation_pct} tone={card.tone} dark={dark} />
          </div>
        </div>
        <div className={`px-1 text-center text-xs font-black uppercase tracking-wide ${dark ? "text-slate-400" : "text-slate-400"}`}>
          vs
        </div>
        <div className={dark ? "rounded-xl bg-white/10 px-4 py-3 backdrop-blur" : ""}>
          <p className={`text-xs font-bold uppercase tracking-wide ${dark ? "text-slate-300" : "text-slate-400"}`}>
            Comparé à — {comparisonLabel}
          </p>
          <p className={`mt-1 text-xl font-black tabular-nums sm:text-2xl ${refTone}`}>
            {money(card.comparison_value)}
          </p>
        </div>
      </div>
      <p className={`text-sm font-medium ${muted}`}>
        {positive && "Votre activité progresse par rapport à la référence sur la même fenêtre horaire."}
        {negative && "Votre activité est en dessous de la référence sur la même fenêtre horaire."}
        {!positive && !negative && "Activité comparable à la période de référence."}
      </p>
    </div>
  );
}

function GoalInsight({ card, dark = false }) {
  const progress = Math.min(100, Number(card.progress_pct || 0));
  const muted = dark ? "text-slate-300" : "text-slate-500";
  const title = dark ? "text-white" : "text-slate-900";
  const value = dark ? "text-white" : "text-slate-950";
  return (
    <div className="space-y-4">
      <div>
        <p className={`text-sm font-semibold ${muted}`}>{card.subtitle}</p>
        <h2 className={`mt-1 text-xl font-black sm:text-2xl ${title}`}>{card.title}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={dark ? "rounded-xl bg-white/10 px-4 py-3 backdrop-blur" : ""}>
          <p className={`text-xs font-bold uppercase ${dark ? "text-slate-300" : "text-slate-400"}`}>Réalisé</p>
          <p className={`mt-1 text-2xl font-black ${value}`}>{money(card.current_value)}</p>
        </div>
        <div className={dark ? "rounded-xl bg-white/10 px-4 py-3 backdrop-blur" : ""}>
          <p className={`text-xs font-bold uppercase ${dark ? "text-slate-300" : "text-slate-400"}`}>Objectif estimé</p>
          <p className={`mt-1 text-xl font-black ${dark ? "text-slate-100" : "text-slate-700"}`}>
            {money(card.goal_amount)}
          </p>
        </div>
        <div className={dark ? "rounded-xl bg-white/10 px-4 py-3 backdrop-blur" : ""}>
          <p className={`text-xs font-bold uppercase ${dark ? "text-slate-300" : "text-slate-400"}`}>Reste à faire</p>
          <p className={`mt-1 text-xl font-black ${dark ? "text-emerald-200" : "text-[var(--dashboard-primary)]"}`}>
            {money(card.remaining_amount)}
          </p>
        </div>
      </div>
      <div>
        <div className={`mb-2 flex justify-between text-xs font-black ${dark ? "text-slate-200" : "text-slate-600"}`}>
          <span>{progress.toLocaleString("fr-FR")} % de l&apos;objectif</span>
        </div>
        <div className={`h-2.5 rounded-full ${dark ? "bg-white/15" : "bg-slate-100"}`}>
          <div
            className={`h-full rounded-full transition-all ${
              card.tone === "positive" ? "bg-emerald-400" : card.tone === "negative" ? "bg-red-400" : "bg-amber-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TrendInsight({ card, dark = false }) {
  const max = Math.max(...(card.series ?? [0]), 1);
  const labels = ["J-4", "J-3", "J-2", "Hier", "Auj."];
  const muted = dark ? "text-slate-300" : "text-slate-500";
  const title = dark ? "text-white" : "text-slate-900";
  return (
    <div className="space-y-4">
      <div>
        <p className={`text-sm font-semibold ${muted}`}>{card.subtitle}</p>
        <h2 className={`mt-1 text-xl font-black sm:text-2xl ${title}`}>{card.title}</h2>
      </div>
      <p
        className={`text-lg font-black ${
          card.tone === "positive"
            ? dark
              ? "text-emerald-200"
              : "text-emerald-700"
            : card.tone === "negative"
              ? dark
                ? "text-red-200"
                : "text-red-600"
              : dark
                ? "text-slate-100"
                : "text-slate-700"
        }`}
      >
        {card.message}
      </p>
      <div className="flex h-20 items-end gap-3">
        {(card.series ?? []).map((serieValue, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-14 w-full items-end">
              <div
                className={`w-full rounded-t-md ${dark ? "bg-emerald-300" : "bg-[var(--dashboard-primary)]"}`}
                style={{
                  height: `${Math.max(6, (Number(serieValue) / max) * 100)}%`,
                  opacity: index === card.series.length - 1 ? 1 : 0.55,
                }}
              />
            </div>
            <span className={`text-[10px] font-bold ${dark ? "text-slate-400" : "text-slate-400"}`}>
              {labels[index] ?? `J${index}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightContent({ card, dark = false }) {
  if (card.key === "daily_goal") return <GoalInsight card={card} dark={dark} />;
  if (card.key === "recent_trend") return <TrendInsight card={card} dark={dark} />;
  return <ComparisonInsight card={card} dark={dark} />;
}

/**
 * Carrousel d'insights admin.
 * Navigation uniquement au clic (pas d'auto-défilement).
 */
export function InsightsCarousel({
  cards = [],
  loading = false,
  greeting,
  dateLabel,
  action,
  variant = "light",
  timeLabel,
}) {
  const [index, setIndex] = useState(0);
  const slides = cards.length ? cards : [];
  const dark = variant === "dark";

  const slideKeys = slides.map((card) => card.key).join("|");

  useEffect(() => {
    // Ne reset que si la liste des slides change (pas à chaque refresh d'heure/CA).
    setIndex(0);
  }, [slideKeys]);

  useEffect(() => {
    if (!slides.length) return;
    if (index >= slides.length) setIndex(0);
  }, [index, slides.length]);

  const active = slides[index] ?? slides[0];

  const shellClass = dark
    ? "overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0b3d2e] text-white shadow-lg"
    : "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm";

  return (
    <header className={shellClass}>
      <div
        className={`flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:pt-8 ${
          dark ? "" : "border-b border-slate-100"
        }`}
      >
        <div className="min-w-0">
          {dark && (
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200/80">Tableau de bord</p>
          )}
          <h1 className={`text-2xl font-black tracking-tight sm:text-3xl ${dark ? "mt-2 text-white" : "text-slate-950"}`}>
            {greeting}
          </h1>
          {dateLabel && (
            <p className={`mt-1 text-sm font-medium capitalize ${dark ? "text-slate-300" : "text-slate-500"}`}>
              {dateLabel}
              {timeLabel ? ` · Référence à ${timeLabel}` : ""}
            </p>
          )}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>

      {loading && !slides.length ? (
        <div className={`px-5 py-10 text-center text-sm font-semibold ${dark ? "text-slate-400" : "text-slate-400"}`}>
          Chargement du pilotage...
        </div>
      ) : !slides.length ? (
        <div className="px-5 py-8 lg:px-8">
          <p className={`text-sm font-medium ${dark ? "text-slate-300" : "text-slate-500"}`}>
            Les indicateurs comparatifs apparaîtront dès les premières ventes enregistrées.
          </p>
        </div>
      ) : (
        <>
          <div
            className={`flex items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-5 lg:px-8 ${
              dark ? "border-y border-white/10" : "border-b border-slate-100"
            }`}
          >
            {slides.map((card, slideIndex) => (
              <button
                key={card.key}
                type="button"
                onClick={() => setIndex(slideIndex)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                  slideIndex === index
                    ? dark
                      ? "bg-white text-slate-950"
                      : "bg-slate-950 text-white"
                    : dark
                      ? "bg-white/10 text-slate-200 hover:bg-white/15"
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
                className={
                  dark
                    ? "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                    : "lte-tool-btn"
                }
                aria-label="Précédent"
              >
                <DashboardIcon name="ChevronDown" size={15} className="rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((current) => (current + 1) % slides.length)}
                className={
                  dark
                    ? "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                    : "lte-tool-btn"
                }
                aria-label="Suivant"
              >
                <DashboardIcon name="ChevronDown" size={15} className="-rotate-90" />
              </button>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:pb-8">
            <InsightContent card={active} dark={dark} />
          </div>
        </>
      )}
    </header>
  );
}
