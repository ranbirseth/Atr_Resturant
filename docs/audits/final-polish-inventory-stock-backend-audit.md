# GOLA_RESTAURANT — Final Polish Phase 1A: Inventory & Stock Backend Audit

> **Read-only investigation.** No source files, dependencies, configuration, database, migrations, seeds, or deployments were modified. The only command executed against the project was the **pure, DB-free** unit suite `node --test utils/inventoryUtils.test.js` (13/13 pass) and two DB-free `node -e` evaluations of the pure helpers. The DB-backed API suite `tests/inventory.api.test.js` was **not run** (it drops a test database and was out of scope for this read-only phase). `client/`, `AdminDashbord/`, `print-service/`, and `react native frontend/` were not inspected or modified.

- **Date:** 2026-10-10
- **Scope:** `server/` (primary) and `gola-expo-preview/` (API contract / navigation only).
- **Owner requirements source:** the Phase 1A brief (items 1–9) plus the existing design docs (`docs/audits/inventory-feature-audit.md`, `docs/implementation/inventory-stock-implementation.md`).
- **Final status:** `AUDIT COMPLETE — AWAITING OWNER REVIEW`. No implementation started.

---

## 0. Evidence legend

| Label | Meaning |
|---|---|
| **CONFIRMED FACT** | Directly read from source in this repo (path + line/function cited). |
| **REPRODUCED** | Confirmed by executing a pure, DB-free helper or unit test. |
| **UNVERIFIED** | Cannot be proven read-only (e.g., remote deployed build, live DB state). |
| **ASSUMPTION** | Stated as an assumption, not a proven fact. |

Status values: **DEFECT** (broken behaviour), **MISSING** (not implemented), **CORRECT** (meets requirement), **PARTIAL**.

---

## 1. Direct answers to A–I

| Question | Answer | Status |
|---|---|---|
| A. Backend flow traced end-to-end | Yes — models → utils → controller → routes → `server.js` mount. See §A. | CORRECT (flow exists) |
| B. Purchase price + notes stored on initial purchase & every restock | **Notes: yes** (movement `note`). **Purchase price: no — absent from every schema, validator, endpoint, and form.** See §B. | **MISSING** |
| C. Item creation with opening qty records opening movement/qty/cost/note | Movement + qty **yes**; note is **hardcoded**; **cost absent**. See §C. | **PARTIAL** |
| D. Consumption/adjustment/restock formulas + 75%-used alert | Arithmetic is correct (10→consume 3→restock 4 = 11 reproduced). **The 75%-used alert does not exist.** See §D. | Arithmetic **CORRECT**, alert **MISSING** |
| E. Concurrency & failure handling; balance/ledger drift | Atomic `$inc` + unique idempotency key are solid for consumption. **Duplicate concurrent RESTOCK can corrupt the cycle ledger** (does not reopen a closed cycle, does not revert purchaseStatus/latestCycleId). See §E. | **DEFECT** |
| F. API response shapes & endpoint paths used by Expo | Documented. Local/Vercel share one app; **Expo targets remote Render production whose deployed revision is unverified.** See §F. | CORRECT locally / **UNVERIFIED** prod |
| G. Coupling of menu/orders/payments to inventory | **None.** No model or controller references the inventory collections. No automatic order deduction (matches brief). See §G. | CORRECT |
| H. How Dashboard/Analytics can consume stock data without duplicate math | Data + endpoints exist; **no analytics/summary endpoint exists yet**, so Dashboard/Analytics cannot consume it today. See §H. | **MISSING** aggregation API |
| I. Expo navigation/screen behaviour | Inventory and Stock are **two separate drawer destinations**; both call the same `/api/inventory/...` endpoints. Consolidation into one "Inventory & Stock" destination is **not done**. See §I. | **MISSING** (UI, out of scope this phase) |

---

## A. Complete backend flow trace

### A.1 Models (3 inventory collections, all additive)

