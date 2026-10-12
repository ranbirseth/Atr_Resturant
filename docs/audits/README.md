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

---

## C.1 P1.2 — Expo Menu UI: Derived Staff Price (2026-10-10)

Owner-approved implementation of P1.2, building on the P1.1 backend (the pricing source of truth). **Scope: `gola-expo-preview/` UI + related pure helpers/tests, and `docs/`.** `server/` was **not** modified (no blocking defect found). No protected directory touched (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`), no new dependencies, no production writes, no data migrations. Unrelated working-tree changes were preserved.

### C.1.1 Files changed and purpose

| File | Purpose |
|---|---|
| `gola-expo-preview/src/utils/menuUtils.js` | Added `computeStaffPrice(price)` — a display-only mirror of the backend formula `Math.round(price * 0.6 * 100) / 100` (null-safe: invalid/negative/non-finite → `null`). Added `formatPriceExact(value)` ("₹59.40", 2 dp). `audiencePrice(item, 'STAFF')` now derives from `item.price` and **ignores** the legacy stored `item.staffPrice`. Removed the obsolete `staffPrice` requirement from `validateItemForm` and the now-meaningless `hasStaffPrice` helper. |
| `gola-expo-preview/src/screens/MenuCategories/ItemFormModal.js` | **Removed** the editable "Staff Price (₹)" `TextInput`. Added a **read-only** derived preview (label `Staff Price (auto)`) that recomputes live from the customer price via `computeStaffPrice` + `formatPriceExact`. `handleSave` no longer sends `staffPrice`. `formFromItem` no longer reads `item.staffPrice` (legacy items edit without error). Customer price stays editable. |
| `gola-expo-preview/src/screens/MenuCategories/MenuManagement.js` | Item cards show the derived staff price (`Staff (auto)` with 2 dp). Removed the legacy "Not set / Staff price needs to be configured" warning and the `hasStaffPrice` import. Customer price display unchanged. |
| `gola-expo-preview/src/utils/menuUtils.test.js` | Removed `hasStaffPrice` tests; added `computeStaffPrice` exactness/rounding/null-safe tests using the **same expected values as the backend suite**; added `formatPriceExact` tests; updated `audiencePrice` tests to prove the legacy stored value is ignored; updated `validateItemForm` tests to prove a staff price is no longer required and a legacy value in the form object is ignored. |

No other Expo file references a manual staff price (`grep staffPrice` in `gola-expo-preview/src` shows only the derived helper, its tests, and explanatory comments).

### C.1.2 Pricing parity with the backend (single rule)

The UI does not invent a second rule it writes back. It only **previews** the backend rule:

- Backend (authoritative): `server/utils/menuUtils.js:59-65` → `Math.round(price * 0.6 * 100) / 100`.
- UI (display only): `gola-expo-preview/src/utils/menuUtils.js:38-44` → byte-identical expression.
- `ItemFormModal` shows this value but **never submits it**; the create/update payload omits `staffPrice`, so the server derives it from the authoritative customer `price`. There is therefore no conflicting write path.
- Parity is enforced by test: the Expo test asserts ₹100→₹60, ₹99→₹59.40, ₹99.99→₹59.99, ₹0.075→₹0.05, ₹199.99→₹119.99, ₹99.99166…→₹60 — the exact values asserted in `server/utils/menuUtils.test.js`.

The preview is rendered with `formatPriceExact` (2 dp) so paise-level rounding is visible (e.g., ₹99 → ₹59.40), unlike the integer-only `formatPrice` still used for customer prices. Customer-price display is deliberately unchanged.

### C.1.3 Tests executed and actual results

Run from `gola-expo-preview/` on 2026-10-10; no server or production write endpoints used.

- `node --test "src/utils/*.test.js"` → **126/126 pass** (121 baseline + 5 net new; includes the rewritten `menuUtils` suite). Failure count 0.
- `npx expo lint` → **0 errors**, 4 warnings — all pre-existing and in files **not touched** by this phase (`src/api/apiClient.js` unused caught var; BOM warnings in `CategoryScreen.js`, `MenuScreen.js`, `SettingsScreen.js`). None in the changed files.
- `npx expo export --platform android` → **bundle built** (`Android Bundled … index.js (1442 modules)`; `dist/` emitted).

Physical-tablet verification was **not** performed (no device in this environment).

### C.1.4 Customer pricing and legacy-record compatibility

- **Customer prices unchanged:** the customer `TextInput` and its validation are untouched; `audiencePrice(item, 'CUSTOMER')` and `formatPrice` are unchanged (existing test still asserts `formatPrice(200) === '₹200'`).
- **Legacy stored `staffPrice` still editable:** `formFromItem` simply ignores the stored field, so editing an item that predates P1.1 no longer surfaces a staff-price field or validation error. Because `staffPrice` is not in the payload, the server's partial update preserves the stored legacy value (inert) — matching the P1.1 backend contract.
- **Existing workflows preserved:** category chip selection, create/edit, availability (`available`), staff visibility (`availableForStaff`), description/image/prep-time/veg, saving/loading state, and server-error handling are all retained.

### C.1.5 Failures, limitations, unresolved risks

- No test or lint **errors**. No server defect encountered; `server/` untouched.
- The Expo helper intentionally duplicates the backend formula for offline display. If the 60% rate or rounding ever changes on the server, this UI preview must change in lockstep — the shared expected-value tests are the guard. The backend remains authoritative regardless, so any drift can only mislead the preview, never the stored/ordered price.
- Legacy `staffPrice` documents remain (inert); a data cleanup is still deferred by design (P1.1 note).
- Deploy dependency: the P1.1 derived-pricing backend must be deployed (Render) before this UI is meaningful in production, otherwise the staff listing still returns the old manual field.
- No auth on admin menu writes (unchanged, owner's explicit no-login decision).

### C.1.6 Current status

| Item | Status |
|---|---|
| P1.2 Expo Menu UI derived staff price | `IMPLEMENTED — EXPO UI COMPLETE, AWAITING OWNER REVIEW` (Expo utils 126/126; lint 0 errors; Android bundle built) |
| P1.3–P1.5 (Customer/Staff billing selector, direct-bill path) | NOT STARTED — explicitly out of scope for P1.2; begins only after owner approval |
| Production deployment (Render/Atlas) | NOT DEPLOYED — P1.1 backend + this UI need an owner-initiated deploy |
| Owner testing | PENDING — smoke test: open Add/Edit Item, confirm no staff-price input, preview = 60% (2 dp), customer price unchanged after save |

Stop: Billing UI work (P1.3+) must not begin automatically.

---

## C.2 P1.3 — Billing Audience Selection: Audit + STOP Design Report (2026-10-11)

> **Status: STOPPED BY DESIGN — REPORT ONLY. No source, schema, or API change was made.** P1.3 required adding a Customer/Staff selector at the point a bill is generated and showing that the selected pricing is actually what gets billed. The audit concludes the **current persistent Bill schema and `/api/billing` API cannot preserve a bill-time audience selection without (a) a schema/API change, (b) a change to what a persistent bill means relative to its orders, and (c) resolving an undefined coupon business rule.** Per the phase's explicit STOP condition, implementation was halted before any such change. **No files were changed in this phase.**

- **Scope:** read-only audit of `server/` + `gola-expo-preview/` + `docs/`. No protected directory touched (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`), no new dependencies, no production writes, no migrations. Unrelated working-tree changes were preserved.
- **Baseline carried forward (unchanged, not re-run):** server `101/101` (P1.1), Expo utils `126/126` (P1.2). No code changed, so no new tests were added.

### C.2.1 The real bill-generation path (two separate flows)

1. **Persisted bill (the "actual billing workflow") — Phase 2B.** Tablet `BillModal` → `generateSessionBill(sessionId)` (`gola-expo-preview/src/api/billService.js:16-21`) → `POST /api/billing/sessions/:sessionId/bills` with an **empty body** (`billService.js:20`) → `generateBill` (`server/controllers/billingController.js`) captures the session's already-persisted, still-billable orders and snapshots them into an immutable `Bill` via `computeBillTotals(stillBillable)` (`billingController.js:152`) + `Bill.createBillRecord` (`billingController.js:155`). Prices are taken **verbatim from each order's own snapshot**: `rupeesToPaisa(order.totalAmount)` and `rupeesToPaisa(item.price)` (`server/utils/billingUtils.js:105,110`). There is no repricing and no catalog lookup.
2. **Local POS preview (not persisted) — Phase 7.** `gola-expo-preview/src/screens/Billing/BillingScreen.js` loads only the **customer** menu (`getItems('customer')`, line 69), builds an in-memory cart, and shows a preview; it explicitly never calls `POST /api/orders`, persists nothing, and records no payment (`BillingScreen.js:232-244`; `src/api/billingService.js:5-7`).

P1.3 targets flow 1. Flow 2 cannot satisfy requirements 4/7 (persisted snapshot; payment/void/OrderLock) by construction.

### C.2.2 Why the current Bill schema/API cannot safely support the selector

1. **No audience anywhere in billing.** `grep audience` across `server/controllers/billingController.js`, `server/utils/billingUtils.js`, `server/models/Bill.js`, `gola-expo-preview/src/api/billService.js`, `BillModal.js`, `src/utils/billUtils.js` → **no matches**. `billSchema` has no `audience` field (`server/models/Bill.js:71-78`); `generateBill` accepts no audience and `generateSessionBill` posts `{}`.
2. **The bill is a verbatim snapshot of order money, not an independent price computation.** `computeBillTotals` reads `order.totalAmount` (`billingUtils.js:105`) and `item.price` (`:110`). Repricing at bill time would make `Σ bill lines ≠ covered orders' totalAmount` — a change to the meaning of a persistent bill (which is the legal money record) and a divergence from analytics/reporting that read `Order.totalAmount` (`server/models/Order.js:17`).
3. **Orders already carry audience and are already priced for it at order time.** `Order.audience` is `['CUSTOMER','STAFF']` default `CUSTOMER` (`server/models/Order.js:26`), set in `createOrder` via `normalizeAudience` (`orderController.js:76`) and priced by `buildAuthoritativeOrder` (`:108`) with the STAFF branch at 60% (`:97`). A persisted session may therefore be **mixed-audience**; a single bill-time selector would have to override or reject mixed sessions — undefined behavior.
4. **Intake guards live at order creation, not billing.** `buildAuthoritativeOrder` enforces price-config/availability/staff-visibility/category-tamper guards when the order is created. A bill-time audience override would either bypass those guards or need to re-enforce them — not currently modeled.
5. **The tablet has no persistent POS order path.** Because the tablet never POSTs `/api/orders` (`docs/implementation/billing-implementation.md`, Phase 7 finding 1.2), there is no "direct-bill" order for a selector to price; only pre-existing customer orders exist to snapshot.

### C.2.3 Coupon rules and the unresolved ambiguity (requirement 8)

- Coupons are applied **only at order creation**: `computeCouponDiscount(coupon, built.subtotal)` (`orderController.js:128`; rule in `server/utils/couponUtils.js`), computed against the order's own (audience-specific) subtotal, then folded into `Order.totalAmount`.
- There is **no bill-time coupon logic**, and no defined staff-coupon rule. Repricing a bill to STAFF from the order's customer-priced lines would invalidate the customer coupon math (discount was computed on the customer subtotal) with no rule for whether the staff bill keeps, scales, or drops that coupon.
- Requirement 8 says to identify this rule and report the ambiguity **before** implementing. It is reported here; it is **unresolved** and needs an owner decision.

### C.2.4 Schema/API change that would be required (proposed, NOT applied)

To satisfy requirements 1–4 a minimum change set would be:

- `Bill`: add `audience` enum `['CUSTOMER','STAFF']`; record the applied unit prices per line (already snapshotted) and mark the bill's audience basis.
- `POST /api/billing/sessions/:sessionId/bills`: accept + validate `audience`; reject/define mixed-audience sessions; define STAFF repricing (`computeStaffPrice` on the order-line snapshot, menu-change-proof) with a decision on the coupon interaction and on the money-record relationship (`bill.totalPaise` vs the orders' `totalAmount`).
- `toBillDTO`/`BillModal`/`billService`: surface the audience and let the operator choose it.

**Options for the owner:** (a) keep bills as verbatim order snapshots and derive audience display-only from the orders (no selector, no schema change — safe, but does not meet "select audience at bill time"); (b) add bill-time audience + repricing (schema/API/semantics change + coupon decision); (c) require pre-priced STAFF orders (already supported at order time) and make the bill inherit them (no repricing, but no bill-time selection).

### C.2.5 Files inspected (nothing changed)

`server/controllers/billingController.js`, `server/utils/billingUtils.js`, `server/utils/menuUtils.js`, `server/utils/couponUtils.js`, `server/models/Bill.js`, `server/models/Order.js`, `server/controllers/orderController.js`, `server/routes/billingRoutes.js`, `server/routes/orderRoutes.js`, `server/server.js`, `server/tests/billing.api.test.js`; `gola-expo-preview/src/api/billService.js`, `src/api/billingService.js`, `src/components/orders/BillModal.js`, `src/utils/billUtils.js`, `src/screens/Billing/BillingScreen.js`, `src/screens/Orders/OrdersScreen.js`; `docs/implementation/billing-implementation.md`.

### C.2.6 Verification

- No files changed → no code, test, or lint delta. Carried-forward green baselines: server `101/101` (P1.1), Expo utils `126/126` (P1.2).
- Audit evidence is grep/read based (audience absent from the billing layer; `generateSessionBill` posts `{}`).

### C.2.7 Decisions needed before P1.3 can be implemented

1. Does "persistent bill" mean **verbatim order snapshot** or an **independently priced document**? (Drives C.2.4.)
2. If independent: for a bill-time STAFF override, what happens to a coupon already baked into `Order.totalAmount`? (C.2.3)
3. Mixed-audience sessions: override all, split, or reject? (C.2.2 #3)
4. Is a tablet **direct-bill / POS order** path (required for a from-scratch staff bill) in scope? (C.2.2 #5)

Stop: no schema/API/UI change was made; P1.3 implementation awaits the decisions above.

---

# GOLA_RESTAURANT — P1.3 Schema/API & Migration-Safety Plan (2026-10-11)

> **Scope:** READ-ONLY investigation + design only. **No application source, dependency, config, database record, or deployment was changed.** This report is appended to the existing audit log; no earlier report was overwritten. Only this file and `docs/implementation/implementation-progress-tracker.md` are written.
>
> **Status:** `P1.3 DESIGN PLAN READY FOR OWNER REVIEW — NO CODE CHANGES`.
>
> **Repo state at investigation:** branch `main`, uncommitted working tree contains the P1.2 Expo menu changes (`gola-expo-preview/src/...`, docs). Those changes were **preserved and not touched**. Last commits `cf682c1 "fixing"` / `e4b8f1b "next fix"`.
>
> **Verification method:** direct reads of the current repository (not summaries). Every claim marked **VERIFIED** has a `path:line` reference. Claims marked **ASSUMPTION** or **RECOMMENDATION** are design choices, not present in code. The P1.3 STOP report (§C.2) and the Phase 2B report (§B.0) were re-read and cross-checked; where they disagree with current code, the code wins and the discrepancy is noted.
>
> **Carried-forward green baselines (not re-run in this read-only phase):** server `101/101` (P1.1), Expo utils `126/126` (P1.2). No code changed, so the test/lint deltas for P1.3 are zero by construction.

## 1. Executive summary

The Phase 2B billing layer is a **read-only snapshot of already-priced orders**, not an independent pricing engine. `generateBill` captures billable orders and copies their money verbatim: `computeBillTotals` reads `order.totalAmount` (`server/utils/billingUtils.js:105`) and `item.price` (`:110`), and `Bill.totalPaise` is the sum of those captured order totals (`server/controllers/billingController.js:152,161`). There is **no `audience` field anywhere in the billing layer** — VERIFIED by grep: `audience` appears only in `Item`/`Category`/`Order`/order+item controllers, never in `Bill`, `billingUtils`, `billingController`, `billService`, `BillModal`, or `billUtils` (see §2.6). The tablet POS screen (`BillingScreen.js`) loads only the customer menu and is a non-persisted local preview (`gola-expo-preview/src/screens/Billing/BillingScreen.js:69,232-244`).

The approved P1.3 rules now make the bill an **independently priced document** (rule 1) whose totals are stored **separately** from preserved original order totals (rule 4), with STAFF pricing = customer menu price × 60% (rule 2), no coupon carried onto a repriced/staff bill (rule 3), mixed-audience rejection (rule 7), audience eligibility validation (rule 11), idempotent creation (rule 14), a direct POS bill that fabricates no customer order (rule 13), and a **separate** billed-sales analytics surface (rule 15).

This plan delivers that as an **additive schema change + additive API surface + additive DTO fields**, with no destructive migration/backfill. The Phase 2B machinery — `OrderLock` mutex, `Counter` bill numbering, the payment `RECORDED→REVERSING→REVERSED` machine, the void `OPEN/SETTLED→VOIDING→VOID` machine, and `VOIDING`/`REVERSING` crash recovery — is sound and reused unchanged. The two genuinely new problems are (a) independent pricing + eligibility at bill creation and (b) idempotent creation with a payload fingerprint; both are specified in §3 and covered by §7.

**Net new decisions the owner must approve before any code** are in §8 (customer-bill coupon policy; POS operator identity/`createdBy`; whether bill analytics is a new endpoint vs a new field on the existing one).

## 2. Verified current architecture (`path:line`)

### 2.1 Bill model (`server/models/Bill.js`)

- Fields (`billSchema`, `server/models/Bill.js:71-88`): `billNumber` (required), `sessionId` (required, indexed, `:74`), `userId` (required, ref User, `:75`), `status` (enum `BILL_STATUSES`, default `OPEN`, indexed, `:76`), `orders` (`[billOrderSchema]`, `:77`), `totalPaise` (required, min 0, `:78`), `amountPaidPaise` (`:79`), `balanceDuePaise` (required, `:80`), `payments` (`[paymentSchema]`, `:81`), `settledAt`/`voidReason`/`voidRequestedAt`/`voidedAt`, `timestamps` (`:82-87`).
- Sub-schemas: `paymentSchema` (`:31-46`) has `paymentId`, `amountPaise`, `method`, `reference`, `note`, `status`, `idempotencyKey` (required), `receivedAt`, `reversalKey`, `reversalRequestedAt`, `reversedAt`. `billLineSchema` (`:48-58`): `itemId`, `name`, `quantity`, `pricePaise`, `linePaise`, `customizations`. `billOrderSchema` (`:60-69`): `orderId` (**required**, ref Order), `orderNo`, `statusAtCapture`, `totalPaise`, `lines`.
- Indexes: `billNumber` unique (`:90`); `'payments.paymentId'` unique sparse (`:94`); `{ sessionId, status, 'orders.orderId' }` (`:96`).
- Statics: `recordPayment` (`:108`), `reversePayment` (`:177`), `asyncFinishReversal` (`:241`), `resumeReversals` (`:287`), `voidBill` (`:313`), `finishVoid` (`:357`), `resumeBill` (`:423`), `createBillRecord` (`:438`), `getSessionBills` (`:454`), `getById` (`:458`).
- **VERIFIED absent:** `audience`, `origin`, `idempotencyKey` (on the Bill root), `createdBy`, `sourceOrders`, `lines` at bill root, `posItems`, `requestHash`, `payloadHash`. **ASSUMPTION confirmed by grep** (§2.6).

### 2.2 Billing helpers (`server/utils/billingUtils.js`)

- Constants: `BILL_STATUSES = ['OPEN','SETTLED','VOIDING','VOID']` (`:11`); `PAYMENT_METHODS` (`:12`); `PAYMENT_STATUSES = ['RECORDED','REVERSING','REVERSED']` (`:13`); `LOCK_PURPOSES = ['BILL','TRANSITION']` (`:14`); `BILLABLE_STATUS_SET` (`:18-27`, canonical + legacy casings; `PLACED`/`CHANGED`/cancelled are not billable); `STALE_BILL_LOCK_MS = 5 min` (`:31`); `TRANSITION_LOCK_TTL_MS = 60 s` (`:35`).
- `canonicalizeStatus` (`:38-55`); `rupeesToPaisa` (`:70-76`), `paisaToRupees` (`:79-85`) — **integer paise is the storage discipline; floats only at the REST edge**.
- `computeBillTotals(orders)` (`:101-132`): for each order, `orderAmountPaise = rupeesToPaisa(order.totalAmount)` (`:105`) and per line `pricePaise = rupeesToPaisa(item.price)` (`:110`); returns `{ totalPaise: Σ, orders:[...] }`. **This is the snapshot-copy path; there is no catalog lookup and no repricing.**
- `validatePaymentInput` (`:135-172`) requires `amount>0`, a `PAYMENT_METHODS` member, and an `idempotencyKey`; `validateVoidInput` (`:174-183`) allows an optional `reason`.
- `derivePaymentStatus` (`:200-219`), `assertPaymentConsistency` (`:224-252`) — the financial invariant checker used by tests; `toBillDTO` (`:256-319`) — PII-free, paise→rupees, includes `orders[].items`, `payments[]`, `orders[].total` (`:294`).

### 2.3 Billing controller + routes

- `generateBill` (`server/controllers/billingController.js:36-175`): requires `sessionId` (`:37-40`); optional `req.body.orderIds` scope (`:41,53-60`); loads orders (`:44`); filters `isBillableStatus` (`:49-50`); skips orders covered by a non-void bill (`:71-88`); pre-generates `billId`/`billNumber`/`requestId` (`:100-102`); acquires a BILL `OrderLock` per order (`:104-127`, aborts all on `IN_PROGRESS`); re-reads locked orders (`:140-143`); `computeBillTotals` (`:152`); `userId = stillBillable[0].userId` (`:153`); `createBillRecord` (`:155-162`); returns `toBillDTO` (`:171`). **It accepts no `audience` and copies prices verbatim.**
- `getSessionBills` (`:178`), `getBill` (`:192`), `recordPayment` (`:205`), `reversePayment` (`:235`), `voidBill` (`:254`, releases order locks only after `VOID`), `resumeBill` (`:276`).
- `server/routes/billingRoutes.js:20-28`: `POST/GET /sessions/:sessionId/bills`, `GET /bills/:id`, `POST /bills/:id/payments`, `POST /bills/:id/void`, `POST /bills/:id/resume`, `POST /bills/:id/payments/:paymentId/reverse`. Mounted at `/api/billing` in `server/server.js:99`.
- **VERIFIED absent:** no POS bill route, no idempotency-key handling on bill creation, no bill analytics route.

### 2.4 Concurrency primitives

- `OrderLock` (`server/models/OrderLock.js`): unique **partial** index `{ orderId: 1 }` where `active:true` (`:43`) is the per-order mutex; TTL only on `transExpireAt` (`:45`) so TRANSITION locks self-expire but BILL locks never do (`:121`). `acquire` (`:107`), `acquireBillLock` (`:158`), `acquireTransitionLock` (`:150`), `release` (`:169`), `releaseByBill` (`:175`), `coveringBill` (`:181`), `reconcile` (`:194` — never deletes a lock whose Bill is `OPEN`/`SETTLED`/`VOIDING`).
- Order guard wiring: `guardBilledTransition` (`server/controllers/orderController.js:28-68`), invoked in `updateOrderStatus` (`:272`) and `updateOrder` (`:711`) → `409 ORDER_ALREADY_BILLED`.
- `Counter.nextBillNumber` (`server/models/Counter.js:25-32`) → `BILL-YYYYMMDD-NNNN` via atomic `$inc` upsert.

### 2.5 Orders / audience / pricing sources

- `Order` schema (`server/models/Order.js`): `totalAmount` required (`:17`), `items[].price` (`:12`), `audience` enum `['CUSTOMER','STAFF']` default `CUSTOMER` (`:26-30`), `status` enum legacy+new (`:33-39`), `sessionId` required indexed (`:7`), compound index `{ sessionId, createdAt }` (`:77`).
- `createOrder` (`server/controllers/orderController.js:74-221`): `normalizeAudience(req.body.audience)` (`:76`); staff category hiding (`:97-104`); `buildAuthoritativeOrder` (`:108-113`); coupon recompute (`:119-139`); `totalAmount = grossTotal - discountAmount` (`:141-142`); stores `audience` (`:172`). **Confirmed: audience and eligibility are enforced at order time only.**
- `buildAuthoritativeOrder` (`server/utils/menuUtils.js:193-287`): STAFF branch requires `availableForStaff !== false` and prices with `computeStaffPrice(dbItem.price)` (`:241-252`); CUSTOMER branch requires `available !== false` and prices with `toFinitePrice(dbItem.price)` (`:253-262`); hidden-category rejection (`:235-238`).
- `computeStaffPrice(price) = Math.round(price * 0.6 * 100) / 100` (`server/utils/menuUtils.js:59-65`) — **the single approved two-decimal backend rule** the P1.3 rule 2 references; null for missing/negative/non-finite.
- `GET /api/items?audience=staff` returns derived `staffPrice` (`server/controllers/itemController.js:28-33`).

### 2.6 Audience in the billing layer — VERIFIED absent

`grep audience` over `Bill.js`, `billingUtils.js`, `billingController.js`, `billingRoutes.js`, `billService.js`, `BillModal.js`, `billUtils.js` → **0 matches** (the only `audience` hits are `Order.js:26`, order/item controllers, `Category.js`, and the Expo menu service). This independently re-confirms §C.2.2 #1.

### 2.7 Analytics

- `getAnalytics` (`server/controllers/orderController.js:492-632`) aggregates **`Order`** `totalAmount`/`items.price` only (`:515-529`, `:548-562`, `:565-581`); **no status filter** (so it includes cancelled orders, the known F6 issue) and **no bill reference**.
- **VERIFIED absent:** there is no `Bill.aggregate`/bill-totals analytics anywhere (`grep` finds `Bill.find` only in `billingController.js:75` and `OrderLock.js`). Rule 15's "new billed-sales analytics" does not exist yet.

### 2.8 Expo tablet surfaces

- `gola-expo-preview/src/api/billService.js`: `generateSessionBill(sessionId)` posts an **empty body** (`:16-21`); `recordPayment` forwards `amount/method/reference/note/idempotencyKey` (`:30-48`); no POS create, no audience param.
- `gola-expo-preview/src/components/orders/BillModal.js`: generate/summary/payment/reverse/void/resume (`:86-285`); **no audience selector**.
- `gola-expo-preview/src/screens/Billing/BillingScreen.js`: loads `getItems('customer')` (`:69`), builds an in-memory cart, and `handleGenerate` opens a local preview only — **no POST, no persistence, no payment** (`:232-244`; header text "local preview only" `:340-342`).
- `gola-expo-preview/src/utils/billUtils.js`: `pickPrimaryBill` (`:200-221`), `canAcceptPayment` (`:223`), `canVoidBill` (`:231`), `canReversePayment` (`:238`), `validatePaymentAmount` (`:248`).
- `gola-expo-preview/src/api/billingService.js:12-20`: only `POST /coupons/validate` (read-only).

### 2.9 Test harness (conventions to follow)

`server/tests/billing.api.test.js`: dedicated DB via `process.env.BILLING_TEST_MONGO_URI || mongodb://127.0.0.1:27017/gola_billing_test` (`:10-11`); `dropDatabase()` then **explicit `syncIndexes()` for `Bill`/`OrderLock`/`Counter`** in `before()` because dropping wipes mongoose-auto-built indexes (`:104-114`); HTTP via global `fetch` against `app.listen(0)` (`:115-120`); `assertInvariants` wraps `assertPaymentConsistency` (`:88-102`). New tests must follow this; a new POS index is **not** created unless `syncIndexes()` is extended (a real migration-safety coupling — see §6).

## 3. Proposed schema and API contracts

> Everything here is **design only — not applied**. Field names are recommendations; semantics are driven by rules 1–16.

### 3.1 Additive `Bill` schema changes (`server/models/Bill.js`)

| Field | Type / enum | Default | Purpose / rule |
|---|---|---|---|
| `origin` | String enum `['SESSION','POS']` | `'SESSION'` | SESSION = references source orders; POS = direct, no customer order. Rule 13. |
| `audience` | String enum `['CUSTOMER','STAFF']` | `'CUSTOMER'` | Pricing basis of the bill. Rule 1. |
| `lines` | `[billLineSchema]` | `[]` | Canonical **billed** priced/quantity snapshot for both origins (POS uses this; SESSION may mirror/derive). Rule 6. |
| `idempotencyKey` | String, `default:null`, **sparse unique** | `null` | Namespaced creation key (`"<origin>:<clientKey>"`). Rule 14. |
| `requestHash` | String, `default:null` | `null` | `sha256` of canonical creation payload; detects key reuse with a different payload. Rule 14. |
| `createdBy` | String, `default:''` | `''` | Free-text operator label (no auth; not an identity guarantee). Audit metadata. Rule 16. |
| `voidedBy`/`voidReason` | (reason exists) + `voidedBy` String | `''` | Audit. |
| `orders[].originalTotalPaise` | Number | mirror `totalPaise` | Preserve the source order total (rule 4). |
| `orders[].billedTotalPaise` | Number | derived | Independently priced total for that order's lines. |
| `orders[].sourceOrderId` | ObjectId ref Order | = `orderId` | Alias kept for backward compat; no rename of the existing `orderId`. |

**Backward compatibility rules (no backfill):**
- Legacy documents lack all new fields. Read paths treat missing `origin` as `SESSION`, missing `audience` as `CUSTOMER`, missing `billedTotalPaise` as `totalPaise`, missing `lines` as derived from `orders[].lines`. Legacy `orders[].totalPaise` keeps its current meaning (captured order total) and is surfaced as `originalTotalPaise`.
- No field is renamed or removed. `userId`/`sessionId` **required** flags must be **relaxed** to allow POS bills with no customer session (see 3.2). Loosening a validator is non-destructive to existing documents.
- New indexes: `{ idempotencyKey: 1 }` unique sparse; `{ origin: 1, audience: 1, status: 1, createdAt: -1 }` (analytics + listings). Existing indexes untouched.

### 3.2 POS bills — no fabricated customer order (rule 13)

A POS bill is a normal `Bill` document with:
- `origin: 'POS'`, `orders: []` (no `orderId`, satisfying the required-field constraint because the array is empty), `sessionId: null`, `userId: null`, `lines: [...]` (the immutable item/quantity/price/total snapshot), `audience`, `totalPaise` = Σ `linePaise`.
- **No `Order` document is created**; the requirement "no fabricated customer order" is satisfied by construction. `OrderLock` is not used for POS bills (nothing to lock).
- **ASSUMPTION:** `userId`/`sessionId` currently `required:true` (`Bill.js:74-75`) must be relaxed. **Alternative** (no schema relaxation): keep a synthetic non-order scope string, but that risks confusing session queries. **RECOMMENDATION:** relax both to `required:false` (legacy docs unaffected; `createBillRecord` still passes them for SESSION).

### 3.3 API contracts

All money is **integer paise in Mongo, rupees at the REST edge** (existing discipline). Errors keep the existing `{ error, message, bill? }` envelope (`billingController.js:19-27`).

**(a) Generate an independently priced SESSION bill**
`POST /api/billing/sessions/:sessionId/bills`
```jsonc
// request
{
  "audience": "CUSTOMER" | "STAFF",     // required for the new contract; omit => legacy verbatim snapshot (compat)
  "orderIds": ["<orderId>", ...],        // optional partial scope (rule 9)
  "idempotencyKey": "<client key>",      // optional; required for rule 14 guarantees
  "createdBy": "<operator label>"        // optional audit metadata
}
// 201 response (unified DTO) — see (f)
```
Behaviour: load session orders; select **eligible, not-yet-billed** orders (rule 8; existing filter at `billingController.js:49-88`); **reject mixed-audience candidates** `400 MIXED_AUDIENCE` (rule 7); look up each line's `Item` and **re-price for `audience`** (CUSTOMER=`Item.price`, STAFF=`computeStaffPrice(Item.price)`, `menuUtils.js:59-65`) with **eligibility validation** (`available`/`availableForStaff`, staff-visible category; rule 11) → `400 ITEM_INELIGIBLE` naming the item; **no coupon applied** to a newly priced bill (rule 3); compute `totalPaise` from the new line snapshot; acquire BILL locks and write the immutable bill (existing flow). Reuse of an `idempotencyKey` with the same `requestHash` returns the existing bill `200 { alreadyProcessed:true }`; a different payload returns `409 IDEMPOTENCY_KEY_REUSED` (rule 14).

**(b) Create a direct POS bill**
`POST /api/billing/pos/bills`
```jsonc
{
  "audience": "CUSTOMER" | "STAFF",
  "items": [{ "itemId": "<id>", "quantity": 2, "customizations": [] }],
  "idempotencyKey": "<client key>",
  "createdBy": "<operator label>"
}
// 201 => unified DTO, origin:"POS", sessionId:null, userId:null, orders:[]
```
Behaviour: validate items against the menu for `audience` (rule 11); reject empty/invalid quantity; price independently; no coupon; create a `Bill` directly (no Order, no OrderLock). Idempotent as in (a).

**(c) Retrieve a bill** — `GET /api/billing/bills/:id` (exists, `billingController.js:192`). DTO gains `origin`/`audience`/`lines` (§3.4). Session listing `GET /api/billing/sessions/:sessionId/bills` is unchanged for legacy bills and returns POS bills only if queried by id.

**(d) Record/reverse payments** — `POST /api/billing/bills/:id/payments` and `POST /api/billing/bills/:id/payments/:paymentId/reverse` (exist; `billingUtils.js:135`, `Bill.js:108,177`). No contract change; work for both origins because POS bills carry the same `payments` ledger.

**(e) Void / resume / recover** — `POST /api/billing/bills/:id/void` and `/resume` (exist; `Bill.js:313,423`). **Rule 12 is already satisfied:** the void's V2 loop reverses every `RECORDED`/`REVERSING` payment before V3 finalizes (`Bill.js:357-420`) and order locks are released only after `VOID` (`billingController.js:262-266`). POS bills have no locks to release — a no-op.

**(f) Unified bill DTO (SESSION and POS)** — extend `toBillDTO` (`billingUtils.js:256`) additively with:
```jsonc
{
  "origin": "SESSION" | "POS",
  "audience": "CUSTOMER" | "STAFF",
  "lines": [{ "itemId","name","quantity","price","total","customizations","sourceOrderId"? }],
  "orders": [{ "orderId","orderNo","statusAtCapture","originalTotal","billedTotal","items":[...] }],
  "totalAmount","amountPaid","balanceDue","paymentStatus","status","payments":[...],
  "...": "existing fields unchanged"
}
```
Legacy bills normalise (`origin:'SESSION'`, `audience:'CUSTOMER'`, `lines` derived). No existing key is removed or re-typed, so P1.2/2B clients keep working.

## 4. Financial invariants

1. **Original order totals never change.** The billing controller only reads `Order` (`billingController.js:44,140`); the only writer of `Order.totalAmount` is `updateOrder` (`orderController.js:736`), which is guarded by `guardBilledTransition`/`OrderLock` once billed (`:711`, `OrderLock.js:43`). **VERIFIED.** P1.3 must keep billing write-free toward `Order`.
2. **Existing bill snapshots never change.** `Bill` creation writes pricing fields once (`createBillRecord`, `Bill.js:438`); later mutations touch only `payments`/`status`/`amountPaid`/`balanceDue` (`Bill.js:108-435`). New `lines`/`audience` are write-once. **VERIFIED.**
3. **Payments/reversals reconcile to the bill total.** `assertPaymentConsistency` (`billingUtils.js:224`) enforces `amountPaid == Σ non-reversed` and `balanceDue == total − amountPaid`; every API test calls it (`billing.api.test.js:88-102`). **VERIFIED.**
4. **Source orders are not counted again as billed sales.** New bill analytics must aggregate **`Bill.totalPaise` of finalized bills** (proposed: `SETTLED`, optionally `OPEN` shown separately; `VOID` excluded), never `Order.totalAmount`. The legacy `/api/orders/analytics` (`orderController.js:492`) is left byte-for-byte unchanged.
5. **Historical order analytics and new bill analytics stay distinguished.** Two separate surfaces: existing `GET /api/orders/analytics` (order-based, unchanged) and new `GET /api/billing/analytics` (bill-based). **RECOMMENDATION:** label them in the UI ("Ordered Sales" vs "Billed Sales") to prevent double counting. **ASSUMPTION:** rule 15's "finalized" means `status ∈ {SETTLED}` counted as revenue, `OPEN` counted as "billed-but-unsettled", `VOIDING`/`VOID` excluded — needs owner confirmation (§8).

## 5. Concurrency / idempotency / recovery analysis

| Scenario | Current mechanism (VERIFIED) | P1.3 addition |
|---|---|---|
| Two requests bill the same order | `OrderLock` partial-unique `{orderId, active}` (`OrderLock.js:43`); loser gets `COVERED`→`ORDER_ALREADY_BILLED` or `IN_PROGRESS`; on `IN_PROGRESS` the whole capture aborts (`billingController.js:119-125`) | Unchanged |
| Partial session billing | `orderIds` scope + covered-check (`billingController.js:41,53-88,170-193`) | Reject mixed audience across the **selected** scope (rule 7) |
| Duplicate POS submission / retry | None today | `idempotencyKey` sparse-unique + `requestHash`; same hash ⇒ `200 alreadyProcessed`, different ⇒ `409 IDEMPOTENCY_KEY_REUSED` (rule 14) |
| Same key, different payload | None today | `409 IDEMPOTENCY_KEY_REUSED` (via `requestHash` mismatch) |
| Crash during bill generation | BILL locks orphaned; `reconcile` clears a lock whose Bill is missing and older than `STALE_BILL_LOCK_MS` (`OrderLock.js:194-221`); a bill-number counter gap is harmless | POS: single atomic `Bill.create` (no locks); a crash before insert loses nothing but a counter increment |
| Crash during reversal | `REVERSING` state; `resumeReversals`/`resumeBill` complete it idempotently (`Bill.js:287,423`) | Unchanged |
| Crash during void | `VOIDING` state; `resumeBill` runs V2+V3 (`Bill.js:423-435`); `reconcile` never drops a `VOIDING` bill's lock (`OrderLock.js:200-208`) | Unchanged |
| Re-bill after fully completed void | Void releases BILL locks after `VOID` (`billingController.js:264-265`); covered-check excludes `VOID` bills (`:77`), so orders become eligible again | Unchanged; new bill has a new `_id`/`billNumber` |

**Race note for idempotency (rule 14):** the create must be *insert-first* (attempt `Bill.create` with the namespaced key, catch `E11000`), mirroring the reserve-first pattern already proven in `inventoryController.recordMovement` — then read the existing bill and compare `requestHash`. A pre-check-then-insert would race.

## 6. Legacy compatibility and migration safety

- **No destructive migration / no backfill.** All schema edits are additive fields and index additions; `userId`/`sessionId` are loosened (never tightened). No document is rewritten.
- **Legacy bills read path.** `toBillDTO` normalises missing `origin`→`SESSION`, `audience`→`CUSTOMER`, `billedTotalPaise`→`totalPaise`, `lines`→derived. Legacy totals continue to equal the captured order totals (today's semantics), so historical reports are unchanged.
- **Additive indexes required:** `{ idempotencyKey: 1 }` unique **sparse**; `{ origin: 1, audience: 1, status: 1, createdAt: -1 }`; optional `{ 'orders.orderId': 1 }` already covered by `:96`. Mongoose `autoIndex` builds these on boot in production (same assumption Phase 2B relied on), **but** the API test harness calls `dropDatabase()` and must therefore add the new models/indexes to the explicit `syncIndexes()` list in `before()` (`billing.api.test.js:110-114`) — otherwise the idempotency index silently does not exist in tests. **This is a required test-harness change, flagged.**
- **Rollback limitations.** Reverting code leaves new fields/indexes inert and harmless (old code ignores unknown fields). A bill created as POS under new code is unreadable by pre-P1.3 code only if it relied on `getSessionBills` (POS bills have `sessionId:null` and are fetched by id). No rollback deletes data. Recovery for an interrupted create is the existing `reconcile` + `resume` machinery.
- **Backup/ops:** no DB record is touched by this plan; any future deploy should follow the existing `RAILWAY_DEPLOYMENT.md`/`QUICK_DEPLOY.md` and take a snapshot first (ops, out of scope here).

## 7. Test plan

**Unit (`server/utils/billingUtils.test.js`, Expo `billUtils.test.js`):**
1. Audience pricing: CUSTOMER=`Item.price`; STAFF=`Math.round(price*0.6*100)/100` with the same expected values as `menuUtils.test.js` (₹100→60, ₹99→59.40, ₹99.99→59.99, ₹0.075→0.05) — no second pricing rule.
2. Eligibility: missing item, `available:false` (CUSTOMER), `availableForStaff:false` (STAFF), staff-hidden category ⇒ `ITEM_INELIGIBLE` with the item name.
3. Mixed-audience candidate set ⇒ `MIXED_AUDIENCE`.
4. Coupon dropped: a source order with `couponCode`/`discountAmount` yields a bill with no discount (rule 3).
5. `requestHash` canonicalisation: identical payloads hash equal; order-insensitive where required; different payloads differ.
6. DTO normalisation of a legacy document (no `origin`/`audience`/`lines`) and a POS document.
7. Analytics helper: finalized bills sum `totalPaise`; `VOID` excluded; `OPEN` classifiable.

**API (`server/tests/billing.api.test.js` or a new `billing.p13.api.test.js`, dedicated `gola_billing_test` DB, `syncIndexes()` extended):**
8. SESSION CUSTOMER bill prices from menu and preserves `Order.totalAmount` unchanged (re-read order).
9. SESSION STAFF bill prices at 60%, no coupon, `Bill.totalPaise ≠ Σ order.totalAmount` where applicable (rule 4), original orders untouched (rule 5).
10. Mixed-audience session rejected `400 MIXED_AUDIENCE`.
11. Partial billing across separate eligible orders (rule 9) and re-bill of one order after partial void (rule 10).
12. Idempotent create: same key/same payload → one bill + `200 alreadyProcessed`; same key/different payload → `409 IDEMPOTENCY_KEY_REUSED`; concurrent duplicate create → exactly one bill.
13. POS create: no `Order` created; `origin:'POS'`, `sessionId:null`, `userId:null`; payment/reverse/void/resume all work; idempotent replay.
14. Crash recovery: simulate `REVERSING`/`VOIDING` then `resume`; `assertPaymentConsistency` after every step.
15. Bill analytics endpoint sums finalized bill totals and does **not** include order-based figures; legacy `/orders/analytics` output unchanged.

**Verification commands (for the future implementation phase, unchanged from existing conventions):** `server/ npm test`; `gola-expo-preview/ node --test "src/utils/*.test.js"`; `npx expo lint`. (Not run here — read-only.)

## 8. Risks, open technical questions, and approval gates

**Risks**
- R1 — **Semantic split risk:** if any UI sums `Order.totalAmount` *and* `Bill.totalPaise`, revenue double counts. Mitigation: rule 15 separation + UI labelling; no order-analytics change.
- R2 — **Menu drift:** independent pricing reads current `Item.price`; if the menu changed since the order, the bill legitimately differs from the order. This is rule-4 by design but must be communicated.
- R3 — **Test-harness index coupling:** forgetting `syncIndexes()` for the new sparse-unique `idempotencyKey` voids rule 14 in tests (§6).
- R4 — **Loosened required fields:** relaxing `userId`/`sessionId` could let a malformed SESSION bill be created if the new controller path has a bug; mitigate with explicit origin-branch validation.
- R5 — **No auth (rule 16):** `/api/billing/*` writes remain open; anyone who can reach the API can create/void/pay/reverse. Documented in §B.0.5/§A.3 (F4); **unchanged by this plan** per the approved requirement.
- R6 — **Customer-coupon policy ambiguity:** rule 3 clearly drops the coupon for STAFF; whether a CUSTOMER repriced bill may carry the original order coupon is unresolved (§8 Q1).

**Open technical questions (owner)**
- Q1 — For a **CUSTOMER**-audience bill: drop the coupon entirely (my RECOMMENDATION, consistent with "independently priced", rule 1), or carry the source order's coupon? Rule 3 only names STAFF.
- Q2 — Does "finalized" for analytics (rule 15) mean **`SETTLED` only**, or `SETTLED` + outstanding `OPEN` shown separately? My ASSUMPTION is the latter, with `VOID` excluded.
- Q3 — POS operator identity: since rule 16 forbids login, is a free-text `createdBy` label acceptable audit metadata, or should it be omitted?
- Q4 — Should a **CUSTOMER** session bill's line prices be re-read from the current menu (my RECOMMENDATION, uniform with STAFF) or copied from the order snapshot? Re-reading is uniform but can drift; copying preserves the order but then "independent pricing" only bites for STAFF.
- Q5 — POS bills with no `sessionId`: is fetching them by id + a future `origin=POS` list endpoint sufficient, or is a POS "day" grouping required?

**Approval gates (no implementation until all pass)**
- **G1** — Owner answers Q1–Q5.
- **G2** — Owner approves the additive schema in §3.1/§3.2 (including relaxing `userId`/`sessionId`).
- **G3** — Owner approves the two new routes and the unified DTO field additions.
- **G4** — Owner approves the bill-analytics separation model in §4/rule 15.
- **G5** — Implementation begins only after G1–G4, and stops for review before deploy (Render).

## 9. Exact files proposed for future modification

> Listed for planning only. **None was modified in this phase.**

| File | Proposed change |
|---|---|
| `server/models/Bill.js` | Add `origin`,`audience`,`lines`,`idempotencyKey`,`requestHash`,`createdBy`,`voidedBy`; `orders[].originalTotalPaise`/`billedTotalPaise`; sparse-unique `idempotencyKey` + analytics index; new `createPosBillRecord`/extended `createBillRecord`; relax `userId`/`sessionId`. |
| `server/utils/billingUtils.js` | Audience pricing/eligibility, `computeBilledTotals`, `requestHash`, mixed-audience check, extend `toBillDTO`, analytics helpers/constants. |
| `server/utils/menuUtils.js` | Reuse `computeStaffPrice` (`:59`); optionally export an eligibility helper for both audiences (no behavior change to ordering). |
| `server/controllers/billingController.js` | `generateBill` accepts `audience`/`idempotencyKey`/`createdBy`; new `createPosBill`; new `getBillAnalytics`. |
| `server/routes/billingRoutes.js` | Add `POST /pos/bills`, `GET /analytics`. |
| `server/tests/billing.api.test.js` (or new `billing.p13.api.test.js`) | New API suite + extend `syncIndexes()` in `before()`. |
| `server/utils/billingUtils.test.js` | New unit suite. |
| `gola-expo-preview/src/api/billService.js` | `audience` on generate; `createPosBill`; idempotency key plumbing. |
| `gola-expo-preview/src/components/orders/BillModal.js` | Customer/Staff selector; pass `audience`. |
| `gola-expo-preview/src/screens/Billing/BillingScreen.js` | Persist a POS bill (replace local-preview-only) + audience selector. |
| `gola-expo-preview/src/utils/billUtils.js` (+ test) | Audience/DTO display helpers. |
| `docs/audits/README.md`, `docs/implementation/implementation-progress-tracker.md` | This report + tracker (already updated). |

**Explicitly NOT proposed to change:** `server/models/Order.js` (audience already exists), `server/controllers/orderController.js` analytics (legacy order metrics stay frozen per rule 15), and all protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`).

## 10. Implementation progress tracker update

Recorded in `docs/implementation/implementation-progress-tracker.md` as a new P1.3 entry: **design complete, awaiting owner review; no code changes.** See the tracker for the Completed / In progress / Remaining table.

---

# GOLA_RESTAURANT — P1.3 Design Approval Corrections (2026-10-11)

> **Scope:** READ-ONLY design correction. **Append-only** — no earlier finding in §C.3 was erased or rewritten. **No source, schema, dependency, application config, database record, or deployment was changed.** Companion review: `docs/audits/p1.3-design-approval-checklist.md` (separate file). This subsection resolves the documentation gaps raised by that checklist (analytics contract G1; immutability clarification; tracker/index consistency) without implementing any feature.
>
> **Verification method:** direct reads of the current repository. **VERIFIED** = read from current code with `path:line`; **ASSUMPTION** = design choice not present in code; **RECOMMENDATION** = proposed, **not approved**; **OWNER DECISION** = requires owner sign-off. No test/lint was re-run in this phase.
>
> **Status:** `P1.3 DESIGN PLAN READY FOR OWNER REVIEW — NO CODE CHANGES`.

## C.3.1.1 Correction G1 — Analytics API contract (the missing §3.3(g))

The original §3.3 supplied contracts for generate/POS/retrieve/payments/void/DTO but **not** for the rule-15 analytics surface (the endpoint appeared only as a name in §9). That gap is preserved as historical record in §3.3; this subsection supplies the missing contract. **RECOMMENDATION — not approved; implementation gated by §8 G1–G5.**

`GET /api/billing/analytics` — read-only; aggregates **finalized bill totals** (`Bill.totalPaise`), never `Order.totalAmount` (rule 15). Mounted under `/api/billing` (`server/server.js:99`).

Query parameters (all optional; additive — unknown params ignored):

| Param | Type | Default | Semantics |
|---|---|---|---|
| `from` | ISO-8601 date/datetime | unbounded (no lower bound) | inclusive lower bound on bill `createdAt` |
| `to` | ISO-8601 date/datetime | unbounded (no upper bound) | inclusive upper bound on bill `createdAt` |
| `origin` | `SESSION` \| `POS` | both | filter on `Bill.origin` |
| `audience` | `CUSTOMER` \| `STAFF` | both | filter on `Bill.audience` |

**Date filtering (RECOMMENDATION):** filter on `Bill.createdAt` (the bill's creation timestamp). For date-only inputs, treat `from` as `T00:00:00.000Z` inclusive and `to` as end-of-day inclusive (exclusive `lt` of the next day, equivalent to `T23:59:59.999Z`). **Time-zone basis is an OWNER DECISION** (server-UTC vs restaurant-local) — see C.3.1.4.

**Response DTO (RECOMMENDATION).** Money is integer paise in Mongo and rupees at the REST edge, matching the existing discipline (`billingUtils.js:70-85`) and `toBillDTO` (`billingUtils.js:256`):

```jsonc
{
  "range": { "from": "<iso|null>", "to": "<iso|null>", "origin": "SESSION|POS|null", "audience": "CUSTOMER|STAFF|null" },
  "currency": "INR",
  "finalized": {              // RECOMMENDED definition; OWNER DECISION below
    "bills": 0,
    "totalAmount": 0.00,      // Σ Bill.totalPaise of finalized bills (rupees at edge)
    "amountPaid": 0.00,
    "balanceDue": 0.00
  },
  "unsettledOpen": {          // OPEN bills reported separately — never counted as recognized revenue
    "bills": 0,
    "totalAmount": 0.00,
    "amountPaid": 0.00,
    "balanceDue": 0.00
  },
  "excluded": { "voidingBills": 0, "voidBills": 0 },
  "byAudience": [ { "audience": "CUSTOMER|STAFF", "bills": 0, "totalAmount": 0.00 } ],
  "byOrigin":   [ { "origin": "SESSION|POS", "bills": 0, "totalAmount": 0.00 } ]
}
```

**Finalized-status definition — OWNER DECISION (not verified, not approved).** §C.3 §4.5/§8 Q2 currently treats it as an ASSUMPTION. This review **recommends** recognized revenue = `status: 'SETTLED'`; `'OPEN'` reported separately in `unsettledOpen`; `'VOIDING'`/`'VOID'` excluded (counted only under `excluded`). The proposal is consistent with the existing state machine (`BILL_STATUSES = ['OPEN','SETTLED','VOIDING','VOID']`, `billingUtils.js:11`) and `assertPaymentConsistency` (`billingUtils.js:224`), but is **not approved** until the owner confirms Q2.

**Legacy surface unchanged — VERIFIED.** `GET /api/orders/analytics` (`orderController.js:492-632`) is order-based, has no status filter, and is **not** modified (rule 15). No bill-aggregation code exists today (VERIFIED absent, §2.7). Error envelope stays `{ error, message, bill? }` (`billingController.js:19-27`).

## C.3.1.2 Correction — Immutability is code-path-enforced, not database-enforced

Original §C.3 §4.2 described new `lines`/`audience` as "write-once". Accurate clarification:

- **VERIFIED:** bill pricing snapshots are immutable today **only because no code path writes them after creation**. `createBillRecord` writes pricing once (`Bill.js:438`); every later bill mutation is confined to `payments`/`status`/`amountPaid`/`balanceDue` (`Bill.js:108-435`). There is **no MongoDB-level immutability guard** — no `immutable: true` on pricing subfields and no schema-level write protection.
- **RECOMMENDATION:** describe immutability as "protected by the absence of any pricing-write path", not as a database guarantee. Implementation *may* optionally add `immutable: true` to `audience`/`lines`/`totalPaise`, but this is not required by the design.
- **Proposed regression test (add to the §7 API suite):** at bill creation capture `audience`, `lines`, `totalPaise`, `orders[].originalTotalPaise`, and `orders[].billedTotalPaise`; then run pay → reverse → re-pay → void → resume; re-read the bill and assert every captured pricing field is byte-identical. Also assert no endpoint exposes a way to `PATCH`/update these fields.

## C.3.1.3 Correction G2 — Tracker and report-index consistency

- **VERIFIED (historical):** when §C.3 §10 was written, the tracker still carried only the §C.2 STOP stub, so §10's "Recorded … as a new P1.3 entry" was ahead of the saved file. Preserved here rather than rewritten.
- **Corrected now (documentation-only):** `docs/implementation/implementation-progress-tracker.md` carries a current, non-contradictory P1.3 entry (design plan + approval checklist, status READY FOR OWNER REVIEW) above the preserved historical §C.2 entry. `docs/README.md` index row 09 reflects the checklist and this correction outcome.

## C.3.1.4 Remaining OWNER DECISIONS (not verified, not approved)

- **Q1–Q5** in §C.3 §8 remain open.
- **New (this subsection):** the `from`/`to` **time-zone basis** for analytics date filtering (server-UTC vs restaurant-local) is an OWNER DECISION.
- **Gates:** G1–G4 in §C.3 §8 still apply; G5 = stop for review before deploy. No implementation begins until G1–G4 pass.

---

**P1.3 DESIGN PLAN READY FOR OWNER REVIEW — NO CODE CHANGES**

## C.3.2 P1.3 — IMPLEMENTATION REPORT (2026-10-11) — APPROVED FOR OWNER REVIEW

**Status:** IMPLEMENTED in server/ (no deploy). All server unit and integration tests pass. Protected directories (client/, AdminDashbord/, print-service/, react native frontend/) unchanged.

### Implemented
- **Models (Bill):** added origin, audience, lines, subtotalPaise, discountPaise, couponCode, idempotencyKey, requestHash, createdBy, voidedBy; relaxed sessionId/userId to default null (non-destructive). Bill order schema gained originalTotalPaise, billedTotalPaise, discountPaise, couponCode. Added indexes {idempotencyKey:1} sparse-unique and {origin:1,audience:1,status:1,createdAt:-1}. Extended createBillRecord() to accept new fields (only sets idempotency when provided). Added findByIdempotencyKey().
- **Utils (billingUtils):** added RECOGNIZED_BILL_STATUSES, VOIDED_BILL_STATUSES, AUDIENCES, IST constants, and helpers: parseAudience, orderAudience, detectMixedAudience, priceLinesForAudience, applyPreservedDiscount, stableStringify, computeRequestHash, canonicalizePosItems, canonicalizeSessionOrderIds, parseIstBoundary, resolveAnalyticsRange, buildBillAnalyticsMatch. Extended toBillDTO to include origin, audience, lines, subtotal, discount, couponCode, createdBy, and per-order originalTotal, billedTotal, discount, couponCode.
- **Controllers (billingController):** generateBill now accepts optional audience and idempotencyKey (namespaced SESSION:<key>); enforces mixed-audience rejection, audience mismatch, and idempotency (pre-check + insert-first with E11000 recovery). Independent pricing path (requested audience) prices at current menu prices, preserves source coupon discount for CUSTOMER (clamped), records no coupon for STAFF, and freezes snapshots. Added createPosBill (requires audience, validates items, idempotency POS:<key>, checks hidden categories for STAFF, independent pricing, no orders). Added getBillAnalytics (IST boundaries, legacy origin/audience fallback, recognized=OPEN+SETTLED, voided=VOIDING+VOID, grouped by audience/origin).
- **Routes:** added POST /pos/bills and GET /analytics.
- **Tests:** new server/tests/billing.p13.api.test.js (9 tests covering pricing, coupon preservation, mixed/audience rules, session+POS idempotency, POS STAFF eligibility, analytics). Extended server/utils/billingUtils.test.js with P1.3 helpers and updated DTO expectations. All existing tests continue to pass.

### Changed files
- server/models/Bill.js (schema fields, indexes, createBillRecord, findByIdempotencyKey)
- server/utils/billingUtils.js (helpers, exports, toBillDTO)
- server/controllers/billingController.js (generateBill, createPosBill, getBillAnalytics)
- server/routes/billingRoutes.js (new routes)
- server/utils/billingUtils.test.js (extended)
- server/tests/billing.p13.api.test.js (new)

### Tests
- node --test utils/*.test.js tests/billing.api.test.js tests/billing.p13.api.test.js tests/inventory.api.test.js tests/items.api.test.js ? **111/111 pass**.

### Safety
- Dedicated DB per integration file; safety guard in P1.3 tests refuses non-test DB. No schema fields made required; backward-compatible defaults. Sparse-unique indexes prevent collisions. No destructive migrations, no deploy/env changes. Preserved protected directories.

### Notes
- Independently priced SESSION bills (when audience specified) record billedTotalPaise per order and per-order line totals derived from current menu; original order totals preserved. STAFF price derived from customer price (60%). POS has no Order documents.

---

## C.3.3 P1.3 - PHASE 2C FINAL BILLING INTEGRATION AUDIT (2026-10-11) - READ-ONLY

**Status:** READ-ONLY AUDIT COMPLETE. No source, schema, database, configuration, dependency, or deployment change was made in this phase. Findings come from code inspection of `server/` plus the currently passing test suite. Protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) were not modified. The Expo tree (`gola-expo-preview/`) was left untouched.

**Tests run (2026-10-11, local throwaway MongoDB):**
- `cd server; npm test` (runs `node --test "utils/*.test.js" "tests/*.test.js"`) -> **111/111 pass, 0 fail, 0 skipped** (~8.3 s): 60 util tests + 51 integration tests.
- `node --test "tests/*.test.js"` -> **51/51 pass** (billing.api 16, billing.p13 9, inventory.api 20, items.api 6) (~4.5 s).

### Verification checklist (line refs are to the current working tree)
| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| SC1 | CUSTOMER bill prices at the current menu price, ignoring the stored order price | PASS | code `billingController.js:244-322`, `priceLinesForAudience` `billingUtils.js:308-343`; test `billing.p13.api.test.js:126-150` |
| SC2 | STAFF bill prices at 60% of the customer price (single rule, no second pricing path) | PASS | code via `menuUtils.buildAuthoritativeOrder`/`computeStaffPrice`; tests `billing.p13.api.test.js:152-174,316-348`; unit `menuUtils.test.js` |
| SC3 | Bill freezes audience/items/qty/unit-prices/discounts/totals (immutable snapshot) | PASS (structural) | pricing fields written once in `createBillRecord` `Bill.js:475-522`; later mutations touch only payments/status/amountPaid/balanceDue/settledAt `Bill.js:146-169,282-293,406-434`; no update route exists `billingRoutes.js`. Regression test not added: see GAP-2 |
| SC4 | STAFF bill carries no coupon; CUSTOMER bill preserves the source coupon discount exactly once, clamped | PASS | code `billingController.js:291-314`, `applyPreservedDiscount` `billingUtils.js:348-353`; tests `billing.p13.api.test.js:176-218` |
| SC5 | Mixed-audience session rejected; audience mismatch/invalid rejected; item eligibility validated at bill time | PASS | code `detectMixedAudience` `billingUtils.js:291-303`, `billingController.js:142-151,478-484`; tests `billing.p13.api.test.js:220-240,316-348` |
| SC6 | Bill creation idempotent: same key+payload replay returns the existing bill (200 alreadyProcessed); same key different payload returns 409 | PASS (sequential) | sparse-unique index `Bill.js:127-129`; hash compare + E11000 recovery `billingController.js:131-140,351-360,493-504,550-567`; tests `billing.p13.api.test.js:242-263,293-314`. Concurrent race untested: see GAP-1 |
| SC7 | POS: no fabricated Order; one bill per checkout; server-side pricing/eligibility/validity | PASS | code `createPosBill` `billingController.js:466-571`; `Bill.js:475-513`; tests `billing.p13.api.test.js:265-348` |
| SC8 | Order locks held while a bill is active and until VOID + all reversals complete; re-bill only after full void | PASS (structural) | lock release only on V3 VOID `billingController.js:452-459`; V3 only after every payment REVERSED `Bill.js:427-435`; covered-set includes OPEN/SETTLED/VOIDING `billingController.js:157-160`. Explicit re-bill regression test not added: see GAP-4 |
| SC9 | Bill-based analytics: recognized = OPEN+SETTLED; voided = VOIDING+VOID reported separately; grouped by audience/origin; filters validated | PASS | code `billingController.js:589-678`, `buildBillAnalyticsMatch` `billingUtils.js:462-485`; test `billing.p13.api.test.js:350-424` |
| SC10 | IST date-only analytics range resolved in Asia/Kolkata (UTC+05:30) | PASS (partial) | `parseIstBoundary` `billingUtils.js:412-437`, consts `billingUtils.js:24-25`; "today-IST" API test `billing.p13.api.test.js:415-423`; range-validity unit `billingUtils.test.js:246-252`. Exact boundary instant not asserted: see GAP-5 |
| SC11 | Legacy bills (no origin/audience/lines/subtotal) stay readable and count under CUSTOMER/SESSION | PASS (design) / GAP (no test) | DTO fallbacks `billingUtils.js:553-554`; analytics matches missing fields via `$in: [value, null]` `billingUtils.js:471-480`. Raw legacy-doc test not added: see GAP-3 |
| SC12 | Existing Phase 2B behaviour unchanged; `/api/orders/analytics` remains the frozen order metrics surface | PASS | 16 billing.api tests still green; `orderController.getAnalytics` untouched |
| SC13 | Idempotency is insert-first (race-safe); duplicate bills structurally impossible | PASS (design) | unique sparse index + first-write-wins; payment concurrency proven `billing.api.test.js:414-512`. Bill-creation concurrency unproven by test: see GAP-1 |

### Confirmed functional defects
None. No functional defect was confirmed in the P1.3 billing integration.

### Confirmed documentation defect (pre-existing, NOT introduced by this phase)
The prior write of `docs/audits/README.md` section C.3.2 (lines ~1156-1186) and the tracker P1.3 entry (`implementation-progress-tracker.md` lines 359-360) embedded control characters because C-style escapes were interpreted: U+0007 x4, U+0008 x4, U+0009 x1, U+000B x1, U+000C x1, U+000D x4. Observable effects include "react native" rendering as "eact native" (line ~1159), "audience" as "udience", and "node --test" as "ode --test" (line ~1179-1180). Content is otherwise intact. This appendix was written to avoid the same bug. Recommendation: a doc-only repair in a separate owner-approved change.

### Cosmetic only (no functional impact)
- `billingController.js:70-98`: the audience/idempotency block is over-indented relative to the function scope.
- `createPosBill` computes the POS request hash twice (`billingController.js:495-499` and `:526-530`); result identical.

### Unverified concerns - regression tests still missing (owner explicitly required these)
- **GAP-1: Concurrent duplicate idempotency.** No `Promise.all` test fires the same creation key in parallel. Reasoning: POS race converges to one bill (E11000 -> 200 idempotent); SESSION race converges to one bill (second request blocked by OrderLock -> 409 IN_PROGRESS). Verified by design, not by test.
- **GAP-2: Snapshot preservation across the full lifecycle.** The regression test proposed in section C.3.1 (capture pricing fields, then pay -> reverse -> re-pay -> void -> resume, assert byte-identical) was not added.
- **GAP-3: Legacy Bill readability.** No test inserts a raw Bill document lacking origin/audience/lines/subtotalPaise and asserts GET read + analytics classification as CUSTOMER/SESSION.
- **GAP-4: Re-bill gate.** No explicit test that an order can be re-billed only after a full void (with all reversals) and stays blocked after a plain payment reversal.
- **GAP-5: Exact IST boundary instant.** No assertion that date-only `from` resolves to previous-day 18:30Z and `to` to end-of-day 18:29:59.999Z as concrete clock values.

### Semantics note (not a defect)
The SESSION idempotency hash covers only `{sessionId, orderIds, audience}` (`billingController.js:92-97`), not the orders' evolving content. A key reused later, after an order's items change, returns the original bill (200 alreadyProcessed) - consistent with decision E ("same key = same logical request"). Worth owner confirmation that this is the desired contract.

### Remaining / owner-approval items
- Owner approval of this report and checklist.
- Optional follow-up (separate, owner-approved change): add GAP-1..GAP-5 regression tests; repair the corrupted C.3.2/tracker text.
- Physical-tablet and live-endpoint verification: NOT performed here (no device tooling), unchanged from prior phases.

### Explicit no-change confirmation
No source code, database, configuration, dependency, or deployment was modified in Phase 2C. Server code and tests were only read, or run against the dedicated throwaway test DBs (`gola_*_test`). Only this appendix (docs/audits/README.md) and the tracker entry immediately below were written (documentation only).

---

## C.3.4 P1.3 - PHASE 2D DOCUMENTATION REPAIR - COMPLETE (2026-10-11)

**Status:** DOCUMENTATION ONLY - repaired the confirmed control-character corruption in the section C.3.2 implementation report above (the section immediately above).
Corrupted characters were U+0007/U+0008/U+0009/U+000B/U+000C/U+000D (each replaced the intended first letter of a word: a/b/t/v/f/r) and U+FFFD (replaced em dashes in the section heading, matching this doc heading style). The `- node --test ...` bullet was rejoined and trailing line-ending CR noise was normalized to LF. Findings, dates, test results, and report order are unchanged; no historical section was deleted or rewritten.

**Owner decision (recorded in the implementation tracker):** SESSION idempotency - same key + same payload returns the original bill even if the source order later changes; same key + different payload returns HTTP 409 IDEMPOTENCY_KEY_REUSED; existing bill snapshots are not recalculated on replay.

**No application code, tests, schema, configuration, dependency, database, or deployment was modified; no protected directory touched.**

---

## C.3.5 P1.3 - PHASE 2E CUSTOMER/STAFF SELECTION IN BILLING - COMPLETE (2026-10-11)

**Status:** IMPLEMENTED in `gola-expo-preview/` (Expo tablet UI) + documentation. Server already enforced audience in Phase 2C/P1.3; this phase wires the missing UI so an explicit Customer/Staff choice is captured and sent. No server source, schema, route, dependency, or deployment change. Protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) untouched.

### Root cause
The tablet billing UI never collected the Customer/Staff audience and never sent it:
- **POS (Billing tab):** `BillingScreen.js` / `BillPanel.js` were a local, display-only preview ("Preview only - not saved"); they never called the server's `POST /api/billing/pos/bills` (which requires `audience`). `billService` had no `createPosBill`. Bills could not be created from the POS screen at all, so the required audience gate was absent.
- **Sessions:** `components/orders/BillModal.js` called `generateSessionBill(sessionId)` with an empty body, so `audience` was never transmitted. The server's audience rule was therefore never satisfied by the client, and staff/customer pricing could not be chosen.

### How the audience reaches the backend
- **POS:** `BillingScreen` holds `audience`; the user taps Customer/Staff chips in `BillPanel`. `buildPosPayload(audience, cart)` produces `{ audience, items: [{ itemId, quantity }] }` (no client prices cross the wire), and `createPosBill(payload.audience, payload.items, checkoutKey)` POSTs to `/api/billing/pos/bills`. Creation is disabled until an audience is selected (`canCreatePosBill`). The server prices authoritatively.
- **Sessions:** `BillModal` holds `audience` plus one per-session idempotency key; Generate is disabled until selected. `generateSessionBill(sessionId, { audience, idempotencyKey })` POSTs to `/api/billing/sessions/:sessionId/bills`. The server rejects mixes (`MIXED_AUDIENCE`) and mismatches (`AUDIENCE_MISMATCH`).

### Implemented
- Mandatory "Who is this bill for?" selector (Customer/Staff) in both the POS Billing panel and the session Bill modal; no silent default.
- POS screen now creates real server bills (origin `POS`) via `createPosBill`; coupon UI removed (the POS backend has no coupon support) to avoid a misleading preview.
- Live audience pricing in the preview: Customer = current menu price, Staff = 60% (`computeStaffPrice` mirror). Preview and item totals update immediately on audience change.
- Selection resets per checkout: audience and a fresh idempotency key are regenerated on Clear and on New Bill / after bill creation.
- New confirmation modal `CreatedBillModal.js` (replaces the deleted `BillPreviewModal.js`) renders the server DTO: `billNumber`, audience label, `lines`, subtotal/discount/total, `amountPaid`, `balanceDue`. Amounts are server-authoritative.
- Extended `billUtils.js` `ERROR_CODES` for `AUDIENCE_REQUIRED`, `INVALID_AUDIENCE`, `AUDIENCE_MISMATCH`, `MIXED_AUDIENCE`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_ORDER_ITEMS`, `SESSION_NOT_FOUND`.

### Changed files
- gola-expo-preview/src/utils/audienceBilling.js (new: AUDIENCES, normalizeAudience, audienceLabel, audienceUnitPrice, cartForAudience, buildPosPayload, canCreatePosBill, buildSessionPayload, makeIdempotencyKey, newCheckout)
- gola-expo-preview/src/api/billService.js (added createPosBill; generateSessionBill now accepts { audience, idempotencyKey })
- gola-expo-preview/src/utils/billUtils.js (extended ERROR_CODES)
- gola-expo-preview/src/screens/Billing/BillPanel.js (audience selector; coupon UI removed)
- gola-expo-preview/src/screens/Billing/BillingScreen.js (audience state, real POS creation, per-checkout idempotency key)
- gola-expo-preview/src/screens/Billing/CreatedBillModal.js (new)
- gola-expo-preview/src/screens/Billing/BillPreviewModal.js (deleted; superseded)
- gola-expo-preview/src/components/orders/BillModal.js (session audience selector + idempotency key)
- gola-expo-preview/src/utils/audienceBilling.test.js (new)
- gola-expo-preview/src/utils/billUtils.test.js (extended)
- docs/audits/README.md (this section), docs/implementation/implementation-progress-tracker.md

### Tests (2026-10-11, local)
- Expo unit tests: `cd gola-expo-preview; node --test src/utils/*.test.js` -> **139/139 pass, 0 fail** (was 126; +13 new: 12 in audienceBilling.test.js, 1 audience/POS error-mapping test in billUtils.test.js).
- Server regression: `cd server; npm test` -> **118/118 pass, 0 fail** (unchanged; no server code touched).
- Lint: `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings**, all pre-existing (3 `unicode-bom` in Category/Menu/Settings screens, 1 unused catch binding in apiClient.js).
- Android bundle: `cd gola-expo-preview; npx expo export --platform android` -> **success** (dist bundle produced).
- No tsconfig.json in gola-expo-preview, so typecheck is unavailable (unchanged from prior phases).

### Remaining / notes
- POS bills (origin `POS`) have no session/orders; recording payments against them would require an explicit payment-entry surface. Out of scope here - the confirmation modal notes payments are recorded from the Sessions flow.
- No physical-tablet or live-endpoint verification (no device tooling); unchanged from prior phases.
- Coupon removal from the POS panel is intentional (no POS coupon support server-side).

### Blockers
- None.

### Scope compliance
- Only `gola-expo-preview/` and docs touched. No server source/route/schema change; existing endpoints reused (`/billing/pos/bills`, `/billing/sessions/:id/bills`); no new routes. Backend remains authoritative for all pricing. No deploy, no prod DB writes, no auth changes.

**Owner review requested before any further work.**

---

## C.3.6 PHASE "DASHBOARD TODAY-ONLY" - REBUILD TO TODAY (IST) + LOW-STOCK ALERTS - COMPLETE (2026-10-11)

**Status:** IMPLEMENTED in `gola-expo-preview/` (Expo tablet UI) + documentation. No server source, schema, route, dependency, or deployment change; protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) untouched. Existing live endpoints reused only.

### Root cause
The dashboard showed **lifetime / last-7-day** aggregates computed client-side from the full `GET /api/orders` list:
- `computeStats` over **all** orders (`DashboardScreen.js`), so the "Total Revenue" card was lifetime revenue, not today's.
- A synthetic "last 7 days" trend built from all orders, which mismatched the fast-service business day the owner wanted.
- No low-stock surface (earlier audit §H noted `DashboardScreen.js` calls only `getOrders()`).
- The server's `GET /api/orders/analytics` was not usable: confirmed **F6 bug** (includes CANCELLED; not IST-filtered), and fixing it would change unrelated AnalyticsTab behaviour.

### Chosen design (owner-spec decisions recorded)
- **Data source:** read-only `GET /api/orders` (all metrics) + `GET /api/inventory/alerts` (stock alerts). Both consumed as real API data; no hardcoded/random metrics.
- **"Today" = India Standard Time (fixed UTC+05:30, no DST).** All client-side day/hour filtering uses the IST offset constant, not the device timezone, so the tablet matches the restaurant's business day.
- **Metric definitions:**
  - `totalOrders` = **all** orders placed in the IST today (cancelled still counts as an order placed today).
  - `totalRevenue` = sum of `totalAmount` for **non-cancelled** today orders (cancelled contributes nothing).
  - `pendingOrders` = PLACED + PENDING (IST today); `completedOrders` = COMPLETED incl. legacy `Completed` (IST today).
  - **Popular items** = today only, **non-cancelled** orders only, ranked by actual quantity sold (ties: revenue, then name), top 5.
  - **Trend** = 24 hourly IST buckets `{ key, label:'HH:00', hour, count, revenue }`; count = all orders in the hour, revenue = non-cancelled only.
  - **Low-stock alerts** = /inventory/alerts rows where `isActive !== false` AND `remainingPercent` is a finite number ≤ **30** (= ≤30% of current-cycle stock remaining, i.e. ≥70% consumed, matching the backend `USAGE_ALERT_THRESHOLD=70`). Displayed: name, `formatQty(currentQty, unit)` left, `formatPercent(remainingPercent)`.
- **No 7-day / 30-day filters** were added.

### Implemented
- `src/utils/dashboardMetrics.js` rewritten: kept `normalizeStatus`/`toNumber`/`isPendingOrder`/`isCompletedOrder`/`isCancelledOrder`/`computeStats`/`computePopularItems`/`formatNumber`/`formatCurrency` (shared exports intact); removed the now-unused `buildSevenDayTrend`/`localDateKey`/`WEEKDAYS` (only used by the old screen + its test); added `istDateKey`, `istDayBounds` (inclusive start / exclusive end), `filterOrdersForIstDay`, `filterNonCancelledOrders`, `computeTodayStats`, `buildTodayTrend`, `computeTodayPopularItems`, `hasLowRemainingStock` (+`LOW_STOCK_MAX_REMAINING_PERCENT=30`), `filterLowStockAlerts`.
- `src/utils/dashboardMetrics.test.js` rewritten: **27 tests** covering IST boundary instants (18:30:00.000Z start include / 18:29:59.999Z previous-day exclude / end exclusive), today-window filtering, cancelled handling for revenue vs total orders, trend bucketing by IST hour, popular-items ranking (today-only + non-cancelled + tie rules), low-stock threshold boundaries (=30 included, 31 excluded, inactive/null/-string rows never alert, explicit-max override).
- `src/api/dashboardService.js`: added `getLowStockAlerts()` (`GET /inventory/alerts`, array-guarded).
- `src/components/dashboard/LowStockAlerts.js` (new): low-stock card (empty state included).
- `src/components/dashboard/OrdersTrend.js`: repurposed to today's 24-hour count+revenue bars (empty/summary handling).
- `src/screens/Dashboard/DashboardScreen.js`: parallel load of `getOrders()` + `getLowStockAlerts()` (alerts failure treated as []; orders drive the page), today-only stats/trend/popular via the IST helpers with a `viewedAt` snapshot, low-stock card rendered, stats labels/hints updated to "today (IST)". Loading/error/retry/empty and pull-to-refresh behaviour preserved.
- `src/components/dashboard/PopularItems.js`: subtitle now reads "Today's top 5 by quantity sold".

### Tests (2026-10-11, local)
- Expo unit tests: `cd gola-expo-preview; node --test src/utils/*.test.js` -> **150/150 pass, 0 fail** (was 139; dashboardMetrics grew 16 → 27).
- Server regression: `cd server; npm test` -> **118/118 pass, 0 fail** (unchanged; no server code touched).
- Lint: `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings**, all pre-existing (3 `unicode-bom` in Category/Menu/Settings screens, 1 unused catch binding in apiClient.js).
- Android bundle: `cd gola-expo-preview; npx expo export --platform android` -> **success** (dist bundle produced).
- No tsconfig.json in gola-expo-preview, so typecheck is unavailable (unchanged from prior phases).

### Data-source integrity note
- Orders and bills are deliberately **not** double-counted: only source orders (`GET /api/orders`) feed the order metrics; `GET /api/inventory/alerts` feeds only the stock card.
- The **known server `GET /api/orders/analytics` F6 bug** (CANCELLED included, no IST basis) is intentionally avoided; it remains listed as an unresolved server-side Analytics concern (fixing it is a separate, cross-surface change).

### Remaining / notes
- No physical-tablet or live-endpoint verification (no device tooling); unchanged from prior phases. Owner smoke test recommended: pull-to-refresh, IST rollover, and a low-stock item appearing at 30% remaining.
- IST is UTC+05:30 with no DST by design; no timezone library needed.

### Blockers
- None.

### Scope compliance
- Only `gola-expo-preview/` and docs touched; existing live endpoints reused (`/orders`, `/inventory/alerts`); no new routes, no server change, no dependencies added, no deploy, no prod DB writes, no auth changes. No 7-day/30-day filters introduced.

**Owner review requested before any further work.**

## C.3.7 PHASE 3 "REVIEWS & ANALYTICS" - ANALYTICS TAB: BILL-BASED SALES + INVENTORY ACTIVITY + PURCHASE SUGGESTIONS - COMPLETE (2026-10-11)

**Status:** IMPLEMENTED in `gola-expo-preview/` (Expo tablet UI) + one smallest-necessary read-only server route + docs. Reviews requirement was already satisfied by the pre-existing `ReviewTab.js` (valid-average `computeRatingStats`, invalid/missing ratings excluded, list + states + refresh) — no server/feedback change. Protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) untouched; no prod DB writes, no deploy, no new dependencies, no auth changes.

### Root cause / context
- The previous Analytics tab reused the dashboard's order-based helpers (`getOrders()` + `computeAnalytics`) and the flawed `GET /api/orders/analytics` (known **F6 bug**: CANCELLED included, not IST). Owner approved **bill-based** analytics instead: bills are the financial source of truth and already snapshot prices/audience/origin at generation time.
- There was no client read-only bill-list endpoint (only `GET /api/billing/bills/:id`), no IST-aware bill analytics helpers, and no inventory-activity/purchase-suggestion UI for a date range.

### Smallest server change (justified, tested)
- **New read-only** `GET /api/billing/bills` (no auth change; list of PII-free `toBillDTO`, sorted `createdAt desc`), optional query filters `from`/`to` (date-only → resolved to exact IST calendar-day boundary instants via the existing `resolveAnalyticsRange`, GAP-5 semantics), `origin`, `audience`, `status` (validated → 400 with stable codes `INVALID_RANGE`/`INVALID_ORIGIN`/`INVALID_AUDIENCE`/`INVALID_STATUS`). Legacy bills (no origin/audience) are never dropped: `buildBillAnalyticsMatch` matches them via `$in: [...]` and `toBillDTO` defaults them to `SESSION`/`CUSTOMER` per the existing compatibility rules.
- Wiring: `getBillList` in `server/controllers/billingController.js`, `router.get('/bills', getBillList)` in `server/routes/billingRoutes.js`. No inventory server change needed.

### Date rules
- 1 Day = today IST; 7 Days = today + previous 6 calendar days IST; 30 Days = today + previous 29 calendar days IST. IST = Asia/Kolkata (fixed UTC+05:30, no DST). Boundaries are exact instants (`rangeStartMs` inclusive, `rangeEndMs` exclusive). Filter switching re-computes all metrics client-side from the already-loaded datasets in `useMemo` — no refetch, never stale.

### Metric definitions (bill-based)
- **Recognized bills** = `OPEN` + `SETTLED`; generated bills count immediately (a just-created bill contributes to revenue the moment it is generated). **Voided** = `VOIDING`/`VOID` (excluded from revenue, shown separately). Unknown/malformed statuses never count.
- `totalRevenue` = sum of `toBillDTO.totalAmount` (rupees) over recognized bills in range; `amountPaid` = sum of `amountPaid`; `balanceDue` = sum of `balanceDue` (partial payments are never double-counted with revenue).
- **AOV** = recognized bill revenue ÷ recognized bill count (never bill revenue ÷ raw order count). No source-order revenue is ever added to bill revenue.
- **Breakdowns**: counts + amounts separately per audience (`CUSTOMER`/`STAFF`; legacy = `CUSTOMER`) and origin (`SESSION`/`POS`; legacy = `SESSION`). Daily buckets include zero-sales days, oldest first.
- **Inventory Activity**: committed movements only (`RESERVED` always excluded, also enforced in util); legacy movements (no status) count as committed. Tally by type (restock/opening/consumption/adjustment) plus per-item quantities **in the item's own unit** — totals are never summed across units. Items added in range use `createdAt`. 30-day ledger fetched once (`limit: 500`); the cap is honestly flagged in the UI when `movements.length === 500`. Current stock is displayed as stock (never treated as consumption).
- **Purchase Suggestions**: items with committed consumption in period ranked by `consumedQty` desc, then name asc, then ingredientId asc. Reorder amount = `minimumStockLevel − currentQty` shown only when `minimumStockLevel > 0 && currentQty < minimumStockLevel`, else an em dash. Usage-based, **not** a stockout prediction; supplier/price/lead-time/exact order qty are never fabricated.
- **Unavailable metrics are honestly labeled**: if a secondary dataset fails to load (feedback/movements/ingredients) that section says data is unavailable with a retry path; null/failed datasets never fake numbers.

### Implemented (Expo)
- `src/utils/billAnalyticsUtils.js` + `.test.js` (new, pure): `BILL_RANGE_OPTIONS`, `rangeDays`, `istDateKey`, `istDayStartMs`/`istDayEndMs`, `rangeStartMs`/`rangeEndMs`, `normalizeStatus`, `isRecognizedBill`, `isVoidedBill`, `billAudience`, `billOrigin`, `filterBillsByRange`, `buildDailyBillSales`, `computeBillAnalytics` (totalBills, recognizedBills, voidedBills, totalRevenue, amountPaid, balanceDue, voidedTotal, avgOrderValue, byAudience, byOrigin, dailySales).
- `src/utils/inventoryAnalyticsUtils.js` + `.test.js` (new, pure): `isCommittedMovement`, `filterCommittedInRange`, `summarizeMovements`, `itemsAddedInRange`, `buildItemActivity`, `buildUsageRanking`.
- `src/api/billService.js`: `getBills()` (array-guarded `GET /billing/bills`).
- `src/screens/ReviewsAnalytics/AnalyticsTab.js` (rewritten): single `Promise.all([getBills, getFeedbacks(catch→null), getMovements(30d IST window, limit 500, catch→null), getIngredients(catch→null)])`; range chips (1/7/30 Days); Sales Overview stat cards (Total Revenue, Generated Bills, Avg Order Value, Customer Rating); Daily Sales (recognized, zero days kept, combined bar chart); Bill Breakdown (audience/origin counts+amounts, amount collected vs balance due, voids separately, legacy/AOV rule note); Inventory Activity (event counts, per-item R/C/A quantities, items added, 500-cap + RESERVED + unit notes); Purchase Suggestions (ranked table, reorder column, usage-based rule note). Loading/error/retry/pull-to-refresh/empty states preserved; screen header "Gola Restaurant" with Analytics/Reviews tabs already present in `ReviewsAnalyticsScreen.js`.
- `src/screens/ReviewsAnalytics/ReviewTab.js`: **untouched** (already met the Reviews requirement).
- `src/utils/analyticsUtils.js`: untouched (still supplies `formatCurrency`/`formatNumber`/`computeRatingStats`/`formatRating`); its `RANGE_OPTIONS` is not used by the new tab (`BILL_RANGE_OPTIONS` is).

### Tests (2026-10-11, local; exact results)
- Expo unit tests: `cd gola-expo-preview; node --test src/utils/*.test.js` -> **171/171 pass, 0 fail** (was 150; +12 `billAnalyticsUtils.test.js`, +9 `inventoryAnalyticsUtils.test.js`). Covers exact IST keying across the 05:30 offset (19:00Z → next IST day), boundary instants for 1/7/30-day windows, status classification (case-insensitive), legacy defaults, range filtering incl. undatable-drop, zero-sales days, revenue/count/AOV across ranges, breakdowns, empty-safety, committed-vs-RESERVED, per-item activity with name-AZ sort, ranking tie-breaks + reorder null cases.
- Server regression: `cd server; npm test` -> **125/125 pass, 0 fail** (was 118; +7 `server/tests/billing.list.api.test.js` against the dedicated `gola_billing_list_test` DB via `BILLING_LIST_TEST_MONGO_URI`: DTO list newest-first, legacy defaults `SESSION`/`CUSTOMER`, origin/audience/status filters, GAP-5 IST date-only boundary exactness, invalid-filter 400s).
- Lint: `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings**, all pre-existing (3 `unicode-bom` in Category/Menu/Settings screens, 1 unused catch binding in apiClient.js).
- Android bundle: `cd gola-expo-preview; npx expo export --platform android` -> **success**.
- No tsconfig.json in gola-expo-preview, so typecheck is unavailable (unchanged from prior phases).

### Data-source integrity note
- Bills are the **only** financial source in this tab; order data is not mixed in. The dashboard tab keeps its own order-based numbers (both total revenue figures are intentionally different things and are not compared). The F6 server `GET /api/orders/analytics` bug remains open as server-side Analytics work; it is not used.

### Remaining / notes
- No physical-tablet or live-endpoint verification (no device tooling); unchanged from prior phases. Owner smoke test recommended: switch 1/7/30-day filters, generate a bill and confirm it appears under recognized sales/bill count immediately, void one and confirm it moves to the voided row, and confirm a large ledger exposes the cap note.
- No POS payment/printer work was started in this phase (stop point).

### Blockers
- None.

### Scope compliance
- Only `gola-expo-preview/` + one read-only server route (`GET /billing/bills`) + `server/routes/billingRoutes.js` + docs touched; existing live endpoints reused (`/feedback`, `/inventory/stock/movements`, `/inventory/ingredients`); no new dependencies, no deploy, no prod DB writes, no auth changes, no changes to customer order or review submission flows; drawer + theme preserved.

**Owner review requested before any further work.**

---

## C.3.8 PHASE 4 "UI POLISH" - KEYBOARD-SAFE FORMS, TREND HOURS, MENU IMAGES, INVENTORY LABELS - COMPLETE (2026-10-12)

**Status:** IMPLEMENTED in `gola-expo-preview/` (Expo tablet UI) + docs. No server source, schema, route, dependency, or deployment change; protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) untouched. Existing live endpoints reused only. No bill generation, payment, idempotency, totals, or reversal logic touched.

### UI issues addressed
1. **Keyboard hid form fields** — modal forms had no `KeyboardAvoidingView` anywhere in the app, so the on-screen keyboard could cover lower inputs and the Save button.
2. **Dashboard "today's trend" looked empty/jumpy** — the chart drew all 24 hourly buckets, so a couple of orders sat as tiny slivers among mostly-zero bars.
3. **Menu cards had no item image** — the admin menu list showed text only, even though items carry an `image` URL.
4. **Inventory Activity labels were cluttered** — the Analytics tab showed "Adjustments" + "Total movements" rows and a per-item "A" adjustment marker that added noise to the simplified model.

### Implemented
- **New shared `src/components/FormModal.js`** (created): a keyboard-safe shell for centered form modals — `KeyboardAvoidingView` (`behavior` = `padding` on iOS / `height` on Android), a full-height-safe card (`maxHeight:'100%`), a scrollable body (`flexShrink:1`, `keyboardShouldPersistTaps="handled"`, interactive/on-drag dismiss) and a pinned footer. Props: `{ visible=true, title, subtitle, maxWidth=560, onRequestClose, children, footer }`.
- **Refactored 5 centered form modals** to `FormModal` and removed their now-unused `Modal`/`ScrollView` imports and duplicated `backdrop`/`card`/`title`/`body`/`footer` styles: `src/screens/Inventory/AddItemModal.js`, `src/screens/Stock/MovementModal.js` (passes `subtitle`), `src/screens/MenuCategories/ItemFormModal.js` (`maxWidth={720}`), `src/screens/UserCoupons/CouponFormModal.js`, `src/screens/MenuCategories/CategoryFormModal.js` (previously had **no** `ScrollView` at all — long content/keyboard could overflow).
- **Bill modal made keyboard-safe:** `src/components/orders/BillModal.js` body is now wrapped in `KeyboardAvoidingView` (bottom sheet preserved) and its inner `ScrollView` sets `keyboardShouldPersistTaps="handled"`, so the payment-amount input and buttons stay reachable above the keyboard.
- **List tap fix:** `src/screens/MenuCategories/MenuManagement.js` list now sets `keyboardShouldPersistTaps="handled"` so chip/Edit taps aren't swallowed by the search keyboard. (`BillingScreen.js`, `UsersTab.js`, `OrdersScreen.js` search fields already had this.)
- **Dashboard trend (Task 2):** added pure helper `populatedTrendHours(trend)` to `src/utils/dashboardMetrics.js` (filters `count > 0`, non-array → `[]`, preserves oldest-first order) and exported it. `src/components/dashboard/OrdersTrend.js` now renders only populated hours inside a horizontal `ScrollView` (`COLUMN_WIDTH = 42`) and shows a single `"No orders today yet."` empty state. `buildTodayTrend` still returns all 24 IST buckets (source of truth unchanged).
- **Menu images (Task 3):** added pure helper `itemImageUrl(item)` to `src/utils/menuUtils.js` (accepts a trimmed `http(s)://` or `data:image/` string, else `null`) and exported it. `src/screens/MenuCategories/MenuManagement.js` gained a `MenuCardImage` component (`Image` keyed by `item.image`, graceful `restaurant-outline` Ionicons + "No image" fallback on error). `@expo/vector-icons` was already a dependency.
- **Inventory Activity labels (Task 4):** `src/screens/ReviewsAnalytics/AnalyticsTab.js` now shows **Stock Added**, **Restock Events**, **Consumption Events**; removed the "Adjustments" and "Total movements" rows and the per-item "A" marker; added `"No stock activity in this range."` empty state when `inventory.summary.movementCount === 0`. No calculation/helper changes.

### Tests (2026-10-12, local; exact results)
- Expo unit tests: `cd gola-expo-preview; node --test src/utils/*.test.js` -> **182/182 pass, 0 fail** (was 176 at the start of this phase; +4 `populatedTrendHours` tests in `dashboardMetrics.test.js`, +2 `itemImageUrl` tests in `menuUtils.test.js`).
- Lint: `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings**, all pre-existing (3 `unicode-bom` in Category/Menu/Settings screens, 1 unused catch binding in `apiClient.js`).
- Android bundle: `cd gola-expo-preview; npx expo export --platform android` -> **success** (Hermes `.hbc`, 3.9 MB); generated `dist/` is git-ignored and was removed afterwards.
- No tsconfig.json in gola-expo-preview, so typecheck is unavailable (unchanged from prior phases).

### Preserved
- Bill generation, payment recording, idempotency, bill totals, and reversal logic: untouched. No thermal printing / Bluetooth / QR / auto-print work started.
- Navigation, theme, audience selection, and all business rules preserved. `buildTodayTrend` IST bucketing unchanged.

### Remaining / notes
- **No physical-tablet or live-endpoint verification** (no device tooling available in this environment) — the keyboard-avoidance behaviour is code-reviewed, not device-tested. Owner device smoke test recommended: open each form modal (Add Item, Movement, Item form, Coupon, Category, Bill) with the keyboard up and confirm the focused field + Save button stay visible; open the dashboard with a few orders to confirm the trend shows only populated hours; open Menu & Categories to confirm item images/placeholders render.
- `src/utils/analyticsLoadUtils.js` + `.test.js` remain untracked and pre-date this phase (not part of this work).

### Blockers
- None.

### Scope compliance
- Only `gola-expo-preview/` and docs touched; existing live endpoints reused; no new routes, no server change, no dependencies added, no deploy, no prod DB writes, no auth changes. Protected directories untouched.

**Owner review requested before any further work.**

---

## C.3.9 PHASE 4.1 "ANDROID APK SCROLLING & BOTTOM-CONTENT VISIBILITY" - APP-WIDE LAYOUT/SAFE-AREA FIX - COMPLETE (2026-10-12)

**Status:** IMPLEMENTED in `gola-expo-preview/` (Expo tablet UI) + docs. No server source, schema, route, dependency, or deployment change; protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) untouched. No API contract, order/menu/category/inventory/stock/user/coupon logic, bill generation/totals/payments/reversals/voiding/resumption/idempotency, or review submission touched. Navigation and theme preserved.

### Reported symptoms
On an installed Android APK (not the web/localhost preview), screens and popups were reported to scroll/lay out poorly and to hide content at the bottom.

### Root causes (verified from source)
1. **No bottom safe-area handling anywhere in the app.** `grep` for `SafeAreaView` / `useSafeAreaInsets` across `src/` returned zero consumers (only the provider in `App.js`). React Native is edge-to-edge on Android in this SDK, and React Navigation's drawer pads the header but not the screen body, so the last list row and any control pinned to the bottom of a screen/modal were drawn underneath the Android navigation/gesture bar. List `contentContainerStyle` bottom padding was a fixed `SPACING.xl` (24) or `SPACING.xl * 2` (48), which does not account for the system bar.
2. **Bottom-sheet ScrollViews could not shrink.** `SessionDetailsModal.js`, `BillModal.js`, and `CreatedBillModal.js` cap their sheet at `maxHeight: '90%'`, but their `ScrollView` had no `flexShrink: 1`. Yoga's default `flexShrink` is `0`, so the scroll body expanded to content height and clipped instead of scrolling when the sheet hit its cap. `FormModal.js` already carried the fix (Phase 4) but the three bottom-sheet/summary modals did not.

### Implemented
- **New `src/hooks/useBottomInset.js`** - `useBottomInset(extra = 0)` returns `insets.bottom + extra`, clamped when no inset is present. Single source of truth for bottom padding.
- **New `src/navigation/ScreenFrame.js`** - wraps screen content in `SafeAreaView` with `edges={['bottom']}` and `COLORS.background`, so every drawer screen lays its content out above the Android system bar regardless of its internal list/scroll structure.
- **`src/navigation/RootNavigator.js`** - added a module-scope `frameScreen(Screen)` wrapper (stable component identity, no remount) and used it for all 8 drawer destinations (`FramedDashboard`, `FramedOrders`, `FramedMenuCategories`, `FramedInventoryStock`, `FramedUserCoupons`, `FramedReviewsAnalytics`, `FramedBilling`, `FramedSettings`).
- **`src/components/FormModal.js`** - centered form popups now add `insets.top` / `insets.bottom` to the backdrop padding, so a full-height card never underlaps the status bar or navigation bar.
- **`src/components/orders/SessionDetailsModal.js`** and **`src/components/orders/BillModal.js`** - bottom sheets now set `flexShrink: 1` on the scroll body (`styles.sheetScroll`) and add `insets.bottom` to the content bottom padding, so long session/bill content scrolls and its end is reachable.
- **`src/screens/Billing/CreatedBillModal.js`** - backdrop padding accounts for top/bottom insets and the scroll body uses `flexShrink: 1` (`styles.scroll`), keeping the pinned "New Bill" button and the last line above the system bar.
- **`src/screens/Billing/BillingScreen.js`** - the narrow-layout cart bottom sheet adds `insets.bottom` to its bottom padding so the pinned "Close" button clears the navigation bar.

### Files changed (Expo + docs only)
- New: `gola-expo-preview/src/hooks/useBottomInset.js`, `gola-expo-preview/src/navigation/ScreenFrame.js`
- Modified: `gola-expo-preview/src/navigation/RootNavigator.js`, `gola-expo-preview/src/components/FormModal.js`, `gola-expo-preview/src/components/orders/SessionDetailsModal.js`, `gola-expo-preview/src/components/orders/BillModal.js`, `gola-expo-preview/src/screens/Billing/CreatedBillModal.js`, `gola-expo-preview/src/screens/Billing/BillingScreen.js`
- Docs: `docs/audits/README.md` (this section), `docs/implementation/implementation-progress-tracker.md`

### Tests (2026-10-12, local; exact results)
- Expo unit tests: `cd gola-expo-preview; node --test src/utils/*.test.js` -> **182/182 pass, 0 fail** (unchanged; this phase adds no pure helpers).
- Lint: `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings**, all pre-existing (3 `unicode-bom` in Category/Menu/Settings screens, 1 unused catch binding in `apiClient.js`).
- Android bundle: `cd gola-expo-preview; npx expo export --platform android` -> **success** (Hermes `.hbc`, 3.9 MB); generated `dist/` is git-ignored and was removed afterwards.
- No `tsconfig.json` in gola-expo-preview, so typecheck is unavailable (unchanged from prior phases).

### Preserved
- Navigation structure, drawer content, theme, audience selection, and every business rule: unchanged. No API contract, order/menu/category/inventory/stock/user/coupon logic, or bill/payment/idempotency/reversal logic touched. Existing live endpoints reused only.

### Remaining / notes
- **No physical-tablet or live-endpoint verification** (no device tooling available in this environment) - the safe-area and `flexShrink` fixes are code-reviewed, not device-tested. Owner device smoke test recommended on the installed APK: scroll each list to its end (Orders, Billing menu, Inventory, Stock, Menu & Categories, Users, Coupons, Reviews, Dashboard, Analytics); open Session Details and Billing sheets with long content and confirm they scroll and the last element is reachable; open each form popup (Add Item, Movement, Item form, Coupon, Category) and the created-bill summary and confirm nothing sits under the Android navigation/gesture bar.
- `gola-expo-preview/src/utils/analyticsLoadUtils.js` + `.test.js` remain untracked and pre-date this phase (not part of this work).

### Blockers
- None.

### Scope compliance
- Only `gola-expo-preview/` and docs touched; existing live endpoints reused; no new routes, no server change, no dependencies added, no deploy, no prod DB writes, no auth changes. Protected directories untouched.

**Owner review requested before any further work.**

---

## C.3.10 PHASE 4.2 "INVENTORY ITEM DELETION REQUIREMENT FIX" - COMPLETE (2026-10-12)

**Status:** IMPLEMENTED in `server/` (cascade delete) + `gola-expo-preview/` (messages) + docs. Protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) untouched. No auth, no new dependencies, no deploy, no production DB access. No business rules changed other than item deletion.

### Reported symptom (owner)
Deleting an inventory item (e.g. "Suger") that already had stock movements/cycles did **not** remove it: the backend silently **archived** it (`isActive = false`) and the UI showed `"Suger" has stock history (2 movement(s), 1 cycle(s)), so it was archived instead of deleted to preserve those records.` The requirement was updated: when the admin confirms Delete, the item must be **permanently removed**, even with stock history - never silently archived.

### Audit findings (verified from source)
1. `DELETE /api/inventory/ingredients/:id` -> `deleteIngredient` (`server/controllers/inventoryController.js`). Old logic: if `movementCount > 0 || cycleCount > 0` it set `isActive:false` and returned `{ archived:true, ... }`; otherwise it deleted cycles then the ingredient. So any item with history could never be deleted.
2. Relationships are **ObjectId references**, not embedded: `StockMovement.ingredientId` and `StockCycle.ingredientId` both `ref 'Ingredient'`, indexed. `Ingredient` carries a materialized `currentQty`.
3. **Analytics/reconcile consequence:** `getAnalytics` computes its range `totals` from the whole movement ledger, but its `items` array comes from live ingredients. Leaving orphaned movements (no matching ingredient) would inflate global totals while mapping to no item - an inconsistency. `reconcile` aggregates movements per `ingredientId` against live ingredients, so orphans would be silently ignored there. Therefore dependents must be deleted with the item to keep analytics consistent.
4. **Atomicity:** the multi-collection delete is **not** transactional. The deployment/tests use **standalone MongoDB** (`server/config/db.js` via `MONGO_URI`; tests use `mongodb://127.0.0.1:27017/gola_inventory_test`), which does not support multi-document transactions on a standalone server. No transaction is used; the cascade is ordered so failures leave a retryable state.

### Owner decision (obtained before implementing the destructive part)
Asked to choose the treatment of related history; owner selected **"Delete item + its history (Recommended)"** - permanently delete the item together with all its `StockMovements` and `StockCycles`. Documented implication: that item's audit history is permanently lost and inventory analytics totals drop by that item's contribution (verified by a new test).

### Implemented
- **`server/controllers/inventoryController.js`** - rewrote `deleteIngredient`. It now: loads the item (404 if missing), counts movements/cycles for an accurate message, then deletes `StockMovements` -> `StockCycles` -> the `Ingredient` document **last** (so a mid-operation failure leaves the item visible/retryable), and returns `{ deleted:true, removedMovements, removedCycles, message }`. The old archive branch and `{ archived:true, ingredient }` shape are removed. Comment documents the owner-approved policy and the non-transactional standalone-MongoDB constraint.
- **`gola-expo-preview/src/api/inventoryService.js`** - updated `deleteIngredient` doc comment to describe the permanent cascade and the new return shape (no code-path change; it already issued `DELETE`).
- **`gola-expo-preview/src/screens/Inventory/InventoryScreen.js`** - confirmation dialog now names the item and states the history is permanently deleted and irreversible (removed the "archived (kept for records)" wording). `runDelete` now shows a truthful `Item deleted` alert with the server message and no longer branches on `result.archived`. On success it refreshes the list; on failure it shows the real error and **does not** refresh, so the item stays visible. Existing `deletingId` guard, cancel, and refresh behaviour preserved.

### Files changed (server + Expo + docs only)
- Modified: `server/controllers/inventoryController.js`, `server/tests/inventory.api.test.js`, `gola-expo-preview/src/api/inventoryService.js`, `gola-expo-preview/src/screens/Inventory/InventoryScreen.js`
- Docs: `docs/audits/README.md` (this section), `docs/implementation/implementation-progress-tracker.md`

### Tests (2026-10-12, local; exact results)
- Server inventory API suite: `cd server; node --test tests/inventory.api.test.js` -> **24/24 pass, 0 fail**.
- Full server suite: `cd server; npm test` -> **129/129 pass, 0 fail**.
- Expo unit tests: `cd gola-expo-preview; node --test src/utils/*.test.js` -> **182/182 pass, 0 fail**.
- Lint: `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings**, all pre-existing (3 `unicode-bom`, 1 unused catch binding); unchanged from Phase 4.1.
- Android bundle: `cd gola-expo-preview; npx expo export --platform android` -> **success** (Hermes `.hbc`, 3.9 MB); generated `dist/` removed afterwards.
- No `tsconfig.json` in gola-expo-preview, so typecheck is unavailable.

New/updated test coverage (the 11 required scenarios):
1. Delete with **no** history -> hard removed (`deleted:true`), `GET` 404.
2. Delete with **movements** -> permanently removed; `removedMovements` reported; movements endpoint empty.
3. Delete with **cycles** (cycle-only branch) -> permanently removed; `removedCycles` reported; cycles endpoint empty.
4. Success response + refresh: server returns `deleted:true` + message; screen refreshes on success.
5. Cancel dialog deletes nothing (pre-existing Alert cancel path; no API call).
6. Backend failure does not falsely remove from UI: on error the screen shows the error and does not refresh. (Covered by code review; the API-level failure path returns 500/404 and the item remains.)
7. Repeated/already-deleted request -> **404**, deletes nothing (idempotent).
8. Unrelated items preserved: bystander item keeps balance and full history.
9. Related stock records handled under the approved strategy -> movements + cycles deleted with the item.
10. Analytics + alerts after deletion -> deleted item absent from `analytics.items`; `totals.consumption` drops by exactly the deleted history; `reconcile` reports no dangling mismatch; alerts endpoint still 200 (`POST /reconcile` and `GET /alerts` exercised).
11. Regression of restock/consumption/unit-cost/idempotency/concurrency -> all pre-existing tests still pass unchanged.

### Preserved
- Stock consumption, restocking, unit-cost calculation, `idempotencyKey` handling, movement validation, insufficient-stock protection, low-stock/usage alerts (>=70% consumed), inventory analytics, movement/cycle calculations, and the `activate`/`deactivate` soft mechanism (`setIngredientActive`) are untouched. The `Archived` pill remains for items soft-deactivated via that separate route. No automatic stock deduction from orders. No API contract change beyond the `deleteIngredient` success body (the archive body no longer exists).

### Remaining / notes
- **No live-endpoint or physical-device verification** (no device/backend tooling in this environment); the delete flow is covered by API integration tests + code review.
- The cascade is intentionally **non-transactional** (standalone MongoDB). Dependents are deleted before the item, each step idempotent, so a partial failure is recoverable by retrying Delete.
- `gola-expo-preview/src/utils/analyticsLoadUtils.js` + `.test.js` remain untracked and pre-date this work.

### Blockers
- None.

### Scope compliance
- Only `server/` (inventory deletion path + its tests) and `gola-expo-preview/` (inventory delete messages) and docs touched. No new routes, no schema change, no dependencies added, no deploy, no production DB reads/writes, no auth changes. Protected directories untouched. Destructive history policy was owner-approved before implementation.

**Owner review requested before any further work.**
