# Gola Restaurant — Implementation Progress Tracker

Live status for the Inventory & Stock build (Phase 10). "Implemented" means working code + tests were completed in `server/` and `gola-expo-preview/`. Design documents are **not** counted as implemented.

Last updated: 2026-10-10

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