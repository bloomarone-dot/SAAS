# Architecture Offline First — Restaurant SAAS (Phase 3)

> Objectif : POS comparable à Toast / Square — **le serveur sert uniquement à synchroniser**.

## 1. Audit — problèmes corrigés

| # | Problème | Fichier(s) | Statut |
|---|----------|------------|--------|
| P0 | `await resolveApiBaseUrl()` bloquait le 1er rendu | `main.jsx` | ✅ Render immédiat |
| P0 | Splash bootstrap bloquant | `App.jsx` | ✅ Supprimé |
| P0 | `/auth/me` bloquant au boot | `App.jsx` | ✅ Background only |
| P0 | Reprise serveur bloquante | `ServerWorkspace.jsx` | ✅ Non bloquant |
| P0 | Menu/tables : spinner avant cache | `TableGrid`, `ServerWorkspace` | ✅ Paint instantané |
| P0 | CategoriesPage réseau-first | `CategoriesPage.jsx` | ✅ `loadLocalFirst` |
| P1 | Stats serveur reset sur erreur | `ServerWorkspace.jsx` | ✅ Conserve stale |
| P1 | Dashboard admin wipe data | `AdminDashboard.jsx` | ✅ Conserve stale |
| P1 | Import stock logout réseau | `Import.jsx` | ✅ Network-safe |
| P1 | Sync sans backoff | `sync.js` | ✅ Exponentiel + nextRetryAt |
| P1 | Pas de sync auto reconnexion | `syncEngine.js` | ✅ Moteur auto |
| P2 | TanStack Query absent | `queryClient.jsx` | ✅ Provider + persist IDB |
| P2 | Modes paiement / TVA non persistés | `offlineCache.js`, `warmup.js` | ✅ Cache étendu |

## 2. Architecture cible

```
React Shell (render < 2s, jamais await API)
    │
    ├─ restoreLocalSession() [sync]
    ├─ loadLocalFirst / applySyncCache [SWR]
    ├─ IndexedDB bloomar_offline_v1
    │     catalog, tables, orders, kitchenTickets, syncQueue, meta
    ├─ PendingOperations (syncQueue)
    │     uuid, endpoint, method, payload, retryCount, idempotencyKey
    ├─ Sync Engine (syncEngine.js) — auto flush + backoff
    ├─ TanStack Query (offlineFirst, persist IndexedDB)
    └─ Service Worker (Workbox) — shell JS/CSS/assets
              │
              ▼ background only
         Backend API
```

## 3. Fichiers créés / modifiés (Phase 3)

| Fichier | Rôle |
|---------|------|
| `offline/syncEngine.js` | Sync auto reconnexion, backoff |
| `offline/queryClient.jsx` | TanStack Query offlineFirst + persist |
| `offline/localFirst.js` | `applySyncCache` paint instantané |
| `main.jsx` | Render immédiat, probe background |
| `App.jsx` | Pas de splash, badge 🟢/🔴/🟡 |
| `CategoriesPage.jsx` | Menu local-first |
| `TableGrid.jsx` | Tables depuis cache sync |
| `ServerWorkspace.jsx` | Reprise non bloquante |
| `sync.js` | PendingOperations enrichi, backoff |
| `syncHelpers.js` | `computeRetryDelayMs` |
| `offlineCache.js` | Payment modes / TVA |
| `warmup.js` | Persist taxes, imprimantes |

## 4. Tests

```bash
cd frontend && npm run test:offline   # 16 tests
npm run build                          # PWA + SW OK
```

### Tests manuels obligatoires

| Scénario | Procédure | Attendu |
|----------|-----------|---------|
| Backend arrêté | `docker stop backend` | App ouvre, menu/tables OK |
| Chrome Offline | DevTools → Offline | Badge 🔴, ops locales |
| Réseau lent | Throttling 3G | Cache affiché, refresh background |
| Timeout | Bloquer API 30s+ | Pas de logout, pas de wipe |
| DNS fail | Mauvaise URL API | Mode offline, session locale |
| Reconnexion | Online après 4h offline | Sync auto 🟡 → 🟢 |

## 5. Checklist opérationnelle

1. **Une fois par tablette** (online) : login → Serveur + Caisse → PWA installée
2. **Offline** : icône PWA → commandes → cuisine → caisse espèces → impression
3. **Reconnexion** : sync automatique sans action utilisateur

## 6. Limites connues

- **1ère connexion** sur appareil neuf : réseau requis (login + warmup)
- **Mobile Money live** : online only (by design)
- **Admin analytics** : stale data offline, refresh au retour réseau
- **Dev Vite** : pas de SW — utiliser `Dockerfile.prod` en prod

## 7. Garanties POS

| Action | Offline (cache OK) |
|--------|-------------------|
| Démarrer app | ✅ |
| Session | ✅ |
| Menu / tables | ✅ |
| Commandes | ✅ PENDING_SYNC |
| Cuisine / bar | ✅ |
| Caisse espèces | ✅ |
| Impression | ✅ |
| Sync auto | ✅ |
