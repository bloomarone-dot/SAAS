/**
 * API métier offline Phase 1 :
 * - catalogue / tables en local
 * - file de sync durable
 * - emplacements prêts pour commandes & tickets (Phase 2)
 */

import {
  STORES,
  idbClear,
  idbDelete,
  idbGet,
  idbGetAll,
  idbGetAllByIndex,
  idbPut,
  openDb,
} from "@/offline/db";

const META_READY_KEY = "foundation_ready";
const OFFLINE_QUEUE_KEY = "offline_action_queue";

let foundationReady = false;
let foundationPromise = null;

function emitQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  }
}

function emitFoundationReady(detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-foundation-ready", { detail }));
  }
}

function readLocalStorageQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocalStorageQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function mirrorQueueToIdb(queue) {
  await idbClear(STORES.syncQueue);
  for (const entry of queue) {
    await idbPut(STORES.syncQueue, entry);
  }
}

/**
 * Initialise IndexedDB et migre la file localStorage existante.
 * Idempotent — safe à appeler au démarrage de l'app.
 */
export async function initOfflineFoundation() {
  if (foundationReady) return { ready: true, queueCount: readLocalStorageQueue().length };
  if (foundationPromise) return foundationPromise;

  foundationPromise = (async () => {
    await openDb();

    const lsQueue = readLocalStorageQueue();
    const idbQueue = await idbGetAll(STORES.syncQueue);

    if (lsQueue.length && !idbQueue.length) {
      await mirrorQueueToIdb(lsQueue);
    } else if (!lsQueue.length && idbQueue.length) {
      writeLocalStorageQueue(idbQueue);
      emitQueueChanged();
    } else if (lsQueue.length && idbQueue.length) {
      // Fusion simple par id (LS prioritaire pour l'instant).
      await mirrorQueueToIdb(lsQueue);
    }

    await idbPut(STORES.meta, {
      key: META_READY_KEY,
      readyAt: new Date().toISOString(),
      version: 2,
    });

    foundationReady = true;
    const queueCount = readLocalStorageQueue().length;
    emitFoundationReady({ queueCount });
    return { ready: true, queueCount };
  })().catch((error) => {
    foundationPromise = null;
    console.warn("[offline] Foundation IndexedDB indisponible:", error);
    return { ready: false, queueCount: readLocalStorageQueue().length, error };
  });

  return foundationPromise;
}

export function isOfflineFoundationReady() {
  return foundationReady;
}

export async function saveCatalogSnapshot(restaurantId, { categories = [], dishes = [] } = {}) {
  if (!restaurantId) return null;
  await initOfflineFoundation();
  return idbPut(STORES.catalog, {
    restaurantId,
    categories,
    dishes,
    savedAt: new Date().toISOString(),
  });
}

export async function loadCatalogSnapshot(restaurantId) {
  if (!restaurantId) return null;
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.catalog, restaurantId);
    if (!row) return null;
    return {
      categories: row.categories || [],
      dishes: row.dishes || [],
      savedAt: row.savedAt,
    };
  } catch {
    return null;
  }
}

export async function saveTablesSnapshot(restaurantId, tables = []) {
  if (!restaurantId) return null;
  await initOfflineFoundation();
  return idbPut(STORES.tables, {
    restaurantId,
    tables,
    savedAt: new Date().toISOString(),
  });
}

export async function loadTablesSnapshot(restaurantId) {
  if (!restaurantId) return null;
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.tables, restaurantId);
    if (!row) return null;
    return {
      tables: row.tables || [],
      savedAt: row.savedAt,
    };
  } catch {
    return null;
  }
}

/** Persistance locale d'une commande (Phase 2 s'appuiera dessus). */
export async function upsertLocalOrder(order) {
  if (!order?.id) return null;
  await initOfflineFoundation();
  return idbPut(STORES.orders, {
    ...order,
    updatedAt: order.updatedAt || new Date().toISOString(),
  });
}

