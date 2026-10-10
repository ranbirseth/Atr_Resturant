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

---

# GOLA_RESTAURANT — Final Polish Phase 1C: Expo Inventory & Stock Integration

> **Scope:** `gola-expo-preview/` (Expo React Native admin app) plus documentation/tracker only. `server/`, `client/`, `AdminDashbord/`, `print-service/`, and `react native frontend/` are **not** modified. No dependencies installed; no deployment; no production database writes.

- **Date:** 2026-10-10
- **Follows:** Phase 1A audit + Phase 1B backend fixes (above).
- **Status at investigation:** `INVESTIGATION COMPLETE — IMPLEMENTATION STARTING`.
- **Overall status (post-implementation):** `IMPLEMENTED — EXPO UI COMPLETE, AWAITING OWNER REVIEW`. Excludes physical-tablet verification.

## C.0 Investigation findings (pre-implementation)

### C.0.1 Verified facts from the current Expo code

| # | Finding | Evidence |
|---|---|---|
| 1 | **Two drawer destinations** for inventory vs stock | `src/navigation/RootNavigator.js:68-87` registers `Inventory` and `Stock` as separate `Drawer.Screen`s. |
| 2 | **Item form captures no cost** | `src/screens/Inventory/IngredientFormModal.js:86-96` builds a payload with only `name/unit/minimumStockLevel/expectedDemand/isActive` (+ optional `openingQty`); no `purchasePrice`/`openingUnitCost`/`openingNote`. |
| 3 | **Item card shows no purchase price** | `src/screens/Inventory/InventoryScreen.js:163-211` renders unit/min/qty/suggested/purchase but not `purchasePrice`. |
| 4 | **Movement form has no per-unit cost** | `src/screens/Stock/MovementModal.js:57-69` builds payload with quantity/date/note/idempotencyKey only; no `unitCost` for RESTOCK. |
| 5 | **Idempotency key generated per submit (not per modal open)** | `MovementModal.js:62` derives the key inside `handleSave`, so a double-tap before `saving` re-renders could produce two keys / two movements. |
| 6 | **No 75%-usage alert UI** | `StockScreen.js:151-163` draws only the `usagePercent` bar; it never reads the backend `usageAlert`/`remainingPercent`, and `lowStock` (min level) is presented without a distinct cycle-usage alert. |
| 7 | **No analytics/alerts client or screen** | `src/api/inventoryService.js` has no `getAnalytics`/`getAlerts`; nothing consumes `GET /api/inventory/{analytics,alerts}`. |
| 8 | **History is per-item only** | `src/screens/Stock/HistoryModal.js` fetches one item's movements/cycles; there is no app-wide "stock movements/history" section. |
| 9 | **Existing state handling** | `StateView` (`src/components/menu/StateView.js`) already provides loading/error+retry/empty; `apiClient.js:25-31` attaches `error.status` + parsed `error.data`; `inventoryUtils.getErrorMessage` prefers `error.data.message`. |

### C.0.2 API contract (from the Phase 1B backend — all fields verified present)

- `GET /api/inventory/ingredients` / `GET /api/inventory/stock` rows now include `purchasePrice`, `usageAlert`, `remainingPercent`, `usagePercent`, `baselineQty`, `lowStock`, `outOfStock`, `needToBuy`, `suggestedQty`, `purchaseStatus`, `available`.
- `POST /api/inventory/ingredients` accepts `purchasePrice`, `openingQty`, `openingUnitCost`, `openingNote`, `createdBy`.
- `POST /api/inventory/stock/movements` accepts `quantity`/`quantityDelta`, `unitCost` (RESTOCK/OPENING), `note`, `movementDate`, `idempotencyKey`; returns `201 {movement, ingredient, cycle}`; duplicate-in-flight → `409 {error:'IN_PROGRESS'}`; over-consumption → `409 {error:'INSUFFICIENT_STOCK'}`.
- `GET /api/inventory/alerts` → array of flagged `stockRow`s (`usageAlert‖lowStock‖outOfStock‖needToBuy`).
- `GET /api/inventory/analytics?from=&to=` → `{from,to,totals{additions,consumption,adjustment,netChange,movementCount},items[...],purchaseSuggestions[...]}`.

### C.0.3 Production API verification (checked live during this phase)

`src/api/config.js:17` selects `PRESETS.production = https://atr-resturant.onrender.com/api`. Live GETs on 2026-10-10 returned **200**:

| Endpoint | Status | Note |
|---|---|---|
| `GET /api/inventory/units` | **200** | unit catalog |
| `GET /api/inventory/alerts` | **200** | row keys include `remainingPercent`, `usageAlert` |
| `GET /api/inventory/analytics` | **200** | item keys include `purchasePrice`, `remainingPercent`, `usageAlert`, `suggestedQty` |

**Conclusion:** the deployed Render revision **already includes the Phase 1B backend**, so the Expo app can target production for these endpoints. (Still no auth on writes — owner-accepted.)

### C.0.4 Root causes

1. Navigation still models inventory and stock as two destinations (finding 1).
2. The Expo forms/lists were written before `purchasePrice`/`unitCost` existed and were never extended (findings 2,3,4).
3. The UI predates `usageAlert`/`remainingPercent` and the analytics/alerts endpoints (findings 6,7).
4. Per-submit idempotency key generation is a latent double-submit risk (finding 5).

### C.0.5 Proposed changes (all within `gola-expo-preview/` + docs)

1. **Service:** add `getAnalytics(params)` and `getAlerts()` to `src/api/inventoryService.js` (mirroring existing wrappers; no new deps).
2. **Pure helpers:** add `formatPrice`, `formatPercent`, and `validateIngredientForm`/`validateMovementForm` rules for `purchasePrice`/`openingUnitCost`/`openingNote`/`unitCost`; extend `src/utils/inventoryUtils.test.js`. No client-side 75% threshold (consume the backend `usageAlert`).
3. **Item form:** add purchase price (item default) and, on create, opening unit cost + opening note; clearly label item `purchasePrice` vs movement `openingUnitCost`.
4. **Item list:** show purchase price (with "\u2014 / Not set" fallback for legacy nulls) and an alert badge when `usageAlert` is true.
5. **Movement modal:** add `unitCost` for RESTOCK; generate one `idempotencyKey` per modal open (ref) and guard against repeat submits; surface `INSUFFICIENT_STOCK`/`IN_PROGRESS` messages.
6. **Stock list:** show `usageAlert` as a distinct "75% Used" alert separate from minimum-level `lowStock`; show `remainingPercent`.
7. **New combined screen:** `src/screens/InventoryStock/InventoryStockScreen.js` with four in-screen sections (Inventory items / Current stock / Movements & history / Alerts & suggestions), reusing the existing Inventory/Stock screens and modals; add `HistorySection` (app-wide movements) and `AlertsSection` (alerts + analytics + purchase suggestions) with loading/empty/error/offline handling.
8. **Navigation:** replace the two drawer screens with one titled `Inventory & Stock`; keep all other destinations.
9. **Tests:** run `node --test "src/utils/*.test.js"`, `npx expo lint`, `npx tsc --noEmit` (if tsconfig exists), and `npx expo export` where supported; update this README + tracker.

> Implementation results are recorded in the **C.1** section appended below after the work is done. No backend file is expected to change; if a backend defect is found it will be documented and left for owner review.

## C.1 Implementation results

### C.1.1 Changes (all inside `gola-expo-preview/` + docs; **no protected directory touched**)

