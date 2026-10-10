# Gola Restaurant — Phase 9A: Inventory Management Read-Only Audit

> **Read-only investigation.** No files were modified, no packages installed, no database touched, no deployments changed, and no feature implemented. `client/`, `AdminDashbord/`, `print-service/`, and `react native frontend/` were **not inspected or modified**. All findings are from authorized sources: `server/`, `gola-expo-preview/`, and `docs/`. No credentials are reproduced.

**Date:** 2026-10-10
**Scope:** Inventory Management feasibility for GOLA_RESTAURANT (Ingredient, Unit, StockMovement, Recipe, Supplier, Purchase, Wastage domains).
**Final status:** `READY FOR OWNER REVIEW` — audit only; no implementation started.

---

## 1. Existing implementation status

| Inventory concern | Status |
|---|---|
| Inventory / ingredients / stock models | **Absent** — no model exists |
| Suppliers / purchases / goods-receipt | **Absent** |
| Stock movements / ledger | **Absent** |
| Recipes / BOM (bill-of-materials) | **Absent** |
| Wastage | **Absent** |
| Stock-aware availability (Item `available`) | **Partial / semantic only** — boolean flags, not stock counts |
| Cost / margin data | **Absent** — one orphaned reference to a non-existent `costPrice` field |

**Bottom line:** the inventory domain is **absent end-to-end**. The only trace of it in the entire `server/` tree is `server/utils/analytics.js:2` (`item.price - item.costPrice`) — an orphaned ESM module imported by nothing (CommonJS project), referencing a `costPrice` field that exists on no schema. This was independently confirmed by the Phase 6 report (`docs/implementation/reviews-analytics-implementation.md:43-49`).

---

## 2. Current architecture and relevant source references

**Deployment:** Express + Socket.IO on `server/server.js:17-19` (local, Render `atr-resturant.onrender.com`) and Vercel serverless via `server/api/index.js` → requires `../server`, so new routes mounted in `server.js` work on both.

**Models (all 6, exactly):**
- `Item` — `server/models/Item.js:3-61`. Fields: `name, price, staffPrice* (new-required), description, image, category (String), isVeg, estimatedPreparationTime, rating, available, availableForStaff`. No cost, stock, or ingredient field.
- `Category` — `server/models/Category.js:3-25`. `name` (unique), `isVisible`, `customerVisible`, `staffVisible`.
- `Order` — `server/models/Order.js:3-79`. Status enum (+ legacy values), `audience`, `items[]` (denormalized snapshot), `previousOrderSnapshot`, `sessionId`, KOT history.
- `User` — `server/models/User.js`. `Coupon` — `server/models/Coupon.js`. `Feedback` — `server/models/Feedback.js`.

**Controllers / routes:**
- `itemController.js` (getItems 23-32, seedItems 34-50, createItem 55-79, updateItem 84-121, deleteItem 126-137) — `itemRoutes.js:6-10`; note **public `/seed`** (`itemRoutes.js:10`) that wipes + reseeds the menu unauthenticated.
- `categoryController.js` (create/update/delete guard, cascade rename) — `categoryRoutes.js:10-11`.
- `orderController.js` — `orderRoutes.js:5-12` (analytics & grouped registered before `/:id`).
- `authController.js` (login/check/all; `getAllUsers` comment at `authController.js:55` admits "strict auth is not implemented yet").
- `adminAuth.js:5-47` — `/api/admin/verify-code` returns a **boolean only; it issues no token/session and protects nothing**.
- `couponRoutes.js`, `feedbackRoutes.js`: admin-labeled but **unauthenticated**.
- `upsellRoutes.js`/`upsellController.js`: ESM dead code, **not mounted** in `server.js`.

**Utils (pure, unit-tested pattern):** `menuUtils.js` (`validateItemInput` 97-160, `buildAuthoritativeOrder` 189-281), `couponUtils.js`, `orderIdGenerator.js`, `SessionManager.js`. Tests run with Node's built-in runner (`node --test`) — `server/utils/*.test.js`. **No test script, no jest/supertest/mongodb-memory-server installed.**

