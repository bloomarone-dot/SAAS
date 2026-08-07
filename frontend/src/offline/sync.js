/**
 * Sync intelligente — Phase 4/5.
 * Ordonnancement, déduplication, retries, conflits idempotents + garde-fous.
 */

import { persistSyncQueue, initOfflineFoundation } from "@/offline/store";
import { idbGet, idbPut, STORES } from "@/offline/db";
import { getDeviceId } from "@/offline/deviceId";
import { appendAuditLog, AUDIT_ACTIONS } from "@/offline/auditLog";
import {
  MAX_ATTEMPTS,
  MAX_QUEUE_SIZE,
  KITCHEN_STATUS_RANK,
  dedupeQueue as dedupeQueuePure,
  sortQueueForFlush as sortQueueForFlushPure,
  isLocalId as isLocalIdPure,
  isConflictResolved,
  isDeferError,
  computeRetryDelayMs,
} from "@/offline/syncHelpers";

const OFFLINE_QUEUE_KEY = "offline_action_queue";
const ID_MAP_META_KEY = "offline_id_map";

let flushInFlight = null;

export const isLocalId = isLocalIdPure;
export const dedupeQueue = dedupeQueuePure;
export const sortQueueForFlush = sortQueueForFlushPure;

export function readOfflineQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function clearOfflineQueue() {
  persistSyncQueue([]);
}

