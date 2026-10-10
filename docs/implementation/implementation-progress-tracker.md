# Gola Restaurant — Implementation Progress Tracker

Live status for the Inventory & Stock build (Phase 10). "Implemented" means working code + tests were completed in `server/` and `gola-expo-preview/`. Design documents are **not** counted as implemented.

Last updated: 2026-10-10

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