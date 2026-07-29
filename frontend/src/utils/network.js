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

export function friendlyNetworkMessage(error, fallback = "Connexion indisponible. Réessayez dans quelques instants.") {
  const message = String(error?.message || error || "");
  if (!navigator.onLine || message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Connexion indisponible. L'action sera possible dès que le réseau revient.";
  }
  return message || fallback;
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