| Model | File | Key fields | Notes |
|---|---|---|---|
| `Ingredient` (a.k.a. "Inventory Item") | `server/models/Ingredient.js:7-59` | `name`, `nameKey` (unique, normalized), `unit` (enum `UNITS`), `minimumStockLevel`, `expectedDemand`, `isActive`, `currentQty` (materialized balance, `min: 0` at `:42-46`), `purchaseStatus` (`NONE/NEEDED/ORDERED/COMPLETED`), `latestCycleId` | **No `purchasePrice`/cost. No `note`.** |
| `StockMovement` (append-only ledger) | `server/models/StockMovement.js:7-53` | `ingredientId`, `type` (enum), signed `quantityDelta`, `unit` snapshot, `movementDate`, `note` (`:34-37`), `cycleId`, `idempotencyKey`, `createdBy` | **No `unitCost`/`purchasePrice`.** Unique sparse index on `idempotencyKey` (`:55`). `pre('save')` rejects any non-new save (`:60-65`). |
| `StockCycle` (usage cycle) | `server/models/StockCycle.js:6-51` | `ingredientId`, `cycleNumber`, `baselineQty`, `restockedQty`, `carriedOverQty`, `startedAt`, `closedAt`, `status` (`OPEN/CLOSED`), `finalUsagePercent` | Unique `(ingredientId, cycleNumber)` (`:53`). |

`Item.js` (menu) and `Order.js` contain **no** inventory references (see §G).

### A.2 Pure helpers — `server/utils/inventoryUtils.js`

- Constants: `UNITS = ['kg','g','litre','ml','pieces','packets']` (`:10`), `MOVEMENT_TYPES = ['OPENING','RESTOCK','CONSUMPTION','ADJUSTMENT']` (`:12`), `PURCHASE_STATUSES` (`:14`), `STOCK_FILTERS` (`:16`).
- `computeUsagePercent(baseline, current)` (`:110-120`): `used = baseline − current`; `percent = used/baseline*100`, clamped `0..100`; `null` when `baseline <= 0`.
- `computeSuggestedQty(min, demand, current)` (`:123-128`): `max(0, min + demand − current)`.
- `computeStockStatus(current, min)` (`:131-141`): `outOfStock = current <= 0`; `lowStock = !outOfStock && current <= min`; `available = !out && !low`.
- `validateIngredientInput` (`:149-196`): whitelists `name/unit/minimumStockLevel/expectedDemand/isActive`; `openingQty` accepted only on create (`:189-193`). **No `purchasePrice`.**
- `validateMovementInput` (`:201-259`): accepts `ingredientId/type/quantity|quantityDelta/unit/movementDate/note/idempotencyKey/createdBy` (`note` at `:246-248`). **No `unitCost`/`purchasePrice`.**
- `movementDelta` (`:262-273`): CONSUMPTION = `−quantity`; RESTOCK/OPENING = `+quantity`; ADJUSTMENT = `quantityDelta`.
- `filterStockItems` (`:276-301`): applies `all|available|low|out|need-to-buy` + name query.

### A.3 Controller — `server/controllers/inventoryController.js`

`stockRow(ingredient, openCycle)` (`:7-20`) is the shared response shaper: spreads the raw `Ingredient` document and adds `available`, `lowStock`, `outOfStock`, `needToBuy`, `suggestedQty`, `baselineQty`, `usagePercent`.

Endpoints (all unauthenticated by owner decision):

| Handler | Lines | Behaviour |
|---|---|---|
| `getUnits` | `:25-27` | Fixed catalog. |
| `getIngredients` | `:31-51` | List + `active`/`query` filter, enriched with open-cycle usage. |
| `getIngredient` | `:55-66` | Single item (404 if absent). |
| `createIngredient` | `:70-125` | Validate, duplicate `nameKey` guard, create item, and if `openingQty>0` create `StockCycle`+`OPENING` movement (`:93-116`). |
| `updateIngredient` | `:129-178` | Partial update; blocks unit change once movements exist (`:156-163`). |
| `setIngredientActive` | `:182-197` | Soft activate/deactivate. |
| `setPurchaseStatus` | `:202-229` | Set `NONE/NEEDED/ORDERED`; rejects `COMPLETED` (`:210-214`). |
| `getStock` | `:233-248` | `GET /stock` + `/stock/balance`; filterable enriched rows. |
| `recordMovement` | `:254-387` | The core write path (see below). |
| `getMovements` | `:391-415` | Append-only history with `ingredientId/type/from/to/limit` (limit capped 1–500). |
| `getCycles` | `:419-428` | Cycles newest-first. |
| `reconcile` | `:432-464` | Recomputes each balance vs `SUM(quantityDelta)`; reports drift; optional `fix`. |

