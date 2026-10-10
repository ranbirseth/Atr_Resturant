# GOLA_RESTAURANT — Final Polish Phase 1B: Inventory & Stock Backend Fixes

> **Scope:** backend only (`server/`). No Expo/React Native, admin dashboard, print-service, or other frontend was modified. No dependencies were installed, no production database was written to, and no deployment was performed. All database-backed tests ran against the dedicated throwaway database `mongodb://127.0.0.1:27017/gola_inventory_test` (overridable with `INVENTORY_TEST_MONGO_URI`), which the suite drops before and after the run.

- **Date:** 2026-10-10
- **Follows:** [Phase 1A — Inventory & Stock Backend Audit](final-polish-inventory-stock-backend-audit.md)
- **Status:** `IMPLEMENTED — BACKEND COMPLETE, AWAITING OWNER REVIEW` (Expo UI phase not started)
- **Test result:** `npm test` in `server/` → **59/59 pass** (13→20 unit tests, 15→20 API tests).

---

## 1. Defects from Phase 1A and their resolution

| # | Phase 1A defect | Status now | Where |
|---|---|---|---|
| 1 | Purchase price never captured/stored (item, opening purchase, restock) | **FIXED** | `Ingredient.purchasePrice`, `StockMovement.unitCost`, validators, `createIngredient`, `recordMovement` |
| 2 | 75%-of-cycle-used alert missing | **FIXED** | `computeRemainingPercent` / `isUsageAlert` + `usageAlert`/`remainingPercent` on every `stockRow` |
| 3 | Duplicate concurrent RESTOCK corrupts cycle state | **FIXED** | Insert-first `RESERVED` idempotency reservation + full compensation |
| 4 | Opening note hardcoded; opening cost absent; `createdBy` not accepted | **FIXED** | `openingNote` / `openingUnitCost` / `createdBy` on create |
| 5 | No inventory analytics/alerts API | **FIXED** | `GET /api/inventory/analytics`, `GET /api/inventory/alerts` |
| 6 | Inventory & Stock are two drawer destinations | **DEFERRED (UI)** | Out of scope for the backend phase (see §7) |

---

## 2. Schema changes (additive only)

- `server/models/Ingredient.js` — added `purchasePrice: Number` (`min: 0`, default `null`).
- `server/models/StockMovement.js` — added:
  - `unitCost: Number` (`min: 0`, default `null`) — the per-unit price of an OPENING/RESTOCK.
  - `status: String` enum `['RESERVED','COMMITTED']` (default `'COMMITTED'`, indexed).

Notes:
- **Backward compatible.** Existing documents lack `status`/`unitCost`; Mongoose treats missing `status` as non-reserved, and `reconcile`/`getMovements` explicitly ignore only `status === 'RESERVED'`, so legacy documents are counted as committed. No migration required.
- No field was renamed or removed; the append-only ledger discipline is preserved.

---

## 3. Pure helpers and validation (`server/utils/inventoryUtils.js`)

- Added `USAGE_ALERT_THRESHOLD = 75`.
- Added `computeRemainingPercent(baseline, current)` — `current/baseline*100`, clamped `0..100`, `null` when baseline `<= 0` (exact complement of `computeUsagePercent`).
- Added `isUsageAlert(baseline, current, thresholdPercent = 75)` — `true` iff usage `>= threshold`; null-safe (no baseline ⇒ `false`).
- `validateIngredientInput` now also accepts `purchasePrice`, `openingUnitCost`, `openingNote`, and `createdBy` (opening fields honoured on create only).
- `validateMovementInput` now also accepts optional non-negative `unitCost` (rejects negatives/NaN/Infinity).
- `INGREDIENT_WRITABLE_FIELDS` updated with `purchasePrice`; new helpers exported.

---

## 4. Controller changes (`server/controllers/inventoryController.js`)

### 4.1 Derived alert fields on every stock row
`stockRow` now emits `usageAlert` and `remainingPercent` alongside the existing `usagePercent`, `baselineQty`, `lowStock`, `outOfStock`, `available`, `needToBuy`, `suggestedQty`. This flows automatically to `GET /ingredients`, `GET /ingredients/:id`, `GET /stock`, `GET /stock/balance`, `POST /stock/movements`, and `GET /alerts`.

### 4.2 Opening purchase cost/note
`createIngredient` now persists `purchasePrice` on the item and `openingUnitCost` (falling back to `purchasePrice`) + `openingNote` (falling back to `'Opening quantity'`) + `createdBy` on the OPENING movement. Opening-only fields are stripped from `updateIngredient` so they cannot be smuggled into an update.

### 4.3 Reserve-first idempotency (fixes defect #3)
`recordMovement` for a keyed request now:
1. **Inserts** a `StockMovement` with `status: 'RESERVED'` and `cycleId: null` **before** any balance/cycle mutation. A duplicate concurrent request hits the unique sparse `idempotencyKey` index and fails immediately (`E11000`) — it can no longer double-increment the balance or close/recreate cycles.
   - If the existing reservation is committed ⇒ `200 { alreadyProcessed: true, movement }`.
   - If it is still `RESERVED` ⇒ `409 { error: 'IN_PROGRESS' }`.
2. Applies the atomic conditional `$inc` (unchanged: `409 INSUFFICIENT_STOCK` when short; the reservation is deleted first).
3. Runs the cycle close/open logic (unchanged semantics).
4. Commits the reservation via `findOneAndUpdate({ _id, status: 'RESERVED' }, { $set: { cycleId, status: 'COMMITTED' } })`.