export async function listLocalOrders(restaurantId) {
  if (!restaurantId) return [];
  try {
    await initOfflineFoundation();
    return idbGetAllByIndex(STORES.orders, "restaurantId", restaurantId);
  } catch {
    return [];
  }
}

export async function upsertLocalKitchenTicket(ticket) {
  if (!ticket?.id) return null;
  await initOfflineFoundation();
  return idbPut(STORES.kitchenTickets, {
    ...ticket,
    updatedAt: ticket.updatedAt || new Date().toISOString(),
  });
}

export async function listLocalKitchenTickets(restaurantId) {
  if (!restaurantId) return [];
  try {
    await initOfflineFoundation();
    return idbGetAllByIndex(STORES.kitchenTickets, "restaurantId", restaurantId);
  } catch {
    return [];
  }
}

/**
 * API sync file — garde localStorage synchrone pour les callers existants,
 * et miroir IndexedDB pour durabilité.
 */
export function persistSyncQueue(queue) {
  const safeQueue = Array.isArray(queue) ? queue : [];
  writeLocalStorageQueue(safeQueue);
  emitQueueChanged();
  // Miroir async (best effort).
  initOfflineFoundation()
    .then(() => mirrorQueueToIdb(safeQueue))
    .catch(() => {});
  return safeQueue;
}

export async function loadSyncQueueDurable() {
  try {
    await initOfflineFoundation();
    const idbQueue = await idbGetAll(STORES.syncQueue);
    if (idbQueue.length) return idbQueue;
  } catch {
    // fallback LS
  }
  return readLocalStorageQueue();
}

export async function clearLocalOpsData(restaurantId) {
  await initOfflineFoundation();
  if (restaurantId) {
    await idbDelete(STORES.catalog, restaurantId);
    await idbDelete(STORES.tables, restaurantId);
    await idbDelete(STORES.meta, `cashier_report:${restaurantId}`);
    await idbDelete(STORES.meta, `delivery_areas:${restaurantId}`);
    const dateKey = new Date().toISOString().slice(0, 10);
    await idbDelete(STORES.meta, `cash_session:${restaurantId}:${dateKey}`);
    await idbDelete(STORES.meta, `cash_movements:${restaurantId}:${dateKey}`);
    await idbDelete(STORES.meta, `cash_session:${restaurantId}:main:${dateKey}`);
    await idbDelete(STORES.meta, `cash_movements:${restaurantId}:main:${dateKey}`);
    const auditRows = await idbGetAllByIndex(STORES.auditLogs, "tenantId", restaurantId);
    for (const row of auditRows) await idbDelete(STORES.auditLogs, row.uuid);
    const orders = await listLocalOrders(restaurantId);
    for (const order of orders) await idbDelete(STORES.orders, order.id);
    const tickets = await listLocalKitchenTickets(restaurantId);
    for (const ticket of tickets) await idbDelete(STORES.kitchenTickets, ticket.id);
  }
}

export async function saveCashierSnapshot(restaurantId, report) {
  if (!restaurantId || !report) return null;
  await initOfflineFoundation();
  return idbPut(STORES.meta, {
    key: `cashier_report:${restaurantId}`,
    report,
    savedAt: new Date().toISOString(),
  });
}

export async function loadCashierSnapshot(restaurantId) {
  if (!restaurantId) return null;
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.meta, `cashier_report:${restaurantId}`);
    return row?.report || null;
  } catch {
    return null;
  }
}

export async function saveDeliveryAreasSnapshot(restaurantId, areas = []) {
  if (!restaurantId) return null;
  await initOfflineFoundation();
  return idbPut(STORES.meta, {
    key: `delivery_areas:${restaurantId}`,
    areas,
    savedAt: new Date().toISOString(),
  });
}

export async function loadDeliveryAreasSnapshot(restaurantId) {
  if (!restaurantId) return null;
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.meta, `delivery_areas:${restaurantId}`);
    if (!row) return null;
    return {
      areas: Array.isArray(row.areas) ? row.areas : [],
      savedAt: row.savedAt,
    };
  } catch {
    return null;
  }
}
