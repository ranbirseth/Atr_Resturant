# Gola Restaurant — Implementation Progress Tracker

Live status for the Inventory & Stock build (Phase 10). "Implemented" means working code + tests were completed in `server/` and `gola-expo-preview/`. Design documents are **not** counted as implemented.

Last updated: 2026-10-10

---

## P1.1 (2026-10-10): Backend Automatic Staff Pricing (60% of customer price)

See [P1.1 report](../audits/README.md) §C.0. Overall: `IMPLEMENTED — BACKEND COMPLETE, AWAITING OWNER REVIEW`. Landed in `server/` + `docs/` only; **no Expo UI change, no protected directory touched, no data migration/reseed, no new dependencies**.

### Completed
| # | Item | Evidence |
|---|---|---|
| P1 | `computeStaffPrice(price) = Math.round(price * 0.6 * 100) / 100` as the single pricing source; order builder never reads legacy stored `staffPrice` | `server/utils/menuUtils.js` |
| P2 | `staffPrice` removed from `ITEM_WRITABLE_FIELDS` + `validateItemInput` — client-supplied `staffPrice` is ignored | `server/utils/menuUtils.js` |
| P3 | `Item.staffPrice` no longer required on create; legacy docs stay readable/editable (field kept, not migrated/deleted) | `server/models/Item.js` |
| P4 | STAFF `GET /api/items?audience=staff` exposes derived 60% staffPrice; customer responses unchanged (staff fields still projected out) | `server/controllers/itemController.js` |
| P5 | STAFF availability (`availableForStaff`), `staffVisible` category filtering, coupon rules, and bill snapshots unchanged except the derived price | derived in `server/utils/menuUtils.js`; coupons/bills untouched |
| P6 | Server tests green: **101/101** (`node --test "utils/*.test.js" "tests/*.test.js"`); new `tests/items.api.test.js` (6) on dedicated `gola_items_test` DB; `menuUtils` unit coverage 23 | recorded in `docs/audits/README.md` §C.0.3 |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Owner review of the P1.1 report | P1.2–P1.5 (Expo UI) NOT started; begins only after approval |
| 2 | Production deploy (Render) of the derived-pricing backend | Also still pending: Phase 2B `/api/billing` + `ORDER_ALREADY_BILLED` guard |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | Expo Menu/Billing UI: remove manual staff-price field, derive display, add Customer/Staff bill selector, direct-bill path | P1.2–P1.5, explicitly out of scope for P1.1 |
| 2 | Optional data cleanup of inert legacy `staffPrice` values | Deferred by design; field harmless and preserved |

---

## Orders — Phase 2B (2026-10-10): Bills & Payments (server + Expo)

See [Phase 2B report](../audits/README.md) §B.0. Overall: `IMPLEMENTED — SERVER + EXPO UI COMPLETE, AWAITING OWNER/PRODUCTION REVIEW`. Landed in `server/` + `gola-expo-preview/` + `docs/` only; **no protected directory touched; no new dependencies**.

