# Architecture Caisse Offline First

> POS niveau Toast / Square — le caissier ne doit **jamais** être bloqué par l'absence de réseau.

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│  UI Caisse (CaisseDashboard, CashDrawerSessionPanel)        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  offline/cashSession.js      — open/close/lock/movements      │
│  offline/ops.js              — paiements, commandes           │
│  offline/ticketSequence.js   — CAM-YYYYMMDD-000001            │
│  offline/auditLog.js         — journal local append-only      │
│  offline/deviceId.js         — ID appareil permanent          │
│  offline/conflictResolution.js — stratégies explicites        │
│  offline/restoreState.js     — reprise après crash          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  IndexedDB bloomar_offline_v1                                 │
│    meta: cash_session, cash_movements, ticket_seq, audit_log  │
│    orders, kitchenTickets, syncQueue                          │
│  localStorage: offline_action_queue (miroir sync)           │
└───────────────────────────┬─────────────────────────────────┘
                            │ background
┌───────────────────────────▼─────────────────────────────────┐
│  syncEngine.js → sync.js → PendingOperations → Backend API   │
└─────────────────────────────────────────────────────────────┘
```

## 2. Verrouillage session de caisse

### Règle
- **Une session OPEN par caisse (register)** et par jour.
- Clé IndexedDB : `cash_session:{tenantId}:{registerId}:{date}`

### Champs de verrou
| Champ | Rôle |
|-------|------|
| `opened_by_user_id` | Caissier ayant ouvert |
| `locked_by_device_id` | Appareil actif |
| `locked_at` | Horodatage verrou |
| `lock_token` | UUID session appareil |

### Comportement
| Situation | Action |
|-----------|--------|
| Même user + même device | **Reprise automatique** (`resume`) |
| Même user + autre device | **Conflit** → bouton « Reprendre » |
| Manager/Admin + forceResume | **Takeover** autorisé |
| Autre user | **Bloqué** (`CashSessionConflictError`) |

Fonction : `evaluateCashSessionAccess()` dans `cashSessionLockCore.js`

## 3. Numérotation tickets

### Format
```
{PREFIX}-{YYYYMMDD}-{SEQ6}
Exemple : CAM-20260807-000001
```

### Séquence locale
- Clé : `ticket_seq:{tenantId}:{date}`
- Incrément atomique via IndexedDB meta
- Préfixe configurable : `ticket_prefix:{tenantId}` (défaut `CAM`)

### Anti-doublon sync
- `client_order_number` conservé localement
- `server_order_number` enregistré après sync
- `idempotencyKey: create_order:{localId}` sur PendingOperations
- Stratégie : `TICKET_NUMBER → client_number_preserved_on_sync`

## 4. PendingOperations

Chaque opération contient :

| Champ | Description |
|-------|-------------|
| `uuid` | Identifiant unique file |
| `tenantId` | Restaurant |
| `deviceId` | Appareil source |
| `endpoint` | URL API cible |
| `method` | HTTP method |
| `payload` | Corps requête |
| `retryCount` | Tentatives |
| `idempotencyKey` | Anti-doublon |
| `status` | pending / failed |

### Types caisse
| Type | Priorité | Dédup |
|------|----------|-------|
| `cash_session_open` | 55 | 1 par register/jour |
| `cash_payment` | 60 | 1 par commande |
| `cash_movement` | 62 | par movement id |
| `payment_cancel` | 63 | par order id |
| `cash_session_close` | 65 | 1 par register/jour |

## 5. Journal d'audit local

Clé : `audit_log:{tenantId}` — max 5000 entrées (ring buffer)

| Champ | Description |
|-------|-------------|
| `uuid` | ID log |
| `tenantId` | Restaurant |
| `userId` | Utilisateur |
| `action` | Voir AUDIT_ACTIONS |
| `resource` | ID ressource |
| `timestamp` | ISO 8601 |
| `deviceId` | Appareil |
| `syncStatus` | LOCAL / PENDING_SYNC / SYNCED |

### Actions tracées
- Ouverture / fermeture / reprise caisse
- Paiement / annulation / remboursement
- Mouvements caisse
- Création commande
- Reprise app (`app.restore`)
- Sync (start/success/error)

## 6. Device ID

- Clé localStorage : `bloomar_device_id`
- Créé une fois, jamais régénéré sauf reset manuel
- Injecté automatiquement dans `enqueueOfflineAction()` et audit log

## 7. Résolution des conflits (codée)

| Scénario | Stratégie | Fonction |
|----------|-----------|----------|
| Items modifiés 2 appareils | `last_write_wins_by_updated_at` | `resolveOrderItemsConflict` |
| Double paiement | `first_success_wins` | `resolvePaymentConflict` |
| Annulation vs sync paiement | `cancel_wins_over_pending_payment` | `resolvePaymentCancelConflict` |
| Double fermeture caisse | `first_close_wins` | `resolveCashSessionCloseConflict` |
| Numéro ticket sync | `client_number_preserved_on_sync` | `resolveTicketNumberConflict` |
| Double ouverture caisse | `single_open_per_register` | `evaluateCashSessionAccess` |

**Aucune résolution implicite** — chaque cas a une fonction dédiée dans `conflictResolution.js`.

## 8. Reprise après crash

Au boot (`bootstrapOfflineFirst`) :

1. `initOfflineFoundation()` — IndexedDB + migration queue
2. `restoreLocalSession()` — JWT + profil
3. `hydrateLocalWorkspace()` — menu, tables, etc.
4. `restoreOfflineState()` — compte orders, tickets, queue, session caisse
5. `appendAuditLog(APP_RESTORE)` — trace reprise

**Aucune suppression physique** — annulations = changement statut + `payment_history` + `status_history`.

## 9. Performances cibles

| Opération | Cible | Mesure |
|-----------|-------|--------|
| Boot app | < 2s | render immédiat + cache |
| Ouverture caisse | < 300ms | write IDB local |
| Paiement | < 200ms | upsert order + snapshot |
| Rapport caisse 1000 cmd | < 500ms | test stress |
| Queue 10000 ops dedupe | < 2s | test stress |

Tests : `npm run test:offline` (inclut `cashOffline.test.js`)

## 10. Tests automatiques

| Test | Fichier |
|------|---------|
| Verrou session | `cashOffline.test.js` |
| Numérotation CAM | `cashOffline.test.js` |
| Conflits paiement/close | `cashOffline.test.js` |
| Stress 1000 orders | `cashOffline.test.js` |
| Stress 10000 queue | `cashOffline.test.js` |
| Calcul session caisse | `cashSessionCore.test.js` |
| Dédup clôture | `syncHelpers.test.js` |

## 11. Limitations connues

| Fonctionnalité | Statut |
|----------------|--------|
| Mobile Money live (API opérateur) | 🔴 Impossible offline |
| Sync mouvements caisse serveur | 🔴 Pas d'endpoint backend |
| Demandes paiement WebSocket serveur | 🔴 Online only |
| Code promo / fidélité | 🔴 Online only |
| PDF natif rapport | 🔴 Impression navigateur uniquement |
| Multi-terminal merge temps réel | 🟡 Merge au retour réseau |

## 12. Validation finale

| Scénario | Statut |
|----------|--------|
| Ouverture caisse sans Internet | ✅ |
| Centaines de commandes offline | ✅ |
| Encaissement 100% offline | ✅ |
| Impression tickets | ✅ |
| Rapports CSV/impression | ✅ |
| Redémarrage multiples | ✅ |
| Données persistées | ✅ |
| Sync auto reconnexion | ✅ |
| Anti-doublon paiement/session | ✅ |
| Verrou session multi-appareil | ✅ |
