import { formatApiError, friendlyNetworkMessage } from "@/utils/network";
import { getApiBaseUrl } from "@/config/api";

export const TOKEN_KEY = "access_token";
export const SESSION_EXPIRED_EVENT = "session-expired";

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
 * Point d'entree unique pour tous les appels API authentifies.
 * - resout la base URL et attache le bearer token
 * - serialise le JSON et pose le bon Content-Type
 * - sur 401 (token expire ou revoque via token_version cote backend),
 *   purge la session et notifie l'app pour rediriger vers le login
 * - normalise les erreurs reseau/HTTP en message lisible
 */
export async function apiFetch(path, { body, headers, json = true, fallback = "Action impossible.", ...options } = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  // Une chaine est consideree deja serialisee (compat appels existants); seul un
  // objet est encode en JSON automatiquement.
  const needsEncoding = body !== undefined && json && !isFormData && typeof body !== "string";
  const payload = needsEncoding ? JSON.stringify(body) : body;
  const sendsJson = body !== undefined && json && !isFormData;

  let response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      body: payload,
      headers: {
        ...(sendsJson ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers ?? {}),
      },
    });
  } catch (error) {
    throw new Error(friendlyNetworkMessage(error, fallback));
  }

  if (response.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new Error("Session expirée, veuillez vous reconnecter.");
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(formatApiError(data?.detail, fallback));
  }
  return data;
}
