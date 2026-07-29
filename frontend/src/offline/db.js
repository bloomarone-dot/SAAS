/**
 * Couche IndexedDB — Phase 1 offline restaurant.
 * Sans dépendance externe (API native).
 */

const DB_NAME = "bloomar_offline_v1";
const DB_VERSION = 1;

const STORES = {
  meta: "meta",
  catalog: "catalog",
  tables: "tables",
  orders: "orders",
  kitchenTickets: "kitchenTickets",
  syncQueue: "syncQueue",
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    dbPromise = Promise.reject(new Error("IndexedDB indisponible"));
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.catalog)) {
        db.createObjectStore(STORES.catalog, { keyPath: "restaurantId" });
      }
      if (!db.objectStoreNames.contains(STORES.tables)) {
        db.createObjectStore(STORES.tables, { keyPath: "restaurantId" });
      }
      if (!db.objectStoreNames.contains(STORES.orders)) {
        const orders = db.createObjectStore(STORES.orders, { keyPath: "id" });
        orders.createIndex("restaurantId", "restaurantId", { unique: false });
        orders.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.kitchenTickets)) {
        const tickets = db.createObjectStore(STORES.kitchenTickets, { keyPath: "id" });
        tickets.createIndex("restaurantId", "restaurantId", { unique: false });
        tickets.createIndex("orderId", "orderId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.syncQueue)) {
        db.createObjectStore(STORES.syncQueue, { keyPath: "id" });
      }
    };
  });

  return dbPromise;
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try {
      result = fn(store);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      Promise.resolve(result).then(resolve).catch(reject);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction IndexedDB annulée"));
  });
}

export async function idbPut(storeName, value) {
  await withStore(storeName, "readwrite", (store) => store.put(value));
  return value;
}

export async function idbGet(storeName, key) {
  return withStore(storeName, "readonly", (store) => reqToPromise(store.get(key)));
}

export async function idbGetAll(storeName) {
  return withStore(storeName, "readonly", (store) => reqToPromise(store.getAll()));
}

export async function idbDelete(storeName, key) {
  await withStore(storeName, "readwrite", (store) => store.delete(key));
}

export async function idbClear(storeName) {
  await withStore(storeName, "readwrite", (store) => store.clear());
}

export async function idbGetAllByIndex(storeName, indexName, query) {
  return withStore(storeName, "readonly", (store) => {
    const index = store.index(indexName);
    return reqToPromise(index.getAll(query));
  });
}

export { STORES, openDb };
