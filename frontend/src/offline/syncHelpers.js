/**
 * Helpers purs de sync offline (Phase 5).
 * Aucune dépendance navigateur — testable en Node.
 */

export const TYPE_PRIORITY = {
  create_table: 5,
  create_table_order: 10,
  create_cashier_delivery: 12,
  update_order_items: 20,
  send_to_kitchen: 30,
  send_to_kitchen_after_create: 30,
  kitchen_status: 40,
  kitchen_status_local: 40,
  order_status: 50,
  close_order: 45,
  cash_payment: 60,
  http: 70,
};

export const KITCHEN_STATUS_RANK = {
  "En attente": 1,
  "En préparation": 2,
  Prête: 3,
  Servie: 4,
};

export const MAX_QUEUE_SIZE = 150;
export const MAX_ATTEMPTS = 5;
export const MAX_RETRY_DELAY_MS = 120_000;

/** Backoff exponentiel pour PendingOperations (2^n secondes, plafonné). */
export function computeRetryDelayMs(attempts, baseMs = 1000) {
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(baseMs * 2 ** n, MAX_RETRY_DELAY_MS);
}

export function isLocalId(id) {
  return String(id || "").startsWith("local_");
}

export function orderKey(action) {
  return String(action?.localOrderId || action?.orderId || "");
}

export function typePriority(action) {
  return TYPE_PRIORITY[action?.type || "http"] ?? 70;
}

export function sortQueueForFlush(queue) {
  return [...(queue || [])].sort((a, b) => {
    const failedA = a.status === "failed" ? 1 : 0;
    const failedB = b.status === "failed" ? 1 : 0;
    if (failedA !== failedB) return failedA - failedB;

    const pa = typePriority(a);
    const pb = typePriority(b);
    if (pa !== pb) return pa - pb;

    const ka = orderKey(a);
    const kb = orderKey(b);
    if (ka && kb && ka !== kb) return ka.localeCompare(kb);

    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}

/**
 * Fusionne les actions redondantes / dangereuses (ex. double paiement).
 */
export function dedupeQueue(queue) {
  const result = [];
  const latestItemsByOrder = new Map();
  const latestCashByOrder = new Map();
  const latestStatusByOrder = new Map();
  const sendKitchenSeen = new Set();
  const kitchenLocalBest = new Map();

  for (const action of queue || []) {
    if (action.status === "failed") {
      result.push(action);
      continue;
    }

    const type = action.type || "http";
    const key = orderKey(action);

    if (type === "update_order_items" && key) {
      latestItemsByOrder.set(key, action);
      continue;
    }

    if (type === "cash_payment" && key) {
      latestCashByOrder.set(key, action);
      continue;
    }

    if (type === "order_status" && key) {
      latestStatusByOrder.set(key, action);
      continue;
    }

    if ((type === "send_to_kitchen" || type === "send_to_kitchen_after_create") && key) {
      if (sendKitchenSeen.has(key)) continue;
      sendKitchenSeen.add(key);
      result.push(action);
      continue;
    }

    if (type === "kitchen_status_local") {
      const ticketKey = `${action.orderId}|${action.itemName}|${action.quantity}`;
      const prev = kitchenLocalBest.get(ticketKey);
      const rank = KITCHEN_STATUS_RANK[action.status] || 0;
      const prevRank = prev ? (KITCHEN_STATUS_RANK[prev.status] || 0) : -1;
      if (!prev || rank >= prevRank) kitchenLocalBest.set(ticketKey, action);
      continue;
    }

    result.push(action);
  }

  for (const action of latestItemsByOrder.values()) result.push(action);
  for (const action of latestStatusByOrder.values()) result.push(action);
  for (const action of kitchenLocalBest.values()) result.push(action);
  for (const action of latestCashByOrder.values()) result.push(action);

  return sortQueueForFlush(result);
}

export function isConflictResolved(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("déjà payée")
    || message.includes("deja payee")
    || message.includes("déjà paye")
    || message.includes("already paid")
    || message.includes("déjà envoy")
    || message.includes("deja envoy")
    || message.includes("déjà en cuisine")
    || message.includes("deja en cuisine")
    || message.includes("already sent")
    || message.includes("statut actuel")
  );
}

export function isDeferError(error) {
  return Boolean(error?.defer);
}
