/**
 * Opérations métier offline — Phase 2 (service + cuisine).
 * Les actions sont d'abord locales ; la file de sync les rejoue au retour réseau.
 */

import { enqueueOfflineAction, isNetworkError } from "@/utils/network";
import {
  initOfflineFoundation,
  listLocalKitchenTickets,
  listLocalOrders,
  loadCashierSnapshot,
  loadTablesSnapshot,
  saveCashierSnapshot,
  saveTablesSnapshot,
  upsertLocalKitchenTicket,
  upsertLocalOrder,
} from "@/offline/store";
import { idbDelete, idbGet, STORES } from "@/offline/db";
import { cacheTables } from "@/utils/offlineCache";
import { KITCHEN_ENABLED } from "@/config/features";

export function newLocalId(prefix = "local") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function isLocalId(id) {
  return String(id || "").startsWith("local_");
}

function nowIso() {
  return new Date().toISOString();
}

function dishNeedsKitchen(dish) {
  if (!dish) return true;
  if (dish.requires_kitchen === true) return true;
  if (dish.requires_kitchen === false) return false;
  const channel = String(dish.sale_channel || "").toUpperCase();
  if (channel === "EMBALLAGE") return false;
  if (channel === "BOISSON") {
    const name = `${dish.name || ""} ${dish.description || ""}`.toLowerCase();
    return /jus\s+naturel|jus\s+frais|citronnade|smoothie/.test(name);
  }
  return true;
}

export async function mirrorOrderLocal(order, restaurantId) {
  if (!order?.id || !restaurantId) return null;
  await initOfflineFoundation();
  return upsertLocalOrder({
    ...order,
    restaurantId,
    restaurant_id: restaurantId,
    updatedAt: nowIso(),
  });
}

export async function mirrorTicketsLocal(tickets, restaurantId) {
  if (!restaurantId || !Array.isArray(tickets)) return [];
  await initOfflineFoundation();
  const saved = [];
  for (const ticket of tickets) {
    saved.push(
      await upsertLocalKitchenTicket({
        ...ticket,
        restaurantId,
        orderId: ticket.order_id || ticket.orderId,
        updatedAt: nowIso(),
      }),
    );
  }
  return saved;
}

export async function createLocalTable({
  restaurantId,
  name,
  room = "Rez-de-chaussée",
  capacity = 4,
}) {
  await initOfflineFoundation();
  const id = newLocalId("local_table");
  const createdAt = nowIso();
  const table = {
    id,
    restaurant_id: restaurantId,
    restaurantId,
    name: String(name || "").trim(),
    number: String(name || "").trim(),
    room: room || "Rez-de-chaussée",
    capacity: Math.max(1, Number(capacity || 1)),
    status: "Libre",
    occupied_seats: 0,
    free_seats: Math.max(1, Number(capacity || 1)),
    is_active: true,
    created_at: createdAt,
    updated_at: createdAt,
    _local: true,
  };

  const snapshot = await loadTablesSnapshot(restaurantId);
  const current = Array.isArray(snapshot?.tables) ? snapshot.tables : [];
  const nextTables = [...current.filter((item) => String(item.id) !== String(id)), table];
  await saveTablesSnapshot(restaurantId, nextTables);
  cacheTables(restaurantId, nextTables);

  enqueueOfflineAction({
    type: "create_table",
    label: `Création table ${table.name}`,
    localTableId: id,
    restaurantId,
    payload: {
      name: table.name,
      room: table.room,
      capacity: table.capacity,
    },
    requests: [],
  });

  return table;
}

export async function remapLocalTableId(localTableId, serverTableId, restaurantId) {
  if (!localTableId || serverTableId == null || String(localTableId) === String(serverTableId)) {
    return null;
  }
  await initOfflineFoundation();
  const snapshot = await loadTablesSnapshot(restaurantId);
  const tables = Array.isArray(snapshot?.tables) ? snapshot.tables : [];
  const nextTables = tables.map((table) => {
    if (String(table.id) !== String(localTableId)) return table;
    return {
      ...table,
      id: serverTableId,
      _local: false,
      updated_at: nowIso(),
    };
  });
  await saveTablesSnapshot(restaurantId, nextTables);
  cacheTables(restaurantId, nextTables);

  const orders = await listLocalOrders(restaurantId);
  for (const order of orders) {
    if (String(order.table_id) !== String(localTableId)) continue;
    await upsertLocalOrder({
      ...order,
      table_id: serverTableId,
      updatedAt: nowIso(),
    });
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("offline-id-remapped", {
        detail: { localId: localTableId, serverId: serverTableId, kind: "table" },
      }),
    );
  }
  return serverTableId;
}

