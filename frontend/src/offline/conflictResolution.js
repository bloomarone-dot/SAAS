/**
 * Stratégies explicites de résolution de conflits offline.
 * Aucune résolution implicite — chaque cas est documenté et codé.
 */

export const CONFLICT_STRATEGIES = {
  ORDER_ITEMS: "last_write_wins_by_updated_at",
  ORDER_STATUS: "max_kitchen_rank_wins",
  PAYMENT: "first_success_wins",
  PAYMENT_CANCEL: "cancel_wins_over_pending_payment",
  CASH_SESSION_OPEN: "single_open_per_register",
  CASH_SESSION_CLOSE: "first_close_wins",
  CASH_SESSION_LOCK: "owner_or_manager_takeover",
  TICKET_NUMBER: "client_number_preserved_on_sync",
};

function parseTime(value) {
  const t = Date.parse(value || 0);
  return Number.isFinite(t) ? t : 0;
}

/** Commande modifiée sur deux appareils → la modification la plus récente gagne. */
export function resolveOrderItemsConflict(localOrder, remoteOrder) {
  const strategy = CONFLICT_STRATEGIES.ORDER_ITEMS;
  const localTime = parseTime(localOrder?.updated_at || localOrder?.updatedAt);
  const remoteTime = parseTime(remoteOrder?.updated_at || remoteOrder?.updatedAt);
  const winner = localTime >= remoteTime ? localOrder : remoteOrder;
  return {
    strategy,
    winner,
    merged: {
      ...winner,
      _conflict_resolved: strategy,
      _conflict_at: new Date().toISOString(),
    },
  };
}

/** Paiement reçu sur deux appareils → le premier encaissement réussi est conservé. */
export function resolvePaymentConflict(existingOrder, incomingPayment) {
  const strategy = CONFLICT_STRATEGIES.PAYMENT;
  const paidStatuses = new Set(["Payée", "Payee", "SUCCESS"]);
  const alreadyPaid = paidStatuses.has(String(existingOrder?.status || ""))
    || existingOrder?.payment_status === "SUCCESS"
    || existingOrder?._paid_offline;

  if (alreadyPaid) {
    return {
      strategy,
      action: "reject_duplicate",
      order: existingOrder,
      reason: "Commande déjà payée — premier encaissement conservé.",
    };
  }

  return {
    strategy,
    action: "accept",
    order: incomingPayment,
  };
}

/** Annulation pendant sync → annulation prioritaire si paiement pas encore confirmé serveur. */
export function resolvePaymentCancelConflict(order, hasPendingPaymentSync) {
  const strategy = CONFLICT_STRATEGIES.PAYMENT_CANCEL;
  if (hasPendingPaymentSync) {
    return { strategy, action: "cancel_wins", order };
  }
  return { strategy, action: "apply_cancel", order };
}

/** Fermeture caisse simultanée → première clôture enregistrée gagne. */
export function resolveCashSessionCloseConflict(localClose, remoteClose) {
  const strategy = CONFLICT_STRATEGIES.CASH_SESSION_CLOSE;
  const localTime = parseTime(localClose?.closed_at);
  const remoteTime = parseTime(remoteClose?.closed_at);
  if (!localClose) return { strategy, winner: remoteClose };
  if (!remoteClose) return { strategy, winner: localClose };
  return {
    strategy,
    winner: localTime <= remoteTime ? localClose : remoteClose,
  };
}

/** Fusion numéro ticket après sync. */
export function resolveTicketNumberConflict(localOrder, serverOrder) {
  return {
    strategy: CONFLICT_STRATEGIES.TICKET_NUMBER,
    order: {
      ...serverOrder,
      client_order_number: localOrder?.client_order_number || localOrder?.order_number,
      order_number: localOrder?.order_number || serverOrder?.order_number,
      server_order_number: serverOrder?.order_number || null,
    },
  };
}
