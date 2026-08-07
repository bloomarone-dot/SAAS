/**
 * Verrouillage session de caisse — une session active par caisse (register).
 */

export class CashSessionConflictError extends Error {
  constructor(message, conflict) {
    super(message);
    this.name = "CashSessionConflictError";
    this.conflict = conflict;
  }
}

export const DEFAULT_REGISTER_ID = "main";

export const MANAGER_ROLES = new Set(["ADMIN", "MANAGER", "SUPERADMIN"]);

export function normalizeRegisterId(registerId) {
  return String(registerId || DEFAULT_REGISTER_ID).trim() || DEFAULT_REGISTER_ID;
}

/**
 * Évalue une tentative d'ouverture / reprise.
 * @returns {{ action: 'open'|'resume'|'takeover', session?: object }}
 */
export function evaluateCashSessionAccess(existingSession, {
  userId = null,
  deviceId = null,
  role = null,
  forceResume = false,
} = {}) {
  if (!existingSession || String(existingSession.status || "").toUpperCase() !== "OPEN") {
    return { action: "open" };
  }

  const sameUser = userId && existingSession.opened_by_user_id === userId;
  const sameDevice = deviceId && existingSession.locked_by_device_id === deviceId;
  const isManager = MANAGER_ROLES.has(String(role || "").toUpperCase());

  if (sameUser && sameDevice) {
    return { action: "resume", session: existingSession };
  }

  if (forceResume && (sameUser || isManager)) {
    return { action: "takeover", session: existingSession };
  }

  throw new CashSessionConflictError(
    sameUser
      ? "Cette caisse est ouverte sur un autre appareil. Reprenez la session pour continuer."
      : `Caisse ouverte par ${existingSession.opened_by_name || "un autre utilisateur"}.`,
    {
      registerId: existingSession.cash_register_id || DEFAULT_REGISTER_ID,
      openedByUserId: existingSession.opened_by_user_id,
      openedByName: existingSession.opened_by_name,
      lockedByDeviceId: existingSession.locked_by_device_id,
      lockedAt: existingSession.locked_at,
      canResume: sameUser || isManager,
      session: existingSession,
    },
  );
}

export function applySessionLock(session, { userId, deviceId, userName }) {
  const lockToken = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `lock_${Date.now()}`;
  return {
    ...session,
    locked_by_user_id: userId || session.opened_by_user_id,
    locked_by_device_id: deviceId,
    locked_at: new Date().toISOString(),
    lock_token: lockToken,
    opened_by_name: userName || session.opened_by_name,
  };
}