export async function createLocalTableOrder({
  restaurantId,
  table,
  partySize = 1,
  currentUser,
}) {
  await initOfflineFoundation();
  const id = newLocalId("local_order");
  const createdAt = nowIso();
  const order = {
    id,
    restaurantId,
    restaurant_id: restaurantId,
    table_id: table.id,
    table_name: table.name || table.number || "—",
    table_room: table.room || "Rez-de-chaussée",
    server_id: currentUser?.id || null,
    server_name: currentUser ? `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() : null,
    party_size: Math.max(1, Number(partySize || 1)),
    order_number: `LOC-${String(Date.now()).slice(-6)}`,
    customer_name: `Table ${table.name || table.number || ""}`.trim(),
    customer_phone: "",
    status: "Nouvelle",
    fulfillment_type: "Sur place",
    payment_method: "Espèces",
    payment_status: "En attente",
    discount_amount: 0,
    delivery_fee: 0,
    total_amount: 0,
    is_closed: false,
    items: [],
    created_at: createdAt,
    updated_at: createdAt,
    updatedAt: createdAt,
    _local: true,
  };

  await upsertLocalOrder(order);

  enqueueOfflineAction({
    type: "create_table_order",
    label: `Ouverture table ${order.table_name}`,
    localOrderId: id,
    tableId: table.id,
    restaurantId,
    party_size: order.party_size,
    requests: [],
  });

  return order;
}

export async function createLocalCashierDelivery({
  restaurantId,
  payload,
  cartLines,
  selectedArea,
  deliveryFee,
  total,
  currentUser,
}) {
  await initOfflineFoundation();
  const id = newLocalId("local_order");
  const createdAt = nowIso();
  const order = {
    id,
    restaurantId,
    restaurant_id: restaurantId,
    order_number: `LOC-LIV-${String(Date.now()).slice(-6)}`,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    customer_address: payload.customer_address || null,
    delivery_area_id: payload.delivery_area_id,
    delivery_area_name: selectedArea?.name || null,
    payment_method: payload.payment_method,
    notes: payload.notes || null,
    fulfillment_type: "Livraison",
    status: KITCHEN_ENABLED ? "Nouvelle" : "Prête",
    created_by_cashier_id: currentUser?.id || null,
    cashier_id: currentUser?.id || null,
    items: cartLines.map((line) => ({
      menu_item_id: line.menu_item_id,
      name: line.name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
    })),
    delivery_fee: deliveryFee,
    total_amount: total,
    discount_amount: 0,
    is_closed: false,
    created_at: createdAt,
    updated_at: createdAt,
    updatedAt: createdAt,
    _local: true,
  };
  await upsertLocalOrder(order);
  enqueueOfflineAction({
    type: "create_cashier_delivery",
    label: `Livraison ${payload.customer_phone}`,
    localOrderId: id,
    restaurantId,
    requests: [{
      path: "/api/v1/orders/cashier-delivery",
      method: "POST",
      requiresAuth: true,
      body: payload,
    }],
  });
  return order;
}

export async function validateLocalDeliveryPayment(order, paymentMethod, currentUser) {
  await initOfflineFoundation();
  const createdAt = nowIso();
  const nextOrder = {
    ...order,
    status: "Payée",
    payment_method: paymentMethod,
    paid_at: createdAt,
    cashier_id: currentUser?.id || order.cashier_id,
    updated_at: createdAt,
    updatedAt: createdAt,
  };
  await upsertLocalOrder({
    ...nextOrder,
    restaurantId: order.restaurantId || order.restaurant_id,
  });
  enqueueOfflineAction({
    type: "cash_payment",
    label: `Paiement ${order.order_number || order.id}`,
    localOrderId: order.id,
    payload: { payment_method: paymentMethod, discount_amount: 0 },
    requests: [{
      path: `/api/v1/orders/${order.id}/payment`,
      method: "POST",
      requiresAuth: true,
      body: { payment_method: paymentMethod, discount_amount: 0 },
    }],
  });
  return nextOrder;
}

export async function getLocalOrder(orderId) {
  if (!orderId) return null;
  try {
    await initOfflineFoundation();
    return (await idbGet(STORES.orders, orderId)) || null;
  } catch {
    return null;
  }
}

export async function remapLocalOrderId(localOrderId, serverOrderId, restaurantId) {
  if (!localOrderId || !serverOrderId || localOrderId === serverOrderId) return null;
  await initOfflineFoundation();
  const localOrder = await idbGet(STORES.orders, localOrderId);
  if (localOrder) {
    await upsertLocalOrder({
      ...localOrder,
      id: serverOrderId,
      restaurantId: restaurantId || localOrder.restaurantId || localOrder.restaurant_id,
      _local: false,
      updatedAt: nowIso(),
    });
    await idbDelete(STORES.orders, localOrderId);
  }

  const tickets = await listLocalKitchenTickets(
    restaurantId || localOrder?.restaurantId || localOrder?.restaurant_id,
  );
  for (const ticket of tickets) {
    if ((ticket.order_id || ticket.orderId) !== localOrderId) continue;
    await upsertLocalKitchenTicket({
      ...ticket,
      order_id: serverOrderId,
      orderId: serverOrderId,
      updatedAt: nowIso(),
    });
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("offline-id-remapped", {
        detail: { localId: localOrderId, serverId: serverOrderId },
      }),
    );
  }
  return serverOrderId;
}

export async function updateLocalOrderItems(order, itemsPayload, dishesById = {}) {
  const nextItems = itemsPayload.map((item) => {
    const dish = dishesById[item.menu_item_id];
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(dish?.price ?? item.unit_price ?? 0);
    return {
      id: item.id || newLocalId("local_item"),
      menu_item_id: item.menu_item_id,
      name: dish?.name || item.name || "Plat",
      sale_channel: dish?.sale_channel || item.sale_channel || "REPAS",
      quantity,
      unit_price: unitPrice,
      line_total: unitPrice * quantity,
      requires_kitchen: dishNeedsKitchen(dish),
    };
  });
  const subtotal = nextItems.reduce((total, item) => total + Number(item.line_total || 0), 0);
  const nextOrder = {
    ...order,
    items: nextItems,
    total_amount: Math.max(0, subtotal + Number(order.delivery_fee || 0) - Number(order.discount_amount || 0)),
    updated_at: nowIso(),
    updatedAt: nowIso(),
  };
  await upsertLocalOrder({
    ...nextOrder,
    restaurantId: order.restaurantId || order.restaurant_id,
  });
  return nextOrder;
}

export async function sendLocalOrderToKitchen(order, restaurantId, dishesById = {}) {
  const items = (order.items || []).filter((item) => item.sale_channel !== "EMBALLAGE");
  const createdAt = nowIso();

  if (!KITCHEN_ENABLED) {
    const kitchenItems = items.filter((item) => {
      const dish = dishesById[item.menu_item_id];
      if (dish) return dish.requires_kitchen !== false && String(dish.sale_channel || "").toUpperCase() !== "BOISSON";
      return item.requires_kitchen !== false && item.sale_channel !== "BOISSON";
    });
    const drinksOnly = items.length > 0 && kitchenItems.length === 0;
    const nextOrder = {
      ...order,
      status: drinksOnly ? "Prête" : order.status === "Nouvelle" ? "Acceptée" : order.status,
      is_closed: drinksOnly ? true : order.is_closed,
      closed_at: drinksOnly ? createdAt : order.closed_at,
      updated_at: createdAt,
      updatedAt: createdAt,
    };
    await upsertLocalOrder({
      ...nextOrder,
      restaurantId: restaurantId || order.restaurantId || order.restaurant_id,
    });
    if (!isLocalId(order.id)) {
      enqueueOfflineAction({
        type: "send_to_kitchen",
        label: `Confirmation ${order.order_number || order.id}`,
        localOrderId: order.id,
        requests: [{
          path: `/api/v1/orders/${order.id}/send-to-kitchen`,
          method: "POST",
          requiresAuth: true,
        }],
      });
    }
    return { order: nextOrder, tickets: [] };
  }

  const kitchenItems = items.filter((item) => {
    const dish = dishesById[item.menu_item_id];
    if (dish) return dishNeedsKitchen(dish);
    return item.requires_kitchen !== false && item.sale_channel !== "BOISSON";
  });

  const tickets = [];
  for (const item of kitchenItems) {
    const ticket = {
      id: newLocalId("local_ticket"),
      restaurantId,
      order_id: order.id,
      orderId: order.id,
      table_number: String(order.table_name || order.table_id || "—"),
      item_name: item.name,
      quantity: Number(item.quantity || 1),
      notes: order.notes || null,
      status: "En attente",
      created_at: createdAt,
      started_at: null,
      ready_at: null,
      served_at: null,
      updatedAt: createdAt,
      _local: true,
      menu_item_id: item.menu_item_id,
    };
    await upsertLocalKitchenTicket(ticket);
    tickets.push(ticket);
  }

  const drinksOnly = items.length > 0 && kitchenItems.length === 0;
  const nextOrder = {
    ...order,
    status: drinksOnly ? "Prête" : kitchenItems.length ? "Acceptée" : order.status,
    is_closed: drinksOnly ? true : order.is_closed,
    closed_at: drinksOnly ? createdAt : order.closed_at,
    updated_at: createdAt,
    updatedAt: createdAt,
  };
  await upsertLocalOrder({
    ...nextOrder,
    restaurantId: restaurantId || order.restaurantId || order.restaurant_id,
  });

  if (!isLocalId(order.id)) {
    enqueueOfflineAction({
      type: "send_to_kitchen",
      label: `Envoi cuisine ${order.order_number || order.id}`,
      localOrderId: order.id,
      requests: [{
        path: `/api/v1/orders/${order.id}/send-to-kitchen`,
        method: "POST",
        requiresAuth: true,
      }],
    });
  } else {
    enqueueOfflineAction({
      type: "send_to_kitchen_after_create",
      label: `Envoi cuisine ${order.order_number || order.id}`,
      localOrderId: order.id,
      requests: [],
    });
  }

  return { order: nextOrder, tickets };
}

export async function advanceLocalTicket(ticket, nextStatus, restaurantId, { cookUserId = null } = {}) {
  const now = nowIso();
  const updated = {
    ...ticket,
    status: nextStatus,
    updatedAt: now,
    restaurantId: restaurantId || ticket.restaurantId,
  };
  if (nextStatus === "En préparation") {
    if (!updated.started_at) updated.started_at = now;
    if (cookUserId && !updated.assigned_cook_id) updated.assigned_cook_id = cookUserId;
  }
  if (nextStatus === "Prête") {
    if (!updated.started_at) updated.started_at = now;
    if (!updated.ready_at) updated.ready_at = now;
  }
  if (nextStatus === "Servie") {
    if (!updated.started_at) updated.started_at = now;
    if (!updated.ready_at) updated.ready_at = now;
    if (!updated.served_at) updated.served_at = now;
  }

  await upsertLocalKitchenTicket(updated);

  if (!isLocalId(ticket.id)) {
    enqueueOfflineAction({
      type: "kitchen_status",
      label: `Ticket #${ticket.id} → ${nextStatus}`,
      requests: [{
        path: `/kitchen/ticket/${ticket.id}/status`,
        method: "PATCH",
        requiresAuth: true,
        body: { status: nextStatus },
      }],
    });
  } else {
    enqueueOfflineAction({
      type: "kitchen_status_local",
      label: `${ticket.item_name} → ${nextStatus}`,
      localTicketId: ticket.id,
      orderId: ticket.order_id || ticket.orderId,
      itemName: ticket.item_name,
      quantity: ticket.quantity,
      status: nextStatus,
      requests: [],
    });
  }

  return updated;
}

