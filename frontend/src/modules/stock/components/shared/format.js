export const today = () => new Date().toISOString().slice(0, 10);

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
