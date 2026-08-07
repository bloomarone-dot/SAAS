/**
 * Numérotation tickets offline — multi-terminal via deviceId + UUID global.
 */

export const DEFAULT_TICKET_PREFIX = "CAM";

export function deviceShortCode(deviceId) {
  return String(deviceId || "unknown").replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function ticketSequenceMetaKey(tenantId, dateKey, deviceId) {
  return `ticket_seq:${tenantId}:${deviceId}:${dateKey}`;
}

export function formatTicketNumber(prefix, dateKey, sequence, deviceId) {
  const safePrefix = String(prefix || DEFAULT_TICKET_PREFIX).toUpperCase().slice(0, 8);
  const ymd = String(dateKey || "").replace(/-/g, "");
  const seq = Math.max(1, Number(sequence) || 1);
  const terminal = deviceShortCode(deviceId);
  return `${safePrefix}-${terminal}-${ymd}-${String(seq).padStart(6, "0")}`;
}

export function parseTicketNumber(orderNumber) {
  const match = String(orderNumber || "").match(/^([A-Z0-9]+)-([A-Z0-9]+)-(\d{8})-(\d+)$/i);
  if (!match) return null;
  return {
    prefix: match[1].toUpperCase(),
    deviceCode: match[2].toUpperCase(),
    dateKey: `${match[3].slice(0, 4)}-${match[3].slice(4, 6)}-${match[3].slice(6, 8)}`,
    sequence: Number(match[4]),
  };
}

export function nextSequenceValue(current) {
  return Math.max(0, Number(current) || 0) + 1;
}

export function preserveClientTicketNumber(localOrder, serverOrder) {
  if (!localOrder?.order_number) return serverOrder;
  const clientNumber = localOrder.client_order_number || localOrder.order_number;
  return {
    ...serverOrder,
    client_order_number: clientNumber,
    order_number: clientNumber,
    server_order_number: serverOrder?.order_number || null,
    local_uuid: localOrder.local_uuid || localOrder.client_uuid || null,
  };
}

export function newGlobalOrderUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