### Completed
| # | Item | Evidence |
|---|---|---|
| B1 | Persistent bill model: `Bill` (immutable snapshot, sparse-unique `payments.paymentId`), `OrderLock` (per-order mutex; TTL on TRANSITION only), shared `Counter` (`BILL-YYYYMMDD-NNNN`) | `server/models/{Bill,OrderLock,Counter}.js` |
| B2 | Pure helpers: billable set, `computeBillTotals`, paise↔rupees, `derivePaymentStatus`, PII-free `toBillDTO`, payment/void validation | `server/utils/billingUtils.js` |
| B3 | `/api/billing` controller + router mounted in `server.js` (generate, read, payment, reverse, void, resume) | `server/controllers/billingController.js`, `server/routes/billingRoutes.js` |
| B4 | OrderLock guard wired into `updateOrderStatus` + `updateOrder` → cancels/changes blocked `409 ORDER_ALREADY_BILLED` once billed | `server/controllers/orderController.js` |
| B5 | Crash recovery: `REVERSING` payloads resume reversals; `VOIDING` recoverable via resume; reconcile never drops OPEN/SETTLED/VOIDING bill locks | `server/models/Bill.js` |
| B6 | Server tests green: **90/90** (`node --test "utils/*.test.js" "tests/*.test.js"`), dedicated `gola_billing_test` DB; harness re-runs `syncIndexes()` after `dropDatabase()` | `server/utils/billingUtils.test.js`, `server/tests/billing.api.test.js` |
| B7 | Expo API wrappers over `/api/billing` (404-safe until deploy; errors keep `status`/`data`) | `gola-expo-preview/src/api/billService.js` |
| B8 | Expo pure helpers + 16 unit tests (status/paymentStatus chips, method labels, `pickPrimaryBill`, canPay/void/reverse, amount validation, error-code mapping) | `gola-expo-preview/src/utils/billUtils.js` + `billUtils.test.js` |
| B9 | `BillModal`: generate / summary (number, chips, total/paid/balance) / payment list + per-payment Reverse / Record-Payment (method chips) / Resume / Void | `gola-expo-preview/src/components/orders/BillModal.js` |
| B10 | Card + details wire-up: `SessionOrderCard` bill row, `SessionDetailsModal` Billing box, `OrdersScreen` `billBySession` cache + modal open | `gola-expo-preview/src/{components/orders, screens/Orders}/...` |
| B11 | Verify: Expo utils **122/122**, `npx expo lint` **0 errors**; project-wide | 2026-10-10 |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Owner smoke test on **live deploy** (deploy first — `/api/billing` does not exist in production yet): generate → pay → reverse → settle → void on the tablet | Requires Render deploy per `RAILWAY_DEPLOYMENT.md` / `QUICK_DEPLOY.md` |
| 2 | Physical tablet visual check of `BillModal` (amounts, method chips, badges, 409 banners) | No device in this environment |
| 3 | Auth for `/api/billing` writes | Owner explicitly wants no login; open-write risk documented (consistent with rest of admin API) |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | Print/PDF from the tablet | Web admin already prints client-side (jsPDF, protected/untouched); a server-side printable receipt (phase 2A F1 resolution) can reuse the Bill snapshot later |
| 2 | Retire the dead `resturent-billing` backend (2A F11) | Phase 2B makes it redundant; owner/ops action |

---

## Final Polish — Phase 1B: backend fixes

See [Phase 1B report](../audits/README.md). Overall: `IMPLEMENTED — BACKEND COMPLETE, AWAITING OWNER REVIEW`. Tests: `server/npm test` → **59/59 pass** (13→20 unit, 15→20 API).

### Completed
| # | Item | Evidence |
|---|---|---|
| B1 | Purchase price stored: `Ingredient.purchasePrice`, `StockMovement.unitCost` | `server/models/*.js` |
| B2 | Opening purchase cost/note/`createdBy` captured (no longer hardcoded) | `createIngredient` + `inventoryUtils.js` |
| B3 | 75%-used alert: `usageAlert` + `remainingPercent` on every stock row | `stockRow`, `isUsageAlert`/`computeRemainingPercent` |
| B4 | Duplicate concurrent RESTOCK fixed via reserve-first idempotency (`RESERVED`→`COMMITTED`) + full compensation (reopen closed cycle, revert item fields) | `recordMovement` |
| B5 | `GET /api/inventory/analytics` (additions/consumption/adjustment, per-item, purchase suggestions) | `inventoryController.js`, `inventoryRoutes.js` |
| B6 | `GET /api/inventory/alerts` (usage/low/out/need-to-buy) | `inventoryController.js`, `inventoryRoutes.js` |
| B7 | Backend regression tests for all of the above | `utils/inventoryUtils.test.js`, `tests/inventory.api.test.js` |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| B8 | Expo UI: consolidate Inventory+Stock into one `Inventory & Stock` destination; add price/note inputs; consume `usageAlert` | ✅ Completed in Phase 1C below |
| B9 | Verify Render production deployment includes inventory routes | ✅ Verified in Phase 1C: `units`/`alerts`/`analytics` → 200 |

