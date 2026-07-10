export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Bonjour";
  if (hour >= 12 && hour < 18) return "Bon après-midi";
  if (hour >= 18 && hour < 22) return "Bonsoir";
  return "Bonne nuit";
}

export const PERIOD_OPTIONS = [
  ["today", "Aujourd'hui"],
  ["yesterday", "Hier"],
  ["week", "Cette semaine"],
  ["month", "Ce mois"],
  ["year", "Cette année"],
  ["all", "Tout"],
];

export function periodBounds(period, custom = { start: "", end: "" }) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  if (period === "today") return [startOfDay(now), endOfDay(now)];
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return [startOfDay(y), endOfDay(y)];
  }
  if (period === "week") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return [startOfDay(s), endOfDay(now)];
  }
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)];
  if (period === "year") return [new Date(now.getFullYear(), 0, 1), endOfDay(now)];
  if (period === "custom" && custom.start && custom.end) {
    return [new Date(`${custom.start}T00:00:00`), new Date(`${custom.end}T23:59:59`)];
  }
  return null;
}

export function matchesPeriod(createdAt, period, custom) {
  if (!period || period === "all") return true;
  const bounds = periodBounds(period, custom);
  if (!bounds) return true;
  const [start, end] = bounds;
  const value = new Date(createdAt);
  return value >= start && value <= end;
}
