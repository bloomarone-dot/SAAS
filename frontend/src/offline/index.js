export {
  initOfflineFoundation,
  isOfflineFoundationReady,
  saveCatalogSnapshot,
  loadCatalogSnapshot,
  saveTablesSnapshot,
  loadTablesSnapshot,
  saveCashierSnapshot,
  loadCashierSnapshot,
  saveDeliveryAreasSnapshot,
  loadDeliveryAreasSnapshot,
  upsertLocalOrder,
  listLocalOrders,
  upsertLocalKitchenTicket,
  listLocalKitchenTickets,
  persistSyncQueue,
  loadSyncQueueDurable,
  clearLocalOpsData,
} from "@/offline/store";

export {
  newLocalId,
  isLocalId,
  mirrorOrderLocal,
  mirrorTicketsLocal,
  createLocalTable,
  remapLocalTableId,
  createLocalTableOrder,
  getLocalOrder,
  remapLocalOrderId,
  updateLocalOrderItems,
  sendLocalOrderToKitchen,
  advanceLocalTicket,
  closeLocalOrderForBill,
  markLocalOrderServed,
  loadKitchenTicketsMerged,
  removeLocalTicket,
  mirrorCashierReport,
  loadCashierReportMerged,
  payLocalCashOrder,
  OFFLINE_CASH_METHODS,
  scopeCashierReport,
  claimLocalOrderForCashier,
  scopeOrdersForCashier,
} from "@/offline/ops";

export {
  connectRestaurantRealtime,
  onRestaurantRealtime,
  isKitchenRealtimeEvent,
  isCashierRealtimeEvent,
} from "@/offline/realtime";

export {
  saveCachedSession,
  loadCachedSession,
  clearCachedSession,
  isAccessTokenUsable,
  saveCachedBranding,
  loadCachedBranding,
  clearCachedBranding,
} from "@/offline/sessionCache";

export { warmupOfflineCache } from "@/offline/warmup";

export {
  flushOfflineQueue,
  enqueueOfflineAction,
  readOfflineQueue,
  clearOfflineQueue,
  discardFailedOfflineActions,
  retryFailedOfflineActions,
  getOfflineQueueStats,
  dedupeQueue,
} from "@/offline/sync";

export {
  MAX_QUEUE_SIZE,
  MAX_ATTEMPTS,
  isConflictResolved,
  sortQueueForFlush,
} from "@/offline/syncHelpers";
