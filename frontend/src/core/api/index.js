/**
 * Couche API partagée (SaaS marketing, vitrine restaurant, dashboard).
 * Réexporte l'implémentation existante — pas de duplication.
 */
export { getApiBaseUrl, getLanApiBaseUrl, setLanApiBaseUrl, resolveApiBaseUrl, isLanApiReachable, isApiReachable } from "@/config/api";
export {
  apiFetch,
  apiFetchPublic,
  apiFetchText,
  getToken,
  setToken,
  clearToken,
  TOKEN_KEY,
  SESSION_EXPIRED_EVENT,
  refreshAccessToken,
} from "@/config/http";
