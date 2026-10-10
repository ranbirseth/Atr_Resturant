# Gola Restaurant — Phase 10: Inventory & Stock Implementation Report

> Implementation report for the Inventory (item master) and Stock (movement/operations) modules. Backend in `server/`, Expo app in `gola-expo-preview/`, report in `docs/`. Protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) were **not modified**. No auth/login was built, per the owner's explicit decision — the write endpoints are intentionally unauthenticated (risk documented in §7).

- **Date:** 2026-10-10
- **Status:** Implemented and tested. Backend endpoint + util tests green. Expo lint clean. Pending tablet visual check.
- **Design basis:** `docs/audits/inventory-feature-audit.md`, `docs/audits/inventory-auth-design-review.md` (per-cycle usage, explicit purchase status, `OPENING/RESTOCK/CONSUMPTION/ADJUSTMENT` movements, immutable ledger, atomic `$inc` + idempotency).

---

## 1. Files created or changed

### Backend — created (`server/`)
| File | Purpose |
|---|---|
| `utils/inventoryUtils.js` | Pure, Mongoose-free helpers: unit allowlist (`kg, g, litre, ml, pieces, packets`), normalized `nameKey`, input validators (ingredient + movement), usage%/suggested-qty math, stock status, stock filter. |
| `utils/inventoryUtils.test.js` | 13 unit tests for the above. |
| `models/Ingredient.js` | Inventory item master: `name`, `nameKey` (unique), `unit` (enum), `minimumStockLevel`, `expectedDemand`, `isActive`, `currentQty` (materialized balance), `purchaseStatus` (NONE/NEEDED/ORDERED/COMPLETED), `latestCycleId`. |
| `models/StockMovement.js` | Immutable append-only ledger: signed `quantityDelta`, unit snapshot, `movementDate`, note, `cycleId`, unique sparse `idempotencyKey`, `createdBy`. `pre('save')` rejects edits; no update/delete route. |
| `models/StockCycle.js` | Per-cycle usage tracking: `baselineQty`, `restockedQty`, `carriedOverQty`, status OPEN/CLOSED, closed `finalUsagePercent`. Unique `(ingredientId, cycleNumber)`. |
| `controllers/inventoryController.js` | All Inventory + Stock business logic (see §2). |
| `routes/inventoryRoutes.js` | `GET/POST /ingredients`, `PUT /ingredients/:id`, activate/deactivate, purchase-status, stock list, movements, cycles, reconcile. |
| `tests/inventory.api.test.js` | 12 integration tests against a dedicated local test DB (`gola_inventory_test`). |

### Backend — modified
| File | Change |
|---|---|
| `server.js` | Mounted `app.use('/api/inventory', require('./routes/inventoryRoutes'))`. |
| `package.json` | Added `"test": "node --test \"utils/*.test.js\" \"tests/*.test.js\""`. No new dependencies. |

### Expo — created (`gola-expo-preview/`)
| File | Purpose |
|---|---|
| `src/api/inventoryService.js` | Thin `apiClient` wrapper for every inventory/stock endpoint. |
| `src/utils/inventoryUtils.js` | Pure CommonJS helpers (testable in Node): form validators, `parseDateInput` (backdated dates allowed, default today), `filterStockList`, usage/suggested math, error mapping. |
| `src/utils/inventoryUtils.test.js` | 11 unit tests. |
| `src/screens/Inventory/InventoryScreen.js` | Item master: search, responsive list, add/edit, deactivate/activate, status chips, current qty, suggested buy, purchase label. |
| `src/screens/Inventory/IngredientFormModal.js` | Add/edit form: name, unit chips, minimum level, expected demand, active switch, optional opening quantity (create only). |
| `src/screens/Stock/StockScreen.js` | Stock ops: All/Available/Low Stock/Out of Stock/Need to Buy filters, search, per-card qty + usage% bar + status badges + suggested buy, Consume/Restock/Adjust, purchase-state actions, History. |
| `src/screens/Stock/MovementModal.js` | Consumption / restock / adjustment form with quantity, date (YYYY-MM-DD, default today, backdating allowed), note. |
| `src/screens/Stock/HistoryModal.js` | Movement history (opening/restock/consumption/adjustment with signed deltas) + usage-cycle list. |

### Expo — modified
| File | Change |
|---|---|
| `src/navigation/RootNavigator.js` | Added two drawer destinations: **Inventory** (`cube-outline`) and **Stock** (`layers-outline`). |
| `src/navigation/AppDrawerContent.js` | Footer updated to `Gola Restaurant · Admin` (was stale "Phase 2"). |

