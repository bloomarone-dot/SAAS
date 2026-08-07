/**
 * Bootstrap Offline First — l'application ne dépend jamais du serveur pour démarrer.
 * 1. Session locale immédiate (JWT + profil cache)
 * 2. Hydratation IndexedDB / localStorage
 * 3. Refresh réseau en arrière-plan uniquement
 */

import { apiFetch } from "@/config/http";
import { resolveApiBaseUrl, isApiReachable } from "@/config/api";
import { isNetworkError, markEffectiveOffline, shouldPreferLocalData } from "@/utils/network";
import {
  getCachedMenuCatalogAsync,
  getCachedRestaurantMetaAsync,
  getCachedTablesAsync,
  getCachedDeliveryAreasAsync,
  getCachedStaffUsersAsync,
  getCachedPaymentModesAsync,
} from "@/utils/offlineCache";
import {
  isAccessTokenUsable,
  loadCachedSession,
  loadCachedBranding,
  saveCachedSession,
  restoreLocalSession,
  SYNC_STATUS,
} from "@/offline/sessionCache";
import { initOfflineFoundation } from "@/offline/store";
import { warmupOfflineCache } from "@/offline/warmup";
import { flushOfflineQueue, getOfflineQueueStats } from "@/offline/sync";
import { computeAdminAnalyticsLocal } from "@/offline/adminAnalytics";
import { restoreOfflineState } from "@/offline/restoreState";

export { restoreLocalSession, SYNC_STATUS } from "@/offline/sessionCache";
export { restoreOfflineState } from "./restoreState";

/**
 * Charge toutes les ressources métier depuis le cache local (IndexedDB + LS).
 */
export async function hydrateLocalWorkspace(restaurantId) {
  if (!restaurantId) return { ready: false, details: {} };

  await initOfflineFoundation().catch(() => {});

  const [menu, tables, areas, staff, meta, branding, paymentModes] = await Promise.all([
    getCachedMenuCatalogAsync(restaurantId).catch(() => null),
    getCachedTablesAsync(restaurantId).catch(() => null),
    getCachedDeliveryAreasAsync(restaurantId).catch(() => null),
    getCachedStaffUsersAsync(restaurantId).catch(() => null),
    getCachedRestaurantMetaAsync(restaurantId).catch(() => null),
    Promise.resolve(loadCachedBranding(restaurantId)),
    getCachedPaymentModesAsync(restaurantId).catch(() => null),
  ]);

  const ready = Boolean(
    (menu?.categories?.length || menu?.dishes?.length)
    && Array.isArray(tables),
  );

  return {
    ready,
    details: {
      menu: Boolean(menu?.dishes?.length),
      tables: Array.isArray(tables) ? tables.length : 0,
      areas: Array.isArray(areas) ? areas.length : 0,
      staff: Array.isArray(staff) ? staff.length : 0,
      branding: Boolean(branding || meta?.branding),
      settings: Boolean(meta?.settings),
      paymentModes: Boolean(paymentModes),
    },
  };
}

/**
 * Refresh session serveur — jamais bloquant, jamais logout sur erreur réseau.
 */
export async function refreshSessionBackground({ onUser } = {}) {
  try {
    await resolveApiBaseUrl().catch(() => {});
    if (shouldPreferLocalData() && !isApiReachable()) {
      markEffectiveOffline("refresh_session");
      return { ok: false, reason: "offline" };
    }
    const user = await apiFetch("/api/v1/auth/me", {
      fallback: "Session serveur indisponible.",
      timeout: 4_000,
      softAuth: true,
    });
    if (user?.id) {
      saveCachedSession(user);
      onUser?.(user, { offline: false });
      return { ok: true, user };
    }
    return { ok: false, reason: "empty" };
  } catch (error) {
    if (isNetworkError(error)) {
      markEffectiveOffline("refresh_session");
      return { ok: false, reason: "network" };
    }
    return { ok: false, reason: "auth", error };
  }
}

/**
 * Sync Engine — warmup cache + flush queue. Toujours non bloquant.
 */
export async function runBackgroundSync(restaurantId, apiBaseUrl) {
  const stats = getOfflineQueueStats();
  let flushResult = { synced: 0, remaining: stats.total, failed: stats.failed };

  try {
    await resolveApiBaseUrl({ force: true }).catch(() => {});
    if (isApiReachable() || navigator.onLine) {
      flushResult = await flushOfflineQueue(apiBaseUrl);
    }
    if (restaurantId) {
      await computeAdminAnalyticsLocal(restaurantId).catch(() => {});
    }
    if (restaurantId && (isApiReachable() || navigator.onLine)) {
      await warmupOfflineCache(restaurantId).catch(() => {});
      await computeAdminAnalyticsLocal(restaurantId).catch(() => {});
    }
  } catch {
    /* best effort */
  }

  return flushResult;
}

/**
 * Point d'entrée bootstrap : session immédiate + hydratation + sync arrière-plan.
 */
export async function bootstrapOfflineFirst({ onSession, onHydrated, apiBaseUrl }) {
  await initOfflineFoundation().catch(() => {});

  const restored = restoreLocalSession();
  if (restored?.user) {
    onSession?.(restored.user, { immediate: true, offline: shouldPreferLocalData() });
    const [hydrated, offlineState] = await Promise.all([
      hydrateLocalWorkspace(restored.user.restaurant_id),
      restoreOfflineState(restored.user.restaurant_id, { userId: restored.user.id }).catch(() => null),
    ]);
    onHydrated?.({ ...hydrated, offlineState });

    refreshSessionBackground({
      onUser: (user) => onSession?.(user, { immediate: false, offline: false }),
    }).catch(() => {});

    if (restored.user.restaurant_id) {
      runBackgroundSync(restored.user.restaurant_id, apiBaseUrl).catch(() => {});
    }

    return { opened: true, source: "local", hydrated };
  }

  return { opened: false, source: "none" };
}
