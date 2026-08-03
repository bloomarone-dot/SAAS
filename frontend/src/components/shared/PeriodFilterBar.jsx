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

function pad2(value) {
  return String(value).padStart(2, "0");
}

/** Date/heure locale (pas UTC) pour que « aujourd'hui » couvre toute la journée caisse. */
function toLocalDateTime(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
}

function endOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
}

export function periodToApiDates(period, customPeriod = { start: "", end: "" }) {
  const now = new Date();

  if (period === "today") {
    return {
      start_date: toLocalDateTime(startOfLocalDay(now)),
      end_date: toLocalDateTime(endOfLocalDay(now)),
    };
  }
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return {
      start_date: toLocalDateTime(startOfLocalDay(y)),
      end_date: toLocalDateTime(endOfLocalDay(y)),
    };
  }
  if (period === "week") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return {
      start_date: toLocalDateTime(startOfLocalDay(s)),
      end_date: toLocalDateTime(endOfLocalDay(now)),
    };
  }
  if (period === "month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start_date: toLocalDateTime(startOfLocalDay(s)),
      end_date: toLocalDateTime(endOfLocalDay(now)),
    };
  }
  if (period === "year") {
    const s = new Date(now.getFullYear(), 0, 1);
    return {
      start_date: toLocalDateTime(startOfLocalDay(s)),
      end_date: toLocalDateTime(endOfLocalDay(now)),
    };
  }
  if (period === "custom" && customPeriod.start && customPeriod.end) {
    return {
      start_date: `${customPeriod.start}T00:00:00`,
      end_date: `${customPeriod.end}T23:59:59`,
    };
  }
  return {};
}