| File | Change |
|---|---|
| `src/api/inventoryService.js` | Added `getAnalytics(params)` + `getAlerts()` wrappers. |
| `src/utils/inventoryUtils.js` | Added `formatPrice` (rupee + em dash), `formatPercent`; `validateIngredientForm` now checks `purchasePrice`/`openingUnitCost` (non-negative), `validateMovementForm` checks `unitCost`. |
| `src/utils/inventoryUtils.test.js` | +6 tests for the helpers above. |
| `src/screens/Inventory/IngredientFormModal.js` | New fields: Purchase Price; on create only Opening Quantity, Opening Unit Cost, Opening Note. Helpers text distinguishes item `purchasePrice` vs opening movement `unitCost`. Payload sends them only when non-empty (legacy-safe). |
| `src/screens/Inventory/InventoryScreen.js` | Card shows purchase price/unit; shows a distinct "75% used — restock soon" alert when `usageAlert`. |
| `src/screens/Stock/MovementModal.js` | RESTOCK gains optional Unit Cost; idempotency key generated once per modal open (lazy ref, reused across retries); `saving` guard prevents duplicate submits. |
| `src/screens/Stock/StockScreen.js` | Distinct rose "75% Used" badge (`usageAlert`) vs amber "Low Stock" (min level); usage bar turns rose when flagged; shows `remainingPercent` ("· x% left"). |
| `src/screens/Stock/HistoryModal.js` | Movement rows show per-unit cost; fixed `renderItem` destructuring so entries render. |
| `src/screens/InventoryStock/HistorySection.js` (new) | App-wide movements/history list with item-name map + type filter + pull-to-refresh. |
| `src/screens/InventoryStock/AlertsSection.js` (new) | Live `/alerts` + `/analytics`: totals cards, purchase suggestions, active-alert badges (75% Used / Low Stock / Out of Stock / Need to Buy) with loading/error/empty handling. |
| `src/screens/InventoryStock/InventoryStockScreen.js` (new) | Single parent with four in-screen sections; reuses existing Inventory/Stock screens. |
| `src/navigation/RootNavigator.js` | Replaced `Inventory` + `Stock` drawer entries with one `Inventory & Stock`. |
| `docs/audits/README.md`, `docs/implementation/implementation-progress-tracker.md` | This report + tracker updated. |

### C.1.2 Behaviour guarantees implemented

- **Drawer:** exactly one `Inventory & Stock` destination; `Dashboard`, `Orders`, `Menu & Categories`, `Users & Coupons`, `Reviews & Analytics`, `Billing`, `Settings` unchanged.
- **No client-side 75% threshold:** the app displays the backend's `usageAlert`/`remainingPercent`/`lowStock`/`outOfStock`/`needToBuy` verbatim; the 75% cycle alert is styled separately from the minimum-level alert.
- **Insufficient-stock + in-progress feedback:** server messages surfaced via `getErrorMessage` (`error.data.message`); no false success (modal closes only on resolve).
- **Backward compatibility:** omitting optional prices/costs/notes is valid; legacy items without `purchasePrice` render `—`.
- **Re-created items list note:** fields `purchaseStatus` is set through the existing Stock actions (Need to Buy → Ordered → Complete via Restock); the API's ingredient create/update payload does not accept a status, so the item form intentionally does not offer it.

### C.1.3 Verification executed

| Check | Command | Result |
|---|---|---|
| Expo pure-helper unit tests | `node --test "src/utils/*.test.js"` (from `gola-expo-preview/`) | **103/103 pass** (incl. new price/cost tests) |
| Expo lint | `npx expo lint` | **0 errors** (4 pre-existing warnings unrelated to this phase) |
| Android bundle | `npx expo export --platform android` | Built successfully (Hermes `.hbc`); generated `dist/` removed afterwards |
| Typecheck | `npx tsc --noEmit` | Not run — project has no `tsconfig.json`; adding one is out of scope |
| Backend | not modified | Phase 1B suite previously 59/59; untouched |
| Physical tablet | not performed | Requires physical device/Expo Go — not available in this environment |

### C.1.4 Production API status

- `config.js` active base URL: `https://atr-resturant.onrender.com/api` (production preset) — used by all inventory/stock/alerts/analytics calls.
- Live GETs (read-only, 2026-10-10): `/units`, `/alerts`, `/analytics` all **200** with Phase 1B fields, confirmed.
- **Not claimed:** production write-path behaviour is not fully exercised from the app in this environment; recommend an owner smoke test (create item with price, restock with unit cost, consume past 75%) on the live deployment.

### C.1.5 Remaining risks / unverified

1. Physical tablet visual/behavioural test of the combined screen (4-section segment) untested here.
2. `expo-doctor` not run (no device tooling available).
3. Live write-path smoke test against production recommended before claiming prod support.
4. Typecheck unavailable (no tsconfig).

### C.1.6 Next recommended phase

Owner smoke test on device/live deployment, then `expo-doctor` + store release prep. No further backend work suggested unless the write-path smoke test finds defects.

---

# GOLA_RESTAURANT — Phase 1D: Simplify Inventory & Stock UI

> **Scope:** `gola-expo-preview/` + documentation/tracker only. `server/`, `client/`, `AdminDashbord/`, `print-service/`, `react native frontend/` are **not** modified. No dependencies installed; no deployment.

- **Date:** 2026-10-10
- **Follows:** Phase 1C (Expo integration) above.
- **Status at investigation:** `INVESTIGATION COMPLETE — IMPLEMENTATION STARTING`.

## D.0 Investigation findings (pre-implementation)

### D.0.1 "Before" UI (too complex)

| Area | Current (Phase 1C) state | Problem for a minimal admin |
|---|---|---|
| Combined screen | `src/screens/InventoryStock/InventoryStockScreen.js` shows **four** sections: Inventory Items, Current Stock, Movements, Alerts & Suggestions | More than the two requested |
| Inventory form | `IngredientFormModal.js` fields: name, unit, minimumStockLevel, expectedDemand, openingQty, purchasePrice, openingUnitCost, openingNote, isActive | 9 fields; admin must understand advanced concepts |
| Item list | card shows min level, purchase price, expected demand, suggested buy, purchase status, 75%-used alert, Edit + Activate/Deactivate | Status/analytics clutter |
| Stock list | search, 5 filter chips, usage bar, suggested buy, Out/Low/Available + Need-to-Buy + 75% badges, Consume/Restock/Adjust, Need-to-Buy→Ordered→Complete flow, History button | Too many controls/actions |
| Extra sections | `HistorySection.js`, `AlertsSection.js` (analytics totals, purchase suggestions, alert list) | Not requested |

### D.0.2 Backend contract inspected (read-only, `server/`)

`validateIngredientInput` (`server/utils/inventoryUtils.js:173`) and `createIngredient` (`server/controllers/inventoryController.js`):

| Backend field | Required on create | Meaning (established) |
|---|---|---|
| `name` | **yes** | item name |
| `unit` | **yes** (allowlist: `kg,g,litre,ml,pieces,packets`) | single measurement unit per item |
| `minimumStockLevel` | **yes** | low-stock threshold — the API rejects a create without it |
| `expectedDemand` | no | for suggestions only |
| `purchasePrice` | no | **item-level default price PER UNIT** (not a total) |
| `openingQty` | no | opening movement quantity |
| `openingUnitCost` | no | opening movement `unitCost` (per unit) |
| `openingNote` | no | opening movement note |
| `isActive` | no | defaults true |

Movement API (`recordMovement`, `inventoryController.js:301`): `movementDate` defaults to now, `note` defaults to `''`; validation requires `unitCost` ≥ 0 when supplied (`inventoryUtils.js:295`).