**`recordMovement` step-by-step** (CONFIRMED FACT):
1. Validate (`:256`), load ingredient (`:261`), unit-match check (`:266-270`), inactive guard (`:272-274`).
2. Idempotency **pre-check** `findOne({idempotencyKey})` → early `200 {alreadyProcessed:true}` (`:276-281`).
3. Compute signed `delta`; reject no-op (`:283-286`).
4. **Atomic conditional balance update** `findOneAndUpdate({_id, ...(delta<0 ? {currentQty:{$gte:magnitude}} : {})}, {$inc:{currentQty:delta}}, {new:true})` (`:289-298`). No match → `409 INSUFFICIENT_STOCK` with `availableQty` (`:300-309`).
5. **If RESTOCK/OPENING** (`:317-347`): compute `currentBefore = updated.currentQty − value.quantity`, `carriedOver = max(0, currentBefore)`; **close** the open cycle with frozen `finalUsagePercent`; create a new cycle with `baselineQty = carriedOver + value.quantity`, `restockedQty = value.quantity`; set `latestCycleId`; if prior `purchaseStatus ∈ {NEEDED, ORDERED}` set `COMPLETED`.
6. **Else** (CONSUMPTION/ADJUSTMENT) attach the current open `cycleId` (`:348-351`).
7. Insert the `StockMovement` (`:353-363`); return `201 {movement, ingredient, cycle}` (`:365-371`).
8. **Compensation on ledger-write failure** (`:372-383`): `$inc currentQty: −delta`; delete the just-created cycle; on `E11000` return `200 {alreadyProcessed:true}`; else `500`.

### A.4 Routes & mounting

- `server/routes/inventoryRoutes.js:21-42`: `/units`, `/ingredients`, `/ingredients/:id`, `/activate|/deactivate`, `/purchase-status`, `/stock`, `/stock/balance`, `/stock/movements` (GET/POST), `/stock/cycles`, `/stock/reconcile`.
- `server/server.js:101`: `app.use('/api/inventory', require('./routes/inventoryRoutes'))`.
- `server/api/index.js:1-3` requires `../server`, and `server/vercel.json` rewrites all paths to `api/index.js`, so the same mounted routes are served on Vercel/Render (single source of truth).

### A.5 Validation, idempotency, error handling

- Validation is centralized in `inventoryUtils.js` (pure) and re-checked by Mongoose (`required`, `min`, `enum`).
- Idempotency: unique sparse `idempotencyKey`; pre-check + E11000 catch.
- Error codes: `400` validation/duplicate/unit-mismatch/inactive, `404` not found, `409` insufficient stock (extra fields `error/message/availableQty/requested`), `500` ledger-write failure, `200` replayed duplicate.

---

## B. Purchase price and notes on purchases/restocks

**Required:** "The item record must support a name, purchase price, quantity, and note" (brief item 1); "Restock accepts quantity, **purchase price**, and optional note" (brief item 4).

**Current behaviour (CONFIRMED FACT — purchase price is entirely absent):**

| Layer | Field present? | Evidence |
|---|---|---|
| `Ingredient` schema | **No** `purchasePrice`/cost/note | `server/models/Ingredient.js:7-59` |
| `StockMovement` schema | **No** `unitCost`/`purchasePrice`; `note` **yes** (`:34-37`) | `server/models/StockMovement.js:7-53` |
| `StockCycle` schema | **No** cost field | `server/models/StockCycle.js:6-51` |
| `validateIngredientInput` | **No** price | `server/utils/inventoryUtils.js:149-196` |
| `validateMovementInput` | **No** price; `note` **yes** (`:246-248`) | `server/utils/inventoryUtils.js:201-259` |
| `createIngredient` | **No** price | `server/controllers/inventoryController.js:70-125` |
| `recordMovement` | **No** price persisted | `server/controllers/inventoryController.js:353-363` |
| Expo `IngredientFormModal` | **No** price/note field | `gola-expo-preview/src/screens/Inventory/IngredientFormModal.js:86-97,153-162` |
| Expo `MovementModal` | **No** price field; `note` **yes** (`:112-118`) | `gola-expo-preview/src/screens/Stock/MovementModal.js:57-69,112-118` |

A repo-wide search for `purchasePrice|costPrice|unitPrice|pricePer` returns only the menu `unitPrice` in `server/utils/menuUtils.js:236-270` and the **dead, unmounted** ESM `server/utils/analytics.js:2` (`item.costPrice`; imported by nothing — confirmed no importer). Neither relates to inventory.

