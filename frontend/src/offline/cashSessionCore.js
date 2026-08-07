/**
 * Calculs purs session de caisse — testable sans navigateur.
 */

import { orderPaymentBreakdown } from "../modules/orders/utils/paymentReporting.js";

export const MOVEMENT_TYPES = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  EXPENSE: "expense",
  ADJUSTMENT: "adjustment",
  REFUND: "refund",
};

export function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function businessDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function cashSessionMetaKey(restaurantId, dateKey = businessDateKey(), registerId = "main") {
  return `cash_session:${restaurantId}:${registerId}:${dateKey}`;
}

/** Clé legacy (Phase 5 initiale) — migration vers clé par caisse. */
export function cashSessionLegacyMetaKey(restaurantId, dateKey = businessDateKey()) {
  return `cash_session:${restaurantId}:${dateKey}`;
}

export function cashMovementsMetaKey(restaurantId, dateKey = businessDateKey(), registerId = "main") {
  return `cash_movements:${restaurantId}:${registerId}:${dateKey}`;
}

export function cashMovementsLegacyMetaKey(restaurantId, dateKey = businessDateKey()) {
  return `cash_movements:${restaurantId}:${dateKey}`;
}

export function sumCashMovementImpact(movements = []) {
  let deposits = 0;
  let withdrawals = 0;
  let expenses = 0;
  let adjustments = 0;
  let refunds = 0;

  for (const movement of movements) {
    const amount = Number(movement.amount || 0);
    switch (movement.type) {
      case MOVEMENT_TYPES.DEPOSIT:
        deposits += amount;
        break;
      case MOVEMENT_TYPES.WITHDRAWAL:
        withdrawals += amount;
        break;
      case MOVEMENT_TYPES.EXPENSE:
        expenses += amount;
        break;
      case MOVEMENT_TYPES.ADJUSTMENT:
        adjustments += amount;
        break;
      case MOVEMENT_TYPES.REFUND:
        refunds += amount;
        break;
      default:
        break;
    }
  }

  const net_cash = deposits - withdrawals - expenses - refunds + adjustments;
  return {
    deposits: round2(deposits),
    withdrawals: round2(withdrawals),
    expenses: round2(expenses),
    adjustments: round2(adjustments),
    refunds: round2(refunds),
    net_cash: round2(net_cash),
  };
}

export function computeReceiptTotals(receipts = []) {
  let sales_total = 0;
  let cash_sales = 0;
  let mobile_sales = 0;
  let card_sales = 0;

  for (const order of receipts) {
    const amount = Number(order.total_amount || 0);
    sales_total += amount;
    const breakdown = orderPaymentBreakdown(order);
    cash_sales += Number(breakdown["Espèces"] || 0);
    mobile_sales += Number(breakdown["Mobile Money"] || 0);
    card_sales += Number(breakdown["Carte"] || 0);
  }

  return {
    sales_total: round2(sales_total),
    cash_sales: round2(cash_sales),
    mobile_sales: round2(mobile_sales),
    card_sales: round2(card_sales),
    paid_orders_count: receipts.length,
  };
}

export function normalizeSessionStatus(status) {
  const value = String(status || "").toUpperCase();
  if (value === "OPEN") return "OPEN";
  if (value === "CLOSED") return "CLOSED";
  return "NONE";
}

/**
 * Construit la vue session alignée sur CashDrawerSessionOut backend.
 */
export function buildCashSessionView(session, receipts = [], movements = []) {
  const totals = computeReceiptTotals(receipts);
  const movementTotals = sumCashMovementImpact(movements);
  const opening_float = session ? Number(session.opening_float ?? session.openingAmount ?? 0) : 0;
  const closingRaw = session?.closing_counted ?? session?.closingAmount;
  const closing_counted = closingRaw == null ? null : round2(closingRaw);
  const expected_in_drawer = round2(opening_float + totals.cash_sales + movementTotals.net_cash);
  const expected_day_total = round2(opening_float + totals.sales_total);
  const variance = closing_counted != null ? round2(closing_counted - expected_in_drawer) : null;
  const status = session ? normalizeSessionStatus(session.status) : "NONE";

  return {
    id: session?.id || session?.localId || null,
    localId: session?.localId || session?.id || null,
    restaurant_id: session?.restaurant_id || session?.tenantId || null,
    business_date: session?.business_date || session?.session_date || businessDateKey(),
    status,
    opening_float,
    closing_counted,
    opening_notes: session?.opening_notes || session?.openingNotes || null,
    closing_notes: session?.closing_notes || session?.closingNotes || null,
    opened_at: session?.opened_at || session?.createdAt || null,
    closed_at: session?.closed_at || null,
    opened_by_name: session?.opened_by_name || null,
    closed_by_name: session?.closed_by_name || null,
    opened_by_user_id: session?.opened_by_user_id || session?.cashierId || null,
    syncStatus: session?.syncStatus || null,
    ...totals,
    deposits_total: movementTotals.deposits,
    withdrawals_total: movementTotals.withdrawals,
    expenses_total: movementTotals.expenses,
    adjustments_total: movementTotals.adjustments,
    refunds_total: movementTotals.refunds,
    net_movements_cash: movementTotals.net_cash,
    expected_in_drawer,
    expected_day_total,
    variance,
    movements: [...movements].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    ),
  };
}

export function canOpenCashSession(view) {
  return !view || view.status === "NONE";
}

export function canCloseCashSession(view) {
  return view?.status === "OPEN";
}

export function cashSessionCloseKey(restaurantId, dateKey = businessDateKey(), registerId = "main") {
  return `cash_session_close:${restaurantId}:${registerId}:${dateKey}`;
}

export function pickAuthoritativeSession(localSession, remoteSession) {
  if (!localSession && !remoteSession) return null;
  if (!localSession) return remoteSession;
  if (!remoteSession || normalizeSessionStatus(remoteSession.status) === "NONE") return localSession;

  const localPending = localSession.syncStatus === "PENDING_SYNC";
  const remoteSynced = remoteSession.syncStatus === "SYNCED" || (
    remoteSession.id && !String(remoteSession.id).startsWith("local_")
  );

  if (normalizeSessionStatus(remoteSession.status) === "CLOSED") return remoteSession;
  if (localPending && normalizeSessionStatus(localSession.status) === "OPEN" && !remoteSynced) {
    return localSession;
  }
  if (remoteSynced) return remoteSession;
  return localSession;
}

export function buildCloseReport(view) {
  return {
    opening_float: view.opening_float,
    closing_counted: view.closing_counted,
    sales_total: view.sales_total,
    cash_sales: view.cash_sales,
    mobile_sales: view.mobile_sales,
    card_sales: view.card_sales,
    deposits_total: view.deposits_total,
    withdrawals_total: view.withdrawals_total,
    expenses_total: view.expenses_total,
    adjustments_total: view.adjustments_total,
    refunds_total: view.refunds_total,
    expected_in_drawer: view.expected_in_drawer,
    variance: view.variance,
    paid_orders_count: view.paid_orders_count,
    movements_count: view.movements?.length || 0,
  };
}