**Critical mapping facts:**
1. There is **no field for a total purchase amount** anywhere (item or movement). Documented limitation; backend not modified.
2. `openingUnitCost` is the correct place for per-unit cost; `purchasePrice` is a **per-unit** item default and must **not** receive the total.
3. `minimumStockLevel` is required by the API, so the simplified form must send a hidden default of `0` (admin never sees it).

### D.0.3 Root causes

1. Phase 1C layered the full Phase 1B feature set into the UI; the admin does not need most of it for daily "record purchase / consume / restock".
2. The item form mirrors every backend field instead of a task-focused subset.
3. The stock cards expose the purchase-status workflow and history instead of just Consume/Restock.

### D.0.4 Proposed changes (all in `gola-expo-preview/` + docs)

1. **Combined screen:** reduce to **two** sections — Inventory, Current Stock (delete Movements/Alerts sections).
2. **Inventory:** simple list (name, unit, current quantity) + `Add Inventory` → new 4-field modal: Item Name, Measurement Unit, Total Quantity, Total Price. Map `name→name`, `unit→unit`, `totalQty→openingQty`, `totalPrice/qty→openingUnitCost`, hidden `minimumStockLevel:0`; never send `purchasePrice`.
3. **Current Stock:** simple cards (name, in-stock qty+unit, used-in-current-batch) + `Consume` and `Restock` only.
4. **Consume modal:** quantity + optional note; **Restock modal:** quantity + total purchase price (unit cost auto `= total/qty`).
5. **Helpers/tests:** add `computeUnitCost`, `computeConsumedQuantity`, `validateAddItemForm`; extend `inventoryUtils.test.js`.
6. **Delete** now-unused `IngredientFormModal.js`, `HistoryModal.js`, `HistorySection.js`, `AlertsSection.js` (no references after the rewrite); backend endpoints keep all capabilities.
7. **Verify:** unit tests, `npx expo lint`, `npx expo export --platform android`; update this README + tracker.

> Implementation results are recorded in **D.1** below.

## D.1 Implementation results

### D.1.1 Before / after

| | Before (Phase 1C) | After (Phase 1D) |
|---|---|---|
| Sections | 4 (Inventory Items, Current Stock, Movements, Alerts & Suggestions) | **2** (Inventory, Current Stock) |
| Add-item fields | 9 (name, unit, min level, expected demand, opening qty, purchase price, opening unit cost, opening note, active) | **4** (Item Name, Measurement Unit, Total Quantity, Total Price) |
| Item list | min level, purchase price, demand, suggested buy, status, alert, Edit/Deactivate | name, unit, in-stock quantity |
| Stock cards | search + 5 filters + usage bar + suggested buy + 5 badges + Consume/Restock/Adjust + purchase workflow + History | name, available qty, used-this-batch, **Consume**, **Restock** |
| Extra screens | Movements + Alerts sections | removed |

### D.1.2 Files changed

| File | Change |
|---|---|
| `src/screens/InventoryStock/InventoryStockScreen.js` | Reduced to two sections (Inventory, Current Stock). |
| `src/screens/Inventory/InventoryScreen.js` | Rewritten: simple list (name, unit, in-stock) + `+ Add Inventory`. |
| `src/screens/Inventory/AddItemModal.js` **(new)** | 4-field form: Item Name, Measurement Unit (chips), Total Quantity, Total Price; live per-unit preview. |
| `src/screens/Stock/StockScreen.js` | Rewritten: simple cards (available + used-this-batch) with Consume/Restock only. |
| `src/screens/Stock/MovementModal.js` | Rewritten: Consume (quantity + optional note) and Restock (quantity + total price → auto unit cost). |
| `src/utils/inventoryUtils.js` | Added `computeUnitCost`, `computeConsumedQuantity`, `validateAddItemForm`. |
| `src/utils/inventoryUtils.test.js` | +3 tests (106 total). |
| `src/screens/Inventory/IngredientFormModal.js` | **Deleted** (unused). |
| `src/screens/Stock/HistoryModal.js` | **Deleted** (unused). |
| `src/screens/InventoryStock/HistorySection.js` | **Deleted** (unused). |
| `src/screens/InventoryStock/AlertsSection.js` | **Deleted** (unused). |
| `docs/audits/README.md`, `docs/implementation/implementation-progress-tracker.md` | This report + tracker. |

### D.1.3 Exact form fields and actions

- **Add Inventory (4 fields):** Item Name (`name`), Measurement Unit (`unit`), Total Quantity (`openingQty`), Total Price (derived → `openingUnitCost`). Hidden `minimumStockLevel: 0` (API-required default). No `purchasePrice`, no demand/status/note.
- **Consume popup:** Quantity to consume (`quantity`, > 0), optional Note; buttons Cancel / Confirm Consume.
- **Restock popup:** Quantity purchased (`quantity`, > 0), Total Purchase Price (≥ 0); buttons Cancel / Confirm Restock; per-unit cost computed automatically.
- **Stock card:** item name · unit · Available `currentQty` · `Used this batch` = `baselineQty − currentQty` (the existing low-level `baselineQty`/`cycleId`/`unitCost` terms are **not** shown); Consume + Restock.

### D.1.4 Price mapping + backend limitation

- Total Price → per-unit: `openingUnitCost = totalPrice / totalQty` on add; `unitCost = totalPrice / restockQty` on restock. Examples verified by unit test: ₹1,500 / 10 L = ₹150/L; ₹600 / 4 L = ₹150/L.
- `purchasePrice` is **never** set from a total (it is an item-level per-unit default; left untouched).
- **Limitation (documented, backend unchanged):** the backend has **no field that stores a total purchase amount**. Only the derived per-unit cost and the quantity are persisted. If a future requirement needs the total, a backend field would be required (out of scope).
- Units use the existing allowlist `kg,g,litre,ml,pieces,packets`; the admin example "L" maps to `litre`.

### D.1.5 Stock calculation (backend is source of truth)

Displayed balance always comes from the backend response; the client never mutates it. After every Consume/Restock the modal closes only on success and the list is re-fetched (`getStock`). Expected flow (matches the required example):

| Action | Available |
|---|---:|
| Add 10 litre oil | 10 litre |
| Consume 3 | 7 litre |
| Restock 4 | 11 litre |

`INSUFFICIENT_STOCK` is surfaced via the server message (`error.data.message`) inside the popup, and the balance is preserved because the list is only refreshed from the backend.

### D.1.6 Tests executed

| Check | Command | Result |
|---|---|---|
| Unit tests | `node --test "src/utils/*.test.js"` (from `gola-expo-preview/`) | **106/106 pass** (adds `computeUnitCost`, `computeConsumedQuantity`, `validateAddItemForm`) |
| Lint | `npx expo lint` | **0 errors** (4 pre-existing warnings: 3 BOM, 1 unused `e` in `apiClient.js`) |
| Android bundle | `npx expo export --platform android` | Built successfully (Hermes `.hbc`); `dist/` removed |
| Typecheck | `npx tsc --noEmit` | Not available — no `tsconfig.json` |
| Physical tablet | not performed | No device in this environment |

Test-mapping to the phase checklist: (1) one `Inventory & Stock` drawer entry — `RootNavigator.js`; (2) exactly four form fields — `AddItemModal.js`; (3)(4)(5) stock balance from backend — `StockScreen.js` re-fetch; (6) price→unit conversion — `computeUnitCost` tests; (7) invalid/zero qty rejected — `validateAddItemForm`/`validateMovementForm` tests; (8) insufficient-stock no false success — modal closes only on resolve; (9) legacy no-price items show `—` — `formatQty`/`formatPrice`; (10) other destinations untouched.

