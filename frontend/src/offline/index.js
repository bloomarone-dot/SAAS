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
  createLocalCashierDelivery,
  validateLocalDeliveryPayment,
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
  restoreLocalSession,
  SYNC_STATUS,
} from "@/offline/sessionCache";

export { warmupOfflineCache } from "@/offline/warmup";

export {
  bootstrapOfflineFirst,
  hydrateLocalWorkspace,
  refreshSessionBackground,
  runBackgroundSync,
  restoreOfflineState,
} from "@/offline/bootstrap";

export { loadLocalFirst, applySyncCache } from "@/offline/localFirst";

export { startSyncEngine, stopSyncEngine, resetSyncBackoff, getSyncBackoffMs } from "@/offline/syncEngine";

export { OfflineQueryProvider, offlineQueryClient } from "@/offline/queryClient.jsx";

export {
  computeAdminAnalyticsLocal,
  computeAdminDailyReportLocal,
  computeAdminInsightsLocal,
  computeLocalAnalytics,
  loadAdminAnalyticsSnapshot,
  loadAdminWorkspaceData,
  cacheAdminAnalyticsSnapshot,
} from "@/offline/adminAnalytics";

export {
  loadLocalCashSession,
  loadCashSessionMerged,
  openLocalCashSession,
  closeLocalCashSession,
  resumeLocalCashSession,
  addLocalCashMovement,
  cancelLocalPayment,
  CashSessionConflictError,
  MOVEMENT_TYPES,
  DEFAULT_REGISTER_ID,
} from "@/offline/cashSession";

export {
  buildCashSessionView,
  businessDateKey,
  canOpenCashSession,
  canCloseCashSession,
  computeReceiptTotals,
  sumCashMovementImpact,
} from "@/offline/cashSessionCore";

export { getDeviceId, withDeviceMeta } from "@/offline/deviceId";

export {
  appendAuditLog,
  loadAuditLog,
  countAuditLog,
  AUDIT_ACTIONS,
} from "@/offline/auditLog";

export {
  nextLocalTicketNumber,
  formatTicketNumber,
  peekTicketSequence,
  getTicketPrefix,
  saveTicketPrefix,
} from "@/offline/ticketSequence";

export {
  CONFLICT_STRATEGIES,
  resolveOrderItemsConflict,
  resolvePaymentConflict,
  resolvePaymentCancelConflict,
  resolveCashSessionCloseConflict,
  resolveTicketNumberConflict,
} from "@/offline/conflictResolution";

export {
  evaluateCashSessionAccess,
  applySessionLock,
  MANAGER_ROLES,
} from "@/offline/cashSessionLockCore";

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
