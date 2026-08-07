import {
  formatApiError,
  friendlyNetworkMessage,
  isNetworkLikeMessage,
  markEffectiveOffline,
  shouldPreferLocalData,
} from "@/utils/network";
import { getApiBaseUrl, resolveApiBaseUrl } from "@/config/api";

/** Clé localStorage du jeton JWT (inchangée — pas de migration cookies ici). */
export const TOKEN_KEY = "access_token";

/** Événement DOM émis par apiFetch sur HTTP 401 pour déclencher la déconnexion. */
export const SESSION_EXPIRED_EVENT = "session-expired";

/** Délai par défaut online (réseau instable : bascule rapide, pas 30 s). */
export const DEFAULT_TIMEOUT_MS = 8_000;

/** Délai court lorsque hors ligne / offline effectif (P0.4). */
export const OFFLINE_TIMEOUT_MS = 2_500;

const REFRESH_PATH = "/api/v1/auth/refresh";

const TIMEOUT_MESSAGE =
  "La requête a pris trop de temps. Vérifiez votre connexion et réessayez.";

/** Promise partagée : une seule requête /auth/refresh pour N×401 concurrents. */
let refreshInFlight = null;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Prépare le corps et les en-têtes d'une requête JSON / FormData.
 * Conserve la compatibilité : une chaîne est considérée déjà sérialisée.
 */
function prepareRequestBody({ body, headers, json = true }) {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const needsEncoding = body !== undefined && json && !isFormData && typeof body !== "string";
  const payload = needsEncoding ? JSON.stringify(body) : body;
  const sendsJson = body !== undefined && json && !isFormData;

  return {
    payload,
    headers: {
      ...(sendsJson ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
  };
}

/**
 * Exécute fetch avec timeout (AbortController) et message utilisateur dédié.
 * Lie un signal externe éventuel pour permettre l'annulation manuelle.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const { signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" && timedOut) {
      throw new Error(TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Traite une réponse HTTP 401 définitive (refresh impossible ou déjà rejoué).
 * Ne s'applique qu'aux appels authentifiés (apiFetch, apiFetchText).
 */
function handleUnauthorized() {
  clearToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
  throw new Error("Session expirée, veuillez vous reconnecter.");
}

/**
 * Extrait un message d'erreur depuis une réponse texte (JSON ou brut).
 */
async function readErrorFromTextResponse(response, fallback) {
  const text = await response.text().catch(() => "");
  if (!text) return fallback;
  try {
    const data = JSON.parse(text);
    return formatApiError(data?.detail ?? data?.message ?? data?.error, fallback);
  } catch {
    return text.trim() || fallback;
  }
}

function isRefreshPath(path) {
  return typeof path === "string" && (path === REFRESH_PATH || path.endsWith(REFRESH_PATH));
}

/**
 * Renouvelle le JWT via le cookie HttpOnly refresh (credentials: include).
 * Dédupe les appels concurrents via une Promise partagée.
 *
 * Ne passe jamais par `request({ auth: true })` pour éviter toute boucle de refresh.
 *
 * @returns {Promise<string>} nouveau access_token
 */
export async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const url = `${getApiBaseUrl()}${REFRESH_PATH}`;
    let response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        DEFAULT_TIMEOUT_MS,
      );
    } catch (error) {
      const networkError = new Error(
        friendlyNetworkMessage(error, "Impossible de renouveler la session."),
      );
      networkError.isNetworkError = true;
      throw networkError;
    }

    if (!response.ok) {
      const authError = new Error("Session expirée, veuillez vous reconnecter.");
      authError.isAuthError = true;
      throw authError;
    }

    const data = await response.json().catch(() => null);
    const accessToken = data?.access_token;
    if (!accessToken) {
      throw new Error("Session expirée, veuillez vous reconnecter.");
    }

    setToken(accessToken);
    return accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Noyau interne partagé par apiFetch, apiFetchPublic et apiFetchText.
 *
 * @param {string} path - Chemin relatif (ex. `/api/v1/orders`)
 * @param {object} [options]
 * @param {boolean} [options.auth=true] - Attacher le Bearer token et gérer le 401
 * @param {"json"|"text"} [options.responseType="json"] - Format de la réponse attendue
 * @param {number} [options.timeout=DEFAULT_TIMEOUT_MS] - Délai max en ms (0 = désactivé)
 * @param {string} [options.fallback] - Message si le serveur ne fournit pas de détail
 * @param {boolean} [options._retry=false] - Marqueur interne anti-boucle (ne pas utiliser côté app)
 * @returns {Promise<object|string|null>}
 */