### D.1.7 Production API status

- Client base URL unchanged: `https://atr-resturant.onrender.com/api` (production preset).
- Endpoints used by the simplified UI are the already-verified ones: `GET /inventory/units`, `GET /inventory/ingredients`, `POST /inventory/ingredients`, `GET /inventory/stock`, `POST /inventory/stock/movements` (Phase 1B/1C).
- **Not claimed:** no live write-path smoke test performed in this environment; recommend an owner test (Add 10 L / Consume 3 / Restock 4) on the live deployment before marking production-verified.

### D.1.8 Remaining issues / next steps

1. Owner device smoke test of the two-section screen and the expected 10→7→11 flow.
2. Optional: prune now-unused client helpers (`filterStockList`, `computeUsagePercent`, `computeSuggestedQty`, `validateIngredientForm`, `purchaseStatusLabel`, `STOCK_FILTERS`, `PURCHASE_STATUSES`) if the simplified UI stays permanent — kept for now since they are tested and the backend still returns those fields.
3. `expo-doctor` + store release prep.
4. Total purchase amount cannot be stored until a backend field exists (future phase, not started).

# GOLA_RESTAURANT - Final Polish Phase 1E (2026-10-10): Fix Add Inventory, 70% Usage Alert, Safe Delete

## E.0 Investigation findings (pre-implementation, read-only)

### E.0.1 Issue 1 - "Add Inventory" fails to create a new item

**Observed (code trace, no reproduction against production needed):**
- The Expo form (`gola-expo-preview/src/screens/Inventory/AddItemModal.js`) keeps exactly the four visible fields intended by Phase 1D (Item Name, Measurement Unit, Total Quantity, Total Price) and submits:
  `{ name, unit, openingQty, openingUnitCost }`.
- The backend validator (`server/utils/inventoryUtils.js:194-198`, `validateIngredientInput(body, { partial: false })`) requires `minimumStockLevel` on **create**:
  `Minimum stock level must be a number greater than or equal to 0`.
- Because the modal payload omits `minimumStockLevel`, every valid four-field submission returns **400** and the item is never created.
- Confirmed no earlier fix shipped it: Phase 1D explicitly removed the minimum-stock field from the form but did not replace it with a hidden `minimumStockLevel: 0` (the schema default only applies when the field is *absent from the DB update*, and validation runs before insert).
- **Root cause:** missing hidden `minimumStockLevel: 0` in the create payload (no new backend work needed for Issue 1).

### E.0.2 Issue 2 - usage alert threshold

- The single source of truth is the backend constant `USAGE_ALERT_THRESHOLD = 75` in `server/utils/inventoryUtils.js:20`.
- It flows through `isUsageAlert(baselineQty, currentQty)` into every server payload that exposes a stock row (`stockRow`, `/alerts`, `/analytics`) as `usageAlert: true/false`.
- The Expo UI currently has **no local threshold** (Phase 1D removed the alert badge), so there is only one place to change: the server constant. No duplicated/conflicting 70/75 value exists client-side (verified by grep across `gola-expo-preview/src`).
- `computeUsagePercent` = `(baseline - current) / baseline`, so a 10 L cycle consumed 6 → 60% (no alert), 7 → 70.0% (alert), 8 → 80% (alert). Restock closes the current cycle, carries over the remainder, and resets usage to 0% (verified by existing API test `'restock closes the current cycle...'`).
- **Root cause:** constant value wrong (75 vs required 70). Change is `75 -> 70` + test updates. The Expo Current Stock cards must start consuming the backend `usageAlert` (currently ignored).

### E.0.3 Issue 3 - safe delete

- `server/routes/inventoryRoutes.js` exposes activate/deactivate/purchase-status but **no delete** route or controller (`deleteOne`/`findByIdAndDelete` grep hits in `server/` are only for stock reservations, categories, menu items, coupons, seed).
- Dependency graph of an ingredient: `StockMovement` (append-only ledger; items are `immutable:true`, idempotency keys unique) and `StockCycle` (baseline/carry-over). No menu/recipe references exist in `server/`. Deleting an ingredient with movements would orphan ledger + cycle history and break `/alerts` and `/analytics`; this must be prevented.
- Safe deletion design that preserves balances/history:
  - Item with **no** movements or cycles → hard delete (name becomes reusable).
  - Item with **any** movements/cycles → archive instead (`isActive = false`, the mechanism `setIngredientActive` already uses) and return a clear `archived` result so the UI can explain history was preserved.
- Expo `apiClient.js` already has `api.delete`, and the app already uses `Alert.alert` confirm patterns (`MenuManagement.js:106-127`, `CouponsTab.js:135`).

### E.0.4 Proposed changes (all phases below land in `server/`, `gola-expo-preview/` and `docs/` only; **no protected directory touched**)

1. **Issue 1:** add `minimumStockLevel: 0` to the `AddItemModal` create payload (still exactly four visible fields; `unitCost = totalPrice / quantity` unchanged).
2. **Issue 2:** change `USAGE_ALERT_THRESHOLD` 75→70; update unit + API tests to 70% boundary semantics (69% no alert / exactly 70% alert / 80% alert / restock resets the alert); surface `usageAlert` (with `usagePercent`) as a minimal line on the Current Stock card - the backend field is consumed, so there is still exactly one threshold, server-side.
3. **Issue 3:** new backend `DELETE /api/inventory/ingredients/:id` (hard-delete when unused, archive when history exists) + Expo `deleteIngredient` service fn + per-card Delete action with `Alert.alert` confirmation, refresh after success, archived/deleted feedback message, and an error alert on failure.
4. New backend unit + API tests for all three issues; verified via Node test runner, `expo lint`, and an Android export.

## E.1 Implementation results (2026-10-10)

### E.1.1 Files changed

| Area | File | Change |
|---|---|---|
| Expo | `gola-expo-preview/src/screens/Inventory/AddItemModal.js` | create payload now includes hidden `minimumStockLevel: 0` (still exactly 4 visible fields; `unitCost = totalPrice / quantity` unchanged). **Fixes the 400 on every Add.** |
| Server | `server/utils/inventoryUtils.js` | `USAGE_ALERT_THRESHOLD` 75 → 70. |
| Server | `server/utils/inventoryUtils.test.js` | threshold test renamed to 70% with explicit boundaries (69% no alert / exactly 70% alert / 80% alert / null-safe). |
| Server | `server/tests/inventory.api.test.js` | `75%-used` API test replaced with `70%-used ... boundaries + restock reset`; added 3 delete tests (archive-with-history, hard-delete-unused, 404). |
| Server | `server/controllers/inventoryController.js` | new `deleteIngredient` (archive when movements/cycles exist, hard-delete only when unused); alerts comment updated to 70%. |
| Server | `server/routes/inventoryRoutes.js` | new `DELETE /api/inventory/ingredients/:id`. |
| Expo | `gola-expo-preview/src/api/inventoryService.js` | new `deleteIngredient(id)` wrapper (`api.delete`). |
| Expo | `gola-expo-preview/src/screens/Inventory/InventoryScreen.js` | per-card Delete action + `Alert.alert` confirmation; archived-vs-deleted feedback alert; refresh after success; error alert on failure; "Archived" badge when `isActive === false`. |
| Expo | `gola-expo-preview/src/screens/Stock/StockScreen.js` | Current Stock cards now show a minimal inline warning when the backend `usageAlert` is true: `{usagePercent}% of this batch used — restock soon`. Consumes the server field — no client threshold duplicated. |

