# Architecture Offline First — Restaurant SAAS

> Objectif : fonctionner comme Toast POS / Square POS — **le serveur sert uniquement à synchroniser**.

## 1. Audit — problèmes identifiés

| # | Problème | Fichier(s) | Impact | Statut |
|---|----------|------------|--------|--------|
| P0 | Bootstrap attendait `/auth/me` avant d'ouvrir l'app | `App.jsx` | Écran vide / login bloqué | ✅ Corrigé |
| P0 | Session cache non restaurée au premier rendu | `App.jsx` | Flash login hors ligne | ✅ Corrigé |
| P0 | 401 sur refresh background → logout | `http.js` | Déconnexion intempestive | ✅ `softAuth` |
| P0 | Menu / tables : réseau d'abord | `ServerWorkspace`, `TableGrid` | Timeout 8s, page vide | ✅ `loadLocalFirst` |
| P0 | Commande table : API d'abord | `TableSessionModal` | Impossible de commander | ✅ Corrigé |
| P1 | Pas de `sync_status` sur commandes locales | `ops.js` | Traçabilité sync | ✅ `PENDING_SYNC` |
| P1 | File sync sans `idempotencyKey` | `sync.js` | Risque doublons | ✅ UUID |
| P1 | Badge connexion masqué en ligne | `SyncStatus` | Utilisateur non informé | ✅ Toujours visible |
| P2 | React Query non utilisé | — | N/A (cache custom) | ⏳ Phase 3 |
| P2 | Pas de React Query persist | — | — | ⏳ Optionnel |
| P2 | Taxes / imprimantes non persistées | — | Caisse avancée | ⏳ Phase 4 |
| P2 | Login initial sans cache impossible | `PublicAuthPages` | 1ère connexion requiert réseau | ⚠️ By design |
| P2 | SW absent en dev Vite | `Dockerfile` vs `Dockerfile.prod` | Dev ne teste pas offline | ⚠️ Utiliser prod |

## 2. Architecture cible

```
┌─────────────────────────────────────────────────────────┐
│                    UI (React)                           │
│  Serveur │ Caisse │ Cuisine │ Admin                     │
└───────────────────────────┬─────────────────────────────┘
                            │ loadLocalFirst (SWR)
┌───────────────────────────▼─────────────────────────────┐
│              Offline Layer (frontend/src/offline)       │
│  bootstrap.js │ localFirst.js │ ops.js │ sync.js        │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  localStorage         IndexedDB           Service Worker
  (session, queue)   (catalog, orders,    (shell JS/CSS,
                      tables, tickets)      manifest)
                            │
                            ▼ (background only)
                      Sync Engine
                            │
                            ▼
                      Backend API
```

### Principes

1. **Local First** — lire cache → afficher → refresh réseau en arrière-plan
2. **Write Local** — toute mutation → IndexedDB + Sync Queue (`PENDING_SYNC`)
3. **Network = hint** — erreur réseau ≠ logout, ≠ vider cache
4. **Sync ordered** — file typée, dédupliquée, idempotente

## 3. Plan de migration (phases)

### Phase 1 — Démarrage & auth ✅ (cette PR)
- [x] `restoreLocalSession()` synchrone au boot
- [x] `bootstrapOfflineFirst()` sans await API
- [x] `softAuth` sur refresh background
- [x] Badge 🟢/🔴 permanent

### Phase 2 — Données métier ✅ (cette PR)
- [x] Menu / tables : `loadLocalFirst`
- [x] Commandes : `sync_status: PENDING_SYNC`
- [x] Sync queue : `idempotencyKey`

### Phase 3 — Caisse & cuisine (à venir)
- [ ] Caisse : rapport local-first systématique
- [ ] `VITE_KITCHEN_ENABLED=true` en prod
- [ ] Warmup automatique post-login obligatoire

### Phase 4 — Infra tablettes
- [ ] Déployer `Dockerfile.prod` (nginx + SW)
- [ ] Installer PWA sur chaque tablette (1× online)
- [ ] Configurer `VITE_LAN_API_URL` / IP locale VPS

### Phase 5 — Tests réseau
- [ ] Script coupure réseau (Chrome DevTools offline)
- [ ] Test backend arrêté (`docker stop backend`)
- [ ] Test 4h offline continu

## 4. Fichiers modifiés

| Fichier | Rôle |
|---------|------|
| `offline/bootstrap.js` | Boot sans API, hydratation, sync background |
| `offline/localFirst.js` | Pattern stale-while-revalidate |
| `offline/bootstrap.test.js` | Tests session locale |
| `App.jsx` | Session synchrone, badge, bootstrap |
| `config/http.js` | `softAuth` — pas de logout réseau |
| `offline/sync.js` | `idempotencyKey`, sync LAN |
| `offline/ops.js` | `PENDING_SYNC` |
| `ServerWorkspace.jsx` | Menu local-first |
| `TableGrid.jsx` | Tables local-first |
| `TableSessionModal.jsx` | Commandes offline-first |
| `main.jsx` | Probe API non bloquant |
| `vite.config.js` | PWA navigateFallbackDenylist |

## 5. Checklist opérationnelle (restaurant)

1. **Une fois par tablette** (avec Internet) :
   - Se connecter
   - Ouvrir Serveur + Caisse (warmup menu/tables)
   - « Ajouter à l'écran d'accueil » (PWA)

2. **Sans Internet** :
   - Ouvrir l'icône PWA
   - Serveur : tables → commande → plats → cuisine
   - Caisse : espèces / carte / dépôt manuel
   - Sync auto au retour réseau

3. **Wi‑Fi local sans Internet** :
   - Paramètres → Réseau local → IP du serveur (`http://145.223.121.38`)

## 6. Tests manuels coupure réseau

```bash
# 1. Backend arrêté
docker compose -f docker-compose.prod.yml stop backend

# 2. Chrome DevTools → Network → Offline

# 3. Vérifier :
# - App s'ouvre (session mémorisée)
# - Menu visible
# - Nouvelle commande table
# - Encaissement espèces
# - Impression reçu
# - Badge 🔴 Hors ligne

# 4. Relancer backend + Online → sync queue vide
docker compose -f docker-compose.prod.yml start backend
```

## 7. Garanties actuelles

| Action | Offline (cache OK) | Offline (jamais connecté) |
|--------|-------------------|---------------------------|
| Ouvrir app | ✅ | ❌ (installer PWA d'abord) |
| Se connecter | ✅ (session cache) | ❌ |
| Voir menu | ✅ | ❌ |
| Prendre commande | ✅ | ❌ |
| Encaisser espèces | ✅ | ❌ |
| Imprimer | ✅ | ❌ |
| Mobile Money live | ❌ | ❌ |