---

## Final Polish — Phase 1C: Expo Inventory & Stock integration

See [Phase 1C report](../audits/README.md). Overall: `IMPLEMENTED — EXPO UI COMPLETE, AWAITING OWNER/PRODUCTION REVIEW`. UI targets the live admin base URL `https://atr-resturant.onrender.com/api`; production endpoints verified reachable with Phase 1B fields.

### Completed
| # | Item | Evidence |
|---|---|---|
| C1 | InventoryService exposes `getAnalytics` + `getAlerts` | `gola-expo-preview/src/api/inventoryService.js` |
| C2 | Pure helpers: `formatPrice`, `formatPercent`, price-field validation (purchasePrice/openingUnitCost/unitCost) | `src/utils/inventoryUtils.js` (+103 utils tests pass) |
| C3 | Item form supports `purchasePrice`, `openingUnitCost`, `openingNote` on create; price on edit; item list shows purchase price + 75%-used alert | `src/screens/Inventory/IngredientFormModal.js`, `InventoryScreen.js` |
| C4 | Movement modal: `unitCost` for RESTOCK, one idempotency key per modal open, `saving` guard | `src/screens/Stock/MovementModal.js` |
| C5 | Stock list shows distinct `75% Used` (cycle) vs `Low Stock` (min level) badges + `remainingPercent` | `src/screens/Stock/StockScreen.js` |
| C6 | History modal shows per-unit cost on movements; app-wide Movements section | `src/screens/Stock/HistoryModal.js`, `src/screens/InventoryStock/HistorySection.js` |
| C7 | Alerts & Suggestions section from live `/alerts` + `/analytics` (75% vs min-stock kept separate, no client re-derived threshold) | `src/screens/InventoryStock/AlertsSection.js` |
| C8 | One `Inventory & Stock` drawer destination with four in-screen sections; other destinations untouched | `src/screens/InventoryStock/InventoryStockScreen.js`, `src/navigation/RootNavigator.js` |
| C9 | Verify: `node --test src/utils/*.test.js` → 103 pass; `npx expo lint` → 0 errors; `npx expo export --platform android` → bundle built | commands above |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Physical tablet visual check of combined screen + sections | Requires physical tablet/Expo Go; not available in this environment |
| 2 | `expo-doctor` (dependency/diagnostic sweep) | Recommended on a workstation with device tooling |
| 3 | `npx tsc --noEmit` | No `tsconfig.json` in this project; typecheck unavailable unless one is added |

### Remaining (out of scope for this version)
| # | Item | Notes |
|---|---|---|
| 1 | OEM review of backend write endpoints found during Phase 1C | No backend defects found in this phase; none deferred for review |
| 2 | Supplier / purchase-invoice / recipe-BOM / wastage modules | Phase 9C, explicitly deferred |
| 3 | Auto stock deduction from restaurant orders | Explicitly not wanted in this version |
| 4 | Cross-unit conversion (kg↔g) | Deliberately not implemented — units never silently mixed |
| 5 | Auth / hardening for inventory write APIs | Owner explicitly requested **no login**. Open-write risk documented in `inventory-stock-implementation.md` §7 |
| 6 | Credential rotation (`ADMIN_SECRET_CODE`, `server/test.js`) | Owner/ops action, documented in earlier audits |

---

## Final Polish — Phase 1D: Simplify Inventory & Stock UI

See [Phase 1D report](../audits/README.md) (§D.0–D.1). Overall: `IMPLEMENTED — SIMPLIFIED UI COMPLETE, AWAITING OWNER/PRODUCTION REVIEW`. Backend untouched; no capabilities removed.

