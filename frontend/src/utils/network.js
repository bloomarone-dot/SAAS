const OFFLINE_QUEUE_KEY = "offline_action_queue";

export function friendlyNetworkMessage(error, fallback = "Connexion indisponible. Réessayez dans quelques instants.") {
  const message = String(error?.message || error || "");
  if (!navigator.onLine || message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Connexion indisponible. L'action sera possible dès que le réseau revient.";
  }
  return message || fallback;
}

export function formatApiError(detail, fallback = "Opération impossible.") {
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
  return detail.message || fallback;
}

export function isNetworkError(error) {
  const message = String(error?.message || error || "");
  return !navigator.onLine || message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("Connexion indisponible");
}

export async function fetchJson(url, options = {}, fallback = "Opération impossible.") {
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(formatApiError(data?.detail, fallback));
    return data;
  } catch (error) {
    throw new Error(friendlyNetworkMessage(error, fallback));
  }
}

export function enqueueOfflineAction(action) {
  const queue = readOfflineQueue();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    ...action,
  };
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([...queue, entry]));
  window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  return entry;
}

export function readOfflineQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
  window.dispatchEvent(new CustomEvent("offline-queue-changed"));
}

export async function flushOfflineQueue(apiBaseUrl) {
  if (!navigator.onLine || !apiBaseUrl) return { synced: 0, remaining: readOfflineQueue().length };
  const queue = readOfflineQueue();
  if (!queue.length) return { synced: 0, remaining: 0 };

  const remaining = [];
  let synced = 0;
  for (const action of queue) {
    try {
      for (const request of action.requests ?? []) {
        const token = localStorage.getItem("access_token");
        await fetchJson(`${apiBaseUrl}${request.path}`, {
          method: request.method ?? "POST",
          headers: {
            ...(request.body ? { "Content-Type": "application/json" } : {}),
            ...(request.requiresAuth && token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: request.body ? JSON.stringify(request.body) : undefined,
        }, action.errorMessage ?? "Synchronisation impossible.");
      }
      synced += 1;
    } catch (error) {
      remaining.push(action);
      if (isNetworkError(error)) break;
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  return { synced, remaining: remaining.length };
}
