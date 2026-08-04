import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCachedSession,
  decodeAccessTokenPayload,
  isAccessTokenUsable,
  loadCachedSession,
  saveCachedSession,
} from "./sessionCache.js";

function fakeJwt({ exp, sub = "u1" } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub, exp })).toString("base64url");
  return `${header}.${payload}.sig`;
}

test("decodeAccessTokenPayload lit le payload JWT", () => {
  const token = fakeJwt({ exp: 2_000_000_000, sub: "abc" });
  const payload = decodeAccessTokenPayload(token);
  assert.equal(payload.sub, "abc");
  assert.equal(payload.exp, 2_000_000_000);
});

test("isAccessTokenUsable refuse un JWT expiré", () => {
  const expired = fakeJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
  assert.equal(isAccessTokenUsable(expired), false);
});

test("isAccessTokenUsable accepte un JWT valide", () => {
  const valid = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  assert.equal(isAccessTokenUsable(valid), true);
});

test("save/loadCachedSession round-trip", () => {
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

  saveCachedSession({ id: "1", username: "serveuse", role: "SERVEUR" });
  const loaded = loadCachedSession();
  assert.equal(loaded.username, "serveuse");
  clearCachedSession();
  assert.equal(loadCachedSession(), null);
});
