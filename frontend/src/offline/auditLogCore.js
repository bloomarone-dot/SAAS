/**
 * Journal d'audit local — structures et helpers purs.
 */

export const AUDIT_ACTIONS = {
  APP_RESTORE: "app.restore",
  APP_CONNECT: "connection.online",
  APP_DISCONNECT: "connection.offline",
  CASH_SESSION_OPEN: "cash_session.open",
  CASH_SESSION_CLOSE: "cash_session.close",
  CASH_SESSION_RESUME: "cash_session.resume",
  CASH_SESSION_CONFLICT: "cash_session.conflict",
  CASH_MOVEMENT: "cash.movement",
  PAYMENT: "payment.record",
  PAYMENT_CANCEL: "payment.cancel",
  REFUND: "payment.refund",
  RECEIPT_PRINT: "receipt.print",
  SYNC_START: "sync.start",
  SYNC_SUCCESS: "sync.success",
  SYNC_ERROR: "sync.error",
  ORDER_CREATE: "order.create",
};

export const MAX_AUDIT_ENTRIES = 5000;

export function auditLogMetaKey(tenantId) {
  return `audit_log:${tenantId}`;
}

export function trimAuditEntries(entries, max = MAX_AUDIT_ENTRIES) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

export function buildAuditEntry({
  uuid,
  tenantId,
  userId = null,
  action,
  resource = null,
  timestamp,
  deviceId,
  syncStatus = "LOCAL",
  details = null,
}) {
  return {
    uuid,
    tenantId,
    userId,
    action,
    resource,
    timestamp,
    deviceId,
    syncStatus,
    details,
  };
}