/** Clôture locale pour addition / passage caisse (P0.5). */
export async function closeLocalOrderForBill(order, restaurantId) {
  await initOfflineFoundation();
  const now = nowIso();
  const nextOrder = {
    ...order,
    is_closed: true,
    closed_at: now,
    updated_at: now,
    updatedAt: now,
  };
  await upsertLocalOrder({
    ...nextOrder,
    restaurantId: restaurantId || order.restaurantId || order.restaurant_id,
  });

  if (!isLocalId(order.id)) {
    enqueueOfflineAction({
      type: "close_order",
      label: `Clôture ${order.order_number || order.id}`,
      localOrderId: order.id,
      requests: [{
        path: `/api/v1/orders/${order.id}/close`,
        method: "POST",
        requiresAuth: true,
      }],
    });
  } else {
    enqueueOfflineAction({
      type: "close_order",
      label: `Clôture ${order.order_number || order.id}`,
      localOrderId: order.id,
      requests: [],
    });
  }

  return nextOrder;
}

export async function markLocalOrderServed(order, restaurantId) {
  const now = nowIso();
  const nextOrder = {
    ...order,
    status: "Livrée",
    updated_at: now,
    updatedAt: now,
  };
  await upsertLocalOrder({
    ...nextOrder,
    restaurantId: restaurantId || order.restaurantId || order.restaurant_id,
  });

  const tickets = await listLocalKitchenTickets(restaurantId || order.restaurantId || order.restaurant_id);
  for (const ticket of tickets.filter((item) => (item.order_id || item.orderId) === order.id && item.status !== "Servie")) {
    await advanceLocalTicket(ticket, "Servie", restaurantId);
  }

  if (!isLocalId(order.id)) {
    enqueueOfflineAction({
      type: "order_status",
      label: `Servie ${order.order_number || order.id}`,
      localOrderId: order.id,
      requests: [{
        path: `/api/v1/orders/${order.id}/status`,
        method: "PATCH",
        requiresAuth: true,
        body: { status: "Livrée" },
      }],
    });
  } else {
    enqueueOfflineAction({
      type: "order_status",
      label: `Servie ${order.order_number || order.id}`,
      localOrderId: order.id,
      payload: { status: "Livrée" },
      requests: [],
    });
  }

  return nextOrder;
}

