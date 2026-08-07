/**
 * Pattern Stale-While-Revalidate — afficher le cache immédiatement, rafraîchir en arrière-plan.
 */

import { isNetworkError, shouldPreferLocalData } from "@/utils/network";

/**
 * @param {object} options
 * @param {() => Promise<any>} options.loadCache
 * @param {() => Promise<any>} options.fetchRemote
 * @param {(data: any) => void} options.apply
 * @param {(msg: string) => void} [options.onNotice]
 */
export async function loadLocalFirst({ loadCache, fetchRemote, apply, onNotice }) {
  let cached = null;
  try {
    cached = await loadCache();
    if (cached != null) apply(cached);
  } catch {
    /* cache miss */
  }

  if (shouldPreferLocalData()) {
    if (cached != null) {
      onNotice?.("Données chargées depuis la mémoire locale.");
      return { source: "cache", data: cached };
    }
    return { source: "empty", data: null };
  }

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
    throw error;
  }
}
