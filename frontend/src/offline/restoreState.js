/**
 * Reprise après crash — restaure session caisse, file sync, état local.
 */

import { initOfflineFoundation, loadSyncQueueDurable, listLocalOrders, listLocalKitchenTickets } from "@/offline/store";
import { loadLocalCashSession } from "@/offline/cashSession";
import { appendAuditLog, AUDIT_ACTIONS, countAuditLog } from "@/offline/auditLog";
import { getDeviceId } from "@/offline/deviceId";
import { peekTicketSequence } from "@/offline/ticketSequence";

export async function restoreOfflineState(restaurantId, { userId = null } = {}) {
  await initOfflineFoundation();

  const [queue, orders, tickets, cashSession, ticketSeq, auditCount] = await Promise.all([
    loadSyncQueueDurable(),
    restaurantId ? listLocalOrders(restaurantId) : Promise.resolve([]),
    restaurantId ? listLocalKitchenTickets(restaurantId) : Promise.resolve([]),
    restaurantId ? loadLocalCashSession(restaurantId) : Promise.resolve(null),
    restaurantId ? peekTicketSequence(restaurantId) : Promise.resolve(0),
    restaurantId ? countAuditLog(restaurantId) : Promise.resolve(0),
  ]);

  const pendingOps = queue.filter((item) => item.status !== "failed").length;

  if (restaurantId) {
    await appendAuditLog({
      tenantId: restaurantId,
      userId,
      action: AUDIT_ACTIONS.APP_RESTORE,
      resource: "offline_state",
      details: {
        deviceId: getDeviceId(),
        pendingOps,
        orders: orders.length,
        tickets: tickets.length,
        cashSessionStatus: cashSession?.status || "NONE",
        ticketSequence: ticketSeq,
        auditEntries: auditCount,
      },
    }).catch(() => {});
  }

  return {
    restored: true,
    deviceId: getDeviceId(),
    pendingOps,
    ordersCount: orders.length,
    ticketsCount: tickets.length,
    cashSessionStatus: cashSession?.status || "NONE",
    cashSessionOpen: cashSession?.status === "OPEN",
    ticketSequence: ticketSeq,
    auditEntries: auditCount,
  };
}