export async function loadKitchenTicketsMerged(restaurantId, remoteTickets = [], { cookUserId = null } = {}) {
  await initOfflineFoundation();
  const local = await listLocalKitchenTickets(restaurantId);
  const byKey = new Map();

  for (const ticket of remoteTickets || []) {
    byKey.set(`remote:${ticket.id}`, {
      ...ticket,
      restaurantId,
      orderId: ticket.order_id,
    });
  }

  for (const ticket of local) {
    if (ticket.status === "Servie") continue;
    const key = isLocalId(ticket.id)
      ? `local:${ticket.id}`
      : `remote:${ticket.id}`;
    // Les tickets locaux (créés offline) restent visibles même si absents du serveur.
    if (isLocalId(ticket.id) || !byKey.has(key)) {
      byKey.set(key, ticket);
    } else {
      // Prefer remote entity but keep richer local timestamps if server lags.
      const remote = byKey.get(key);
      byKey.set(key, {
        ...remote,
        started_at: remote.started_at || ticket.started_at,
        ready_at: remote.ready_at || ticket.ready_at,
        served_at: remote.served_at || ticket.served_at,
        assigned_cook_id: remote.assigned_cook_id ?? ticket.assigned_cook_id,
      });
    }
  }

  const merged = [...byKey.values()].sort(
    (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
  );
  if (!cookUserId) return merged;
  return merged.filter((ticket) => ticketVisibleToCook(ticket, cookUserId));
}

function ticketVisibleToCook(ticket, cookUserId) {
  const assigned = ticket.assigned_cook_id ?? ticket.assignedCookId ?? null;
  const status = String(ticket.status || "");
  if (status === "En attente") return !assigned || assigned === cookUserId;
  return assigned === cookUserId;
}

export async function removeLocalTicket(ticketId) {
  await idbDelete(STORES.kitchenTickets, ticketId);
}

const CASHIER_PENDING_STATUSES = new Set(["Prête", "Prete", "Livrée", "Livree", "PENDING_PAYMENT"]);
const CASHIER_PAID_STATUSES = new Set(["Payée", "Payee"]);
const OFFLINE_CASH_METHODS = new Set(["Espèces", "Carte", "Orange Money", "MTN Mobile Money"]);

function emptyCashierReport() {
  return {
    pending_orders_count: 0,
    paid_orders_count: 0,
    receipts_count: 0,
    total_collected: 0,
    total_discounts: 0,
    discounted_orders_count: 0,
    discount_lines: [],
    average_ticket: 0,
    by_payment_method: {},
    pending_orders: [],
    receipts: [],
  };
}

function normalizeCashierStatus(status) {
  const value = String(status || "").trim();
  if (value === "Prete") return "Prête";
  if (value === "Livree") return "Livrée";
  if (value === "Payee") return "Payée";
  return value;
}

function cashierNameOf(user) {
  if (!user) return null;
  const full = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return full || user.username || null;
}

function orderVisibleToCashier(order, cashierUserId, { pending = false } = {}) {
  if (!cashierUserId) return true;
  const assigned = order.assigned_cashier_id ?? order.assignedCashierId ?? null;
  const createdBy = order.created_by_cashier_id ?? order.createdByCashierId ?? null;
  const isDelivery = String(order.fulfillment_type || "") === "Livraison";

  if (assigned === cashierUserId) return true;
  if (assigned) return false;
  if (isDelivery && createdBy && createdBy !== cashierUserId) return false;
  if (pending) return true;

  const cashier = order.cashier_id ?? order.cashierId ?? null;
  return cashier === cashierUserId;
}

export function scopeOrdersForCashier(orders, cashierUserId) {
  if (!cashierUserId || !orders?.length) return orders || [];
  return orders.filter((order) => orderVisibleToCashier(order, cashierUserId, { pending: true }));
}

export function scopeCashierReport(report, cashierUserId) {
  if (!cashierUserId || !report) return report;
  const pending = (report.pending_orders || []).filter((order) =>
    orderVisibleToCashier(order, cashierUserId, { pending: true }),
  );
  const receipts = (report.receipts || []).filter((order) =>
    orderVisibleToCashier(order, cashierUserId),
  );
  return recomputeTotals({ ...report, pending_orders: pending, receipts });
}

function recomputeTotals(report) {
  const pending = report.pending_orders || [];
  const receipts = report.receipts || [];
  const by_payment_method = {};
  let total_collected = 0;
  let total_discounts = 0;
  const discount_lines = [];
  for (const order of receipts) {
    const amount = Number(order.total_amount || 0);
    total_collected += amount;
    const method = order.payment_method || "Non renseigné";
    by_payment_method[method] = (by_payment_method[method] || 0) + amount;
    const discountValue = Number(order.discount_amount || 0);
    if (discountValue > 0) {
      total_discounts += discountValue;
      discount_lines.push({
        order_id: order.id,
        order_number: order.order_number,
        discount_amount: discountValue,
        total_amount: amount,
        server_name: order.server_name || null,
        cashier_name: order.cashier_name || null,
        paid_at: order.paid_at || order.updated_at,
      });
    }
  }
  discount_lines.sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0));
  return {
    ...report,
    pending_orders: pending,
    receipts,
    pending_orders_count: pending.length,
    paid_orders_count: receipts.length,
    receipts_count: receipts.length,
    total_collected,
    total_discounts: Math.round(total_discounts * 100) / 100,
    discounted_orders_count: discount_lines.length,
    discount_lines,
    average_ticket: receipts.length ? total_collected / receipts.length : 0,
    by_payment_method,
  };
}