export function enqueueOfflineAction(action) {
  const queue = readOfflineQueue();
  const pendingCount = queue.filter((item) => item.status !== "failed").length;
  if (pendingCount >= MAX_QUEUE_SIZE) {
    const err = new Error(
      `File offline saturée (${MAX_QUEUE_SIZE}). Synchronisez ou videz la file avant de continuer.`,
    );
    emitSyncEvent("offline-queue-overflow", { max: MAX_QUEUE_SIZE, pendingCount });
    throw err;
  }

  // Champs PendingOperations — uuid, endpoint, method, payload, retryCount, idempotencyKey
  const entry = {
    ...action,
    tenantId: action.tenantId || action.restaurantId || null,
    deviceId: action.deviceId || getDeviceId(),
    uuid:
      action.uuid
      || action.idempotencyKey
      || (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    id: action.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    idempotencyKey:
      action.idempotencyKey
      || action.uuid
      || (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    endpoint: action.endpoint || action.path || action.url || "",
    method: String(action.method || "POST").toUpperCase(),
    payload: action.payload ?? action.body ?? null,
    createdAt: action.createdAt || new Date().toISOString(),
    created_at: action.created_at || new Date().toISOString(),
    lastTry: null,
    nextRetryAt: null,
    retryCount: 0,
    attempts: 0,
    status: "pending",
  };
  const next = dedupeQueue([...queue, entry]);
  persistSyncQueue(next);
  emitSyncEvent("offline-queue-changed", { count: next.length });
  return entry;
}

function emitSyncEvent(name, detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function hasAuthToken() {
  try {
    return Boolean(localStorage.getItem("access_token"));
  } catch {
    return false;
  }
}

async function loadIdMap() {
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.meta, ID_MAP_META_KEY);
    return row?.map && typeof row.map === "object" ? { ...row.map } : {};
  } catch {
    return {};
  }
}

async function saveIdMap(idMap) {
  try {
    await initOfflineFoundation();
    await idbPut(STORES.meta, {
      key: ID_MAP_META_KEY,
      map: idMap,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // best effort
  }
}

function rewritePath(path, idMap) {
  let next = String(path || "");
  for (const [localId, serverId] of Object.entries(idMap)) {
    next = next.split(localId).join(String(serverId));
  }
  return next;
}

function rewriteActionIds(action, idMap) {
  const next = { ...action };
  if (next.localOrderId && idMap[next.localOrderId]) next.localOrderId = idMap[next.localOrderId];
  if (next.orderId && idMap[next.orderId]) next.orderId = idMap[next.orderId];
  if (next.localTableId && idMap[next.localTableId]) next.localTableId = idMap[next.localTableId];
  if (next.tableId && idMap[next.tableId]) next.tableId = idMap[next.tableId];
  if (Array.isArray(next.requests)) {
    next.requests = next.requests.map((request) => ({
      ...request,
      path: rewritePath(request.path, idMap),
    }));
  }
  return next;
}

function resolveOrderId(action, idMap) {
  const raw = action.localOrderId || action.orderId;
  if (!raw) return null;
  if (idMap[raw]) return idMap[raw];
  if (!isLocalId(raw)) return raw;
  return null;
}

export function isNetworkError(error) {
  if (error?.isNetworkError) return true;
  const message = String(error?.message || error || "");
  return (
    (typeof navigator !== "undefined" && !navigator.onLine)
    || message.includes("Failed to fetch")
    || message.includes("NetworkError")
    || message.includes("Connexion indisponible")
    || message.includes("pris trop de temps")
    || /timeout/i.test(message)
    || message.includes("Load failed")
    || message.includes("Network request failed")
  );
}

async function matchAndApplyKitchenStatus(apiFetch, action, orderId) {
  const remoteTickets = await apiFetch("/kitchen/tickets/active", {
    method: "GET",
    fallback: "Tickets cuisine indisponibles.",
  });
  const ticket = (remoteTickets || []).find(
    (item) =>
      String(item.order_id) === String(orderId)
      && String(item.item_name) === String(action.itemName)
      && Number(item.quantity || 0) === Number(action.quantity || 0)
      && item.status !== "Servie",
  );
  if (!ticket) {
    const err = new Error("Ticket serveur pas encore disponible");
    err.defer = true;
    throw err;
  }
  const currentRank = KITCHEN_STATUS_RANK[ticket.status] || 0;
  const targetRank = KITCHEN_STATUS_RANK[action.status] || 0;
  if (targetRank <= currentRank) return; // déjà au moins aussi avancé
  await apiFetch(`/kitchen/ticket/${ticket.id}/status`, {
    method: "PATCH",
    body: { status: action.status },
    fallback: "Mise à jour ticket impossible.",
  });
}

async function runAction(action, { apiFetch, apiFetchPublic, idMap }) {
  const type = action.type || "http";

  if (type === "create_table") {
    const localTableId = action.localTableId;
    const payload = action.payload || {};
    const result = await apiFetch(`/tables?restaurant_id=${encodeURIComponent(action.restaurantId)}`, {
      method: "POST",
      body: {
        name: payload.name,
        room: payload.room || "Rez-de-chaussée",
        capacity: Number(payload.capacity || 1),
      },
      fallback: action.errorMessage || "Création de table impossible.",
    });
    const serverTableId = result?.id;
    if (serverTableId == null) throw new Error("Création de table : id serveur manquant.");
    if (localTableId) {
      idMap[localTableId] = serverTableId;
      try {
        const { remapLocalTableId } = await import("@/offline/ops");
        await remapLocalTableId(localTableId, serverTableId, action.restaurantId);
      } catch {
        // best effort
      }
    }
    return;
  }

  if (type === "create_table_order") {
    const tableId = idMap[action.tableId] || action.tableId;
    if (isLocalId(tableId)) {
      const err = new Error("Table locale pas encore créée");
      err.defer = true;
      throw err;
    }
    const result = await apiFetch(`/tables/${tableId}/orders`, {
      method: "POST",
      body: { party_size: action.party_size || 1 },
      fallback: action.errorMessage || "Création de commande impossible.",
    });
    const serverOrderId = result?.order?.id;
    if (!serverOrderId) throw new Error("Création de commande : id serveur manquant.");
    idMap[action.localOrderId] = serverOrderId;
    try {
      const { remapLocalOrderId } = await import("@/offline/ops");
      await remapLocalOrderId(action.localOrderId, serverOrderId, action.restaurantId);
      if (result?.order?.order_number && action.payload?.client_order_number) {
        const localOrder = await idbGet(STORES.orders, serverOrderId);
        if (localOrder) {
          await idbPut(STORES.orders, {
            ...localOrder,
            client_order_number: action.payload.client_order_number,
            order_number: action.payload.client_order_number,
            server_order_number: result.order.order_number,
          });
        }
      }
    } catch {
      // best effort
    }
    return;
  }

  if (type === "create_cashier_delivery") {
    const body = action.requests?.[0]?.body || action.payload;
    const result = await apiFetch("/api/v1/orders/cashier-delivery", {
      method: "POST",
      body,
      fallback: action.errorMessage || "Création livraison impossible.",
    });
    const serverOrderId = result?.id;
    if (!serverOrderId) throw new Error("Création livraison : id serveur manquant.");
    if (action.localOrderId) {
      idMap[action.localOrderId] = serverOrderId;
      try {
        const { remapLocalOrderId, mirrorOrderLocal } = await import("@/offline/ops");
        await remapLocalOrderId(action.localOrderId, serverOrderId, action.restaurantId);
        await mirrorOrderLocal(result, action.restaurantId);
      } catch {
        // best effort
      }
    }
    return;
  }

  if (type === "update_order_items") {
    const orderId = resolveOrderId(action, idMap);
    if (!orderId) {
      const err = new Error("Commande locale pas encore créée");
      err.defer = true;
      throw err;
    }
    await apiFetch(`/api/v1/orders/${orderId}`, {
      method: "PATCH",
      body: { items: action.items },
      fallback: action.errorMessage || "Mise à jour commande impossible.",
    });
    return;
  }

  if (type === "send_to_kitchen" || type === "send_to_kitchen_after_create") {
    const orderId = resolveOrderId(action, idMap);
    if (!orderId) {
      const err = new Error("Commande locale pas encore créée");
      err.defer = true;
      throw err;
    }
    await apiFetch(`/api/v1/orders/${orderId}/send-to-kitchen`, {
      method: "POST",
      fallback: action.errorMessage || "Envoi cuisine impossible.",
    });
    return;
  }

  if (type === "kitchen_status_local") {
    const orderId = resolveOrderId({ localOrderId: action.orderId, orderId: action.orderId }, idMap)
      || (idMap[action.orderId] ? idMap[action.orderId] : null)
      || (!isLocalId(action.orderId) ? action.orderId : null);
    if (!orderId) {
      const err = new Error("Commande locale pas encore créée");
      err.defer = true;
      throw err;
    }
    await matchAndApplyKitchenStatus(apiFetch, action, orderId);
    return;
  }

  if (type === "cash_payment") {
    const orderId = resolveOrderId(action, idMap);
    if (!orderId) {
      const err = new Error("Commande locale pas encore créée");
      err.defer = true;
      throw err;
    }
    const payload = action.payload || action.requests?.[0]?.body || {
      payment_method: "Espèces",
      discount_amount: 0,
    };
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: { status: "Livrée" },
        fallback: "Statut commande impossible.",
      });
    } catch {
      // déjà payable
    }
    await apiFetch(`/api/v1/orders/${orderId}/payment`, {
      method: "POST",
      body: payload,
      fallback: action.errorMessage || "Paiement caisse impossible.",
    });
    return;
  }

  if (type === "payment_cancel") {
    const orderId = resolveOrderId(action, idMap);
    if (!orderId) {
      const err = new Error("Commande locale pas encore créée");
      err.defer = true;
      throw err;
    }
    await apiFetch(`/api/v1/orders/${orderId}/payment-cancel`, {
      method: "POST",
      fallback: action.errorMessage || "Annulation paiement impossible.",
    });
    return;
  }

  if (type === "cash_session_open") {
    const payload = action.payload || action.requests?.[0]?.body || {};
    await apiFetch("/api/v1/orders/cash-session/open", {
      method: "POST",
      body: payload,
      fallback: action.errorMessage || "Ouverture caisse impossible.",
    });
    return;
  }

  if (type === "cash_session_close") {
    const payload = action.payload || action.requests?.[0]?.body || {};
    await apiFetch("/api/v1/orders/cash-session/close", {
      method: "POST",
      body: payload,
      fallback: action.errorMessage || "Clôture caisse impossible.",
    });
    return;
  }

  if (type === "cash_movement") {
    // Pas d'endpoint serveur — mouvement conservé localement (idempotent).
    return;
  }

  if (type === "order_status") {
    const orderId = resolveOrderId(action, idMap);
    if (!orderId) {
      const err = new Error("Commande locale pas encore créée");
      err.defer = true;
      throw err;
    }
    const body = action.payload || action.requests?.[0]?.body || { status: "Livrée" };
    await apiFetch(`/api/v1/orders/${orderId}/status`, {
      method: "PATCH",
      body,
      fallback: action.errorMessage || "Mise à jour statut impossible.",
    });
    return;
  }

  if (type === "close_order") {
    const orderId = resolveOrderId(action, idMap);
    if (!orderId) {
      const err = new Error("Commande locale pas encore créée");
      err.defer = true;
      throw err;
    }
    await apiFetch(`/api/v1/orders/${orderId}/close`, {
      method: "POST",
      fallback: action.errorMessage || "Clôture commande impossible.",
    });
    return;
  }

  for (const request of action.requests ?? []) {
    const path = rewritePath(request.path, idMap);
    if (path.includes("local_")) {
      const err = new Error("Référence locale non résolue");
      err.defer = true;
      throw err;
    }
    const fallback = action.errorMessage ?? "Synchronisation impossible.";
    const options = {
      method: request.method ?? "POST",
      body: request.body,
      fallback,
    };
    if (request.requiresAuth) await apiFetch(path, options);
    else await apiFetchPublic(path, options);
  }
}