async function request(path, options = {}) {
  const {
    body,
    headers,
    json = true,
    fallback = "Action impossible: le serveur n'a pas fourni de détail.",
    auth = true,
    responseType = "json",
    timeout,
    _retry = false,
    ...fetchOptions
  } = options;

  const resolvedTimeout =
    typeof timeout === "number"
      ? timeout
      : shouldPreferLocalData()
        ? OFFLINE_TIMEOUT_MS
        : DEFAULT_TIMEOUT_MS;

  const token = auth ? getToken() : null;
  const { payload, headers: preparedHeaders } = prepareRequestBody({ body, headers, json });

  if (auth && shouldPreferLocalData()) {
    await resolveApiBaseUrl({ force: true });
  }

  const url = `${getApiBaseUrl()}${path}`;

  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        ...fetchOptions,
        credentials: fetchOptions.credentials ?? "include",
        body: payload,
        headers: {
          ...preparedHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      resolvedTimeout,
    );
  } catch (error) {
    markEffectiveOffline("apiFetch");
    const networkError = new Error(friendlyNetworkMessage(error, fallback));
    networkError.isNetworkError = true;
    throw networkError;
  }

  if (auth && response.status === 401) {
    const canRefresh = !_retry && !isRefreshPath(path);
    if (canRefresh) {
      try {
        await refreshAccessToken();
      } catch (error) {
        // P0.1 : une erreur réseau sur le refresh ne doit jamais logout.
        if (error?.isNetworkError || isNetworkLikeMessage(error?.message)) {
          markEffectiveOffline("refresh");
          const networkError = new Error(
            friendlyNetworkMessage(error, "Connexion indisponible. Session locale conservée."),
          );
          networkError.isNetworkError = true;
          throw networkError;
        }
        handleUnauthorized();
      }
      return request(path, {
        ...options,
        body,
        headers,
        json,
        fallback,
        auth,
        responseType,
        timeout: resolvedTimeout,
        _retry: true,
      });
    }
    handleUnauthorized();
  }

  if (response.status === 204) return null;

  if (!response.ok) {
    if (responseType === "text") {
      const err = new Error(await readErrorFromTextResponse(response, fallback));
      err.status = response.status;
      throw err;
    }
    const data = await response.json().catch(() => null);
    const err = new Error(formatApiError(data?.detail ?? data?.message ?? data?.error, fallback));
    err.status = response.status;
    throw err;
  }

  if (typeof window !== "undefined") {
    window.__bloomarApiReachable = true;
    window.__bloomarEffectiveOffline = false;
  }

  if (responseType === "text") {
    return response.text();
  }

  const data = await response.json().catch(() => null);
  return data;
}

/**
 * Appel API authentifié — point d'entrée principal de l'application.
 *
 * - Résout la base URL via `getApiBaseUrl()` (variable `VITE_API_URL`)
 * - Attache automatiquement `Authorization: Bearer <token>`
 * - Sérialise les objets en JSON ; laisse FormData et les chaînes intactes
 * - Abandonne la requête après `timeout` ms (défaut 30 s)
 * - Sur HTTP 401 : tente un refresh silencieux puis rejoue ; sinon purge + SESSION_EXPIRED_EVENT
 * - Normalise les erreurs réseau et HTTP en messages lisibles
 *
 * @example
 * const orders = await apiFetch("/api/v1/orders?limit=100");
 * await apiFetch("/api/v1/finance/expenses", {
 *   method: "POST",
 *   body: { total_amount: 5000 },
 *   fallback: "Impossible d'enregistrer la dépense.",
 * });
 *
 * @param {string} path
 * @param {object} [options] - Options fetch + `body`, `json`, `fallback`, `timeout`
 * @returns {Promise<object|null>}
 */
export async function apiFetch(path, options = {}) {
  return request(path, { ...options, auth: true, responseType: "json" });
}

/**
 * Appel API public — sans en-tête Authorization.
 *
 * À utiliser pour les routes accessibles sans session :
 * login, récupération de mot de passe, menu public, commandes publiques, etc.
 *
 * Ne déclenche pas la purge de session sur HTTP 401 (identifiants invalides au login).
 * Ne tente jamais de refresh automatique.
 *
 * @example
 * const session = await apiFetchPublic("/api/v1/auth/login", {
 *   method: "POST",
 *   body: { login: "admin", password: "secret" },
 *   fallback: "Connexion impossible.",
 * });
 * const menu = await apiFetchPublic(`/api/v1/menu/public/${slug}`);
 *
 * @param {string} path
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function apiFetchPublic(path, options = {}) {
  return request(path, { ...options, auth: false, responseType: "json" });
}

/**
 * Appel API authentifié dont la réponse est du texte brut (pas du JSON).
 *
 * À utiliser pour les exports FEC, rapports tabulaires, CSV, etc.
 * Gère le timeout, le Bearer token, le refresh silencieux et la session expirée comme `apiFetch`.
 *
 * @example
 * const fecContent = await apiFetchText("/api/v1/finance/reports/fec", {
 *   fallback: "Export FEC impossible.",
 * });
 *
 * @param {string} path
 * @param {object} [options]
 * @returns {Promise<string|null>}
 */
export async function apiFetchText(path, options = {}) {
  return request(path, { ...options, auth: true, responseType: "text" });
}

/** Hooks de test uniquement — ne pas utiliser dans l'application. */
export const __httpTestHooks = {
  getRefreshInFlight: () => refreshInFlight,
  resetRefreshInFlight: () => {
    refreshInFlight = null;
  },
  isRefreshPath,
};