**Expo (`gola-expo-preview`, SDK 57):**
- Navigation: `RootNavigator.js:36-105` — React Navigation Drawer with **7 destinations** (Dashboard, Orders, MenuCategories, UserCoupons, ReviewsAnalytics, Billing, Settings). **No Inventory destination.**
- `AppDrawerContent.js` footer: "Phase 2 – Mobile admin" (stale; app is at Phase 8).
- API services: `apiClient.js`, `config.js` (production preset `https://atr-resturant.onrender.com/api` active), `menuService`, `orderService`, `billingService`, `reviewsService`, `userCouponService`, `socketClient`.
- Screens: all 7 implemented except `Settings` (`SettingsScreen.js` still `<PlaceholderScreen/>`). Legacy unused `Menu/` and `Category/` screens exist but are **not routed** (`menu-categories-dual-pricing-audit.md:286`).
- Analytics shows an honest **gap card** for "Inventory Purchases vs Sales — not available" (`ReviewsAnalytics/AnalyticsTab.js:265-273`).

Chain of prior reports in `docs/` confirms this continuity: `orders-feature-audit.md`, `menu-categories-dual-pricing-audit.md` (§6-10), `billing-implementation.md` (§1.1-1.2), `reviews-analytics-implementation.md` (§1.5).

---

## 3. Task 2 — Linking ingredients to menu items without breaking contracts / snapshots

**The customer contract is narrow and safe.** The customer site depends on a bare-array `GET /api/items` with `price` and fields `_id, name, description, category, image, available` (`menu-categories-dual-pricing-audit.md:306-307`). The server already filters staff-only fields out of customer responses (`itemController.js:26`; `staffPrice`/`availableForStaff` excluded). **Historical orders are already snapshot-safe**: order lines embed denormalized `{itemId, name, quantity, price, customizations}` (`Order.js:8-16`), and `previousOrderSnapshot` preserves prior versions on edit (`Order.js:42-45`, `orderController.js:652-660`) — menu changes can never rewrite past orders.

**Recommended linkage (v1): do not touch `Item` at all.** Use a separate `Recipe` collection keyed by `itemId` (one recipe per menu item). Reasons:
- Zero change to `Item` schema → customer website contract and web admin UI are unaffected.
- Recipes can be managed independently of menu edits (chef-side data).
- Stock fields never leak through `GET /items`; the existing audience projection needs no change.
- A later additive `costPrice` on `Item` is optional and non-breaking (per prior audit §7.1 pattern).

**Constraint: categories remain string-named.** Ingredient grouping should not try to join on `Category` document ids; treat category as a label. The `Item.category → ObjectId` migration is still not done and should not be a dependency of this phase (`menu-categories-dual-pricing-audit.md:248`).

---

## 4. Task 3 — Orders module: statuses, Socket.IO events, safe stock-deduction point

**Canonical statuses** (`Order.js:33-39`, default `PLACED`): `PLACED, ACCEPTED, CHANGED, CANCELLED, COMPLETED`, plus legacy `Pending, Accepted, Preparing, Ready, ChangeRequested, Updated`. **Important:** uppercase `PREPARING`/`READY` are **not** valid enum members; the apps deliberately send legacy-cased `Preparing`/`Ready` (`orders-implementation.md:56`, `orderUtils.js:344-366`).

**Transition whitelist** (`orderController.js:281-289`): `PLACED→{ACCEPTED,CANCELLED}`; `ACCEPTED→{COMPLETED,CANCELLED,PREPARING,READY}`; `CHANGED→{ACCEPTED,CANCELLED}`; `PREPARING→{READY,COMPLETED,CANCELLED}`; `READY→{COMPLETED,CANCELLED}`; `CANCELLED/COMPLETED → {}` (terminal).

