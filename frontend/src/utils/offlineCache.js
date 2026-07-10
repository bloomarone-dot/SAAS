const MENU_KEY = "offline_menu_cache";
const TABLES_KEY = "offline_tables_cache";

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
    })
  );
}

export function cacheMenuCatalog(restaurantId, categories, dishes) {
  if (!restaurantId) return;
  write(MENU_KEY, restaurantId, { categories, dishes });
}

export function getCachedMenuCatalog(restaurantId) {
  const data = read(MENU_KEY);
  if (!data || data.restaurantId !== restaurantId) return null;
  return data.payload;
}

export function cacheTables(restaurantId, tables) {
  if (!restaurantId) return;
  write(TABLES_KEY, restaurantId, tables);
}

export function getCachedTables(restaurantId) {
  const data = read(TABLES_KEY);
  if (!data || data.restaurantId !== restaurantId) return null;
  return data.payload;
}