**Hardened compensation:** on any post-balance failure the handler now reverts the `$inc`, deletes the new cycle, **restores the previously-open cycle** (`status: 'OPEN'`, `closedAt: null`, `finalUsagePercent: null`), reverts `latestCycleId`/`purchaseStatus`, and deletes the leftover reservation. Unkeyed movements keep the original create-at-end path (also with the restored compensation).

### 4.4 Reserved rows hidden from reads
`getMovements` and the `reconcile` aggregation exclude `status === 'RESERVED'`, so an interrupted (dangling) reservation can never be mistaken for committed stock.

---

## 5. New endpoints

### `GET /api/inventory/analytics?from=&to=`
Single-pass ledger aggregation (no duplicated math — reuses `inventoryUtils`):
```jsonc
{
  "from": null, "to": null,
  "totals": { "additions": 15, "consumption": 4, "adjustment": -1, "netChange": 10, "movementCount": 4 },
  "items": [{
    "ingredientId": "...", "name": "Ghee", "unit": "kg",
    "currentQty": 10, "minimumStockLevel": 5, "expectedDemand": 8,
    "purchasePrice": 250.5, "purchaseStatus": "NONE", "needToBuy": false,
    "baselineQty": 10, "usagePercent": 0, "remainingPercent": 100, "usageAlert": false,
    "additions": 15, "consumption": 4, "adjustment": -1, "netChange": 10, "suggestedQty": 3
  }],
  "purchaseSuggestions": [{ "ingredientId": "...", "name": "Ghee", "suggestedQty": 3, "...": "..." }]
}
```
- `additions` = OPENING + RESTOCK; `consumption` = −CONSUMPTION; `adjustment` = signed ADJUSTMENT.
- `from`/`to` are inclusive (the `to` boundary is extended to end-of-day, matching `getMovements`); an unparseable date returns `400`.
- `suggestedQty` = existing `computeSuggestedQty(min, demand, current)`.

### `GET /api/inventory/alerts`
Array of `stockRow`s where `usageAlert || lowStock || outOfStock || needToBuy` is true — the Dashboard can render it without re-deriving anything.

Both routes are registered in `server/routes/inventoryRoutes.js` and remain unauthenticated per the owner's explicit decision.

---

## 6. Tests

Extended and green (`server/npm test` → 59/59):

- **Unit (`utils/inventoryUtils.test.js`, +7):** `computeRemainingPercent` complement/null-safety; `isUsageAlert` at/above 75% and null-safe; validator acceptance/rejection of `purchasePrice`, `openingUnitCost`, `openingNote`, `createdBy`, and `unitCost`.
- **API (`tests/inventory.api.test.js`, +5):**
  1. Purchase price + opening cost/note captured and persisted on OPENING/RESTOCK; negative `unitCost` rejected.
  2. 75% usage alert: baseline 10 → consume 2 (`usageAlert:false`) → consume 6 (`usageAlert:true`, `remainingPercent:20`) → restock resets it.
  3. Concurrent duplicate RESTOCK (same key): exactly one movement, balance +1×, exactly one open cycle, opening cycle closed once, no spurious `COMPLETED`, `reconcile` zero drift, duplicate returns `200` or `409 IN_PROGRESS`.
  4. Analytics per-item additions/consumption/adjustment/net/suggestion + date-range filter + invalid-date `400`.
  5. Alerts endpoint surfaces a 75%-used item.
- All pre-existing regressions still pass unchanged: duplicate names, unit mismatch, `409 INSUFFICIENT_STOCK`, ledger immutability, 20-way concurrency, cycle math, `GET /stock` filters.

---

## 7. Deferred / out of scope (not done here)

- **Expo UI phase (defect #6):** consolidating Inventory + Stock into one `Inventory & Stock` drawer destination, and adding price/note inputs to `IngredientFormModal`/`MovementModal` and consuming `usageAlert`. The backend now returns everything these screens need.
- **Production deploy (UNVERIFIED):** Expo still targets `https://atr-resturant.onrender.com/api`; whether that deployment includes these inventory routes must be verified by the owner before tablet testing.
- **Auth/hardening:** inventory write endpoints remain open by explicit owner decision.

## Behaviour changes to be aware of

- A **new** response for a duplicate keyed request that is still being processed: `409 { error: 'IN_PROGRESS' }`. A retry after the first request commits yields `200 { alreadyProcessed: true }`. Sequential replays are unaffected.
- New optional response fields (`unitCost`, `purchasePrice`, `usageAlert`, `remainingPercent`) are additive; existing clients that ignore them continue to work.

## Files changed

| File | Change |
|---|---|
| `server/models/Ingredient.js` | `purchasePrice` field |
| `server/models/StockMovement.js` | `unitCost`, `status` fields |
| `server/utils/inventoryUtils.js` | alert helpers + cost/opening validation |
| `server/utils/inventoryUtils.test.js` | +7 unit tests |
| `server/controllers/inventoryController.js` | `stockRow` alerts, opening cost/note, reserve-first `recordMovement` + compensation, READ filters, `getAnalytics`, `getAlerts` |
| `server/routes/inventoryRoutes.js` | `/analytics`, `/alerts` routes |
| `server/tests/inventory.api.test.js` | +5 API regression tests |
| `docs/audits/README.md` | this report |
| `docs/implementation/implementation-progress-tracker.md` | Phase 1B status |

## Verification

```powershell
# from server/
npm test
# → ℹ tests 59 | ℹ pass 59 | ℹ fail 0
```