**Mutation surface (each one can fire events):**
- `POST /api/orders` → `createOrder` (`orderController.js:20-167`) emits `sessionOrderUpdate` + `newOrder` (:144-160). This is the only persistence path; **Billing "Generate Bill" is a local preview and never POSTs** (`billing-implementation.md:26`).
- `PUT /:id/status` → `updateOrderStatus` (:188-251) emits `sessionOrderUpdate`; uses `updateOne` **without `runValidators`** (enum bypassed, transition whitelist is the only guard — noted `orders-feature-audit.md:138`).
- `PUT /:id/update` → `updateOrder` (:625-698) modifies items, snapshots, sets `CHANGED`, emits `sessionOrderUpdate`.
- `PUT /print-success` → `confirmPrintStatus` (:571-620) emits `sessionOrderUpdate`.
- Socket.IO broadcasts to **all** clients; no rooms (:110-116).

**Safest future deduction point (recommendation — NOT implemented):**
- **`COMPLETED`**, triggered inside the status transition, is the safest single point today:
  - Terminal state — `COMPLETED` can never transition again, so no re-entry.
  - Any cancellation before completion never deducts at all (no reversal problem).
  - It reads the order's **final `items[]`**, so `CHANGED` order modifications are naturally accounted for at deduction time and no per-edit reconciliation logic is required in v1.
  - `README` status data shows `COMPLETED`/`Completed` already in production use (`orders-feature-audit.md:22`).
- **Alternative considered — `ACCEPTED` (kitchen start):** matches physical stock leaving the shelf earlier and surfaces shortages sooner, but creates a mandatory **reversal path on `CANCELLED`/`CHANGED`** and complicates v1. Reject for v1; revisit if the owner wants "block un-cookable orders at acceptance."
- Deduction must be **idempotent** (see §7) because `sessionOrderUpdate` echoes and status PUTs from the Expo app can race/de-dupe (`orders-implementation.md:73-74` documents the local 2.5 s dedupe window).

---

## 5. Task 4 — Expo: Inventory destination status

**No Inventory destination exists.** The drawer has exactly 7 screens (`RootNavigator.js:36-105`); none reference inventory. `Settings` is the only remaining placeholder. No `inventoryService` in `src/api/`, no `src/screens/Inventory/*`, and the only "inventory" text in the whole RN app is the analytics gap card. The single in-app "state" precedent to mirror is the Menu & Categories pattern (one drawer destination with in-screen segments + modal forms + `useFocusEffect` reload) (`MenuCategoriesScreen.js:11-114`).

---

## 6. Task 5 — Do inventory collections already exist?

**No.** Read-only evidence:
1. The codebase registers exactly **6 Mongoose models**; Mongo creates a collection only via `mongoose.model()`. No model file for inventory/ingredient/supplier/purchase/movement/recipe exists under `server/models/`.
2. Prior documented DB inspection (Phase 6): a repo-wide search for `inventory|stock|purchase|procurement|supplier|cost|stockMovement` across `server/` returned exactly **one** hit — the orphaned `costPrice` helper — and concluded "Inventory / stock / purchase records do NOT exist" (`reviews-analytics-implementation.md:43-49`).
3. `server/inspection_log.txt` (a past inspection artifact) reports only Users/Orders counts; `debug_counts.js`/`inspect_db*.js` only touch User/Order.
4. `Item` availability is **boolean** (`available`, `availableForStaff`), never a quantity. No balance/on-hand field anywhere.

The live DB and `.env` were not opened (would require executing code and touching live infrastructure/credentials); the in-repo evidence above is conclusive for the audit purpose.

---

## 7. Task 6 — Minimal inventory data model

All timestamps + `createdBy` on writes. **Essential for first release** vs **can wait**:

| Collection | Fields (minimal) | First release? |
|---|---|---|
| `Ingredient` | `name` (unique, case-insensitive key), `baseUnit` (ref), `categoryGroup` (label), `reorderLevel` (Number ≥ 0, display-only), `allowedOversell` (Boolean, default **false**), `isActive`, **`onHandQty`** (materialized, maintained by ledger writes) | **Yes — core** |
| `Unit` | `name` (unique), `symbol`, `toBaseFactor` (Number > 0, default 1) | **Yes — core** (low/medium/high → g/kg/mL gram base; keep factors simple in v1) |
| `StockMovement` (ledger) | `ingredientId` (ref), `type` ∈ `PURCHASE, ADJUSTMENT (=, ±with reason), ISSUE (sale deduction), SALE_RETURN, WASTAGE, TRANSFER`, `quantityDelta` (signed, base units), `idempotencyKey` (unique), `sourceRef` (`{orderId?, itemId?, purchaseId?, adjustmentId?}`), `refNo` (invoice/KOT ref), `unitCost?`, `note`, `createdBy` | **Yes — core** (append-only, immutable) |
| `Recipe` (BOM) | `itemId` (ref `Item`, unique), `ingredients[] {ingredientId, quantity (base units)}`, `yieldQuantity` (default 1), `isActive` | **Yes — core** |
| `Supplier` | `name`, `phone`, `address`, `isActive` | **Can wait (Phase 9C)** |
| `Purchase` / GoodsReceipt | `supplierId` (ref, or free-text supplierName), `items[] {ingredientId, quantity, unit, unitCost}`, `invoiceNo`, `receivedAt`, `totalCost`, `status` | **Can wait (Phase 9C)** |
| `Wastage` | Daily styled record w/ reason, photo, reviewer | **Can wait** — model as `StockMovement.type=WASTAGE` in v1 |

**Design decisions:**
- **One append-only ledger + materialized balance.** `Ingredient.onHandQty` is derived from the ledger; every accepted movement atomically `$inc`s it. A reconcile endpoint recomputes balances from the ledger (guards any drift). This gives audit history + concurrency safety with plain MongoDB.
- **Purchases in v1** = `StockMovement.type=PURCHASE` (with `refNo`/`unitCost`, free-text supplier) → no Supplier/Purchase collections needed for the first release. Supplier analytics collections wait for Phase 9C reporting.
- **Transactions caveat:** dev is standalone `mongodb://localhost` (`server/.env.example:11`); multi-doc transactions need a replica set (Atlas prod supports, local may not). **The deduction path intentionally avoids multi-doc transactions** — it uses per-ingredient atomic updates + idempotency keys instead (see §9).
- **No stock on `Item`.** `available`/`availableForStaff` remain manual knobs; optionally auto-flip later.

---

## 8. Task 7 — Validation requirements

