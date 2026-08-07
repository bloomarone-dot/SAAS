/**
 * Analytics admin Offline First — KPI, graphiques et rapports depuis IndexedDB.
 * Aucun appel réseau requis : commandes locales + snapshot caisse + tickets cuisine.
 */

import {
  initOfflineFoundation,
  listLocalKitchenTickets,
  listLocalOrders,
  loadCashierSnapshot,
  loadTablesSnapshot,
} from "@/offline/store";
import { idbGet, idbPut, STORES } from "@/offline/db";
import { loadCachedBranding } from "@/offline/sessionCache";
import {
  getCachedMenuCatalogAsync,
  getCachedRestaurantMetaAsync,
  getCachedStaffUsersAsync,
} from "@/utils/offlineCache";
import {
  periodBounds,
  orderActivityAt,
  isPaidOrder,
  isCancelledOrder,
  mergeLocalOrders,
  filterOrdersInRange,
  computeHourlySales,
  computeTopProducts,
  computeTopCategories,
  computePaymentMethods,
  computeEmployeePerformance,
  computeMealVsDrink,
  computeRealtimeOrders,
  computeKitchenStats,
  computeTableStats,
  computeCashDrawer,
  computeDiscountsAndVat,
  computeSalesChart,
  computeLocalAnalytics,
  computeLocalHomeInsights,
  computeRecentActivities,
  computeLocalDailyReport,
} from "./adminAnalyticsCore.js";

export * from "./adminAnalyticsCore.js";


const ANALYTICS_CACHE_KEY = (id) => `admin_analytics_snapshot:${id}`;

export async function cacheAdminAnalyticsSnapshot(restaurantId, payload) {
  if (!restaurantId || !payload) return;
  await initOfflineFoundation();
  await idbPut(STORES.meta, {
    key: ANALYTICS_CACHE_KEY(restaurantId),
    payload,
    savedAt: new Date().toISOString(),
  });
}

export async function loadAdminAnalyticsSnapshot(restaurantId) {
  if (!restaurantId) return null;
  try {
    await initOfflineFoundation();
    const row = await idbGet(STORES.meta, ANALYTICS_CACHE_KEY(restaurantId));
    return row?.payload || null;
  } catch {
    return null;
  }
}

export async function loadAdminWorkspaceData(restaurantId) {
  if (!restaurantId) return null;
  await initOfflineFoundation();
  const [
    localOrders,
    cashierSnapshot,
    tablesSnapshot,
    tickets,
    menu,
    staff,
    meta,
    branding,
  ] = await Promise.all([
    listLocalOrders(restaurantId),
    loadCashierSnapshot(restaurantId),
    loadTablesSnapshot(restaurantId),
    listLocalKitchenTickets(restaurantId),
    getCachedMenuCatalogAsync(restaurantId),
    getCachedStaffUsersAsync(restaurantId),
    getCachedRestaurantMetaAsync(restaurantId),
    Promise.resolve(loadCachedBranding(restaurantId)),
  ]);

  const orders = mergeLocalOrders(localOrders, cashierSnapshot);
  const vatRate = meta?.settings?.vat_rate ?? meta?.settings?.tax_rate ?? branding?.vat_rate ?? 0;

  return {
    orders,
    menu,
    staff,
    tables: tablesSnapshot,
    tickets,
    cashierSnapshot,
    meta,
    branding,
    vatRate,
  };
}

export async function computeAdminAnalyticsLocal(restaurantId, options = {}) {
  const workspace = await loadAdminWorkspaceData(restaurantId);
  if (!workspace) return null;
  const payload = computeLocalAnalytics({
    orders: workspace.orders,
    menu: workspace.menu,
    staff: workspace.staff,
    tables: workspace.tables,
    tickets: workspace.tickets,
    cashierSnapshot: workspace.cashierSnapshot,
    vatRate: workspace.vatRate,
    ...options,
  });
  await cacheAdminAnalyticsSnapshot(restaurantId, payload);
  return payload;
}

export async function computeAdminInsightsLocal(restaurantId, options = {}) {
  const workspace = await loadAdminWorkspaceData(restaurantId);
  if (!workspace) return { cards: [], time_label: "", recent_activities: [] };
  return {
    ...computeLocalHomeInsights({
      orders: workspace.orders,
      menu: workspace.menu,
      branchId: options.branchId || "",
    }),
    recent_activities: computeRecentActivities(workspace.orders),
  };
}

export async function computeAdminDailyReportLocal(restaurantId, options = {}) {
  const workspace = await loadAdminWorkspaceData(restaurantId);
  if (!workspace) return null;
  return computeLocalDailyReport({
    orders: workspace.orders,
    menu: workspace.menu,
    staff: workspace.staff,
    restaurantName: workspace.branding?.name || workspace.meta?.settings?.name,
    branchId: options.branchId || "",
    vatRate: workspace.vatRate,
  });
}
