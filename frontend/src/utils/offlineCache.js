import {
  idbGet,
  idbPut,
  STORES,
} from "@/offline/db";
import {
  initOfflineFoundation,
  loadCatalogSnapshot,
  loadDeliveryAreasSnapshot,
  loadTablesSnapshot,
  saveCatalogSnapshot,
  saveDeliveryAreasSnapshot,
  saveTablesSnapshot,
} from "@/offline/store";

const MENU_KEY = "offline_menu_cache";
const TABLES_KEY = "offline_tables_cache";
const AREAS_KEY = "offline_delivery_areas_cache";
const STAFF_KEY = "offline_staff_users_cache";
const META_KEY = "offline_restaurant_meta_cache";

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, restaurantId, payload) {
  localStorage.setItem(
    key,
    JSON.stringify({
      restaurantId,
      savedAt: new Date().toISOString(),
      payload,
    }),
  );
}

/** Cache menu : localStorage (sync) + IndexedDB (durable). */
export function cacheMenuCatalog(restaurantId, categories, dishes) {
  if (!restaurantId) return;
  write(MENU_KEY, restaurantId, { categories, dishes });
  saveCatalogSnapshot(restaurantId, { categories, dishes }).catch(() => {});
}

/** À appeler après création / modification / suppression d'un plat. */
export function clearMenuCatalogCache() {
  try {
    localStorage.removeItem(MENU_KEY);
  } catch {
    /* ignore */
  }
}

export function getCachedMenuCatalog(restaurantId) {
  const data = read(MENU_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  // Reprise async depuis IndexedDB (remplit le LS pour les prochains appels).
  loadCatalogSnapshot(restaurantId)
    .then((snapshot) => {
      if (!snapshot) return;
      write(MENU_KEY, restaurantId, {
        categories: snapshot.categories,
        dishes: snapshot.dishes,
      });
    })
    .catch(() => {});
  return null;
}

/** Version async préférée (Phase 2+). */
export async function getCachedMenuCatalogAsync(restaurantId) {
  const data = read(MENU_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  const snapshot = await loadCatalogSnapshot(restaurantId);
  if (!snapshot) return null;
  write(MENU_KEY, restaurantId, {
    categories: snapshot.categories,
    dishes: snapshot.dishes,
  });
  return {
    categories: snapshot.categories,
    dishes: snapshot.dishes,
  };
}

export function cacheTables(restaurantId, tables) {
  if (!restaurantId) return;
  write(TABLES_KEY, restaurantId, tables);
  saveTablesSnapshot(restaurantId, tables).catch(() => {});
}

export function getCachedTables(restaurantId) {
  const data = read(TABLES_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  loadTablesSnapshot(restaurantId)
    .then((snapshot) => {
      if (!snapshot) return;
      write(TABLES_KEY, restaurantId, snapshot.tables);
    })
    .catch(() => {});
  return null;
}

export async function getCachedTablesAsync(restaurantId) {
  const data = read(TABLES_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  const snapshot = await loadTablesSnapshot(restaurantId);
  if (!snapshot) return null;
  write(TABLES_KEY, restaurantId, snapshot.tables);
  return snapshot.tables;
}

/** Cache quartiers / frais livraison : localStorage + IndexedDB. */
export function cacheDeliveryAreas(restaurantId, areas) {
  if (!restaurantId || !Array.isArray(areas)) return;
  write(AREAS_KEY, restaurantId, areas);
  saveDeliveryAreasSnapshot(restaurantId, areas).catch(() => {});
}

export function getCachedDeliveryAreas(restaurantId) {
  const data = read(AREAS_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  loadDeliveryAreasSnapshot(restaurantId)
    .then((snapshot) => {
      if (!snapshot) return;
      write(AREAS_KEY, restaurantId, snapshot.areas);
    })
    .catch(() => {});
  return null;
}

export async function getCachedDeliveryAreasAsync(restaurantId) {
  const data = read(AREAS_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  const snapshot = await loadDeliveryAreasSnapshot(restaurantId);
  if (!snapshot) return null;
  write(AREAS_KEY, restaurantId, snapshot.areas);
  return snapshot.areas;
}

export function cacheStaffUsers(restaurantId, users) {
  if (!restaurantId || !Array.isArray(users)) return;
  write(STAFF_KEY, restaurantId, users);
  initOfflineFoundation()
    .then(() =>
      idbPut(STORES.meta, {
        key: `staff_users:${restaurantId}`,
        users,
        savedAt: new Date().toISOString(),
      }),
    )
    .catch(() => {});
}

export async function getCachedStaffUsersAsync(restaurantId) {
  const data = read(STAFF_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.meta, `staff_users:${restaurantId}`);
    if (!row?.users) return null;
    write(STAFF_KEY, restaurantId, row.users);
    return row.users;
  } catch {
    return null;
  }
}

/** Branding + paramètres restaurant (fusion partielle). */
export function cacheRestaurantMeta(restaurantId, patch = {}) {
  if (!restaurantId || !patch) return;
  const current = read(META_KEY);
  const prev =
    current && current.restaurantId === restaurantId && current.payload ? current.payload : {};
  const next = { ...prev, ...patch };
  write(META_KEY, restaurantId, next);
  initOfflineFoundation()
    .then(() =>
      idbPut(STORES.meta, {
        key: `restaurant_meta:${restaurantId}`,
        meta: next,
        savedAt: new Date().toISOString(),
      }),
    )
    .catch(() => {});
}

export async function getCachedRestaurantMetaAsync(restaurantId) {
  const data = read(META_KEY);
  if (data && data.restaurantId === restaurantId) {
    return data.payload;
  }
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.meta, `restaurant_meta:${restaurantId}`);
    if (!row?.meta) return null;
    write(META_KEY, restaurantId, row.meta);
    return row.meta;
  } catch {
    return null;
  }
}