export async function mirrorCashierReport(report, restaurantId) {
  if (!restaurantId || !report) return null;
  await initOfflineFoundation();
  await saveCashierSnapshot(restaurantId, report);
  for (const order of [...(report.pending_orders || []), ...(report.receipts || [])]) {
    await mirrorOrderLocal(order, restaurantId);
  }
  return report;
}

export async function loadCashierReportMerged(restaurantId, remoteReport = null, { cashierUserId = null } = {}) {
  await initOfflineFoundation();
  const base = remoteReport
    || (await loadCashierSnapshot(restaurantId))
    || emptyCashierReport();

  const localOrders = await listLocalOrders(restaurantId);
  const pendingById = new Map((base.pending_orders || []).map((order) => [String(order.id), order]));
  const receiptsById = new Map((base.receipts || []).map((order) => [String(order.id), order]));

  for (const order of localOrders) {
    const status = normalizeCashierStatus(order.status);
    const id = String(order.id);
    if (CASHIER_PAID_STATUSES.has(status) || order._paid_offline) {
      pendingById.delete(id);
      receiptsById.set(id, { ...receiptsById.get(id), ...order, status: "Payée" });
      continue;
    }
    if (CASHIER_PENDING_STATUSES.has(status)) {
      if (!receiptsById.has(id)) {
        pendingById.set(id, { ...pendingById.get(id), ...order, status });
      }
    }
  }

  const merged = recomputeTotals({
    ...base,
    pending_orders: [...pendingById.values()].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
    ),
    receipts: [...receiptsById.values()].sort(
      (a, b) => new Date(b.paid_at || b.updated_at || 0) - new Date(a.paid_at || a.updated_at || 0),
    ),
  });
  return scopeCashierReport(merged, cashierUserId);
}