### E.1.2 Requirement → implementation mapping

1. **Add Inventory must work (4 fields, clear errors/false-success rules).**
   - Root cause fixed: hidden `minimumStockLevel: 0` in the create payload. The server validator only rejects when the field is missing on create (`validateIngredientInput partial:false`); the form still shows exactly Item Name / Measurement Unit / Total Quantity / Total Price. `unitCost = totalPrice / totalQuantity` unchanged; the modal closes (and the list refreshes) only on a successful `201`; server `message` is shown on any non-OK response (no false success).
2. **70% usage alert, one rule everywhere, restock resets, tests for 69/70/>70/reset.**
   - Single source of truth `USAGE_ALERT_THRESHOLD = 70` in `server/utils/inventoryUtils.js`; it feeds `isUsageAlert` → `usageAlert` on every stock row (`stockRow`, `/alerts`, `/analytics`). The Expo UI reads only that boolean (plus `usagePercent`). Verified by API test: baseline 10 L — consume 6.9 (69%) no alert, 7.0 (70%) alert, 8 (80%) alert, restock resets to base and clears the alert. `200` in `/alerts` unchanged.
3. **Safe Delete — confirm, refresh, no corruption, tests.**
   - `DELETE /api/inventory/ingredients/:id`: items with any `StockMovement`/`StockCycle` are **archived** (`isActive=false`, same soft mechanism as activate/deactivate; ledger + cycles untouched so balances/history stay consistent) and the API returns `{ archived: true, message }`; items with zero history are hard-deleted (`{ deleted: true }`, name reusable). Unknown id → 404. Expo confirms via `Alert.alert`, shows the returned message (archived vs deleted), refreshes the list, and alerts on failure. Tests added for all three branches (including "balance untouched by archive" and "history preserved").

### E.1.3 Verification executed (all in this environment, 2026-10-10)

- `server/ npm test` → **62/62 pass** (previously 59): 20 unit + 42 API including the 3 new delete tests and the reworked 70% boundaries test.
- `gola-expo-preview/ node --test "src/utils/*.test.js"` → **106/106 pass**.
- `gola-expo-preview/ npx expo lint` → **0 errors, 4 warnings** (all pre-existing: `apiClient.js` unused catch var + three BOM warnings; none introduced here).
- `gola-expo-preview/ npx expo export --platform android` → bundle built successfully (Metro, 1439 modules); generated `dist/` deleted afterwards.
- **Not claimed:** physical tablet / Expo Go run, and any live-production write smoke test.

### E.1.4 Production deployment note (important)

- The Expo fixes (hidden `minimumStockLevel: 0`) work against the current production API **today** — production already accepts `minimumStockLevel` on create, so Add Inventory now succeeds without any deploy.
- The **70% rule and the delete endpoint are backend changes and only take effect after the `server/` changes are deployed to Render** (current production still returns `usageAlert` at the old 75% and has no `DELETE /ingredients/:id`, so deleting on the live backend would 404 until deployment).
- Frontend delete already handles that gracefully (shows the server message), but the owner should deploy the backend before expecting delete/70% behaviour in production.

### E.1.5 Remaining risks / next steps

1. Owner smoke test on the live deployment once the backend is published: Add 10 L → Consume 7 L (70% alert appears) → Consume 1 more (80%, still alert) → Restock 4 L (returns 7 L, alert cleared) → Delete the item (should archive because history exists).
2. Physical tablet visual check of the new Delete button + alert line.
3. Not done here: `expo-doctor`, `tsc --noEmit` (no `tsconfig.json`).

---

# GOLA_RESTAURANT - Phase 2A (2026-10-10): Orders Module — Read-Only Investigation & Audit

## A.0 Scope and rules

