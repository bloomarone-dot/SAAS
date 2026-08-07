/**
 * Moteur de synchronisation automatique — reprise au retour réseau avec backoff exponentiel.
 */

import { getApiBaseUrl, isApiReachable, resolveApiBaseUrl } from "@/config/api";
import { flushOfflineQueue, getOfflineQueueStats } from "@/offline/sync";
import { clearEffectiveOffline, shouldPreferLocalData } from "@/utils/network";

const BASE_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 120_000;
let engineStarted = false;
let backoffMs = BASE_INTERVAL_MS;
let timerId = null;
let flushing = false;

function emit(name, detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export function resetSyncBackoff() {
  backoffMs = BASE_INTERVAL_MS;
}

export function getSyncBackoffMs() {
  return backoffMs;
}

async function tick() {
  if (flushing) return;
  if (shouldPreferLocalData() && !isApiReachable()) return;

  const stats = getOfflineQueueStats();
  if (stats.total === 0) {
    backoffMs = BASE_INTERVAL_MS;
    return;
  }

  flushing = true;
  emit("offline-sync-started", { auto: true, total: stats.total });
  try {
    await resolveApiBaseUrl({ force: true }).catch(() => {});
    if (isApiReachable()) clearEffectiveOffline();
    const result = await flushOfflineQueue(getApiBaseUrl());
    if (result.synced > 0) {
      resetSyncBackoff();
      emit("offline-sync-finished", { ...result, auto: true });
    } else if (result.skipped) {
      backoffMs = Math.min(backoffMs * 2, MAX_INTERVAL_MS);
    } else if (result.remaining > 0) {
      backoffMs = Math.min(backoffMs * 1.5, MAX_INTERVAL_MS);
    }
  } catch {
    backoffMs = Math.min(backoffMs * 2, MAX_INTERVAL_MS);
  } finally {
    flushing = false;
    scheduleNext();
  }
}

function scheduleNext() {
  if (timerId) clearTimeout(timerId);
  const stats = getOfflineQueueStats();
  const delay = stats.total > 0 ? backoffMs : BASE_INTERVAL_MS;
  timerId = setTimeout(tick, delay);
}

export function startSyncEngine() {
  if (engineStarted || typeof window === "undefined") return;
  engineStarted = true;

  window.addEventListener("online", () => {
    resetSyncBackoff();
    tick();
  });

  window.addEventListener("offline-queue-changed", () => {
    resetSyncBackoff();
    scheduleNext();
  });

  window.addEventListener("offline-warmup-finished", () => {
    resetSyncBackoff();
    tick();
  });

  scheduleNext();
}

export function stopSyncEngine() {
  if (timerId) clearTimeout(timerId);
  timerId = null;
  engineStarted = false;
}
