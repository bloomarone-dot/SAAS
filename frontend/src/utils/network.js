/**
 * Helpers réseau + façade sync offline (Phase 4).
 * La logique de flush intelligente vit dans offline/sync.js.
 */

export {
  enqueueOfflineAction,
  readOfflineQueue,
  clearOfflineQueue,
  flushOfflineQueue,
  isNetworkError,
  discardFailedOfflineActions,
  retryFailedOfflineActions,
  getOfflineQueueStats,
  dedupeQueue,
  sortQueueForFlush,
} from "@/offline/sync";

import { resolveApiBaseUrl, isApiReachable, isLanApiReachable } from "@/config/api";

export { resolveApiBaseUrl, isApiReachable, isLanApiReachable };

const EFFECTIVE_OFFLINE_FLAG = "__bloomarEffectiveOffline";

/** true si le navigateur est offline ET qu'aucun serveur (cloud ou local Wi‑Fi) n'est joignable. */
export function shouldPreferLocalData() {
  if (typeof window !== "undefined" && window.__bloomarApiReachable === true) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (typeof window !== "undefined" && window[EFFECTIVE_OFFLINE_FLAG]) return true;
  return false;
}

export function markEffectiveOffline(reason = "network") {
  if (typeof window === "undefined") return;
  if (window[EFFECTIVE_OFFLINE_FLAG]) return;
  window[EFFECTIVE_OFFLINE_FLAG] = true;
  window.dispatchEvent(new CustomEvent("offline-effective", { detail: { reason } }));
}

export function clearEffectiveOffline() {
  if (typeof window === "undefined") return;
  window[EFFECTIVE_OFFLINE_FLAG] = false;
}

export function isNetworkLikeMessage(message) {
  const text = String(message || "");
  return (
    text.includes("Failed to fetch")
    || text.includes("NetworkError")
    || text.includes("Connexion indisponible")
    || text.includes("pris trop de temps")
    || /timeout/i.test(text)
    || text.includes("Load failed")
    || text.includes("Network request failed")
  );
}

export function friendlyNetworkMessage(error, fallback = "Connexion indisponible. Réessayez dans quelques instants.") {
  const message = String(error?.message || error || "");
  if (
    (typeof navigator !== "undefined" && !navigator.onLine)
    || isNetworkLikeMessage(message)
  ) {
    markEffectiveOffline("fetch");
    return "Connexion indisponible. L'action sera possible dès que le réseau revient.";
  }
  return message || fallback;
}

/** Tente le serveur local Wi‑Fi avant de basculer en mode 100 % local (tablette isolée). */
export async function preferLocalOpsAfterProbe() {
  await resolveApiBaseUrl({ force: true });
  return shouldPreferLocalData();
}

export function formatApiError(detail, fallback = "Action impossible: le serveur n'a pas fourni de détail.") {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item?.loc) ? item.loc.filter((part) => part !== "body").join(".") : "";
        const message = item?.msg || fallback;
        return field ? `${field}: ${message}` : message;
      })
      .filter(Boolean)
      .join(" | ") || fallback;
  }
  return detail.message || detail.error || detail.detail || fallback;
}
