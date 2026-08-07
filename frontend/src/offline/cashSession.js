/**
 * Session de caisse offline-first — ouverture, clôture, verrouillage, mouvements, remboursements.
 */

import { enqueueOfflineAction } from "@/offline/sync";
import {
  initOfflineFoundation,
  loadCashierSnapshot,
  saveCashierSnapshot,
  upsertLocalOrder,
} from "@/offline/store";
import { idbGet, idbPut, STORES } from "@/offline/db";
import {
  buildCashSessionView,
  businessDateKey,
  canCloseCashSession,
  cashMovementsLegacyMetaKey,
  cashMovementsMetaKey,
  cashSessionCloseKey,
  cashSessionLegacyMetaKey,
  cashSessionMetaKey,
  MOVEMENT_TYPES,
  pickAuthoritativeSession,
} from "@/offline/cashSessionCore.js";
import {
  applySessionLock,
  CashSessionConflictError,
  DEFAULT_REGISTER_ID,
  evaluateCashSessionAccess,
  normalizeRegisterId,
} from "@/offline/cashSessionLockCore.js";
import { orderPaymentBreakdown } from "@/modules/orders/utils/paymentReporting.js";
import { getDeviceId, withDeviceMeta } from "@/offline/deviceId";
import { appendAuditLog, AUDIT_ACTIONS } from "@/offline/auditLog";
import { resolveCashSessionCloseConflict } from "@/offline/conflictResolution.js";

function nowIso() {
  return new Date().toISOString();
}

