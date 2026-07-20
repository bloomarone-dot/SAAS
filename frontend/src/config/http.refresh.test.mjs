/**
 * Tests du refresh automatique JWT (Phase 3.4).
 * Exécution : node src/config/http.refresh.test.mjs  (depuis frontend/)
 */
import assert from "node:assert/strict";
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../..");

function createLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function jsonResponse(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadHttpModule() {
  const storage = createLocalStorage();
  const events = [];

  globalThis.localStorage = storage;
  globalThis.window = {
    location: { origin: "http://localhost:5173" },
    dispatchEvent: (event) => {
      events.push(event.type);
      return true;
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });
  if (typeof globalThis.FormData === "undefined") {
    globalThis.FormData = class FormData {};
  }

  const server = await createServer({
    root: frontendRoot,
    configFile: path.join(frontendRoot, "vite.config.js"),
    server: { middlewareMode: true },
    appType: "custom",
  });

  const http = await server.ssrLoadModule("/src/config/http.js");
  return { http, storage, events, close: () => server.close() };
}

async function run() {
  let passed = 0;
  const cases = [];

  async function test(name, fn) {
    cases.push(name);
    const ctx = await loadHttpModule();
    try {
      await fn(ctx);
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(error);
      process.exitCode = 1;
    } finally {
      ctx.http.__httpTestHooks.resetRefreshInFlight();
      await ctx.close();
    }
  }

  await test("refresh réussi met à jour le token", async ({ http, storage }) => {
    storage.setItem("access_token", "old-token");
    let refreshCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        assert.equal(options.credentials, "include");
        assert.equal(options.method, "POST");
        return jsonResponse(200, { access_token: "new-token", refresh_token: "r2" });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const token = await http.refreshAccessToken();
    assert.equal(token, "new-token");
    assert.equal(storage.getItem("access_token"), "new-token");
    assert.equal(refreshCalls, 1);
  });

  await test("refresh échoué ne met pas à jour le token", async ({ http, storage }) => {
    storage.setItem("access_token", "old-token");
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/v1/auth/refresh")) {
        return jsonResponse(401, { detail: "invalid" });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    await assert.rejects(() => http.refreshAccessToken(), /Session expirée/);
    assert.equal(storage.getItem("access_token"), "old-token");
  });

  await test("une seule requête refresh malgré plusieurs 401 simultanés", async ({ http, storage }) => {
    storage.setItem("access_token", "expired");
    let refreshCalls = 0;
    let resolveRefresh;
    const refreshGate = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    globalThis.fetch = async (url, options) => {
      const path = String(url);
      if (path.includes("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        await refreshGate;
        return jsonResponse(200, { access_token: "fresh-token" });
      }
      const auth = options?.headers?.Authorization;
      if (auth === "Bearer expired") {
        return jsonResponse(401, { detail: "expired" });
      }
      if (auth === "Bearer fresh-token") {
        return jsonResponse(200, { ok: true, path });
      }
      return jsonResponse(500, { detail: "bad auth" });
    };

    const requests = Promise.all([
      http.apiFetch("/api/v1/orders"),
      http.apiFetch("/api/v1/stock/items"),
      http.apiFetch("/api/v1/finance/expenses"),
    ]);

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(refreshCalls, 1, "un seul refresh doit être en vol");
    resolveRefresh();
    const results = await requests;
    assert.equal(results.length, 3);
    assert.equal(refreshCalls, 1);
    assert.equal(storage.getItem("access_token"), "fresh-token");
  });

  await test("requête originale rejouée après refresh", async ({ http, storage }) => {
    storage.setItem("access_token", "expired");
    const calls = [];
    globalThis.fetch = async (url, options) => {
      const path = String(url);
      calls.push({ path, auth: options?.headers?.Authorization });
      if (path.includes("/api/v1/auth/refresh")) {
        return jsonResponse(200, { access_token: "fresh-token" });
      }
      if (options?.headers?.Authorization === "Bearer expired") {
        return jsonResponse(401, { detail: "expired" });
      }
      return jsonResponse(200, { replayed: true });
    };

    const data = await http.apiFetch("/api/v1/orders?limit=1");
    assert.equal(data.replayed, true);
    assert.equal(calls.filter((c) => c.path.includes("/orders")).length, 2);
    assert.equal(calls.filter((c) => c.path.includes("/auth/refresh")).length, 1);
  });

  await test("pas de boucle infinie sur /auth/refresh", async ({ http, storage, events }) => {
    storage.setItem("access_token", "expired");
    let refreshCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(401, { detail: "dead" });
      }
      return jsonResponse(401, { detail: "expired" });
    };

    await assert.rejects(() => http.apiFetch("/api/v1/auth/refresh"), /Session expirée/);
    // Un seul appel = la requête initiale ; pas de second refresh automatique.
    assert.equal(refreshCalls, 1, "ne doit pas rejouer /auth/refresh en boucle");
    assert.ok(events.includes("session-expired"));
  });

  await test("apiFetchPublic inchangé (pas de refresh sur 401)", async ({ http, storage }) => {
    storage.setItem("access_token", "any");
    let refreshCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, { access_token: "x" });
      }
      return jsonResponse(401, { detail: "Identifiants invalides" });
    };

    await assert.rejects(
      () => http.apiFetchPublic("/api/v1/auth/login", { method: "POST", body: { login: "a", password: "b" } }),
      /Identifiants invalides/,
    );
    assert.equal(refreshCalls, 0);
    assert.equal(storage.getItem("access_token"), "any");
  });

  await test("apiFetchText rejoue après refresh", async ({ http, storage }) => {
    storage.setItem("access_token", "expired");
    globalThis.fetch = async (url, options) => {
      const path = String(url);
      if (path.includes("/api/v1/auth/refresh")) {
        return jsonResponse(200, { access_token: "fresh-token" });
      }
      if (options?.headers?.Authorization === "Bearer expired") {
        return jsonResponse(401, { detail: "expired" });
      }
      return new Response("col1;col2", { status: 200, headers: { "Content-Type": "text/plain" } });
    };

    const text = await http.apiFetchText("/api/v1/finance/reports/fec");
    assert.equal(text, "col1;col2");
    assert.equal(storage.getItem("access_token"), "fresh-token");
  });

  await test("refresh échoué purge token et émet SESSION_EXPIRED_EVENT", async ({ http, storage, events }) => {
    storage.setItem("access_token", "expired");
    globalThis.fetch = async (url) => {
      if (String(url).includes("/api/v1/auth/refresh")) {
        return jsonResponse(401, { detail: "invalid refresh" });
      }
      return jsonResponse(401, { detail: "expired" });
    };

    await assert.rejects(() => http.apiFetch("/api/v1/orders"), /Session expirée/);
    assert.equal(storage.getItem("access_token"), null);
    assert.ok(events.includes("session-expired"));
  });

  console.log(`\n${passed}/${cases.length} tests passed`);
  if (passed !== cases.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
