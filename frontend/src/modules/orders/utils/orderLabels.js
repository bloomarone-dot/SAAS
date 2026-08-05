export function isDeliveryOrder(order) {
  return order?.fulfillment_type === "Livraison";
}

export function orderTakerName(order) {
  if (!order) return null;
  if (order.order_taker_name) return order.order_taker_name;
  if (isDeliveryOrder(order)) {
    return (
      order.created_by_cashier_name ||
      order.cashier_name ||
      order.assigned_cashier_name ||
      null
    );
  }
  return order.server_name || null;
}

export function orderTakerDisplay(order, fallback = "Non renseigné") {
  if (isDeliveryOrder(order)) {
    return orderTakerName(order) || "Caissière non renseignée";
  }
  return orderTakerName(order) || fallback;
}

export function orderTakerRole(order) {
  return isDeliveryOrder(order) ? "Caissier(ère)" : "Serveur(se)";
}

export function orderTakerGroupKey(order) {
  if (isDeliveryOrder(order)) {
    return orderTakerDisplay(order, "Caissière non renseignée");
  }
  return orderTakerName(order) || "Sans serveur assigné";
}

/** Caissier(ère) ayant encaissé ou pris en charge la commande. */
export function cashierDisplay(order, fallback = "Non renseigné") {
  if (!order) return fallback;
  return (
    order.cashier_name ||
    order.created_by_cashier_name ||
    order.assigned_cashier_name ||
    fallback
  );
}
