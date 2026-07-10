const LOCAL_TIMEZONE = "Africa/Douala";

export const today = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: LOCAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
};

export const dateToApiDateTime = (value) => {
  if (!value) return undefined;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const local = new Date(year, month - 1, day, 12, 0, 0);
  return local.toISOString();
};

export const formatLocalDate = (value) => {
  if (!value) return "-";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: LOCAL_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

export const money = (value) =>
  `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;

export const qty = (value) =>
  Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export const normalizeUnitLabel = (unit) => {
  const value = String(unit?.name || unit?.symbol || "")
    .trim()
    .toLowerCase()
    .replace("¼", "1/4")
    .replace(/\s+/g, " ");
  const aliases = {
    "quart kg": "1/4 kg",
    "quart kilo": "1/4 kg",
    "0.25 kg": "1/4 kg",
    "250g": "1/4 kg",
    "250 g": "1/4 kg",
    pcs: "piece",
    pièce: "piece",
    pieces: "piece",
    paquets: "paquet",
    packet: "paquet",
  };
  return aliases[value] || value;
};

export const uniqueUnits = (units) => {
  const seen = new Set();
  return units.filter((unit) => {
    const keys = [
      normalizeUnitLabel(unit),
      normalizeUnitLabel({ name: unit?.symbol, symbol: unit?.name }),
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
};

export const uniqueDepots = (depots) => {
  const seen = new Set();
  return depots.filter((depot) => {
    const key = String(depot?.code || depot?.id || "")
      .trim()
      .toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