### Completed
| # | Item | Evidence |
|---|---|---|
| D1 | One `Inventory & Stock` drawer destination, reduced to **2** sections (Inventory, Current Stock) | `src/screens/InventoryStock/InventoryStockScreen.js`, `src/navigation/RootNavigator.js` |
| D2 | Inventory = simple list + `Add Inventory` with exactly 4 fields (name, unit, total quantity, total price) | `src/screens/Inventory/InventoryScreen.js`, `AddItemModal.js` |
| D3 | Mapping: name→`name`, unit→`unit`, qty→`openingQty`, totalPrice/qty→`openingUnitCost`, hidden `minimumStockLevel:0`; `purchasePrice` never set from total | `AddItemModal.js` |
| D4 | Current Stock = simple cards (name, available, used-this-batch) + `Consume` + `Restock` only | `src/screens/Stock/StockScreen.js` |
| D5 | Consume popup (quantity + optional note); Restock popup (quantity + total price → auto unit cost) | `src/screens/Stock/MovementModal.js` |
| D6 | Balance always from backend; refresh after success; `INSUFFICIENT_STOCK` shown, no false success | `StockScreen.js` re-fetch on success |
| D7 | Pure helpers + tests: `computeUnitCost`, `computeConsumedQuantity`, `validateAddItemForm` | `src/utils/inventoryUtils.js` + test (106 total pass) |
| D8 | Removed dead UI: IngredientFormModal, HistoryModal, HistorySection, AlertsSection | files deleted |
| D9 | Verify: 106/106 unit tests, `npx expo lint` 0 errors, `npx expo export --platform android` built | commands above |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Owner smoke test of 10 L → consume 3 → restock 4 = 11 L on live deployment | Not performed here |
| 2 | Physical tablet visual check | No device in this environment |
| 3 | `expo-doctor` + `npx tsc --noEmit` | Not run (no device tooling; no tsconfig) |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | Persistent "total purchase amount" | Backend has no such field; documented limitation, backend not modified |
| 2 | Unused client helpers (`filterStockList`, `computeSuggestedQty`, `computeUsagePercent`, `validateIngredientForm`, `purchaseStatusLabel`, `STOCK_FILTERS`, `PURCHASE_STATUSES`) | Kept (tested; backend still returns those fields) — candidate prune if minimal UI stays permanent |
| 3 | Supplier / purchase-invoice / recipe-BOM / wastage modules | Phase 9C, explicitly deferred |
| 4 | Auto stock deduction from orders | Explicitly not wanted |
| 5 | Auth / hardening for inventory write APIs | Owner explicitly requested **no login** |

---

## Final Polish — Phase 1E (2026-10-10): Fix Add Inventory, 70% Usage Alert, Safe Delete

See [Phase 1E report](../audits/README.md) (§E.0–E.1). Overall: `IMPLEMENTED — ALL THREE BUGS FIXED, AWAITING OWNER/PRODUCTION REVIEW`.

