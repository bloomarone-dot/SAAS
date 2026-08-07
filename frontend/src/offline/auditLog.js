/**
 * Journal d'audit local — store IndexedDB auditLogs (v2).
 */

import { idbGet, idbGetAllByIndex, idbPut, idbDelete, STORES } from "@/offline/db";
import { initOfflineFoundation } from "@/offline/store";
import { getDeviceId } from "@/offline/deviceId";
import {
  AUDIT_ACTIONS,
  auditLogMetaKey,
  buildAuditEntry,
  MAX_AUDIT_ENTRIES,
  trimAuditEntries,
} from "@/offline/auditLogCore.js";

export { AUDIT_ACTIONS };

function newUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function migrateMetaAuditToStore(tenantId) {
  const legacy = await idbGet(STORES.meta, auditLogMetaKey(tenantId));
  if (!legacy?.entries?.length) return;
  for (const entry of legacy.entries) {
    await idbPut(STORES.auditLogs, entry);
  }
  await idbDelete(STORES.meta, auditLogMetaKey(tenantId));
}

export async function appendAuditLog({
  tenantId,
  userId = null,
  action,
  resource = null,
  syncStatus = "LOCAL",
  details = null,
} = {}) {
  if (!tenantId || !action) return null;
  await initOfflineFoundation();
  await migrateMetaAuditToStore(tenantId).catch(() => {});

  const entry = buildAuditEntry({
    uuid: newUuid(),
    tenantId,
    userId,
    action,
    resource,
    timestamp: new Date().toISOString(),
    deviceId: getDeviceId(),
    syncStatus,
    details,
  });

  await idbPut(STORES.auditLogs, entry);

  const count = await idbGetAllByIndex(STORES.auditLogs, "tenantId", tenantId);
  if (count.length > MAX_AUDIT_ENTRIES) {
    const overflow = trimAuditEntries(count, MAX_AUDIT_ENTRIES);
    const keep = new Set(overflow.map((row) => row.uuid));
    for (const row of count) {
      if (!keep.has(row.uuid)) await idbDelete(STORES.auditLogs, row.uuid);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-audit-log", { detail: entry }));
  }

  return entry;
}

export async function loadAuditLog(tenantId, { limit = 200 } = {}) {
  if (!tenantId) return [];
  await initOfflineFoundation();
  await migrateMetaAuditToStore(tenantId).catch(() => {});
  const rows = await idbGetAllByIndex(STORES.auditLogs, "tenantId", tenantId);
  return rows
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, Math.max(1, limit));
}

export async function countAuditLog(tenantId) {
  if (!tenantId) return 0;
  await initOfflineFoundation();
  return idbGetAllByIndex(STORES.auditLogs, "tenantId", tenantId).then((rows) => rows.length);
}