/**
 * Réserve une commande pour la caissière connectée (mode hors ligne).
 */
export async function claimLocalOrderForCashier(order, restaurantId, cashier) {
  if (!cashier?.id || !order?.id) return order;
  const assigned = order.assigned_cashier_id ?? order.assignedCashierId ?? null;
  if (assigned && assigned !== cashier.id) {
    throw new Error("Cette commande est déjà prise en charge par une autre caissière.");
  }
  if (assigned === cashier.id) return order;
  const rid = restaurantId || order.restaurantId || order.restaurant_id;
  const next = {
    ...order,
    assigned_cashier_id: cashier.id,
    restaurantId: rid,
    restaurant_id: rid,
  };
  await upsertLocalOrder(next);
  if (!isLocalId(order.id)) {
    enqueueOfflineAction({
      type: "claim_cashier",
      label: `Prise en charge ${order.order_number || order.id}`,
      localOrderId: order.id,
      orderId: order.id,
      restaurantId: rid,
      requests: [{
        path: `/api/v1/orders/${order.id}/claim-cashier`,
        method: "POST",
        requiresAuth: true,
      }],
    });
  }
  return next;
}

/**
 * Encaissement local (espèces, carte, dépôt Orange/MTN enregistré manuellement).
 */
export async function payLocalCashOrder(order, {
  payment_method = "Espèces",
  discount_amount = null,
  restaurantId,
  cashier = null,
} = {}) {
  const method = String(payment_method || "Espèces").trim() || "Espèces";
  if (!OFFLINE_CASH_METHODS.has(method)) {
    throw new Error("Mode de paiement non pris en charge hors ligne.");
  }
  if (!order?.id) throw new Error("Commande introuvable.");
  const status = normalizeCashierStatus(order.status);
  if (CASHIER_PAID_STATUSES.has(status) || order._paid_offline || order.payment_status === "SUCCESS") {
    throw new Error("Cette commande est déjà encaissée localement.");
  }
  if (!CASHIER_PENDING_STATUSES.has(status) && status !== "Servie") {
    throw new Error("Seules les commandes prêtes ou servies peuvent être encaissées hors ligne.");
  }

  const rid = restaurantId || order.restaurantId || order.restaurant_id;
  const discount = discount_amount == null
    ? Number(order.discount_amount || 0)
    : Number(discount_amount || 0);
  const itemsSubtotal = (order.items || []).reduce(
    (total, item) => total + Number(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0))),
    0,
  );
  const totalAmount = Math.max(
    0,
    itemsSubtotal + Number(order.delivery_fee || 0) - discount,
  );
  const paidAt = nowIso();
  const paid = {
    ...order,
    discount_amount: discount,
    total_amount: totalAmount,
    payment_method: method,
    status: "Payée",
    payment_status: "SUCCESS",
    paid_at: paidAt,
    updated_at: paidAt,
    updatedAt: paidAt,
    cashier_id: cashier?.id || order.cashier_id || null,
    assigned_cashier_id: cashier?.id || order.assigned_cashier_id || null,
    cashier_name: cashierNameOf(cashier) || order.cashier_name || null,
    restaurantId: rid,
    restaurant_id: rid,
    _paid_offline: true,
  };

  await upsertLocalOrder(paid);

  const snapshot = (await loadCashierSnapshot(rid)) || emptyCashierReport();
  const pending = (snapshot.pending_orders || []).filter((item) => String(item.id) !== String(order.id));
  const receipts = [
    paid,
    ...(snapshot.receipts || []).filter((item) => String(item.id) !== String(order.id)),
  ];
  const nextReport = recomputeTotals({ ...snapshot, pending_orders: pending, receipts });
  await saveCashierSnapshot(rid, nextReport);

  const payload = { payment_method: method, discount_amount: discount };
  enqueueOfflineAction({
    type: "cash_payment",
    label: `Paiement ${order.order_number || order.id}`,
    localOrderId: order.id,
    orderId: order.id,
    restaurantId: rid,
    payload,
    requests: isLocalId(order.id)
      ? []
      : [{
          path: `/api/v1/orders/${order.id}/payment`,
          method: "POST",
          requiresAuth: true,
          body: payload,
        }],
  });

  return { order: paid, report: nextReport };
}

export { isNetworkError, OFFLINE_CASH_METHODS };
