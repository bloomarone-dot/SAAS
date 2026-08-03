/** Montants FCFA : toujours des entiers (pas de centimes à l'affichage métier). */

/**
 * Parse une saisie prix FCFA en entier.
 * Accepte "1500", "1 500", "1.500" (milliers EU), "1500,5".
 */
export function parseFcfa(value, { allowZero = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const compact = raw.replace(/[\s\u00a0\u202f]/g, "").replace(/FCFA|XAF|cfa/gi, "");
  // Milliers style EU : 1.500 ou 12.500.000
  if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
    const amount = Number(compact.replace(/\./g, ""));
    if (!Number.isFinite(amount)) return null;
    if (allowZero ? amount < 0 : amount <= 0) return null;
    return amount;
  }

  const normalized = compact.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round(amount);
  if (allowZero ? rounded < 0 : rounded <= 0) return null;
  return rounded;
}

export function formatFcfa(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("fr-FR")} FCFA`;
}

/** Invalide le cache Workbox + cache offline menu (évite un ancien prix après modification). */
export async function bustMenuApiCache() {
  try {
    const { clearMenuCatalogCache } = await import("@/utils/offlineCache");
    clearMenuCatalogCache();
  } catch {
    /* ignore */
  }
  if (typeof caches === "undefined") return;
  try {
    await caches.delete("menu-api-cache");
  } catch {
    /* ignore */
  }
}