1. **Non-negative stock:** every debiting movement (`ISSUE`, `WASTAGE`, negative `ADJUSTMENT`) executes `findOneAndUpdate({_id, onHandQty: {$gte: required}}, {$inc:{onHandQty:-required}})` per ingredient. On `modifiedCount===1` → commit movement; otherwise roll back and return `409 INSUFFICIENT_STOCK` listing the short ingredient. Override via `Ingredient.allowedOversell=true`.
2. **Unit conversion:** quantities normalized to the ingredient's `baseUnit` using `Unit.toBaseFactor` at write time; movement stores base-unit `quantityDelta` + optional display unit. Validation: factor finite and > 0; ingredient.baseUnit must exist.
3. **Concurrent stock:** solved by the atomic conditional `$inc`; **update on-hand then write ledger** (ledger is the audit record of what actually happened — reject the movement if the `$inc` loses). Duplicate concurrent deducts are also caught by the unique `idempotencyKey` (E11000 → `409 ALREADY_PROCESSED` / return current state).
4. **Duplicate ingredients:** unique normalized case/whitespace-insensitive `nameKey` (reuses the codebase's `categoryKey` pattern, `menuUtils.js:84-87`); duplicate → 400. Deleting an ingredient/unit referenced by movement/recipe must be **blocked** (mirror `categoryController.js:97-122`).
5. **Audit history:** ledger is append-only; no delete/update endpoints for `StockMovement`; only corrective entries (`ADJUSTMENT`) with a reason. All writes record `createdBy` (user/admin identity).
6. **Insufficient-stock handling:** return `409` with per-ingredient shortfall; never silently prune an order. v1 policy = **block at deduction** (deduction happens at `COMPLETED`, which is post-fulfillment, so blocking at COMPLETED only alerts — the "block before kitchen" option is the rejected `ACCEPTED` path).

---

## 9. Task 8 — Recipe/sales linking and duplicate-deduction prevention

**Linkage (later, after v1 subsystems):** when an order transitions to `COMPLETED`:
- For each order line, load `Recipe` by `itemId` (fallback: line has no recipe → skip that line, record it as "unmapped").
- Required base units = `Σ (recipe.ingredient.quantity × line.quantity)`, grouped per ingredient.
- Write one `StockMovement(type=ISSUE)` per ingredient with `quantityDelta = −required` and `idempotencyKey = "order:{orderId}:{itemId}"`.

**Duplicate-deduction prevention (three independent guards):**
1. **Unique ledger key:** `StockMovement.idempotencyKey` unique index — a replay just hits E11000 and is returned as already-done.
2. **Order-level compare-and-set:** `Order.findOneAndUpdate({_id, stockDeductionId: {$exists:false}}, {$set:{stockDeductionId}})`; proceed only if `modifiedCount === 1`. Additive field, default-absent → no migration.
3. **Status-gated entry:** the deduction hook lives only on the `COMPLETED` transition result; `updateOrderStatus` currently re-fetches session orders and re-emits `sessionOrderUpdate`, and the Expo app already de-dupes socket echoes for 2.5 s — but with guard #1/#2 the hook is immune regardless of races, double-taps, or socket replays.

**Order-modification semantics:** because deduction runs at `COMPLETED` on the **final** `items[]`, a `CHANGED` edit naturally buys back nothing until completion; if the owner later wants delta reconciliation, a `CHANGED` diff can emit compensating keyed movements (e.g. `"order:{id}:{itemId}:diff"`). Explicitly **not** in v1.

---

## 10. Task 9 — Security risks and auth blockers

Confirmed (also in prior audits: `orders-feature-audit.md:139`, `menu-categories-dual-pricing-audit.md:298-303`):
- **No auth middleware on any route.** Every mutation (`/api/items`, `/api/categories`, `/api/orders/*`, `/api/coupons`, `/api/feedback`, `/api/auth/all`) is unauthenticated.
- `/api/admin/verify-code` returns a boolean; **issues no token/session → there is nothing to gate on today**.
- Public `/api/items/seed` (and `/api/coupons/seed`) wipe+reseed data (`itemRoutes.js:10`, `couponRoutes.js:204`).
- CORS allows **no-origin requests** (Postman/mobile-friendly, `server.js:69,76`) and wildcard `.vercel.app`/`.onrender.com`; Socket.IO broadcasts to all clients.
- `updateOrderStatus` bypasses schema enum validation (`orderController.js:222-225`).

**Blockers for inventory write endpoints:**
1. No authenticated identity → inventory must not ship write endpoints unauthenticated. **Minimal recommendation:** a `requireAdminKey` middleware checking `x-admin-key === ADMIN_SECRET_CODE` (env), applied to all `/api/inventory` writes (and ideally retrofitted to existing mutations). Note the Expo app targets Render prod; the tablet would need the key in a staff-only build config. Full JWT/role auth is a separate larger initiative (listed in `features.txt` as future enhancement).
2. Until that exists, inventory **read** endpoints (GET balances, units, ingredients) could ship safely, but **writes should be gated from day one** — shipping them open would legitimize the existing pattern.

---

## 11. Task 10 — Implementation sequence, API contracts, files, tests, rollback

### Sequence (each step independently shippable; 9C is out of this phase)
1. **Step A — Data + pure logic (backend, additive):** models `Ingredient`, `Unit`, `StockMovement`, `Recipe`; `server/utils/inventoryUtils.js` (pure math: unit→base conversion, balance projection, recipe requirement computation, idempotency-key builder) + `inventoryUtils.test.js`. No routes yet.
2. **Step B — Read APIs (safe, no auth dependency):** `GET /api/inventory/units`, `GET /api/inventory/ingredients`, `GET /api/inventory/stock` (paged ledger), `GET /api/inventory/stock/balance` (per ingredient or all), `GET /api/inventory/recipes`.
3. **Step C — Auth middleware** `server/middleware/adminAuth.js` (`x-admin-key`) applied to inventory writes (and available for retrofit).
4. **Step D — Write APIs:** ingredient/unit/recipe CRUD + `POST /api/inventory/stock` (validation + atomic `$inc` + ledger). Duplicate/referenced blockers as in §7.
5. **Step E — Order hook (idempotent deduction):** `POST /api/inventory/stock/deduct-order {orderId}` + call from `updateOrderStatus` on the `COMPLETED` transition; gated by env flag. Order gets additive `stockDeductionId`.
6. **Step F — Expo:** `inventoryService.js`, drawer destination `Inventory` (8th), screen with segments + modal forms mirroring MenuCategories; pure `inventoryUtils.js` + tests; replace the analytics gap card with real data.
7. **Step G (later / Phase 9C):** `Supplier`/`Purchase` collections, wastage records, reorder alerts, manufacturer-level reports.

### API contracts (draft)
```
GET  /api/inventory/units             → [{_id,name,symbol,toBaseFactor}]
POST /api/inventory/units             {name,symbol,toBaseFactor}         → 201 | 400 dup
GET  /api/inventory/ingredients?query → [{_id,name,baseUnit,onHandQty,reorderLevel,allowedOversell}]
POST /api/inventory/ingredients       {name,baseUnit,reorderLevel?,allowedOversell?} → 201 | 400 dup
PUT  /api/inventory/ingredients/:id   (reorderLevel/allowedOversell/baseUnit) → 200 | 400 ref-blocked on delete only
DELETE /api/inventory/ingredients/:id → 400 if referenced, 200 else
POST /api/inventory/stock             {ingredientId,type,quantity,unit?,sourceRef?,refNo?,unitCost?,note?}
                                      → 201 | 409 INSUFFICIENT_STOCK | 409 ALREADY_PROCESSED
GET  /api/inventory/stock?ingredientId&type&from&to&limit&cursor → paged ledger (append-only)
GET  /api/inventory/stock/balance     → [{ingredientId,name,onHandQty,reorderLevel,atOrBelowReorder}]
POST /api/inventory/stock/deduct-order {orderId} → {status:'EXECUTED'|'ALREADY_DONE'|'BLOCKED', short[]}
GET/POST/PUT/DELETE /api/inventory/recipes (+ validate itemId exists, ingredients resolve, no duplicates)
HEADER x-admin-key: <ADMIN_SECRET_CODE>  → 401 when missing/invalid (writes only)
```

### Affected files
- **New (server):** `models/{Ingredient,Unit,StockMovement,Recipe}.js`, `controllers/inventoryController.js`, `routes/inventoryRoutes.js`, `utils/inventoryUtils.js` (+ `.test.js`), `middleware/adminAuth.js`.
- **Modified (server):** `server.js` (mount `/api/inventory`, apply admin-key middleware), `controllers/orderController.js` (COMPLETED hook + flag), `models/Order.js` (additive `stockDeductionId` only).
- **New/Modified (Expo):** `src/api/inventoryService.js`, `src/utils/inventoryUtils.js` (+ test), `src/screens/Inventory/*`, `src/navigation/RootNavigator.js` (+`AppDrawerContent.js`), `src/screens/ReviewsAnalytics/AnalyticsTab.js`.
- **Deferred (Phase 9C):** `models/{Supplier,Purchase,Wastage}.js`.

### Tests
- Pure logic: `node --test server/utils/inventoryUtils.test.js`; Expo `node --test src/utils/inventoryUtils.test.js` (conversion math, balance math, key builder, recipe requirements, validation).
- Endpoint (requires adding devDeps `supertest` + `mongodb-memory-server`): CRUD shapes; duplicate → 400; delete-referenced → 400; **INSUFFICIENT_STOCK → 409 with short list**; `Promise.all` of N identical deducts → exactly one `$inc`, one ledger row (idempotency/concurrency); missing/invalid `x-admin-key → 401`; legacy: `orderUtils`/`menuUtils`/`billingUtils` tests still pass.
- Expo: `npx expo lint`, `npx expo-doctor`, `npx expo export --platform android`.

### Rollback risks
- **Low.** All collections are additive; nothing touches existing data. `stockDeductionId` additive with default-absent. Deduction gated by env flag (`INVENTORY_DEDUCTIONS=off`) so Step E activates in isolation; reverting = remove route mounts + set flag off. `deduct-order` is deterministic/idempotent, so misbehavior is correctable by replaying ledger from scratch (reconcile endpoint). Serverless/Express: `api/index.js` auto-includes new routes via `../server`.
- Caution: call the deduct hook **after** the status write commits, and never inside the socket broadcast section, so an emission failure can't cause a skipped deduction.

---

## 12. Integration risks — menu, orders, billing

- **Menu:** adding a `Recipe` collection keeps `GET /items` byte-shape compatible. If anyone later adds `costPrice`/stock to `Item`, the customer projection must keep excluding it (pattern already exists at `itemController.js:26`). Do **not** block item delete while a recipe references it silently — return a clear 400 (or hard-delete recipe with the item after owner confirmation).
- **Orders:** the hook runs inside `updateOrderStatus`; risk that a parallel `updateOrder` (`CHANGED`) mutates `items[]` between the read and deduction. Mitigation: re-fetch the final order inside the hook and deduct from the **stored** `items[]` at `COMPLETED` (order is terminal there, so no race window remains).
- **Socket:** no changes needed; deduction produces no new broadcast. If a "stock warning" toast is desired later, emit a dedicated `stockAlert` event — do not piggyback `newOrder`/`sessionOrderUpdate` (the Expo app de-dupes those already).
- **Billing:** currently preview-only, so billing never triggers deduction — that's fine and consistent. When POS order persistence arrives (documented as a needed backend path, `billing-implementation.md:88-91`), it must use the same `POST /api/orders` family or the order-hook so deductions remain single-sourced.
- **Analytics:** the gap card at `AnalyticsTab.js:265-273` must be replaced by real ledger data only after Phase 9C supplier spend exists; until then keep the honest "no purchase records" wording (revenue − purchases ≠ profit).
- **Status enum quirk:** keep using legacy `Preparing`/`Ready` casing; never add uppercase `PREPARING`/`READY` to the enum in this phase.

---

## 13. Blockers and decisions requiring owner approval

1. **Authentication mechanism** (required before any inventory **write** ships): approve the minimal `x-admin-key` header middleware vs. a fuller token/JWT initiative. Also approve **not** retrofitting auth to existing legacy mutations in this phase.
2. **Stock-deduction point:** approve `COMPLETED` (recommended, terminal, no reversal path) vs. `ACCEPTED` (kitchen-start, needs reversal on cancel/change).
3. **Insufficient-stock policy:** approve **block-with-409 default** + opt-in `allowedOversell` per ingredient.
4. **v1 purchase scope:** approve "purchases = ledger `PURCHASE` movements (no Supplier/Purchase collections)" with Supplier/Wastage/Reporting deferred to Phase 9C.
5. **Transactions:** approve the **atomic-$inc + idempotency-key** design over multi-doc transactions (dev Mongo is standalone; no replica set guarantee).
6. **Test dependencies:** approve adding `supertest` + `mongodb-memory-server` as server devDependencies (repo currently has none) so endpoint/idempotency tests can run without touching the production DB.
7. **Public seed routes:** approve guarding (`/api/items/seed`, `/api/coupons/seed`) as part of inventory hardening, or leave untouched.
8. **Expo Inventory surface:** approve adding an **8th drawer destination** and the placement of the admin key in a staff-only build config.

**Final status: `READY FOR OWNER REVIEW`** — audit complete, read-only, nothing modified. Awaiting explicit approval before any implementation.