**Verdict:** `MISSING` — purchase price is not captured for the initial purchase **or** for any restock. Notes for movements are captured and displayed (`HistoryModal.js:69-71`), but there is **no note field on the item/opening purchase**.

**Suggested minimal fix (future, not applied):**
- Add `purchasePrice` (Number ≥ 0) to the **item** (last/default purchase price) and `unitCost` (Number ≥ 0) + keep `note` on **`StockMovement`** so every restock/opening carries its own price.
- Accept/validate `purchasePrice` in `validateIngredientInput` and `unitCost` (or `purchasePrice`) in `validateMovementInput`; persist on the `OPENING`/`RESTOCK` movement; expose in `stockRow` and the Expo forms.
- Keep amounts optional for backward compatibility (legacy movements have none).

---

## C. Item creation with opening quantity

**Current behaviour (CONFIRMED FACT, `createIngredient`:70-125):**
- `openingQty` is validated (`inventoryUtils.js:189-193`) and used as `currentQty` (`:89`).
- If `openingQty > 0`: a `StockCycle` is created (`:95-103`, `cycleNumber: 1`, `baselineQty = restockedQty = openingQty`, `carriedOverQty: 0`), an `OPENING` movement is created (`:104-113`), and `latestCycleId` is set (`:114-115`).
- The opening movement's `note` is **hardcoded `'Opening quantity'`** (`:110`).
- `createdBy` is read from `value.createdBy`, but `validateIngredientInput` never whitelists `createdBy`, so it is always `'admin'` (`:112`).

**Required:** opening purchase should record quantity **and cost and note**.

**Verdict:** `PARTIAL`.
- Quantity: CORRECT.
- Opening movement + open cycle: CORRECT (matches API test intent, `tests/inventory.api.test.js:95-111`).
- Note: **not user-supplied** (hardcoded).
- Cost: **MISSING**.

**Suggested minimal fix:** accept optional `openingNote` and `openingPurchasePrice` (or a shared `purchasePrice`) on create; store them on the `OPENING` movement's `note`/`unitCost`.

---

## D. Consumption / adjustment / restock formulas and the 75%-used alert

### D.1 Arithmetic (CONFIRMED FACT; owner example REPRODUCED)

- Consumption: `currentQty += −quantity` via conditional `$inc`; blocked at/below zero (`:289-309`).
- Adjustment: `currentQty += quantityDelta` (signed), no new cycle (`:348-351`).
- Restock: `carriedOver = max(0, currentQty_before)`, `newBaseline = carriedOver + quantity`, `restockedQty = quantity`; the previous cycle closes with `finalUsagePercent = usage(baseline, currentQty_before)` (`:317-347`).

**Owner example (10 L oil → consume 3 L → restock 4 L):**
`currentQty` = 10 − 3 + 4 = **11 L** ✅ (reproduced with `computeUsagePercent(10,7)=30`, `computeUsagePercent(11,11)=0`). This matches requirement 4.

### D.2 The 75%-used low-stock alert (required by brief item 6)

**Requirement:** alert when 75% of a cycle has been used ⇒ ≤ 25% of the **baseline** remains.

**Current behaviour (CONFIRMED FACT):**
- `computeStockStatus` (`inventoryUtils.js:131-141`) defines `lowStock` as `currentQty <= minimumStockLevel` — a **manually set absolute threshold**, unrelated to the cycle baseline.
- `usagePercent` is computed (`computeUsagePercent`) and **displayed** as a progress bar (`StockScreen.js:151-160`) and in history (`HistoryModal.js:103-108`), **but nothing raises an alert at 75%**.
- **REPRODUCED:** with `minimumStockLevel = 0`, an item with baseline 10 and current 2 (80% used, 20% left) returns `{available:true, lowStock:false, outOfStock:false}`. So the required 75%-used alert is **not** produced.

**Verdict:** `MISSING` (alert). The `usagePercent` building block is CORRECT and already in the API response.

**Suggested minimal fix (backend, to satisfy item 6):**
- Add a derived flag in `stockRow` (not a new collection), e.g. `cycleUsagePercent = usagePercent` and `usageAlert = usagePercent !== null && usagePercent >= 75`, computed from the **open cycle baseline** (fallback to the active/last baseline or `minimumStockLevel` when no cycle).
- Return it on `GET /stock`, `GET /ingredients`, and `POST /stock/movements` so Dashboard/Analytics can consume it without recomputation.

### D.3 Note on `usagePercent` vs baseline after carry-over