### Docs — created/updated (`docs/`)
| File | Change |
|---|---|
| `docs/implementation/inventory-stock-implementation.md` | This report. |
| `docs/implementation/implementation-progress-tracker.md` | Live implementation progress tracker. |
| `docs/README.md` | Registered I7 and the tracker in the index. |

---

## 2. Backend endpoints implemented

All under `/api/inventory` — **unauthenticated** (explicit owner decision).

| Method & path | Behaviour | Status codes |
|---|---|---|
| `GET /api/inventory/units` | Fixed unit catalog (kg, g, litre, ml, pieces, packets) | 200 |
| `GET /api/inventory/ingredients?query=&active=` | List/search inventory items, enriched with status/suggested qty | 200 |
| `GET /api/inventory/ingredients/:id` | Single item | 200 / 404 |
| `POST /api/inventory/ingredients` | Create item (+ optional `openingQty` → OPENING movement + open cycle). Duplicate normalized name rejected | 201 / 400 |
| `PUT /api/inventory/ingredients/:id` | Edit name/unit/minimum/expectedDemand/isActive. Unit change blocked once movements exist | 200 / 400 / 404 |
| `POST /api/inventory/ingredients/:id/activate` · `/deactivate` | Soft activate/deactivate (history kept) | 200 / 404 |
| `POST /api/inventory/ingredients/:id/purchase-status` | Set `NONE`/`NEEDED`/`ORDERED`. `COMPLETED` rejected here — use restock | 200 / 400 / 404 |
| `GET /api/inventory/stock?filter=all\|available\|low\|out\|need-to-buy&query=` | Current stock with `usagePercent`, `baselineQty`, `suggestedQty`, independent status flags | 200 |
| `GET /api/inventory/stock/balance` | Alias of `/stock` | 200 |
| `POST /api/inventory/stock/movements` | Record OPENING/RESTOCK/CONSUMPTION/ADJUSTMENT. Atomic conditional `$inc`; consumption beyond balance → 409 w/ available qty; unit mismatch → 400; idempotency key dedupes | 201 / 200(dup) / 400 / 404 / 409 / 500 |
| `GET /api/inventory/stock/movements?ingredientId=&type=&from=&to=&limit=` | Append-only paginated history | 200 |
| `GET /api/inventory/stock/cycles?ingredientId=` | Usage cycles, newest first | 200 |
| `POST /api/inventory/stock/reconcile {fix?}` | Recomputes balances from the ledger and reports any drift (optionally fixes) | 200 |

**Key invariants**
- Ledger is the source of truth; `Ingredient.currentQty` is a materialized balance updated with atomic `$inc`.
- Negative movements use `findOneAndUpdate({_id, currentQty: {$gte: qty}}, {$inc:{-qty}})` — a failed match returns `409 INSUFFICIENT_STOCK` and changes nothing.
- Restock closes the open cycle (freezing final usage%) and opens a new one with `baseline = carriedOver + restocked`; sets `purchaseStatus=COMPLETED` when a purchase was pending.
- Replay protection: unique sparse `idempotencyKey` on `StockMovement`; races are caught by E11000 → balance compensated + already-processed returned.
- Movement documents are immutable (`immutable:true` semantics via `pre('save')` guard; no PUT/DELETE routes).

---

## 3. Inventory screen functionality (Expo)

- Drawer destination **Inventory** — list of all inventory items with name, unit, minimum stock level, expected demand, **current quantity**, and a status chip (Available / Low Stock / Out of Stock / Inactive).
- Search box + responsive grid (1/2/3 columns from tablet width).
- **Add Item**: modal form with name, unit chips (correct units never mixed), minimum stock level, expected demand, active switch, optional opening quantity.
- **Edit**: same form pre-filled; unit change becomes an API error if movements already exist.
- **Deactivate / Activate** with confirmation; history is preserved.
- Loading, error+retry, and empty states; server validation messages shown in-form.

## 4. Stock screen functionality (Expo)

- Drawer destination **Stock** — shows real quantities, usage % for the current cycle (progress bar), baseline, `suggestedQty`, and independent badges: Low Stock / Out of Stock / Need to Buy.
- Filters: **All, Available, Low Stock, Out of Stock, Need to Buy** + search (client-side mirror of the server filter).
- **Record consumption**: quantity + date (defaults to today, backdating allowed) + note. Over-consumption surfaces the server's `409 INSUFFICIENT_STOCK` message (quantity is never deducted).
- **Restock**: added quantity + date + note; starts a new usage cycle; auto-completes a pending purchase (`ORDERED`/`NEEDED → COMPLETED`).
- **Adjust**: signed correction that never opens a new cycle.
- **Purchase states**: `Need to Buy` → `Mark Ordered` → `Complete (Restock)`; state chip shown per item.
- **History**: modal lists every movement (opening/restock/consumption/adjustment with signed deltas, dates, notes) plus past usage cycles with their final usage %.
- Double-tap protection: each movement submit carries an `idempotencyKey` generated when the modal opens; the server applies it exactly once.