- **Mode:** STRICT READ-ONLY. This is an investigation and audit phase. Everything below is a **confirmation of what exists**, not a specification of what to build. No implementation was requested or performed.
- **Date:** 2026-10-10. Repo: branch `main`, working tree clean (last commit `e4b8f1b "next fix"`).
- Protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) were **only read**; `server/` and `gola-expo-preview/` were **not modified** — zero source/DB/deploy changes.
- Live API checked **read-only** (GET only, no writes): `https://atr-resturant.onrender.com/` → `200` "API is running..."; `GET /api/orders/analytics?range=1d` → `200` (0 orders today). `https://resturent-billing.onrender.com` (the web-admin Billing page's API target) **timed out** — see F11.

## A.1 End-to-end architecture / data flow (verified from source)

1. **Customer web app (`client/`, React+Vite)** — `client/src/pages/OrderType.jsx:57` builds the order payload and calls `placeOrder` → `client/src/context/AppContext.jsx:153` → `POST /api/orders` with `{ userId, items:[{itemId,name,quantity,price,customizations}], totalAmount, grossTotal, couponCode, discountAmount, orderType('Dine-in'|'Takeaway'), tableNumber, isDelivery, deliveryAddress }`. The new order id is kept as `currentOrderId` (localStorage) and `client/src/pages/Countdown.jsx` polls `GET /api/orders/:id` every 5s, shows a 2-minute cancel window (`PUT /api/orders/:id/status {status:'Cancelled'}`), and triggers feedback (`feedbackStatus`) once status is `Ready`/`Completed`. **The customer app has no bill/receipt/invoice.**
2. **Backend (`server/`)** — `server/routes/orderRoutes.js`: `GET /analytics`, `POST /`, `GET /grouped`, `GET /`, `GET /:id`, `PUT /:id/status`, `PUT /:id/update`, `PUT /print-success`.
   - `POST /api/orders` → `createOrder` (`server/controllers/orderController.js:20`): requires `userId` + non-empty items, validates ObjectIds, builds lines **server-authoritatively** via `buildAuthoritativeOrder` (`server/utils/menuUtils.js` — client-supplied prices/totals are ignored), re-validates the coupon server-side, computes `totalAmount = subtotal - discount`, generates `sessionId = user_{userId}_date_{YYYYMMDD}` (`server/utils/SessionManager.js`), sets `status:'PLACED'`, then **broadcasts** `sessionOrderUpdate` + `newOrder` to every connected socket (lines 144, 150).
   - `GET /grouped` → `getGroupedOrders` (line 310): groups all orders by `sessionId`, sums `totalAmount`/`grossTotal`/`discountAmount`, derives one session `status` by priority (map at lines 370–385 — **lacks uppercase `PREPARING`/`READY`**, see F7).
   - `PUT /:id/status` → `updateOrderStatus` (line 188): transition-guarded by `validateStatusTransition` (lines 259–293), writes with `Order.updateOne` **without `runValidators`** (see F8), re-broadcasts the session.
   - `PUT /:id/update` → `updateOrder` (line 625): replaces `items`/`totalAmount`/`grossTotal`/`discountAmount` straight from the request body **with no server-side re-validation** (see F5), snapshots the previous state, sets `status:'CHANGED'`.
   - `GET /analytics` → `getAnalytics` (line 426): `$sum totalAmount` over a date range **with no status filter** (see F6).
   - `PUT /print-success` → `confirmPrintStatus` (line 571): sets `kotPrinted`, pushes `kotHistory`.
3. **Expo tablet (`gola-expo-preview/`)** — `src/screens/Orders/OrdersScreen.js` loads `GET /api/orders/grouped`, subscribes to `sessionOrderUpdate`/`newOrder` (`src/api/socketClient.js`), rebuilds sessions with `buildSession` + `computeSessionStatus`/`computeSessionTotals` (`src/utils/orderUtils.js`), and per-order actions from `SessionOrderCard` call `PUT /orders/:id/status` (`src/api/orderService.js`). **No Bill / Print / KOT anywhere in the Orders module** (grep for `Bill|bill|Print|print|KOT|kot` in `src/components/orders/` → no matches). Active API base: `https://atr-resturant.onrender.com/api` (`src/api/config.js:17`).
4. **Web admin (`AdminDashbord/`)** — `Orders.jsx` also loads `/grouped` + socket; on ACCEPTED it auto-prints a KOT via the local `print-service` (port 6001) and calls `PUT /orders/print-success`. `SessionOrderCard.jsx:329-335` shows a **Bill** button (ACCEPTED-workflow orders only) → `Orders.jsx:330-433 generateSessionPdf` (jsPDF): filters billable orders (ACCEPTED/Accepted/COMPLETED/Completed/Preparing/Ready), merges items, sums totals, and either downloads the PDF or shares it via `https://wa.me/91…` (hardcoded `+91`). **The bill is rendered client-side; nothing is written to the backend and no payment is recorded.**
5. **Analytics surfaces disagree:** Expo Dashboard (`DashboardScreen.js` → `dashboardService.js` → raw `GET /orders`) computes revenue client-side **excluding CANCELLED** (`dashboardMetrics.computeStats` + `analyticsUtils.computeAnalytics`). Web admin Analytics (`Analytics.jsx` → `orderService.getAnalytics`) uses the server `/orders/analytics`, which **includes CANCELLED orders** in revenue/trend/top-items.

## A.2 Owner requirement → current status

| Requirement (Orders saga) | Backend `server/` | Expo tablet admin | Web admin (`AdminDashbord/`) | Verdict |
|---|---|---|---|---|
| Customer places order → API → DB | ✅ `POST /api/orders` | — | — | Implemented |
| Admin Orders screen shows live orders | ✅ socket broadcast + `/grouped` | ✅ implemented | ✅ implemented | Implemented |
| Orders grouped into visit sessions with session total | ✅ `GET /grouped` (sums totals) | ✅ session cards/total | ✅ session cards/total | Implemented |
| **Online order has a Bill button that generates its bill** | ❌ no bill/print endpoint | ❌ **missing entirely** | ⚠️ client-side PDF only; not persisted; no payment flag | Missing on Expo; partially on web admin |
| Payment recorded / order marked paid | ❌ no `paymentStatus`/`paymentMethod`/`isPaid`/Bill/Invoice model (only Order/Coupon/User/…) | ❌ (Billing module is local POS preview — `billing-implementation.md`) | ❌ | Missing |
| KOT printing | ✅ `print-success`/`kotPrinted` | ❌ absent | ⚠️ auto-KOT on accept (needs local print-service) | Partial (web only) |
| Customer cancel / status watch | ✅ transitions + polling | n/a | n/a | Implemented |
| Analytics / dashboard | ✅ `/orders/analytics` (status-unfiltered) | ✅ client-side (cancelled-excluded) | ✅ (server endpoint) | Implemented but inconsistent (F6) |

## A.3 Findings (severity + classification)

- **F1 — High · Missing:** No payment/bill-of-record anywhere. `server/models/Order.js` has no `paymentStatus`/`paymentMethod`/`isPaid`, and the six models (`User, Order, Coupon, Feedback, Category, Item`) contain no Bill/Invoice/Payment model (consistent with `billing-implementation.md` §1.1). Consequences: orders are never marked paid; "revenue" equals the sum of ordered amounts regardless of collection; a session cannot be "settled". **Requirement "payment recorded" is missing end-to-end.**
- **F2 — High · Missing (Expo) / Partial (web):** No **Bill action on online-order sessions in the Expo tablet Orders screen** — the primary admin UI. `SessionOrderCard.jsx` (Expo) only offers status actions + Cancel + "View Session Details"; `SessionDetailsModal` lists items/totals only. The web admin's Bill (F3) is not portable to the tablet.
- **F3 — High · Missing:** No server-side persistent bill. Web-admin bill is a **client-rendered jsPDF** (`Orders.jsx:330-433`) with duplicated totalling/filtering logic; nothing is stored, re-generated bills are repeatable but unreferenced, and no bill id/history exists. Rules ("billable = ACCEPTED-workflow only") exist only in the UI, not the backend.
- **F4 — High · Confirmed bug (security):** All order endpoints are unauthenticated. `GET /orders`, `/orders/grouped`, `/orders/:id`, `/orders/analytics` expose customer `name` + **mobile** (PII) to anyone; `PUT /:id/status`, `PUT /:id/update`, `PUT /print-success` accept writes from any caller with an order `_id` (an attacker can cancel/complete or alter prices). Known/open because the owner disabled login — but it is a verified risk, and `updateOrder` (F5) makes the write path particularly dangerous.
- **F5 — Medium · Confirmed bug:** `updateOrder` (`orderController.js:625-698`) applies client-supplied `items`, `totalAmount`, `grossTotal`, `discountAmount` without re-validating against the menu (unlike `createOrder`, which is authoritative). A client can change line prices/quantities or totals, desyncing order value vs menu price and skewing analytics.
- **F6 — Medium · Confirmed bug (analytics accuracy):** Server `getAnalytics` aggregates **all statuses by date**, so CANCELLED (and never-completed) orders inflate `totalRevenue`, `totalOrders`, `revenueTrend` and `topItems` (the Expo dashboard and `analyticsUtils` explicitly exclude CANCELLED — so web-admin and tablet dashboards disagree; today's live `range=1d` call returned 0/0/0, so the live site is effectively empty, but the logic bug is present).
- **F7 — Medium · Confirmed (edge):** Server `getGroupedOrders` statusPriority (lines 370–385) has **no uppercase `PREPARING`/`READY`** → priority 0 → a session whose only active order is uppercase `PREPARING` would be reported `COMPLETED` by the server grouping. Today Expo deliberately sends legacy `'Preparing'`/`'Ready'` (documented in `orderUtils.js:344-366`) so the normal flow is safe; the risk appears only if a client sends uppercase (which `validateStatusTransition` accepts).
- **F8 — Medium · Confirmed (data-integrity):** `Order` status enum (`Order.js:33-39`) contains legacy `'Preparing'`/`'Ready'` but **not** uppercase `PREPARING`/`READY`, yet `updateOrderStatus` writes via `Order.updateOne` **without `runValidators`**, so arbitrary/uppercase statuses can be stored and later break session-status logic.
- **F9 — Medium · Gap:** **Zero automated tests for the order flow.** `server/` tests cover only order-adjacent utils (`menuUtils`, `couponUtils`, `inventoryUtils`) + inventory API; Expo tests cover pure utils only. Nothing exercises `createOrder`, transitions, grouped status, or analytics aggregation.
- **F10 — Low · Confirmed:** Web-admin WhatsApp bill share hardcodes `+91` (`Orders.jsx:453`) — breaks for non-Indian mobiles; bill shares a text message with a PDF to manually attach.
- **F11 — Medium/High · Confirmed (integration):** The web-admin **Billing page** (`AdminDashbord/src/services/billingService.js:4`) targets `https://resturent-billing.onrender.com/api` — a **different backend** from the main `atr-resturant.onrender.com` used by everything else — and that URL **timed out** (unreachable during this audit). The POS-style Billing inside the admin is effectively pointing at a dead/dormant service, separate from the Expo Billing module (POS-preview) and from the Orders bill.
- **F12 — Low · Confirmed (hygiene):** `react native frontend/` is a stale/duplicate Expo admin app skeleton (same Billing/Dashboard/Orders screens), not a customer app — easy to confuse with the real customer app (`client/`).

## A.4 Ordered implementation plan (future phase — NOT executed here)

Proposed low-risk order if the owner proceeds (each is a separate implementable unit):
1. **F2/F3 root first:** add a server `PUT /api/orders/bill` (or `POST /api/sessions/:id/settle`) that server-side totals, marks orders `paid:true`, and returns a bill record (new `Bill` model or fields on `Order`).
2. **F4/F5 hardening:** require admin proof on order write routes and re-authoritative `updateOrder` (or remove client prices).
3. **Expo Orders Bill:** Bill button on `SessionOrderCard` + `SessionDetailsModal` wired to the new endpoint.
4. **F6/F7/F8:** status-filter `analytics`, add uppercase statuses to server maps, add `runValidators` or schema members.
5. **F9:** add order-flow API tests (isolated test DB); **F10/F11:** fix share + retire/deploy the billing API.

## A.5 Verification executed (all local, no production data touched)

- `server/ npm test` → **62/62 pass** (`tests/inventory.api.test.js` uses the dedicated `gola_inventory_test` DB and drops it; utility tests are pure). No order tests exist (F9).
- `gola-expo-preview/ node --test "src/utils/*.test.js"` → **106/106 pass**.
- Live read-only: main API root `200`, `GET /api/orders/analytics?range=1d` `200` (0 orders); `resturent-billing.onrender.com` unreachable.
- **Not claimed:** end-to-end order creation against production, physical tablet check, any live write, or order-flow automated coverage (none exists).

## A.6 Risks / dependencies

- Any future bill/payment feature requires a **backend change + Render deploy** before the Expo tablet can use it (same dependency as Phase 1E backend items).
- Implementing bills without payment state (F1) would be cosmetic — decide first whether "bill" means *printable itemised receipt* vs *recorded transaction*.
- The dead `resturent-billing` backend (F11) should be retired or repointed so no admin surface silently points at a missing server.
- Reminder: Phase 1E's 70% threshold + inventory delete endpoint still await the backend deploy to take effect in production.

## A.7 Summary

The Orders core loop (customer → order API → DB → session grouping → live admin screen → status lifecycle → analytics) is **working and consistent** across customer, backend, and both admin UIs. The gaps cluster around the **bill/payment half of the requirement**: no persistent bill exists, the **Expo tablet (primary admin UI) has no Bill action at all**, nothing records a payment, and the reports that mention "revenue" cannot distinguish paid from unpaid orders. Security, analytics-status and status-enum issues (F4–F8) are real but were already known consequences of the owner's deliberate no-login choice and the legacy-migration status scheme.

---

## B.0 Phase 2B — Bills & Payments (server + Expo): Implementation Report

> **Status: IMPLEMENTED — SERVER + EXPO UI COMPLETE, AWAITING OWNER/PRODUCTION REVIEW.**
> This phase adds a persistent, server-authoritative bill/payment system (phase 2A finding F1) and wires the Bill action into the Expo admin tablet (phase 2A "awaiting decision" item 2). Landed strictly in `server/` + `gola-expo-preview/` + `docs/`. **No protected directory touched** (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`, and the pre-existing Order/orderRoute/menuUtil/SessionManager/Config code remain read-only). **No new dependencies** — only Node built-ins (`crypto.randomUUID`) and the existing mongoose.

### B.0.1 Corrected final spec (owner-approved)

- Explicit payment state machine stored on the Bill: `RECORDED → REVERSING → REVERSED`; every transition guarded & idempotent; crash mid-reversal recoverable via `resume`.
- Reconciling a BILL lock is safe only once it is provably gone (stale capture) or its Bill is `VOID`; never deletes `OPEN`/`SETTLED`/`VOIDING` bill locks (allows the mutex to survive a partial crash).
- Cancels/changes blocked `409 ORDER_ALREADY_BILLED` once any order in the session belongs to a non-void bill.
- Money as **integer paise** in Mongo; the REST API converts to/from rupees — the only place floats are touched.
- Independent settlement, delta bills, dedicated `/api/billing` router (decisions D1–D3, D5–D7 confirmed).

### B.0.2 Server implementation (all green)

| # | Item | Evidence |
|---|---|---|
| 1 | Pure helpers: billable set, `computeBillTotals` (per-order capture snapshot), paise↔rupees, payment/void input validation, `derivePaymentStatus`, PII-free `toBillDTO` | `server/utils/billingUtils.js` |
| 2 | Models: `Bill` (immutable snapshot, `payments.paymentId` **sparse unique index**, per‑bill `_id` pre-generated), `OrderLock` (partial unique index on active-per-order, TTL only on TRANSITION locks), shared `Counter` (`BILL-YYYYMMDD-NNNN` via `nextBillNumber`) | `server/models/{Bill,OrderLock,Counter}.js` |
| 3 | Controller endpoints: generate, session/`single` read, record payment, reverse payment, void, resume (crash recovery) | `server/controllers/billingController.js` |
| 4 | Router mounted at `/api/billing` in `server.js` after the order routes | `server/routes/billingRoutes.js`, `server/server.js` |
| 5 | **OrderLock guard wired into `updateOrderStatus` + `updateOrder`** (cancels on non-void bills → `409 ORDER_ALREADY_BILLED`; releases the lock in `finally`) | `server/controllers/orderController.js` |
| 6 | Test-harness fix: `dropDatabase()` wipes auto-built indexes, so the API tests re-run `syncIndexes()` for `Bill`/`OrderLock`/`Counter` in `before()` (matching production's boot-time autoIndex build) | `server/tests/billing.api.test.js` |
| 7 | `resumeReversals` returns the non-ok `finished` result (409) instead of silently returning a stale bill when a reversal refuses to progress | `server/models/Bill.js` |

Tests: `server/ npm test` → **90/90 pass** (62 baseline + 12 `billingUtils` unit + 16 `billing.api` integration on the dedicated `gola_billing_test` DB). Covered: full-pay auto-settle, overpay `409 EXCEEDS_BALANCE` + idempotent replay `200`, reversal-only-before-settlement `409 BILL_SETTLED`, `VOID_IN_PROGRESS` / `REVERSAL_IN_PROGRESS` 409s, idempotent reversals/voids, concurrent payment/void races, deadlock-avoidance, crash recovery of `REVERSING` and `VOIDING` states, and order-status-block after billing.

### B.0.3 Expo (tablet) implementation

| # | Item | Evidence |
|---|---|---|
| 1 | Thin API wrappers over `/api/billing` (errors keep `status`/`data` for friendly decoding) | `gola-expo-preview/src/api/billService.js` |
| 2 | Pure display helpers + error-code mapping (`billStatus`, derived `paymentStatus`, method labels, `pickPrimaryBill`, `canPay/void/reverse`, amount validation on rupees) + 16 unit tests | `gola-expo-preview/src/utils/billUtils.js` + `billUtils.test.js` |
| 3 | New `BillModal`: generate-bill / bill summary (number + status chips, total/paid/balance) / payment list with per-payment Reverse / Record-Payment (amount + method chips CASH/UPI/CARD/WALLET/OTHER) / Resume when `VOIDING` / destructive Void; all 409 codes surface friendly messages; per-session remount via `key` avoids stale fetches | `gola-expo-preview/src/components/orders/BillModal.js` |
| 4 | `SessionOrderCard` footer shows a bill row (no-bill → "Bill Now"; else bill number + status + payment chips) | `gola-expo-preview/src/components/orders/SessionOrderCard.js` |
| 5 | `SessionDetailsModal` shows a Billing box (status chips, paid/balance, Open/Generate Bill) | `gola-expo-preview/src/components/orders/SessionDetailsModal.js` |
| 6 | `OrdersScreen` keeps `billBySession` cache, opens the modal, and refreshes card badges via `onChangeBill` | `gola-expo-preview/src/screens/Orders/OrdersScreen.js` |

Verify: `node --test src/utils/*.test.js` → **122/122 pass** (106 baseline + 16 new); `npx expo lint` → **0 errors** (project-wide). No `tsconfig.json` in the project, so `tsc` typecheck remains unavailable by design.

### B.0.4 Behaviour notes & deployment requirement

- A bill is an **immutable snapshot**: re-billing the same eligible orders is rejected `409 ALREADY_BILLED`; the delta-bill rule allows *new/newly-billable* orders on a later generate.
- Full payment auto-settles the bill (`SETTLED`); reversal after settlement is refused (`409 BILL_SETTLED` — void the bill instead); voiding resets all recorded payments and releases the per-order locks **after** the void commits.
- **Deploy first:** the new `/api/billing` endpoints and the `ORDER_ALREADY_BILLED` guard only take effect after the server is deployed (Render) — until then the tablet Bill actions will hit 404s. Follow `RAILWAY_DEPLOYMENT.md` / `QUICK_DEPLOY.md`.

### B.0.5 Remaining / not verified in this environment

- Owner smoke test on the **live deploy**: generate bill → pay partial/full → reverse a payment → settle → void; confirm tablet reflects each state.
- Physical-tablet visual check of `BillModal` (amounts, method chips, badges, 409 banners).
- No auth was added to `/api/billing` (consistent with the owner's explicit no-login decision); write endpoints are open like the rest of the admin API (documented risk, as in earlier phases).

---

## C.0 P1.1 — Backend Automatic Staff Pricing (2026-10-10)

Owner-approved implementation of P1.1 based on the P1 read-only audit. **Scope: backend only** — `server/` + `docs/`. No Expo UI change, no protected directory touched (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`), no data migration/reseed/schema-destructive step, no new dependencies, no production DB writes.

### C.0.1 Files changed and purpose

| File | Purpose |
|---|---|
| `server/utils/menuUtils.js` | Added `computeStaffPrice(price)` (single source of truth for 60% pricing); removed `staffPrice` from `ITEM_WRITABLE_FIELDS` and from `validateItemInput` (client `staffPrice` is now ignored); `buildAuthoritativeOrder` derives the STAFF unit price from the customer `Item.price` and never reads the legacy stored `staffPrice`. |
| `server/models/Item.js` | `staffPrice` is no longer `required` on new documents. The legacy field stays in the schema (documented as legacy-only) so pre-P1.1 records remain readable and their unrelated fields editable; no data is deleted or migrated. |
| `server/controllers/itemController.js` | `GET /api/items?audience=staff` now returns the **derived** `staffPrice` (60% of `price`); customer responses are unchanged (`staffPrice`/`availableForStaff` still projected out). Seed items no longer carry a manual `staffPrice`. |
| `server/utils/menuUtils.test.js` | Updated existing validation/order tests to the derived contract; added `computeStaffPrice` tests (exact 60%, 2-dp rounding, half-paise boundary, float-dust, null-safe) and legacy-stored-value-ignored tests. |
| `server/tests/items.api.test.js` | **New** — API tests against a dedicated `gola_items_test` DB: create without `staffPrice` succeeds and stores none; submitted `staffPrice` is ignored; customer listing keeps customer pricing and never exposes staff fields; staff listing exposes derived 60% prices; legacy documents stay readable and show the derived value while the stored legacy field is preserved on unrelated-field updates; staff availability fields survive. |

No other server file references the legacy stored value for pricing (`grep staffPrice` in `server/` shows only the model field, the derived exposure, and tests).

### C.0.2 Exact pricing formula and rounding

`staffPrice = round(customerPrice × 0.60, 2)` computed as `Math.round(price * 0.6 * 100) / 100` (`server/utils/menuUtils.js:59-65`). `Math.round` rounds half up in paise, so a half-paise product rounds up to the nearest paise; float dust is eliminated. Verified examples: ₹100 → ₹60.00; ₹99 → ₹59.40; ₹99.99 → ₹59.99; boundary ₹0.075 → 4.5 paise → ₹0.05; ₹199.99 → ₹119.99. The same helper is used by both the order builder and the staff menu listing, so orders and menu display cannot diverge. A `price` that is missing/negative/non-finite yields `null` (STAFF order rejected with "Price is not configured…" just like a CUSTOMER order with no price).

### C.0.3 Tests executed and actual results

Run against the local, dedicated test databases only (`gola_billing_test`, `gola_inventory_test`, `gola_items_test`); no production write endpoints used.

- `server/ npm test` (`node --test "utils/*.test.js" "tests/*.test.js"`) → **101/101 pass** (90 baseline + 11 new). Failure count 0. Covers: `computeStaffPrice` exactness/rounding/legacy-ignore; CUSTOMER price unchanged; STAFF order derived 60%; items API create/ignore/legacy/staff-list; `buildAuthoritativeOrder` availability/category/tamper guards; coupons (`PERCENT`/`FLAT`/min-order/cap); bill snapshot paise math; billing/inventory API suites.

### C.0.4 Confirmation: customer pricing and legacy records remain compatible

- CUSTOMER ordering is untouched: `buildAuthoritativeOrder`'s CUSTOMER branch and `GET /api/items` (customer) are byte-for-byte the same logic as before (`menuUtils.js` CUSTOMER branch; `itemController.js` customer projection). Customer responses never expose `staffPrice`/`availableForStaff`.
- Existing orders are denormalized snapshots (`Order.items[].price`, `Order.totalAmount`) — already-written orders are unaffected by this change.
- Existing bills are immutable paise snapshots (`Bill.orders[].totalPaise`, `lines[].pricePaise`) — unaffected. New bills keep using the authoritative prices saved on their orders (`computeBillTotals` unchanged).
- Legacy documents that store `staffPrice` still load and edit (e.g., updating `description` preserves the stored field); staff listing/orders use the **derived** value instead.

### C.0.5 Failures, limitations, unresolved risks

- No test failures. One test authoring mistake (expected 60 for a ₹200 legacy item) was fixed before recording results.
- Legacy `staffPrice` values remain in existing documents but are inert (never read for pricing). A later data-cleaning step could drop the field; intentionally deferred this phase.
- Items without a customer `price` have no staff price either (it is fully derived) — the STAFF order path now rejects them with the existing "Price is not configured" message.
- Deploy required: the change reaches production only after the Render deploy; until then staff listings/orders on the live server still use the old manual-field behavior.
- Consistency with prior documented behavior: coupon order-of-ops and bill snapshot rules are unchanged by design (verify/don't-invent).

### C.0.6 Current status

| Item | Status |
|---|---|
| P1.1 Backend automatic staff pricing | `IMPLEMENTED — BACKEND COMPLETE, AWAITING OWNER REVIEW` (101/101 server tests green) |
| P1.2–P1.5 (Expo UI: remove manual staff-price field, derived display, Customer/Staff selector, direct-bill path) | NOT STARTED — explicitly out of scope for P1.1; begins only after owner approval |
| Production deployment (Render/Atlas) | NOT DEPLOYED — requires owner-initiated deploy (also pending: Phase 2B `/api/billing`) |
| Owner testing | PENDING — smoke test menu + staff order pricing post-deploy |

Stop: P1.2–P1.5 Expo work must not begin automatically.