Because `baselineQty` includes `carriedOverQty`, usage resets to 0 at each restock even if old stock remains. This is intentional (`StockCycle.js:3-5`) and consistent with the API tests (`inventory.api.test.js:144-164`), but the owner should confirm whether the 75% alert should measure **this cycle's baseline** (current behaviour semantics) or a fixed reorder baseline.

---

## E. Concurrency and failure handling

### E.1 What is solid (CONFIRMED FACT)

- **Negative-balance prevention is race-safe:** the conditional `findOneAndUpdate({_id, currentQty:{$gte:magnitude}}, {$inc:{-magnitude}})` (`:289-298`) makes concurrent consumption safe; the DB test asserts 20×qty-1 against 10 available → exactly 10 succeed / 10 `409` (`tests/inventory.api.test.js:215-237`).
- **Duplicate consumption dedupe:** unique sparse `idempotencyKey` (`StockMovement.js:55`) + pre-check (`:276-281`) + E11000 catch (`:378-381`).
- **Balance compensation on ledger failure** for the simple case: `$inc: −delta` (`:374`).

### E.2 DEFECT — duplicate concurrent RESTOCK corrupts cycle state

Consider two concurrent `POST /stock/movements` with the **same** `idempotencyKey`, `type: RESTOCK` (e.g., a double-tap that shares a key, or a client retry storm):
1. Both pass the idempotency pre-check (no movement exists yet).
2. Both apply the `$inc` → balance is incremented **twice**.
3. Both enter the RESTOCK branch: the **first** closes the previous open cycle and creates cycle N; the **second** then finds cycle N (still `OPEN`) as the "open cycle", **closes it**, and creates cycle N+1.
4. The second `StockMovement.create` fails with `E11000`.
5. Compensation (`:372-383`) reverts the second `$inc` and deletes **only its own** `newCycle` (N+1). It does **not**:
   - re-open the cycle the loser closed (N stays erroneously `CLOSED` with a bogus `finalUsagePercent`), and
   - revert `latestCycleId` / `purchaseStatus = COMPLETED` (set at `:343-347`).

**Result (CONFIRMED by code trace):** balance is corrected, but the item is left with **no OPEN cycle**, a wrongly closed cycle, and possibly a spurious `COMPLETED` purchase status. `usagePercent` becomes `null` until the next restock. This is **balance/ledger/cycle drift** — the exact class of bug the `reconcile` endpoint cannot fully repair (it only reconciles balances from the ledger, not cycles or purchase status; `:432-464`).

**Related lesser drift:** any RESTOCK whose ledger insert fails after step 3 likewise leaves the previously-open cycle closed, because compensation only deletes the new cycle and never restores `status:'OPEN'`/`finalUsagePercent:null` on the cycle it closed.

**Suggested minimal fix (future):**
- Wrap the cycle-close/create + ledger insert so that on failure the previously closed cycle is restored (`status:'OPEN'`, `closedAt:null`, `finalUsagePercent:null`) and `latestCycleId`/`purchaseStatus` are reverted; **or** make idempotency an insert-first reservation (insert the movement, then apply cycle + `$inc`) so a duplicate never mutates cycles. A single-document `StockMovement` reservation is compatible with standalone MongoDB (no replica set required).

### E.3 Other observed handling (CONFIRMED FACT)

- `reconcile({fix:true})` clamps to `max(0, ledgerQty)` (`:454`) — a real negative balance would be silently floored, not surfaced as an error; the mismatch list still reports the pre-fix `drift`.
- The idempotency pre-check is a TOCTOU window but is backstopped by the unique index for balances; it is **not** backstopped for cycle state (see E.2).

---

## F. API response shapes and endpoint paths used by Expo

### F.1 Endpoint paths (Expo → server)

`gola-expo-preview/src/api/apiClient.js:4` prefixes `getBaseUrl()`. `inventoryService.js` uses:

| Expo call | HTTP request | Server route |
|---|---|---|
| `getUnits()` | `GET /inventory/units` | `inventoryRoutes.js:21` |
| `getIngredients(params)` | `GET /inventory/ingredients?query=&active=` | `:23` |
| `getIngredient(id)` | `GET /inventory/ingredients/:id` | `:25` |
| `createIngredient(payload)` | `POST /inventory/ingredients` | `:24` |
| `updateIngredient(id,payload)` | `PUT /inventory/ingredients/:id` | `:26` |
| `setIngredientActive(id,active)` | `POST /inventory/ingredients/:id/(activate\|deactivate)` | `:27-34` |
| `setPurchaseStatus(id,status)` | `POST /inventory/ingredients/:id/purchase-status` | `:35` |
| `getStock(params)` | `GET /inventory/stock` | `:37` |
| `recordMovement(payload)` | `POST /inventory/stock/movements` | `:40` |
| `getMovements(params)` | `GET /inventory/stock/movements?...` | `:39` |
| `getCycles(ingredientId)` | `GET /inventory/stock/cycles?...` | `:41` |
| `reconcile(fix)` | `POST /inventory/stock/reconcile` | `:42` |

### F.2 Response shapes (CONFIRMED FACT)

- `GET /stock`, `GET /stock/balance`, `GET /ingredients` → **array** of `stockRow`: raw `Ingredient` fields + `available`, `lowStock`, `outOfStock`, `needToBuy`, `suggestedQty`, `baselineQty` (nullable), `usagePercent` (nullable).
- `GET /stock/movements`, `GET /stock/cycles` → **array** of documents.
- `POST /stock/movements` → `201 { movement, ingredient: stockRow, cycle }`; duplicate → `200 { alreadyProcessed:true, movement }`; insufficient → `409 { error:'INSUFFICIENT_STOCK', message, availableQty, requested }`; validation → `400 { message, errors? }`.
- Expo mock expectations match: `getStock`/`getMovements`/`getCycles` guard with `Array.isArray` (`inventoryService.js:63-80`); `StockScreen` reloads after writes and ignores the POST body (`StockScreen.js:93-105`).

### F.3 Local vs production (UNVERIFIED)

- `gola-expo-preview/src/api/config.js:9` defines `production: 'https://atr-resturant.onrender.com/api'`, and `:17` selects **`PRESETS.production` (active)**. So the tablet calls the **remote Render** backend, not the local server.
- Local, Vercel, and Render all mount the same routes via `server.js`/`api/index.js`. However, **the revision currently deployed on Render is unverifiable read-only**; if Render was last deployed before the inventory routes were added, the Expo Inventory/Stock screens would 404 in production while passing locally. **UNVERIFIED — flagged as a production risk.**
- All inventory endpoints are unauthenticated by owner decision (`inventoryRoutes.js:18-19`). `ADMIN_SECRET_CODE` (`.env.example`) is not used by inventory.

---

## G. Coupling of menu / orders / payments to inventory

**CONFIRMED FACT — no coupling exists, and no auto-deduction (matches the brief).**

- A repo-wide search for `Ingredient|StockMovement|StockCycle|inventory` finds hits **only** in `server/models/{Ingredient,StockMovement,StockCycle}.js`, `server/controllers/inventoryController.js`, `server/routes/inventoryRoutes.js`, `server/utils/inventoryUtils*.js`, `server/tests/inventory.api.test.js`, `server/server.js:101`, and docs.
- `server/models/Order.js` has no stock fields and no `stockDeductionId`; `server/controllers/orderController.js` references neither `Ingredient` nor `StockMovement` (its only `analytics` hit is the orders analytics function at `:426`).
- `server/models/Item.js` (menu) has no recipe/BOM/cost/stock field.
- Billing is preview-only per prior docs; no payment record touches stock.

**Verdict:** `CORRECT` — requirement "do not introduce automatic order-based stock deduction" is respected.

---

## H. Future Dashboard / Analytics consumption of stock data

**CONFIRMED FACT — the data exists; the aggregation API does not.**

- Inventory source of truth: `StockMovement` (`quantityDelta`, `type`, `movementDate`, `cycleId`, `note`) and `StockCycle` (`baselineQty`, `restockedQty`, `carriedOverQty`, `finalUsagePercent`). Per-item derived values are computed in `stockRow` (`inventoryController.js:7-20`).
- The **only** server-side aggregations are:
  - `getStock` / `getIngredients` (per-item enrichment) — `inventoryController.js:31-51,233-248`;
  - `reconcile` (balance vs ledger) — `:432-464`.
- There is **no** inventory additions/consumption/suggestion summary endpoint. The actual analytics endpoint (`orderController.js:426-...`) covers orders only, and the Expo `AnalyticsTab.js:262-276` explicitly shows an honest "Inventory: Purchases vs Sales — Not available" gap card.