function newLocalCashId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `local_cash_${crypto.randomUUID()}`;
  }
  return `local_cash_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function newMovementId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cashierNameOf(user) {
  if (!user) return null;
  const full = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return full || user.username || null;
}

function emitCashSessionChanged(detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cash-session-changed", { detail }));
  }
}

async function migrateLegacySessionIfNeeded(restaurantId, dateKey, registerId) {
  const legacyKey = cashSessionLegacyMetaKey(restaurantId, dateKey);
  const newKey = cashSessionMetaKey(restaurantId, dateKey, registerId);
  const legacy = await idbGet(STORES.meta, legacyKey);
  const current = await idbGet(STORES.meta, newKey);
  if (legacy?.session && !current?.session) {
    await idbPut(STORES.meta, {
      key: newKey,
      session: {
        ...legacy.session,
        cash_register_id: legacy.session.cash_register_id || registerId,
      },
      savedAt: legacy.savedAt,
    });
  }

  const legacyMovements = await idbGet(STORES.meta, cashMovementsLegacyMetaKey(restaurantId, dateKey));
  const newMovements = await idbGet(STORES.meta, cashMovementsMetaKey(restaurantId, dateKey, registerId));
  if (legacyMovements?.movements?.length && !newMovements?.movements?.length) {
    await idbPut(STORES.meta, {
      key: cashMovementsMetaKey(restaurantId, dateKey, registerId),
      movements: legacyMovements.movements,
      savedAt: legacyMovements.savedAt,
    });
  }
}

async function loadSessionRecord(restaurantId, dateKey = businessDateKey(), registerId = DEFAULT_REGISTER_ID) {
  if (!restaurantId) return null;
  await initOfflineFoundation();
  await migrateLegacySessionIfNeeded(restaurantId, dateKey, registerId);
  const row = await idbGet(STORES.meta, cashSessionMetaKey(restaurantId, dateKey, registerId));
  return row?.session || null;
}

async function saveSessionRecord(restaurantId, session, dateKey = businessDateKey(), registerId = DEFAULT_REGISTER_ID) {
  await initOfflineFoundation();
  await idbPut(STORES.meta, {
    key: cashSessionMetaKey(restaurantId, dateKey, registerId),
    session,
    savedAt: nowIso(),
  });
  return session;
}

async function loadMovementRecords(restaurantId, dateKey = businessDateKey(), registerId = DEFAULT_REGISTER_ID) {
  if (!restaurantId) return [];
  await initOfflineFoundation();
  await migrateLegacySessionIfNeeded(restaurantId, dateKey, registerId);
  const row = await idbGet(STORES.meta, cashMovementsMetaKey(restaurantId, dateKey, registerId));
  return Array.isArray(row?.movements) ? row.movements : [];
}

async function saveMovementRecords(restaurantId, movements, dateKey = businessDateKey(), registerId = DEFAULT_REGISTER_ID) {
  await initOfflineFoundation();
  await idbPut(STORES.meta, {
    key: cashMovementsMetaKey(restaurantId, dateKey, registerId),
    movements,
    savedAt: nowIso(),
  });
  return movements;
}

function remoteToLocalSession(remote, restaurantId, registerId = DEFAULT_REGISTER_ID) {
  if (!remote || remote.status === "NONE") return null;
  return {
    id: remote.id || newLocalCashId(),
    localId: remote.id || newLocalCashId(),
    restaurant_id: restaurantId,
    tenantId: restaurantId,
    cash_register_id: registerId,
    business_date: remote.business_date || businessDateKey(),
    status: remote.status,
    opening_float: Number(remote.opening_float || 0),
    closing_counted: remote.closing_counted ?? null,
    opening_notes: remote.opening_notes || null,
    closing_notes: remote.closing_notes || null,
    opened_at: remote.opened_at || null,
    closed_at: remote.closed_at || null,
    opened_by_name: remote.opened_by_name || null,
    closed_by_name: remote.closed_by_name || null,
    syncStatus: remote.id && !String(remote.id).startsWith("local_") ? "SYNCED" : "PENDING_SYNC",
  };
}

async function resolveReceipts(restaurantId, receipts) {
  if (Array.isArray(receipts)) return receipts;
  const snapshot = await loadCashierSnapshot(restaurantId);
  return snapshot?.receipts || [];
}

function appendStatusHistory(order, entry) {
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  return { ...order, status_history: [...history, entry] };
}

export async function loadLocalCashSession(
  restaurantId,
  { receipts = null, dateKey = businessDateKey(), registerId = DEFAULT_REGISTER_ID } = {},
) {
  const session = await loadSessionRecord(restaurantId, dateKey, registerId);
  const movements = await loadMovementRecords(restaurantId, dateKey, registerId);
  const receiptList = await resolveReceipts(restaurantId, receipts);
  return buildCashSessionView(session, receiptList, movements);
}

export async function loadCashSessionMerged(
  restaurantId,
  remoteSession = null,
  { receipts = null, dateKey = businessDateKey(), registerId = DEFAULT_REGISTER_ID } = {},
) {
  if (!restaurantId) {
    return buildCashSessionView(null, [], []);
  }

  const localSession = await loadSessionRecord(restaurantId, dateKey, registerId);
  const remoteLocal = remoteSession ? remoteToLocalSession(remoteSession, restaurantId, registerId) : null;
  let authoritative = pickAuthoritativeSession(localSession, remoteLocal);

  if (localSession?.status === "CLOSED" && remoteLocal?.status === "CLOSED") {
    const resolved = resolveCashSessionCloseConflict(localSession, remoteLocal);
    authoritative = resolved.winner;
  }

  if (authoritative && authoritative !== localSession) {
    await saveSessionRecord(restaurantId, authoritative, dateKey, registerId);
  }

  const movements = await loadMovementRecords(restaurantId, dateKey, registerId);
  const receiptList = await resolveReceipts(restaurantId, receipts);
  return buildCashSessionView(authoritative || localSession, receiptList, movements);
}

export async function resumeLocalCashSession({
  restaurantId,
  cashier = null,
  receipts = null,
  registerId = DEFAULT_REGISTER_ID,
} = {}) {
  const dateKey = businessDateKey();
  const register = normalizeRegisterId(registerId);
  const existing = await loadSessionRecord(restaurantId, dateKey, register);
  if (!existing || String(existing.status).toUpperCase() !== "OPEN") {
    throw new Error("Aucune session ouverte à reprendre.");
  }

  evaluateCashSessionAccess(existing, {
    userId: cashier?.id,
    deviceId: getDeviceId(),
    role: cashier?.role,
    forceResume: true,
  });

  const locked = applySessionLock(existing, {
    userId: cashier?.id,
    deviceId: getDeviceId(),
    userName: cashierNameOf(cashier),
  });

  await saveSessionRecord(restaurantId, locked, dateKey, register);

  await appendAuditLog({
    tenantId: restaurantId,
    userId: cashier?.id,
    action: AUDIT_ACTIONS.CASH_SESSION_RESUME,
    resource: locked.localId || locked.id,
    details: withDeviceMeta({ registerId: register }),
  });

  const view = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId: register });
  emitCashSessionChanged({ restaurantId, action: "resume", view });
  return view;
}

export async function openLocalCashSession({
  restaurantId,
  openingFloat,
  notes = null,
  cashier = null,
  cashRegisterId = null,
  receipts = null,
  forceResume = false,
} = {}) {
  if (!restaurantId) throw new Error("Restaurant introuvable.");
  const dateKey = businessDateKey();
  const registerId = normalizeRegisterId(cashRegisterId);
  const existing = await loadSessionRecord(restaurantId, dateKey, registerId);

  if (existing && String(existing.status).toUpperCase() === "OPEN") {
    const access = evaluateCashSessionAccess(existing, {
      userId: cashier?.id,
      deviceId: getDeviceId(),
      role: cashier?.role,
      forceResume,
    });

    if (access.action === "resume") {
      const view = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId });
      emitCashSessionChanged({ restaurantId, action: "resume", view });
      return view;
    }

    if (access.action === "takeover") {
      return resumeLocalCashSession({ restaurantId, cashier, receipts, registerId });
    }
  }

  const current = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId });
  if (current.status === "CLOSED") {
    throw new Error("La caisse du jour est déjà clôturée.");
  }

  const amount = Math.round(Number(openingFloat || 0));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Indiquez un fond de caisse valide.");
  }

  const localId = newLocalCashId();
  const openedAt = nowIso();
  const deviceId = getDeviceId();
  let session = {
    id: localId,
    localId,
    restaurant_id: restaurantId,
    tenantId: restaurantId,
    cash_register_id: registerId,
    business_date: dateKey,
    status: "OPEN",
    opening_float: amount,
    openingAmount: amount,
    opening_notes: notes?.trim() || null,
    opened_at: openedAt,
    createdAt: openedAt,
    opened_by_user_id: cashier?.id || null,
    cashierId: cashier?.id || null,
    opened_by_name: cashierNameOf(cashier),
    syncStatus: "PENDING_SYNC",
  };

  session = applySessionLock(session, {
    userId: cashier?.id,
    deviceId,
    userName: cashierNameOf(cashier),
  });

  await saveSessionRecord(restaurantId, session, dateKey, registerId);

  const payload = withDeviceMeta({
    opening_float: amount,
    notes: notes?.trim() || null,
    local_session_id: localId,
    cash_register_id: registerId,
  });

  enqueueOfflineAction({
    type: "cash_session_open",
    label: `Ouverture caisse ${amount} FCFA`,
    restaurantId,
    tenantId: restaurantId,
    deviceId,
    endpoint: "/api/v1/orders/cash-session/open",
    method: "POST",
    payload,
    idempotencyKey: `cash_session_open:${restaurantId}:${registerId}:${dateKey}:${localId}`,
    requests: [{
      path: "/api/v1/orders/cash-session/open",
      method: "POST",
      requiresAuth: true,
      body: payload,
    }],
  });

  await appendAuditLog({
    tenantId: restaurantId,
    userId: cashier?.id,
    action: AUDIT_ACTIONS.CASH_SESSION_OPEN,
    resource: localId,
    syncStatus: "PENDING_SYNC",
    details: payload,
  });

  const view = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId });
  emitCashSessionChanged({ restaurantId, action: "open", view });
  return view;
}

export async function closeLocalCashSession({
  restaurantId,
  closingCounted,
  notes = null,
  cashier = null,
  receipts = null,
  registerId = DEFAULT_REGISTER_ID,
} = {}) {
  if (!restaurantId) throw new Error("Restaurant introuvable.");
  const dateKey = businessDateKey();
  const register = normalizeRegisterId(registerId);
  const current = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId: register });
  if (!canCloseCashSession(current)) {
    throw new Error("Aucune session de caisse ouverte à clôturer.");
  }

  const session = await loadSessionRecord(restaurantId, dateKey, register);
  if (session?.locked_by_device_id && session.locked_by_device_id !== getDeviceId()) {
    const sameUser = session.opened_by_user_id === cashier?.id;
    if (!sameUser) {
      throw new CashSessionConflictError(
        "Cette caisse est verrouillée sur un autre appareil.",
        { session, canResume: sameUser },
      );
    }
  }

  const amount = Math.round(Number(closingCounted || 0));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Indiquez le montant compté en caisse.");
  }

  const closedAt = nowIso();
  const nextSession = {
    ...session,
    status: "CLOSED",
    closing_counted: amount,
    closingAmount: amount,
    closing_notes: notes?.trim() || null,
    closed_at: closedAt,
    closed_by_user_id: cashier?.id || null,
    closed_by_name: cashierNameOf(cashier),
    syncStatus: "PENDING_SYNC",
  };

  await saveSessionRecord(restaurantId, nextSession, dateKey, register);

  const payload = withDeviceMeta({
    closing_counted: amount,
    notes: notes?.trim() || null,
    local_session_id: session.localId || session.id,
    cash_register_id: register,
  });

  enqueueOfflineAction({
    type: "cash_session_close",
    label: `Clôture caisse ${amount} FCFA`,
    restaurantId,
    tenantId: restaurantId,
    deviceId: getDeviceId(),
    endpoint: "/api/v1/orders/cash-session/close",
    method: "POST",
    payload,
    idempotencyKey: cashSessionCloseKey(restaurantId, dateKey, register),
    requests: [{
      path: "/api/v1/orders/cash-session/close",
      method: "POST",
      requiresAuth: true,
      body: payload,
    }],
  });

  await appendAuditLog({
    tenantId: restaurantId,
    userId: cashier?.id,
    action: AUDIT_ACTIONS.CASH_SESSION_CLOSE,
    resource: session.localId || session.id,
    syncStatus: "PENDING_SYNC",
    details: { ...payload, variance: current.variance },
  });

  const view = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId: register });
  emitCashSessionChanged({ restaurantId, action: "close", view });
  return view;
}

export async function addLocalCashMovement({
  restaurantId,
  type,
  amount,
  note = null,
  cashier = null,
  receipts = null,
  registerId = DEFAULT_REGISTER_ID,
} = {}) {
  if (!restaurantId) throw new Error("Restaurant introuvable.");
  const dateKey = businessDateKey();
  const register = normalizeRegisterId(registerId);
  const current = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId: register });
  if (current.status !== "OPEN") {
    throw new Error("Ouvrez la caisse avant d'enregistrer un mouvement.");
  }

  const validTypes = Object.values(MOVEMENT_TYPES);
  if (!validTypes.includes(type)) {
    throw new Error("Type de mouvement invalide.");
  }

  const value = Math.round(Number(amount || 0));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Indiquez un montant valide.");
  }

  const session = await loadSessionRecord(restaurantId, dateKey, register);
  const movement = {
    id: newMovementId(),
    uuid: newMovementId(),
    tenantId: restaurantId,
    restaurant_id: restaurantId,
    cashSessionId: session?.localId || session?.id,
    session_id: session?.localId || session?.id,
    cash_register_id: register,
    type,
    amount: value,
    note: note?.trim() || null,
    created_at: nowIso(),
    createdAt: nowIso(),
    created_by_user_id: cashier?.id || null,
    created_by_name: cashierNameOf(cashier),
    deviceId: getDeviceId(),
    status: "PENDING_SYNC",
    syncStatus: "PENDING_SYNC",
  };

  const movements = [...await loadMovementRecords(restaurantId, dateKey, register), movement];
  await saveMovementRecords(restaurantId, movements, dateKey, register);

  enqueueOfflineAction({
    type: "cash_movement",
    label: `Mouvement caisse ${type} ${value} FCFA`,
    restaurantId,
    tenantId: restaurantId,
    deviceId: getDeviceId(),
    endpoint: "/api/v1/orders/cash-movements",
    method: "POST",
    payload: movement,
    idempotencyKey: `cash_movement:${movement.id}`,
  });

  await appendAuditLog({
    tenantId: restaurantId,
    userId: cashier?.id,
    action: type === MOVEMENT_TYPES.REFUND ? AUDIT_ACTIONS.REFUND : AUDIT_ACTIONS.CASH_MOVEMENT,
    resource: movement.id,
    syncStatus: "PENDING_SYNC",
    details: movement,
  });

  const view = await loadLocalCashSession(restaurantId, { receipts, dateKey, registerId: register });
  emitCashSessionChanged({ restaurantId, action: "movement", view });
  return { movement, view };
}

export async function cancelLocalPayment(order, {
  restaurantId,
  cashier = null,
  createRefundMovement = true,
  registerId = DEFAULT_REGISTER_ID,
} = {}) {
  if (!order?.id) throw new Error("Commande introuvable.");
  const rid = restaurantId || order.restaurant_id || order.restaurantId;
  if (!rid) throw new Error("Restaurant introuvable.");

  const paidStatuses = new Set(["Payée", "Payee"]);
  if (!paidStatuses.has(String(order.status || "")) && !order._paid_offline && order.payment_status !== "SUCCESS") {
    throw new Error("Seule une commande payée peut être annulée.");
  }

  const revertedAt = nowIso();
  const deviceId = getDeviceId();
  const paymentSnapshot = {
    payment_method: order.payment_method,
    total_amount: order.total_amount,
    cash_paid_amount: order.cash_paid_amount,
    mobile_paid_amount: order.mobile_paid_amount,
    paid_at: order.paid_at,
    cancelled_at: revertedAt,
    cancelled_by: cashier?.id || null,
    deviceId,
  };

  let reverted = {
    ...order,
    status: "Livrée",
    payment_status: "CANCELLED",
    paid_at: null,
    _paid_offline: false,
    payment_method: null,
    cash_paid_amount: null,
    mobile_paid_amount: null,
    updated_at: revertedAt,
    updatedAt: revertedAt,
    restaurantId: rid,
    restaurant_id: rid,
    payment_history: [
      ...(Array.isArray(order.payment_history) ? order.payment_history : []),
      { action: "cancelled", ...paymentSnapshot },
    ],
  };

  reverted = appendStatusHistory(reverted, {
    from: order.status,
    to: "Livrée",
    action: "payment_cancel",
    at: revertedAt,
    userId: cashier?.id || null,
    deviceId,
  });

  await upsertLocalOrder(reverted);

  const snapshot = (await loadCashierSnapshot(rid)) || {
    pending_orders: [],
    receipts: [],
  };
  const receipts = (snapshot.receipts || []).filter((item) => String(item.id) !== String(order.id));
  const pending = [
    reverted,
    ...(snapshot.pending_orders || []).filter((item) => String(item.id) !== String(order.id)),
  ];
  await saveCashierSnapshot(rid, {
    ...snapshot,
    pending_orders: pending,
    receipts,
  });

  const cashPart = Number(orderPaymentBreakdown(order)["Espèces"] || 0);
  if (createRefundMovement && cashPart > 0) {
    const sessionView = await loadLocalCashSession(rid, { registerId });
    if (sessionView.status === "OPEN") {
      await addLocalCashMovement({
        restaurantId: rid,
        type: MOVEMENT_TYPES.REFUND,
        amount: cashPart,
        note: `Remboursement ${order.order_number || order.id}`,
        cashier,
        receipts,
        registerId,
      });
    }
  }

  enqueueOfflineAction({
    type: "payment_cancel",
    label: `Annulation paiement ${order.order_number || order.id}`,
    localOrderId: order.id,
    orderId: order.id,
    restaurantId: rid,
    tenantId: rid,
    deviceId,
    endpoint: `/api/v1/orders/${order.id}/payment-cancel`,
    method: "POST",
    payload: withDeviceMeta({ order_id: order.id }),
    idempotencyKey: `payment_cancel:${order.id}`,
    requests: [{
      path: `/api/v1/orders/${order.id}/payment-cancel`,
      method: "POST",
      requiresAuth: true,
    }],
  });

  await appendAuditLog({
    tenantId: rid,
    userId: cashier?.id,
    action: AUDIT_ACTIONS.PAYMENT_CANCEL,
    resource: order.id,
    syncStatus: "PENDING_SYNC",
    details: { order_number: order.order_number, paymentSnapshot },
  });

  emitCashSessionChanged({ restaurantId, action: "payment_cancel", orderId: order.id });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cash-analytics-changed", { detail: { restaurantId: rid } }));
  }
  return reverted;
}

export {
  CashSessionConflictError,
  MOVEMENT_TYPES,
  DEFAULT_REGISTER_ID,
  buildCashSessionView,
  businessDateKey,
};