---

## 5. Dependencies

**None installed.** Backend tests use Node's built-in `node --test` runner and `fetch`; the API tests connect to a **dedicated local test database** (`gola_inventory_test`) instead of `mongodb-memory-server`, so no new packages were needed. The only function added to the backend was the `test` script.

---

## 6. Tests actually executed and results

### Backend (`server/`)
Run with `npm test` (= `node --test "utils/*.test.js" "tests/*.test.js"`):

- `utils/inventoryUtils.test.js` — 13/13 pass (name normalization, unit allowlist, rounding, usage %, suggested qty, stock status, ingredient/movement validation, movement deltas, stock filters).
- `utils/menuUtils.test.js`, `utils/couponUtils.test.js` — pass (regression, unchanged).
- `tests/inventory.api.test.js` — 12/12 pass against the local test DB: unit catalog; create validation + duplicate (case/whitespace-insensitive) → 400; opening qty seeds balance + OPENING movement + open cycle; consumption reduces balance + logs movement; **insufficient stock → 409 and balance unchanged**; restock closes cycle at 60% usage and opens a new accumulated baseline; purchase states NEEDED→ORDERED, direct COMPLETED rejected, restock completes; **idempotency applies once**; **20 concurrent consumes of qty 1 vs 10 available → exactly 10 succeed, 10 → 409, balance 0**; unit mismatch → 400; movements can't be edited/deleted; reconcile reports zero drift; stock filters work.

Result: **50/50 pass, 0 fail.**

### Expo (`gola-expo-preview/`)
- `node --test "src/utils/*.test.js"` → **99/99 pass** (86 pre-existing + 11 new inventory utils).
- `npx expo lint` → **0 errors, 4 pre-existing warnings** (all in untouched files: `apiClient.js`, legacy `Category/Menu/Settings` screens).

**Not run**: `npx expo export` / `expo-doctor` / on-tablet visual check (no device/emulator in this environment). The navigation change is additive and mirrors the existing 7-screen drawer.

---

## 7. Security note (owner awareness)

All Inventory & Stock **read and write** endpoints are **unauthenticated**, per the owner's explicit instruction. This means anyone who can reach the API can create items, post movements, and alter balances without a credential. This matches the existing behavior of `/api/items`, `/api/categories`, and `/api/orders` on this codebase, but stock balances are operationally sensitive. Recommended hardening (not done here, out of scope): gate writes behind a header or session (e.g. `x-admin-key`), never ship DB credentials in the mobile bundle, and rotate the placeholder `ADMIN_SECRET_CODE`.

---

## 8. How to run

**Backend** (needs local MongoDB, port 27017):
1. `cd server`
2. `npm install` (if not already), then `npm run dev` (or `npm start`)
3. Server listens on `http://localhost:5000`; verify `GET http://localhost:5000/api/inventory/units`.
4. `npm test` → runs all util + API integration tests.

**Expo Go tablet**:
1. `cd gola-expo-preview`
2. Set the API base in `src/api/config.js`: the tablet must reach the machine running the server. For a physical tablet on the same Wi-Fi, set `currentBaseUrl = PRESETS.lan` and update the LAN IP; for a USB-tethered dev box, use `localhost`; for the deployed Render backend, keep `production`.
3. `npx expo start`, then scan the QR / open in Expo Go.
4. Open the **hamburger menu (top-left)** → the drawer now has **Inventory** and **Stock** entries between "Menu & Categories" and "Users & Coupons".

---

## 9. Remaining / not in this version

- Supplier, purchase invoice, recipe/BOM, and wastage modules — explicitly out of scope (Phase 9C).
- Automatic stock deduction from restaurant orders — explicitly out of scope: orders do not touch stock.
- A `Stock` **adjust** entry point exists on the card; a "wastage" label for adjustments is intentionally not added.
- Unit conversion between compatible units (e.g. kg↔g) is **not** silently performed — each item uses one unit and movements in another unit are rejected with a clear error.
- Real auth/hardening for inventory writes (see §7).
- Tablet visual check, `expo-doctor`, and Android bundle export remain to be run on a device.