**Verdict (brief item 7):** `MISSING` — an inventory analytics/summary API is required for "inventory additions, consumption, and purchase suggestions based on repeated usage."

**Suggested minimal fix (future, non-duplicating):**
- Add `GET /api/inventory/analytics?from=&to=` that aggregates the ledger once: additions (`SUM` of `OPENING+RESTOCK`), consumption (`SUM` of `−CONSUMPTION`), adjustment total, and per-item `consumptionRate = consumed / baseline`; emit `purchaseSuggestion` using `computeSuggestedQty` (already in `inventoryUtils.js:123-128`) plus repeated-usage trend.
- Add `GET /api/inventory/alerts` (or a `usageAlert` flag on `stockRow`) for Dashboard low-stock (item 6).
- Both should reuse `inventoryUtils` and `stockRow` so Dashboard/Analytics never re-derive formulas.

---

## I. Expo navigation and screen behaviour (documentation only)

**CONFIRMED FACT:**
- `RootNavigator.js:68-87` registers **two separate** drawer destinations: `Inventory` (`cube-outline`, title "Inventory") → `InventoryScreen`, and `Stock` (`layers-outline`, title "Stock") → `StockScreen`. They sit between "Menu & Categories" and "Users & Coupons".
- `InventoryScreen.js:63` calls `getIngredients({})` + `getUnits()`; `StockScreen.js:53` calls `getStock({})`. All writes go through `inventoryService.js` (see §F).
- `IngredientFormModal` has **no price/note** input (`:86-97,153-162`); `MovementModal` has a `note` input but **no price** (`:112-118`); `HistoryModal` renders movement `note` but no cost (`:69-71`).
- `DashboardScreen.js` calls only `getOrders()` (`:13,49`) — no stock/alerts.
- `AnalyticsTab.js:262-276` shows the inventory gap card.

**Verdict:** requirement 5 (single drawer destination named `Inventory & Stock`) is `MISSING` at the UI level. This is a presentation change for a later phase; **no UI was modified in this audit**.

**Suggested minimal fix (future, UI phase):** merge into one drawer destination with two in-screen segments (Item master / Stock operations), mirroring the existing `MenuCategoriesScreen` combined pattern, and label it `Inventory & Stock`.

---

## Confirmed bugs

1. **Purchase price is never captured or stored** for the item, initial purchase, or any restock (brief items 1 & 4). — `MISSING` (§B). Paths: `Ingredient.js`, `StockMovement.js`, `inventoryUtils.js:149-259`, `inventoryController.js:70-125,353-363`.
2. **75%-of-cycle-used low-stock alert does not exist;** low stock is only `currentQty <= minimumStockLevel`. — `MISSING` (§D.2, REPRODUCED). Path: `inventoryUtils.js:131-141`; no `usageAlert` anywhere.
3. **Duplicate concurrent RESTOCK corrupts cycle state** (closed cycle not reopened; `latestCycleId`/`purchaseStatus` not reverted on compensation). — `DEFECT` (§E.2). Path: `inventoryController.js:317-347,372-383`.
4. **Opening purchase note is hardcoded** and opening cost is absent; `createdBy` is not accepted on create. — `PARTIAL/DEFECT` (§C). Path: `inventoryController.js:104-113`, `inventoryUtils.js:149-196`.
5. **No inventory analytics/summary API** for additions/consumption/purchase suggestions. — `MISSING` (§H).
6. **Inventory and Stock are two separate drawer destinations** (require one `Inventory & Stock`). — `MISSING` UI (§I).

## Missing fields / features

- `purchasePrice` on `Ingredient` (and/or `unitCost` on `StockMovement`); `note` on the item/opening purchase.
- Movement `unitCost`/`purchasePrice` accepted by `validateMovementInput` and persisted on OPENING/RESTOCK.
- Derived `usageAlert` (usage ≥ 75% or remaining ≤ 25% of baseline) in `stockRow`.
- `GET /api/inventory/analytics` and/or `GET /api/inventory/alerts` for Dashboard/Analytics.
- Consolidated `Inventory & Stock` drawer destination + price/note inputs in Expo forms (UI phase).

## Existing functionality to preserve

