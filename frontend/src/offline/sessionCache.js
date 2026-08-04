/**
 * Cache de session pour reprise offline (P0.1).
 * Ne remplace pas le JWT : il stocke le profil utilisateur pour rouvrir l'app
 * quand /auth/me est inaccessible à cause du réseau.
 */

const SESSION_KEY = "offline_session_user";
const BRANDING_KEY = "offline_restaurant_branding";

export function decodeAccessTokenPayload(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** true si le JWT local n'est pas expiré (marge 30 s). Sans `exp`, on considère le token utilisable. */
export function isAccessTokenUsable(token, skewMs = 30_000) {
  if (!token) return false;
  const payload = decodeAccessTokenPayload(token);
  if (!payload) return false;
  if (payload.exp == null) return true;
  return Number(payload.exp) * 1000 > Date.now() + skewMs;
}

export function saveCachedSession(user) {
  if (!user?.id) return;
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        user,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadCachedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.user || null;
  } catch {
    return null;
  }
}

export function clearCachedSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function saveCachedBranding(restaurantId, branding) {
  if (!restaurantId || !branding) return;
  try {
    localStorage.setItem(
      BRANDING_KEY,
      JSON.stringify({
        restaurantId,
        savedAt: new Date().toISOString(),
        branding,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function loadCachedBranding(restaurantId) {
  try {
    const raw = localStorage.getItem(BRANDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (restaurantId && data.restaurantId && String(data.restaurantId) !== String(restaurantId)) {
      return null;
    }
    return data.branding || null;
  } catch {
    return null;
  }
}

export function clearCachedBranding() {
  try {
    localStorage.removeItem(BRANDING_KEY);
  } catch {
    /* ignore */
  }
}
