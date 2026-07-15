import { PERIOD_OPTIONS } from "@/utils/greeting";

export function PeriodFilterBar({ period, onPeriodChange, customPeriod, onCustomPeriodChange, className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select
        value={period}
        onChange={(event) => onPeriodChange(event.target.value)}
        className="form-control h-10 min-w-40"
      >
        {PERIOD_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
        <option value="custom">Période personnalisée</option>
      </select>
      {period === "custom" && (
        <>
          <input
            type="date"
            value={customPeriod.start}
            onChange={(event) => onCustomPeriodChange({ ...customPeriod, start: event.target.value })}
            className="form-control h-10"
          />
          <input
            type="date"
            value={customPeriod.end}
            onChange={(event) => onCustomPeriodChange({ ...customPeriod, end: event.target.value })}
            className="form-control h-10"
          />
        </>
      )}
    </div>
  );
}

export function periodToApiDates(period, customPeriod = { start: "", end: "" }) {
  const now = new Date();
  const toIsoDate = (date) => date.toISOString().slice(0, 10);
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

  if (period === "today") {
    return { start_date: toIsoDate(startOfDay(now)), end_date: toIsoDate(endOfDay(now)) };
  }
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { start_date: toIsoDate(startOfDay(y)), end_date: toIsoDate(endOfDay(y)) };
  }
  if (period === "week") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { start_date: toIsoDate(startOfDay(s)), end_date: toIsoDate(endOfDay(now)) };
  }
  if (period === "month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start_date: toIsoDate(s), end_date: toIsoDate(endOfDay(now)) };
  }
  if (period === "year") {
    const s = new Date(now.getFullYear(), 0, 1);
    return { start_date: toIsoDate(s), end_date: toIsoDate(endOfDay(now)) };
  }
  if (period === "custom" && customPeriod.start && customPeriod.end) {
    return { start_date: customPeriod.start, end_date: customPeriod.end };
  }
  return {};
}
