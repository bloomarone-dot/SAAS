/**
 * Pattern Stale-While-Revalidate — afficher le cache immédiatement, rafraîchir en arrière-plan.
 */

import { isNetworkError, shouldPreferLocalData } from "@/utils/network";

/**
 * Applique immédiatement les données du cache synchrone (localStorage) si disponibles.
 * @returns {boolean} true si des données ont été appliquées
 */
export function applySyncCache(loadSyncCache, apply) {
  if (typeof loadSyncCache !== "function") return false;
  try {
    const cached = loadSyncCache();
    if (cached != null) {
      apply(cached);
      return true;
    }
  } catch {
    /* cache miss */
  }
  return false;
}

/**
 * @param {object} options
 * @param {() => any} [options.loadSyncCache] — lecture synchrone (localStorage) pour paint instantané
 * @param {() => Promise<any>} options.loadCache
 * @param {() => Promise<any>} options.fetchRemote
 * @param {(data: any) => void} options.apply
 * @param {(msg: string) => void} [options.onNotice]
 * @param {(refreshing: boolean) => void} [options.onRefreshing]
 */
export async function loadLocalFirst({
  loadSyncCache,
  loadCache,
  fetchRemote,
  apply,
  onNotice,
  onRefreshing,
}) {
  applySyncCache(loadSyncCache, apply);

  let cached = null;
  try {
    cached = await loadCache();
    if (cached != null) apply(cached);
  } catch {
    /* cache miss */
  }

  if (shouldPreferLocalData()) {
    if (cached != null || applySyncCache(loadSyncCache, apply)) {
      onNotice?.("Données chargées depuis la mémoire locale.");
      return { source: "cache", data: cached };
    }
    return { source: "empty", data: null };
  }

  onRefreshing?.(true);
  try {
    const remote = await fetchRemote();
    apply(remote);
    return { source: "remote", data: remote };
  } catch (error) {
    if (cached != null) {
      onNotice?.(
        isNetworkError(error)
          ? "Connexion instable : affichage des données locales."
          : "Données locales utilisées.",
      );
      return { source: "cache", data: cached, error };
    }
    const syncHit = applySyncCache(loadSyncCache, apply);
    if (syncHit) {
      onNotice?.("Connexion instable : affichage des données locales.");
      return { source: "cache", data: null, error };
    }
    throw error;
  } finally {
    onRefreshing?.(false);
  }
}