### Completed
| # | Item | Evidence |
|---|---|---|
| E1 | **Add Inventory creation fixed** — missing required `minimumStockLevel` caused a 400 on every create. Four visible fields unchanged; hidden `minimumStockLevel: 0` now sent on create | `gola-expo-preview/src/screens/Inventory/AddItemModal.js` |
| E2 | **Usage alert threshold = single backend constant, 75% → 70%** (`USAGE_ALERT_THRESHOLD`); no client-side threshold exists | `server/utils/inventoryUtils.js` |
| E3 | 70% boundary verified: 69% no alert / exactly 70% alert / 80% alert / restock clears alert (cycle reset is the source of truth) | `server/utils/inventoryUtils.test.js`, `server/tests/inventory.api.test.js` |
| E4 | Current Stock cards surface backend `usageAlert` + `usagePercent` (minimal inline warning, no new section, no duplicated threshold) | `gola-expo-preview/src/screens/Stock/StockScreen.js` |
| E5 | **Safe delete API** `DELETE /api/inventory/ingredients/:id` — hard-delete only when no movements/cycles; otherwise archive (`isActive=false`, preserves ledger/cycles) with a clear message | `server/controllers/inventoryController.js`, `server/routes/inventoryRoutes.js` |
| E6 | Expo delete UX: per-card Delete + confirmation, archived/deleted feedback, error alert, list refresh, "Archived" badge on inactive items | `gola-expo-preview/src/screens/Inventory/InventoryScreen.js`, `src/api/inventoryService.js` |
| E7 | Verify: `server npm test` → **62/62** (added DELETE archive / hard-delete / 404); Expo utils **106/106**; `npx expo lint` → **0 errors**; `npx expo export --platform android` → bundle built | verified 2026-10-10 |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Owner smoke test on live deployment | Add item → consume 7/10 L (70% alert appears) → restock clears it; delete item with history → archived, not deleted |
| 2 | Physical tablet check | No device in this environment |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | Persistent "total purchase amount" | Backend has no such field; documented limitation |
| 2 | Auth / hardening for inventory write APIs | Owner explicitly requested **no login** |
| 3 | Supplier / purchase-invoice / recipe-BOM / wastage modules | Phase 9C, deferred |

---

## Orders — Phase 2A (2026-10-10): Read-Only Investigation & Audit

> **Status: READ-ONLY ORDERS AUDIT — COMPLETE, AWAITING OWNER REVIEW.**
> This phase made **NO source, database, or deployment changes** (all protected dirs read-only; `server/` and `gola-expo-preview/` unmodified). Full report: `docs/audits/README.md` §A.0–A.7. The Orders module is NOT marked "done"/"complete" — the audit only, because the bill/payment half is still missing.

### Completed
| # | Item | Evidence / Result |
|---|---|---|
| A1 | Read-only audit of the full Orders flow (customer `client/` → `POST /api/orders` → Mongo → socket + `/grouped` → web admin + Expo tablet → analytics) | Verified source reads across `client/`, `server/`, `AdminDashbord/`, `gola-expo-preview/` |
| A2 | Expo tablet Orders has **no Bill/Print/KOT** anywhere (grep confirms); `SessionOrderCard` = status actions + Cancel + View Details only | `gola-expo-preview/src/components/orders/*` |
| A3 | Web admin DOES have **Bill** (client-side jsPDF, billable = ACCEPTED-workflow) + auto-KOT print on accept via local `print-service:6001`; **bill not persisted, no payment recorded** | `AdminDashbord/src/pages/Orders.jsx`, `SessionOrderCard.jsx`, `orders/print-success` |
| A4 | No payment/bill model or field exists (`paymentStatus`/`isPaid` absent; models = User, Order, Coupon, Feedback, Category, Item) | `server/models/Order.js`, `billing-implementation.md` §1.1 |
| A5 | Findings documented (F1–F12) with severity/classification/file+line evidence; ordered implementation plan + risks included | `docs/audits/README.md` §A.3–A.6 |
| A6 | Verified existing tests still green: server `npm test` **62/62**; Expo utils **106/106**; live read-only GETs (main API `200`; `resturent-billing.onrender.com` unreachable) | 2026-10-10, local, no production data touched |

### Awaiting owner decision (next implementation phase — NOT started)
| # | Item | Notes |
|---|---|---|
| 1 | Decide bill semantics: itemised printable receipt vs recorded/paid transaction (defines F1 fix) | See `docs/audits/README.md` §A.4, A.6 |
| 2 | Add Bill action to Expo tablet Orders (`SessionOrderCard`/`SessionDetailsModal`) once a server bill/settle endpoint exists | Requires backend deploy |
| 3 | Fix F4/F5 (order API auth + authoritative `updateOrder`), F6 (analytics status filter), F7/F8 (uppercase status maps/enum), F9 (order-flow tests), F10/F11 (share `+91`, retire dead billing backend) | Prioritised in report §A.4 |

