import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCachedSession,
  restoreLocalSession,
  saveCachedSession,
  SYNC_STATUS,
} from "./sessionCache.js";

globalThis.localStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    this.store.set(key, String(value));
  },
  removeItem(key) {
    this.store.delete(key);
  },
};

function fakeJwt({ exp, sub = "u1" } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub, exp })).toString("base64url");
  return `${header}.${payload}.sig`;
}

test("restoreLocalSession retourne null sans token", () => {
  localStorage.removeItem("access_token");
  clearCachedSession();
  assert.equal(restoreLocalSession(), null);
});

test("restoreLocalSession restaure le profil cache avec JWT valide", () => {
  const token = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  localStorage.setItem("access_token", token);
  saveCachedSession({ id: "u1", role: "SERVEUR", restaurant_id: "r1" });
  const result = restoreLocalSession();
  assert.equal(result?.user?.id, "u1");
  assert.equal(result?.source, "cache");
});

test("SYNC_STATUS expose PENDING_SYNC", () => {
  assert.equal(SYNC_STATUS.PENDING_SYNC, "PENDING_SYNC");
});
