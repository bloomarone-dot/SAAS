/**
 * Séquence locale de numérotation tickets — par tenant + device + jour.
 */

import { idbGet, idbPut, STORES } from "@/offline/db";
import { initOfflineFoundation } from "@/offline/store";
import { getDeviceId } from "@/offline/deviceId";
import { businessDateKey } from "@/offline/cashSessionCore.js";
import {
  DEFAULT_TICKET_PREFIX,
  formatTicketNumber,
  nextSequenceValue,
  ticketSequenceMetaKey,
} from "@/offline/ticketSequenceCore.js";

export async function getTicketPrefix(tenantId) {
  await initOfflineFoundation();
  const row = await idbGet(STORES.meta, `ticket_prefix:${tenantId}`);
  return row?.prefix || DEFAULT_TICKET_PREFIX;
}

export async function saveTicketPrefix(tenantId, prefix) {
  if (!tenantId) return null;
  await initOfflineFoundation();
  const safe = String(prefix || DEFAULT_TICKET_PREFIX).toUpperCase().slice(0, 8);
  await idbPut(STORES.meta, {
    key: `ticket_prefix:${tenantId}`,
    prefix: safe,
    savedAt: new Date().toISOString(),
  });
  return safe;
}

export async function peekTicketSequence(tenantId, dateKey = businessDateKey(), deviceId = getDeviceId()) {
  if (!tenantId) return 0;
  await initOfflineFoundation();
  const row = await idbGet(STORES.meta, ticketSequenceMetaKey(tenantId, dateKey, deviceId));
  return Number(row?.lastSequence || 0);
}

export async function nextLocalTicketNumber(tenantId, {
  dateKey = businessDateKey(),
  prefix = null,
  deviceId = getDeviceId(),
} = {}) {
  if (!tenantId) throw new Error("tenantId requis pour numéroter un ticket.");
  await initOfflineFoundation();

  const ticketPrefix = prefix || (await getTicketPrefix(tenantId));
  const metaKey = ticketSequenceMetaKey(tenantId, dateKey, deviceId);
  const row = await idbGet(STORES.meta, metaKey);
  const nextSeq = nextSequenceValue(row?.lastSequence);

  await idbPut(STORES.meta, {
    key: metaKey,
    tenantId,
    deviceId,
    lastSequence: nextSeq,
    dateKey,
    prefix: ticketPrefix,
    savedAt: new Date().toISOString(),
  });

  return formatTicketNumber(ticketPrefix, dateKey, nextSeq, deviceId);
}

export {
  formatTicketNumber,
  parseTicketNumber,
  preserveClientTicketNumber,
  newGlobalOrderUuid,
  deviceShortCode,
} from "./ticketSequenceCore.js";