---

## Inventory & Stock (Phase 10)

### Completed
| # | Item | Evidence |
|---|---|---|
| 1 | Backend pure helpers (`inventoryUtils.js`) | `server/utils/inventoryUtils.js` (+ 13 unit tests pass) |
| 2 | Mongoose models: `Ingredient`, `StockMovement`, `StockCycle` | `server/models/*.js` |
| 3 | Inventory item master API: list/search, create, edit, deactivate | `GET/POST/PUT /api/inventory/ingredients*` |
| 4 | Duplicate normalized-name rejection, required/non-negative validation | unit + API tests pass |
| 5 | Stock movement API: OPENING/RESTOCK/CONSUMPTION/ADJUSTMENT with atomic `$inc` | `POST /api/inventory/stock/movements` |
| 6 | Insufficient-stock guard (409, balance unchanged) | API test pass |
| 7 | Restock closes cycle + opens new one; usage% math | API test pass (60% close, accumulated baseline) |
| 8 | Purchase states NONE/NEEDED/ORDERED/COMPLETED | `purchase-status` route + restock completion; API test pass |
| 9 | Idempotency (unique `idempotencyKey`) | API test pass |
| 10 | Concurrency safety (20 parallel vs 10 stock → exactly 10 succeed) | API test pass |
| 11 | Unit-mismatch rejection (no silent mixing of kg/litre/…) | API test pass |
| 12 | Reconcile endpoint (ledger drift detection) | API test pass (zero drift) |
| 13 | Immutable ledger (no PUT/DELETE on movements) | API test pass |
| 14 | Routes mounted in `server.js`; `npm test` script | `server/server.js`, `server/package.json` |
| 15 | Expo API client `inventoryService.js` | `gola-expo-preview/src/api/inventoryService.js` |
| 16 | Expo pure helpers + tests | `gola-expo-preview/src/utils/inventoryUtils.js` (11 tests pass) |
| 17 | **Inventory screen** (list, search, add, edit, deactivate, status, current qty) | `src/screens/Inventory/*` |
| 18 | **Stock screen** (filters, consume, restock, adjust, purchase states, usage %, suggested buy, history) | `src/screens/Stock/*` |
| 19 | Two drawer destinations added (Inventory, Stock) | `src/navigation/RootNavigator.js` |
| 20 | Expo lint clean (0 errors) | `npx expo lint` |
| 21 | Implementation report + tracker | `docs/implementation/*` |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Tablet visual check of Inventory + Stock screens | Requires physical tablet/Expo Go; not available in this environment |
| 2 | `expo-doctor` + Android bundle export | Recommended on a workstation with device tooling |

### Remaining (out of scope for this version)
| # | Item | Notes |
|---|---|---|
| 1 | Supplier / purchase-invoice / recipe-BOM / wastage modules | Phase 9C, explicitly deferred |
| 2 | Auto stock deduction from restaurant orders | Explicitly not wanted in this version |
| 3 | Cross-unit conversion (kg↔g) | Deliberately not implemented — units never silently mixed |
| 4 | Auth / hardening for inventory write APIs | Owner explicitly requested **no login**. Open-write risk documented in `inventory-stock-implementation.md` §7 |
| 5 | Credential rotation (`ADMIN_SECRET_CODE`, `server/test.js`) | Owner/ops action, documented in earlier audits |

---

## Earlier phases (reference)

| Phase | Deliverable | Status |
|---|---|---|
| 1–8 | Printer audit, dashboard, orders, navigation, menu/dual-pricing, coupons, analytics, billing | Done (see `docs/README.md`, reports I1–I6) |
| 9 | Inventory audits 9A → 9A.3 | Audit/design only — superseded by Phase 10 implementation |