- Append-only immutable ledger + `pre('save')` guard (`StockMovement.js:60-65`); no PUT/DELETE movement routes (`inventoryRoutes.js`).
- Atomic conditional `$inc` negative-balance guard and `409 INSUFFICIENT_STOCK` (`inventoryController.js:289-309`).
- Unique sparse `idempotencyKey` and duplicate handling (`StockMovement.js:55`, `inventoryController.js:276-281,378-381`).
- Per-cycle usage semantics and `finalUsagePercent` on close (`StockCycle.js`, `inventoryController.js:317-347`).
- Duplicate-name and unit-change guards (`inventoryController.js:77-81,143-163`).
- `GET /stock/balance` alias and all existing response field names consumed by Expo.
- No order-based stock deduction; menu/orders/payments remain decoupled.
- Unauthenticated access per explicit owner decision.

## Risks

- **Production drift (UNVERIFIED):** Expo targets `https://atr-resturant.onrender.com/api` (`config.js:17`); the deployed revision may not include inventory routes. Verify before any tablet testing.
- **Open write endpoints:** anyone reaching the API can create items and post movements (documented risk; owner-accepted).
- **Cycle-dependent alert:** if the 75% rule is implemented against the open-cycle baseline, a restock resets it to 0% by design (carry-over included) — confirm this is the intended semantics.
- **`reconcile({fix:true})` floors negatives** rather than surfacing them; keep as a detection tool, but treat negative/ledger drift as a stop condition.
- **Standalone MongoDB** (`.env.example`): no multi-document transactions assumed; any fix should stay within per-document atomicity + idempotency keys.

## Recommended backend fix sequence (do not start until owner approves)

1. **Schema (additive):** add `purchasePrice` to `Ingredient` and `unitCost`/`purchasePrice` to `StockMovement`; keep optional/nullable for legacy.
2. **Validation/helpers:** extend `validateIngredientInput` (item price + opening note/cost) and `validateMovementInput` (unitCost); add `computeUsageAlert(baseline, current, threshold=0.75)` to `inventoryUtils.js` with unit tests.
3. **Controller:** persist cost/note on OPENING/RESTOCK; add `usageAlert` (and `remainingPercent`) to `stockRow`; fix the RESTOCK compensation to restore the previously closed cycle (`status:'OPEN'`, `closedAt:null`, `finalUsagePercent:null`) and revert `latestCycleId`/`purchaseStatus` (or adopt insert-first idempotency reservation).
4. **Analytics API:** add `GET /api/inventory/analytics` (additions/consumption/purchase suggestions via existing `computeSuggestedQty`) and `GET /api/inventory/alerts`, both derived from the ledger/cycles only.
5. **Tests** (below) green before any Expo change.
6. **Expo (separate phase):** add price/note inputs, consume `usageAlert`, and consolidate to one `Inventory & Stock` destination.

## Backend regression tests required before touching the Expo frontend

1. **Purchase price persistence:** create item with opening `.purchasePrice`, restock with `.unitCost`, assert both are returned by `GET /stock/movements` and surfaced on the item/row.
2. **Opening record integrity:** opening qty still creates exactly one OPENING movement + one OPEN cycle; custom opening note/cost round-trip.
3. **Owner example:** 10 → consume 3 → restock 4 ⇒ `currentQty === 11` (already covered in spirit; add explicit assertion).
4. **75% alert:** baseline 10, current 2 (min level 0) ⇒ `usageAlert === true`; baseline 10, current 8 ⇒ `usageAlert === false`; no-open-cycle ⇒ `usageAlert === false` (null-safe).
5. **Concurrent duplicate RESTOCK (same idempotencyKey):** exactly one movement persists, balance +1×, and — critically — the item is left with **exactly one open cycle**, no wrongly-closed cycle, and no spurious `COMPLETED` status. (New regression for §E.2.)
6. **Concurrent consumption** (existing `inventory.api.test.js:215-237`) must still pass unchanged.
7. **Ledger-write failure compensation:** previously-open cycle is restored to `OPEN`; `latestCycleId`/`purchaseStatus` revert (new).
8. **Reconcile:** after the above sequences, `POST /stock/reconcile` reports zero balance drift (and cycle state is consistent).
9. **Regression:** duplicate-name, unit-mismatch, `409 INSUFFICIENT_STOCK`, movement immutability, and `GET /stock` filter tests unchanged.
10. **Analytics API:** additions/consumption totals equal the ledger sums; purchase suggestion equals `computeSuggestedQty` for each item; date-range filtering correct.

---

**Stop.** This audit is delivered for owner review. No code, schema, dependency, configuration, database, or deployment changes have been made. Implementation begins only after explicit approval.