/**
 * Flush intelligent de la file offline.
 * @returns {{ synced: number, remaining: number, failed: number, conflicts: number, idMap: object }}
 */
export async function flushOfflineQueue(apiBaseUrl) {
  const { isApiReachable, resolveApiBaseUrl } = await import("@/config/api");
  await resolveApiBaseUrl().catch(() => {});
  const canReachServer = Boolean(apiBaseUrl) && (isApiReachable() || navigator.onLine);
  if (!canReachServer) {
    const queue = readOfflineQueue();
    return {
      synced: 0,
      remaining: queue.filter((a) => a.status !== "failed").length,
      failed: queue.filter((a) => a.status === "failed").length,
      conflicts: 0,
      idMap: {},
      skipped: !navigator.onLine && !isApiReachable() ? "offline" : "no_api",
    };
  }

  // Sans JWT : ne pas brûler les tentatives (401 en boucle).
  if (!hasAuthToken()) {
    const queue = readOfflineQueue();
    return {
      synced: 0,
      remaining: queue.filter((a) => a.status !== "failed").length,
      failed: queue.filter((a) => a.status === "failed").length,
      conflicts: 0,
      idMap: {},
      skipped: "no_auth",
    };
  }

  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const rawQueue = readOfflineQueue();
    if (!rawQueue.length) {
      return { synced: 0, remaining: 0, failed: 0, conflicts: 0, idMap: {} };
    }

    const { apiFetch, apiFetchPublic } = await import("@/config/http");
    const idMap = await loadIdMap();
    const queue = dedupeQueue(rawQueue);
    const queueIdsAtStart = new Set(queue.map((action) => action.id));
    const remaining = [];
    let synced = 0;
    let conflicts = 0;
    let failed = 0;

    emitSyncEvent("offline-sync-started", { total: queue.length });

    for (const action of queue) {
      if (action.status === "failed") {
        remaining.push(action);
        failed += 1;
        continue;
      }

      if (action.nextRetryAt && Date.parse(action.nextRetryAt) > Date.now()) {
        remaining.push(action);
        continue;
      }

      emitSyncEvent("offline-sync-progress", {
        label: action.label || action.type || "action",
        synced,
        remaining: queue.length - synced - remaining.length,
      });

      try {
        await runAction(action, { apiFetch, apiFetchPublic, idMap });
        synced += 1;
      } catch (error) {
        if (isConflictResolved(error)) {
          synced += 1;
          conflicts += 1;
          continue;
        }

        const rewritten = rewriteActionIds(action, idMap);

        if (isDeferError(error)) {
          remaining.push({
            ...rewritten,
            status: "pending",
            last_error: String(error.message || error),
          });
          continue;
        }

        if (isNetworkError(error)) {
          remaining.push({
            ...rewritten,
            status: "pending",
            last_error: String(error.message || error),
          });
          const idx = queue.findIndex((item) => item.id === action.id);
          for (let i = idx + 1; i < queue.length; i += 1) {
            const next = rewriteActionIds(queue[i], idMap);
            if (!remaining.some((item) => item.id === next.id)) remaining.push(next);
          }
          break;
        }

        const attempts = Number(action.attempts || 0) + 1;
        const retryCount = attempts;
        const delayMs = computeRetryDelayMs(attempts);
        const retryMeta = {
          lastTry: new Date().toISOString(),
          nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
          retryCount,
        };
        if (attempts >= MAX_ATTEMPTS) {
          remaining.push({
            ...rewritten,
            status: "failed",
            attempts,
            retryCount,
            ...retryMeta,
            last_error: String(error.message || error),
            failed_at: new Date().toISOString(),
          });
          failed += 1;
        } else {
          remaining.push({
            ...rewritten,
            status: "pending",
            attempts,
            retryCount,
            ...retryMeta,
            last_error: String(error.message || error),
          });
        }
      }
    }

    await saveIdMap(idMap);
    // Conserves les actions enqueued pendant le flush (évite perte P0 race).
    const latest = readOfflineQueue();
    const remainingIds = new Set(remaining.map((action) => action.id));
    const enqueuedDuringFlush = latest.filter(
      (action) => !queueIdsAtStart.has(action.id) && !remainingIds.has(action.id),
    );
    const nextQueue = dedupeQueue([...remaining, ...enqueuedDuringFlush]);
    persistSyncQueue(nextQueue);

    const result = {
      synced,
      remaining: nextQueue.filter((a) => a.status !== "failed").length,
      failed: nextQueue.filter((a) => a.status === "failed").length,
      conflicts,
      idMap,
    };

    const tenantId = queue.find((a) => a.tenantId || a.restaurantId)?.tenantId
      || queue.find((a) => a.restaurantId)?.restaurantId;
    if (tenantId && synced > 0) {
      appendAuditLog({
        tenantId,
        action: AUDIT_ACTIONS.SYNC_SUCCESS,
        syncStatus: "SYNCED",
        details: { synced, conflicts, remaining: result.remaining },
      }).catch(() => {});
    }
    if (tenantId && failed > 0) {
      appendAuditLog({
        tenantId,
        action: AUDIT_ACTIONS.SYNC_ERROR,
        syncStatus: "LOCAL",
        details: { failed, remaining: result.remaining },
      }).catch(() => {});
    }

    emitSyncEvent("offline-sync-finished", result);
    emitSyncEvent("offline-queue-changed", { count: remaining.length });
    return result;
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

export function discardFailedOfflineActions() {
  const queue = readOfflineQueue().filter((action) => action.status !== "failed");
  persistSyncQueue(queue);
  emitSyncEvent("offline-queue-changed", { count: queue.length });
  return queue.length;
}

export function retryFailedOfflineActions() {
  const queue = readOfflineQueue().map((action) => (
    action.status === "failed"
      ? { ...action, status: "pending", attempts: 0, last_error: null, failed_at: null }
      : action
  ));
  persistSyncQueue(queue);
  emitSyncEvent("offline-queue-changed", { count: queue.length });
  return queue.length;
}

export function getOfflineQueueStats() {
  const queue = readOfflineQueue();
  return {
    total: queue.length,
    pending: queue.filter((a) => a.status !== "failed").length,
    failed: queue.filter((a) => a.status === "failed").length,
    labels: queue.slice(0, 8).map((a) => a.label || a.type || "action"),
  };
}
