/**
 * Warm-up cache après connexion réussie (P0.2).
 * Télécharge et persiste les données indispensables au service hors ligne.
 */

import { apiFetch } from "@/config/http";
import { menuApi } from "@/modules/menu/services/menuApi";
import { orderApi } from "@/modules/orders/services/orderApi";
import { tableApi } from "@/modules/menu/services/tableApi";
import {
  cacheDeliveryAreas,
  cacheMenuCatalog,
  cacheRestaurantMeta,
  cacheStaffUsers,
  cacheTables,
} from "@/utils/offlineCache";
import { saveCachedBranding } from "@/offline/sessionCache";
import { mirrorCashierReport, mirrorTicketsLocal } from "@/offline/ops";
import { kitchenApi } from "@/modules/menu/services/kitchenApi";

let warmupInFlight = null;

async function warmMenu(restaurantId) {
  const fetchedCategories = await menuApi.getCategories(restaurantId);
  const activeCategories = fetchedCategories.filter((item) => item.is_active !== false);
  const groups = await Promise.all(
    activeCategories.map((category) => menuApi.getDishesByCategory(category.id, true).catch(() => [])),
  );
  const dishes = groups.flat().filter((dish) => dish.is_available !== false);
  cacheMenuCatalog(restaurantId, activeCategories, dishes);
  return { categories: activeCategories.length, dishes: dishes.length };
}

async function warmTables(restaurantId) {
  const tables = await tableApi.getTables(restaurantId);
  const list = Array.isArray(tables) ? tables : [];
  cacheTables(restaurantId, list);
  return list.length;
}

async function warmDeliveryAreas(restaurantId) {
  const areas = await orderApi.listDeliveryAreas();
  const list = Array.isArray(areas) ? areas : [];
  cacheDeliveryAreas(restaurantId, list);
  return list.length;
}

async function warmBranding(restaurantId) {
  try {
    const branding = await apiFetch("/api/v1/restaurants/me/branding", {
      fallback: "Branding indisponible.",
      timeout: 6_000,
    });
    saveCachedBranding(restaurantId, branding);
    cacheRestaurantMeta(restaurantId, { branding });
    return true;
  } catch {
    const settings = await apiFetch("/api/v1/restaurants/me", {
      fallback: "Paramètres restaurant indisponibles.",
      timeout: 6_000,
    });
    saveCachedBranding(restaurantId, settings);
    cacheRestaurantMeta(restaurantId, { branding: settings, settings });
    return true;
  }
}

async function warmSettings(restaurantId) {
  try {
    const settings = await apiFetch("/api/v1/restaurants/me", {
      fallback: "Paramètres restaurant indisponibles.",
      timeout: 6_000,
    });
    cacheRestaurantMeta(restaurantId, { settings });
    return true;
  } catch {
    return false;
  }
}

async function warmUsers(restaurantId) {
  const users = await apiFetch("/api/v1/users", {
    fallback: "Personnel indisponible.",
    timeout: 8_000,
  });
  const list = Array.isArray(users) ? users : [];
  cacheStaffUsers(restaurantId, list);
  return list.length;
}

async function warmKitchenTickets(restaurantId) {
  const tickets = await kitchenApi.getActiveTickets();
  await mirrorTicketsLocal(tickets || [], restaurantId);
  return (tickets || []).length;
}

async function warmCashierReport(restaurantId) {
  const report = await orderApi.cashierReport();
  await mirrorCashierReport(report, restaurantId);
  return true;
}

/**
 * Précharge le cache local. Idempotent et non bloquant pour l'UI (best effort).
 * @returns {Promise<{ ok: boolean, details: Record<string, unknown> }>}
 */
export async function warmupOfflineCache(restaurantId, { includeCashier = true } = {}) {
  if (!restaurantId) return { ok: false, details: { reason: "no_restaurant" } };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, details: { reason: "offline" } };
  }
  if (warmupInFlight) return warmupInFlight;

  warmupInFlight = (async () => {
    const details = {};
    const tasks = [
      ["menu", () => warmMenu(restaurantId)],
      ["tables", () => warmTables(restaurantId)],
      ["deliveryAreas", () => warmDeliveryAreas(restaurantId)],
      ["branding", () => warmBranding(restaurantId)],
      ["settings", () => warmSettings(restaurantId)],
      ["users", () => warmUsers(restaurantId)],
      ["kitchenTickets", () => warmKitchenTickets(restaurantId)],
    ];
    if (includeCashier) {
      tasks.push(["cashierReport", () => warmCashierReport(restaurantId)]);
    }

    const settled = await Promise.allSettled(
      tasks.map(async ([key, fn]) => {
        const value = await fn();
        details[key] = { ok: true, value };
        return value;
      }),
    );

    settled.forEach((result, index) => {
      const key = tasks[index][0];
      if (result.status === "rejected") {
        details[key] = { ok: false, error: String(result.reason?.message || result.reason) };
      }
    });

    const ok = Boolean(details.menu?.ok && details.tables?.ok);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("offline-warmup-finished", { detail: { ok, restaurantId, details } }),
      );
    }
    return { ok, details };
  })().finally(() => {
    warmupInFlight = null;
  });

  return warmupInFlight;
}
