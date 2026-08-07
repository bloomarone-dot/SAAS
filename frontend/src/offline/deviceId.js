/**
 * Identifiant permanent de l'appareil — utilisé pour traçabilité et anti-doublons.
 */

const DEVICE_ID_KEY = "bloomar_device_id";

function generateDeviceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `dev_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

/** Retourne l'ID appareil (créé une seule fois, persisté localStorage). */
export function getDeviceId() {
  if (typeof localStorage === "undefined") return "node-device";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return generateDeviceId();
  }
}

export function withDeviceMeta(payload = {}) {
  return {
    ...payload,
    deviceId: getDeviceId(),
  };
}
