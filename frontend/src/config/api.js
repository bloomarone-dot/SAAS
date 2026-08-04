const LAN_KEY = "bloomar_lan_api_url";
const ACTIVE_BASE_KEY = "__bloomarActiveApiBase";
const API_REACHABLE_KEY = "__bloomarApiReachable";
const LAN_REACHABLE_KEY = "__bloomarLanReachable";
const PROBE_TTL_MS = 20_000;

let probePromise = null;
let probeExpiresAt = 0;

function normalizeBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function getPrimaryApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured || configured === "/") {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }
  return normalizeBase(configured);
}

export function getLanApiBaseUrl() {
  if (typeof window === "undefined") {
    return normalizeBase(import.meta.env.VITE_LAN_API_URL);
  }
  const stored = localStorage.getItem(LAN_KEY);
  if (stored?.trim()) return normalizeBase(stored);
  return normalizeBase(import.meta.env.VITE_LAN_API_URL);
}

export function setLanApiBaseUrl(url) {
  if (typeof window === "undefined") return;
  const normalized = normalizeBase(url);
  if (normalized) localStorage.setItem(LAN_KEY, normalized);
  else localStorage.removeItem(LAN_KEY);
  invalidateApiProbe();
}

export function invalidateApiProbe() {
  probeExpiresAt = 0;
  probePromise = null;
}

function markApiReachable(base, { viaLan = false } = {}) {
  if (typeof window === "undefined") return base;
  window[ACTIVE_BASE_KEY] = base;
  window[API_REACHABLE_KEY] = true;
  window[LAN_REACHABLE_KEY] = viaLan;
  probeExpiresAt = Date.now() + PROBE_TTL_MS;
  return base;
}

function markApiUnreachable() {
  if (typeof window === "undefined") return;
  window[API_REACHABLE_KEY] = false;
  window[LAN_REACHABLE_KEY] = false;
}

async function probeBase(base) {
  if (!base) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2_500);
    const response = await fetch(`${base}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export function isApiReachable() {
  if (typeof window === "undefined") return true;
  return window[API_REACHABLE_KEY] === true;
}

export function isLanApiReachable() {
  if (typeof window === "undefined") return false;
  return window[LAN_REACHABLE_KEY] === true;
}

/** URL active utilisée par les appels API (cloud ou serveur local Wi‑Fi). */
export function getApiBaseUrl() {
  if (typeof window !== "undefined" && window[ACTIVE_BASE_KEY]) {
    return window[ACTIVE_BASE_KEY];
  }
  return getPrimaryApiBaseUrl();
}

/**
 * Teste le cloud puis le serveur local Wi‑Fi.
 * Permet aux tablettes de rester synchronisées quand Internet est coupé mais le Wi‑Fi local fonctionne.
 */
export async function resolveApiBaseUrl({ force = false } = {}) {
  if (
    !force
    && typeof window !== "undefined"
    && window[ACTIVE_BASE_KEY]
    && Date.now() < probeExpiresAt
  ) {
    return window[ACTIVE_BASE_KEY];
  }

  if (probePromise && !force) return probePromise;

  probePromise = (async () => {
    const primary = getPrimaryApiBaseUrl();
    const lan = getLanApiBaseUrl();

    if (await probeBase(primary)) {
      return markApiReachable(primary, { viaLan: false });
    }

    if (lan && lan !== primary && await probeBase(lan)) {
      return markApiReachable(lan, { viaLan: true });
    }

    markApiUnreachable();
    probeExpiresAt = Date.now() + 5_000;
    return primary;
  })();

  try {
    return await probePromise;
  } finally {
    probePromise = null;
  }
}

export function getApiWsBaseUrl() {
  return getApiBaseUrl().replace(/^http/, "ws");
}
