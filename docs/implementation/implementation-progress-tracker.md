# Gola Restaurant — Implementation Progress Tracker

Live status for the Inventory & Stock build (Phase 10). "Implemented" means working code + tests were completed in `server/` and `gola-expo-preview/`. Design documents are **not** counted as implemented.

Last updated: 2026-10-12

---

## P1.3 (2026-10-11): Design Plan — READY FOR OWNER REVIEW

See the plan in [audits §C.3 + corrections §C.3.1](../audits/README.md) and the review checklist in [P1.3 checklist report](../audits/p1.3-design-approval-checklist.md) (separate file). Overall: `P1.3 DESIGN PLAN READY FOR OWNER REVIEW — NO CODE CHANGES`. Read-only design review: **no source/schema/API/DB change, no protected directory touched, no new dependencies, no production writes**. Carried-forward green baselines: server `101/101` (P1.1), Expo utils `126/126` (P1.2) — not re-run.

### Approval checklist (owner's 10 items) — post-correction
| # | Item | Result |
|---|---|---|
| 1 | Backward-compatible SESSION + POS schemas | PASS |
| 2 | Immutable audience/snapshots/quantities/integer-paise money | PASS — clarified code-path-enforced, not DB-level; regression test added (§C.3.1.2) |
| 3 | Staff 60% + two-decimal rounding + no staff coupon | PASS |
| 4 | Preserve existing orders/bills/payments/snapshots | PASS |
| 5 | Atomic claiming, mixed-audience reject, partial billing, re-bill after void/reversal | PASS |
| 6 | POS bill with no fabricated customer order | PASS |
| 7 | Idempotent retries + same-key/different-hash rejection | PASS |
| 8 | Payment/reversal/void/resume recovery for both origins | PASS |
| 9 | Separate finalized-bill analytics vs legacy order metrics | PASS — analytics contract added as §C.3.1.1; finalized-status set remains an OWNER DECISION |
| 10 | Tests, index creation, migration safety, rollback, regression | PASS |
| G2 | Tracker/report §C.3 §10 consistency | CLOSED — reconciled here (§C.3.1.3) |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Owner decisions Q1–Q5 (§C.3 §8) + analytics date/time-zone basis (§C.3.1.4) | Required before implementation |
| 2 | Approval gates G1–G4 (§C.3 §8) | No implementation until all pass; G5 = stop before deploy |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | P1.3 implementation (audience pricing, POS bill, idempotency, bill analytics) | Blocked on owner decisions + gates; not started |

---

## P1.3 (prior audit): STOPPED BY DESIGN — DESIGN REPORT ONLY

Superseded by the checklist entry above. See [P1.3 audit report](../audits/README.md) §C.2. Audit only: **no source/schema/API change, no protected directory touched, no new dependencies, no production writes**.

### Completed
| # | Item | Evidence |
|---|---|---|
| P1 | Traced the real bill-generation path: persisted Phase 2B bill = verbatim snapshot of pre-priced session orders; Phase 7 POS screen = non-persisted preview | `billingController.js:152,155`; `billingUtils.js:105,110`; `billService.js:20`; `BillingScreen.js:232` |
| P2 | Confirmed the billing layer has **no** audience support (schema, controller, API, tablet) | `grep audience` → none in billing files; `Bill.js:71-78`; `generateSessionBill` posts `{}` |
| P3 | Identified blocking issues: bill-time repricing desyncs bill from `Order.totalAmount`; mixed-audience sessions; intake guards not in billing; tablet has no POS order path | report §C.2.2 |
| P4 | Confirmed coupons are order-time only → unresolved business rule for a staff bill | `orderController.js:128`; `couponUtils.js` |
| P5 | STOPPED before any schema/API change per the phase STOP condition; produced the design report + required decisions | `docs/audits/README.md` §C.2 |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Owner decisions required (D1–D4 in §C.2.7): bill semantics, coupon treatment, mixed-audience handling, direct-bill scope | Blocks any P1.3 implementation |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | P1.3 implementation (Customer/Staff selector on the persisted bill) | Blocked on owner decisions + a Bill schema/API change |
| 2 | P1.4/P1.5 (tablet direct-bill / POS order path) | NOT started |

---

## P1.2 (2026-10-10): Expo Menu UI — Derived Staff Price

See [P1.2 report](../audits/README.md) §C.1. Overall: `IMPLEMENTED — EXPO UI COMPLETE, AWAITING OWNER REVIEW`. Landed in `gola-expo-preview/` + `docs/` only; **`server/` untouched, no protected directory touched, no new dependencies, no production writes**.

### Completed
| # | Item | Evidence |
|---|---|---|
| P1 | Removed the manually editable Staff Price input from the item create/edit form | `gola-expo-preview/src/screens/MenuCategories/ItemFormModal.js` |
| P2 | Added a read-only derived staff-price preview (60% of customer price, 2 dp) that updates live with the customer price | `ItemFormModal.js`; `src/utils/menuUtils.js` (`computeStaffPrice`, `formatPriceExact`) |
| P3 | `computeStaffPrice` mirrors the backend exactly (`Math.round(price*0.6*100)/100`); tests assert the same expected values as `server/utils/menuUtils.test.js` — no second conflicting rule | `src/utils/menuUtils.js`, `src/utils/menuUtils.test.js` |
| P4 | Customer price stays editable; payload no longer sends `staffPrice` (backend remains authoritative) | `ItemFormModal.js` |
| P5 | Form validation no longer requires a staff price; legacy items with a stored `staffPrice` edit without errors (`formFromItem` ignores it) | `ItemFormModal.js`, `validateItemForm` |
| P6 | Item cards show the derived staff price (`₹`, 2 dp); obsolete "Not set / needs configuring" warning + dead `hasStaffPrice` removed | `MenuManagement.js`, `src/utils/menuUtils.js` |
| P7 | Verify: Expo utils **126/126**; `npx expo lint` **0 errors** (4 pre-existing warnings in untouched files); `npx expo export --platform android` bundled | 2026-10-10 |

### In progress
| # | Item | Notes |
|---|---|---|
| 1 | Owner review of the P1.2 report | Billing UI (Customer/Staff selector, direct-bill) NOT started; begins only after approval |
| 2 | Production deploy (Render): P1.1 derived-pricing backend must ship before/with this UI | Until deployed, the live staff listing still returns the old manual field |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | Customer/Staff billing selector + direct-bill path | P1.3–P1.5, explicitly out of scope for P1.2 |
| 2 | Optional data cleanup of inert legacy `staffPrice` values | Deferred by design (unchanged from P1.1) |

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
| 1 | Owner review of the P1.1 report | Approved — P1.2 (Expo derived staff-price UI) delivered; P1.3–P1.5 NOT started |
| 2 | Production deploy (Render) of the derived-pricing backend | Also still pending: Phase 2B `/api/billing` + `ORDER_ALREADY_BILLED` guard |

### Remaining (deferred)
| # | Item | Notes |
|---|---|---|
| 1 | Expo Menu/Billing UI: remove manual staff-price field (✅ P1.2), derive display (✅ P1.2), add Customer/Staff bill selector, direct-bill path | P1.3–P1.5 remain (P1.2 done) |
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
## P1.3 (2026-10-11): IMPLEMENTATION - COMPLETED

**Status:** COMPLETED (tests passing).
**Scope (server):** Bill schema updated (origin/audience/lines/idempotency), billingUtils helpers + DTO extensions, billingController (generateBill with audience/idempotency, createPosBill, getBillAnalytics), billingRoutes added; new billing.p13.api.test.js (9 tests) + extended billingUtils.test.js; all 111 server tests pass.
**Docs:** docs/audits/README.md §C.3.2 added; docs/audits/p1.3-design-approval-checklist.md unchanged (design review).
**Safety:** isolated test DBs, backward-compatible, no protected dirs modified.

---

## P1.3 (2026-10-11): PHASE 2C FINAL BILLING INTEGRATION AUDIT - COMPLETE (READ-ONLY)

**Status:** READ-ONLY AUDIT COMPLETE - no code/DB/config/dep/deploy change. Full report: `docs/audits/README.md` section C.3.3.

**Verified findings**
- All 111 server tests pass (`npm test`: 111/111; integration files 51/51: billing.api 16, billing.p13 9, inventory.api 20, items.api 6).
- Independent pricing (CUSTOMER = menu, STAFF = 60%), coupon rules (STAFF none, CUSTOMER preserves source discount once, clamped), audience guards, session+POS idempotency (sequential), analytics (recognized vs voided, grouped, IST range), POS with no fabricated Order, and lock release only after VOID: all PASS (see checklist in C.3.3).
- No functional defect confirmed. No protected directory touched.

**Unverified concerns (fixes optional, owner-approved, separate change)**
- GAP-1 concurrent duplicate idempotency test; GAP-2 snapshot preservation across pay/reverse/void/resume; GAP-3 legacy-bill readability test; GAP-4 re-bill only after full void; GAP-5 exact IST boundary instant. Each is handled by design; only automated coverage is missing.
- Pre-existing doc corruption in C.3.2/tracker text (control chars from interpreted escapes) recommended for a separate doc-only repair.

---

## P1.3 (2026-10-11): PHASE 2C.1 BILLING REGRESSION TESTS - COMPLETE

**Status:** TESTS AND TARGETED FIXES ONLY - all five Phase 2C billing gaps now have automated regression coverage. Full server suite **118/118 pass**, confirmed on 6 consecutive runs. No production code/schema/migration/dependency/deploy change; no protected directory touched. Full report: `docs/audits/Phase2C1-billing-regression-tests.md`.

**Test results (exact):**
- `cd server; node --test "tests/billing.gaps.api.test.js"` -> **6/6 pass**.
- `cd server; node --test "tests/inventory.api.test.js"` -> **20/20 pass** (after harness fix).
- `cd server; npm test` -> **118/118 pass, 0 fail, 0 skipped** (61 util tests incl. +1 exact-IST-boundary unit test; 57 integration tests incl. +6 gaps tests) - confirmed on 6 consecutive full-suite runs.

**Coverage added:**
- GAP-1a POS concurrent idempotency - `billing.gaps.api.test.js:176` (6 parallel identical checkouts -> one bill, uniform replays; reused key/different payload -> 409).
- GAP-1b SESSION concurrent idempotency - `billing.gaps.api.test.js:220` (one session bill; retryable 409s only; single active BILL lock).
- GAP-2 immutable snapshot across payment/reversal/void/resume - `billing.gaps.api.test.js:273` (deep-equal pricing snapshot; resume stays VOID).
- GAP-3 legacy bill readability - `billing.gaps.api.test.js:340` (raw pre-P1.3 doc readable/payable/analysable; no backfill).
- GAP-4 safe re-billing - `billing.gaps.api.test.js:411` (orders released only on full void; reversal alone keeps them locked).
- GAP-5 exact IST boundaries - `billing.gaps.api.test.js:473` + `billingUtils.test.js:255` (include/exclude at exact boundary instants).

**Files changed:** new `server/tests/billing.gaps.api.test.js`; `server/utils/billingUtils.test.js` (+1 test, +1 require entry); `server/tests/inventory.api.test.js` (test-only harness fix - explicit `syncIndexes()` after the DB drop resolved an intermittent idempotency-index race exposed under 6-file parallel load; no assertion weakened). No implementation or data changes.

**Owner approval required:** approve new tests before deployment; confirm SESSION idempotency-reuse semantics are the desired contract.


---

## P1.3 (2026-10-11): PHASE 2D DOCUMENTATION REPAIR - COMPLETE (OWNER SESSION-IDEMPOTENCY DECISION RECORDED)

**Status:** DOCUMENTATION ONLY - repaired the confirmed control-character corruption in the section C.3.2 report (`docs/audits/README.md`) and the P1.3 IMPLEMENTATION entry above; recorded the owner SESSION-idempotency decision. No application code, tests, schema, configuration, dependency, database, or deployment change; no protected directory touched (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`).

**Owner decision (approved): SESSION idempotency semantics**
- Same key + same request payload returns the original bill, even if the source order later changes.
- Same key + different payload returns HTTP 409 `IDEMPOTENCY_KEY_REUSED`.
- Existing bill snapshots are not recalculated on replay.

**Repair summary:** corrupted control characters (U+0007/U+0008/U+0009/U+000B/U+000C/U+000D) replaced the intended first letters a/b/t/v/f/r; U+FFFD glyphs were restored per context (em dashes in the README C.3.2 heading, an ASCII hyphen in the tracker IMPLEMENTATION heading, and a section sign in the tracker C.3.2 reference); the split `node --test` command line was rejoined; trailing line-ending CR noise was normalized to LF. Findings, dates, test results, and report order are unchanged; no historical entry was deleted or rewritten.

**Full report:** `docs/audits/README.md` section C.3.4 (Phase 2D).

---

## P1.3 (2026-10-11): PHASE 2E CUSTOMER/STAFF SELECTION IN BILLING - COMPLETE

**Status:** IMPLEMENTED in `gola-expo-preview/` (Expo tablet UI) + documentation. The server already enforced audience (Phase 2C/P1.3); this phase adds the missing UI so an explicit Customer/Staff choice is captured and sent. No server source, schema, route, dependency, or deployment change; no protected directory touched (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`).

**Root cause:** the tablet billing UI never collected or sent the audience. The POS Billing tab (`BillingScreen.js`/`BillPanel.js`) was a local display-only preview and never called `POST /api/billing/pos/bills` (which requires `audience`); `billService` had no `createPosBill`. The session `BillModal.js` called `generateSessionBill(sessionId)` with an empty body, so `audience` was never transmitted.

**How the audience reaches the backend:**
- POS: `buildPosPayload(audience, cart)` -> `{ audience, items: [{ itemId, quantity }] }`; `createPosBill(...)` -> `POST /api/billing/pos/bills`. Creation disabled until an audience is selected (`canCreatePosBill`); server prices authoritatively.
- Sessions: `generateSessionBill(sessionId, { audience, idempotencyKey })` -> `POST /api/billing/sessions/:sessionId/bills`; server rejects `MIXED_AUDIENCE` / `AUDIENCE_MISMATCH`.

**Implemented:** mandatory Customer/Staff selector in both flows (no silent default); POS now creates real origin-`POS` bills (coupon UI removed - no POS coupon support); live audience pricing (Customer = menu, Staff = 60%); selection + fresh idempotency key reset per checkout; new `CreatedBillModal.js` renders the server DTO; `ERROR_CODES` extended for audience/POS/session errors.

**Files changed (Expo + docs only):** new `gola-expo-preview/src/utils/audienceBilling.js` and `gola-expo-preview/src/screens/Billing/CreatedBillModal.js` and `gola-expo-preview/src/utils/audienceBilling.test.js`; `gola-expo-preview/src/api/billService.js`, `gola-expo-preview/src/utils/billUtils.js`, `gola-expo-preview/src/utils/billUtils.test.js`, `gola-expo-preview/src/screens/Billing/BillPanel.js`, `gola-expo-preview/src/screens/Billing/BillingScreen.js`, `gola-expo-preview/src/components/orders/BillModal.js`; deleted `gola-expo-preview/src/screens/Billing/BillPreviewModal.js`; `docs/audits/README.md`, this tracker.

**Test results (exact, 2026-10-11):**
- `cd gola-expo-preview; node --test src/utils/*.test.js` -> **139/139 pass, 0 fail** (was 126; +13 new).
- `cd server; npm test` -> **118/118 pass, 0 fail** (unchanged; no server code touched).
- `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings** (all pre-existing: 3 `unicode-bom`, 1 unused catch binding).
- `cd gola-expo-preview; npx expo export --platform android` -> success. No tsconfig.json, so typecheck unavailable (unchanged).

**Remaining / blockers:** POS bills have no session/orders, so POS payment entry is out of scope (Sessions flow records payments); no device/live-endpoint verification (no device tooling); no blockers.

**Owner review required before any further work.** Full report: `docs/audits/README.md` section C.3.5.

---

## Dashboard TODAY-ONLY REWORK (2026-10-11): TODAY (IST) METRICS + LOW-STOCK ALERTS - COMPLETE

**Status:** IMPLEMENTED in `gola-expo-preview/` + documentation. No server source/schema/route/dependency/deploy change; protected directories untouched; existing live endpoints reused (`/orders`, `/inventory/alerts`). Full report: `docs/audits/README.md` section C.3.6.

**Root cause:** the dashboard computed lifetime / last-7-day aggregates client-side from the full `GET /api/orders` list; there was no "today only" basis, no IST filtering, and no low-stock surface. The server `/orders/analytics` endpoint was unusable (known F6 bug: CANCELLED included, not IST), so metrics are computed client-side in IST from source orders only.

**Metric definitions:** `totalOrders` = all orders placed in the IST today (cancelled included); `totalRevenue` = non-cancelled today orders only; `pending` = PLACED/PENDING today; `completed` = COMPLETED (incl. legacy `Completed`) today; popular items = today + non-cancelled, ranked by quantity sold (top 5); trend = 24 hourly IST buckets (count + revenue); low-stock = active items with finite `remainingPercent <= 30` from `/inventory/alerts`. No 7-day/30-day filters.

**Files changed (Expo + docs only):**
- `gola-expo-preview/src/utils/dashboardMetrics.js` (rewritten: IST helpers + today stats/trend/popular + low-stock threshold; shared exports kept, `buildSevenDayTrend`/`localDateKey`/`WEEKDAYS` removed)
- `gola-expo-preview/src/utils/dashboardMetrics.test.js` (rewritten, 27 tests incl. exact IST boundary instants)
- `gola-expo-preview/src/api/dashboardService.js` (+`getLowStockAlerts`)
- `gola-expo-preview/src/components/dashboard/LowStockAlerts.js` (new)
- `gola-expo-preview/src/components/dashboard/OrdersTrend.js` (24-hour IST count+revenue bars)
- `gola-expo-preview/src/components/dashboard/PopularItems.js` (subtitle: "Today's top 5...")
- `gola-expo-preview/src/screens/Dashboard/DashboardScreen.js` (parallel orders + alerts load; today-only metrics; low-stock card; loading/error/retry/empty/refresh preserved)
- `docs/audits/README.md` (§C.3.6), this tracker

**Test results (exact, 2026-10-11):**
- `cd gola-expo-preview; node --test src/utils/*.test.js` -> **150/150 pass, 0 fail** (was 139; dashboardMetrics 16 → 27).
- `cd server; npm test` -> **118/118 pass, 0 fail** (unchanged; no server code touched).
- `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings** (all pre-existing).
- `cd gola-expo-preview; npx expo export --platform android` -> success. No tsconfig.json, so typecheck unavailable (unchanged).

**Remaining / blockers:** no physical-tablet or live-endpoint verification (no device tooling); the pre-existing server `/orders/analytics` F6 bug remains open as Analytics work (deliberately not touched here); no blockers.

**Owner review required before any further work.** Full report: `docs/audits/README.md` section C.3.6.

---

## PHASE 3 "REVIEWS & ANALYTICS" (2026-10-11): ANALYTICS TAB - BILL-BASED SALES + INVENTORY ACTIVITY + PURCHASE SUGGESTIONS - COMPLETE

**Status:** IMPLEMENTED in `gola-expo-preview/` + one smallest-necessary read-only server route + docs. Reviews requirement already satisfied by the pre-existing `ReviewTab.js` (no feedback/server change). Protected directories untouched; no prod DB writes / deploy / new dependencies / auth changes. Full report: `docs/audits/README.md` section C.3.7.

**Root cause:** earlier Analytics tab re-used order-based helpers and the flawed `GET /api/orders/analytics` (F6: CANCELLED included, not IST). Owner-approved design is **bill-based** (bills are the financial source of truth); there was no client bill-list endpoint, no IST analytics helpers, and no inventory activity / purchase suggestions for a range.

**Date rules:** 1 Day = today IST; 7 Days = today + previous 6; 30 Days = today + previous 29 (Asia/Kolkata, UTC+05:30, no DST); exact boundary instants, inclusive start / exclusive end; changing the filter recomputes client-side in `useMemo` from already-loaded data (no refetch, never stale).

**Metric definitions:** recognized = OPEN + SETTLED (count immediately, incl. just-generated); voided = VOIDING/VOID shown separately; revenue = recognized bill totals; AOV = recognized revenue ÷ recognized count; amountPaid/balanceDue handled separately (partial payments never double-counted); breakdowns per audience (CUSTOMER/STAFF; legacy=CUSTOMER) and origin (SESSION/POS; legacy=SESSION) with counts and amounts; daily buckets keep zero-sales days. Inventory = COMMITTED only (RESERVED excluded); per-item quantities in the item's own unit (never summed across units); items added by createdAt; 500-movement cap flagged in UI. Purchase Suggestions = consumption-ranked (qty desc, name asc, id asc), reorder = minStock − currentQty only when min>0 && current<min, else em dash; usage-based, no fabricated supplier/price/lead time/order qty. Unavailable datasets show honest "data unavailable" (secondary fetches catch→null; never fake numbers).

**Server change (smallest, tested):** new read-only `GET /api/billing/bills` (PII-free `toBillDTO` list, `createdAt desc`) with optional `from`/`to` date-only IST filters (`resolveAnalyticsRange`, GAP-5), `origin`, `audience`, `status` (400 stable codes `INVALID_RANGE`/`INVALID_ORIGIN`/`INVALID_AUDIENCE`/`INVALID_STATUS`); legacy bills matched via `$in` and defaulted SESSION/CUSTOMER by `toBillDTO`.

**Files changed:**
- `server/controllers/billingController.js` (+`getBillList`), `server/routes/billingRoutes.js` (+`router.get('/bills', ...)`), `server/tests/billing.list.api.test.js` (new)
- `gola-expo-preview/src/utils/billAnalyticsUtils.js` + `.test.js` (new)
- `gola-expo-preview/src/utils/inventoryAnalyticsUtils.js` + `.test.js` (new, incl. `buildItemActivity`)
- `gola-expo-preview/src/api/billService.js` (+`getBills`)
- `gola-expo-preview/src/screens/ReviewsAnalytics/AnalyticsTab.js` (rewritten: range chips 1/7/30 Days, Sales Overview / Daily Sales / Bill Breakdown / Inventory Activity / Purchase Suggestions; loading/error/retry/pull-to-refresh/empty preserved)
- `docs/audits/README.md` (§C.3.7), this tracker
- Untouched by design: `ReviewTab.js`, `analyticsUtils.js` (still supplies formatting + rating stats), order submission / review submission flows, drawer, theme.

**Test results (exact, 2026-10-11):**
- `cd gola-expo-preview; node --test src/utils/*.test.js` -> **171/171 pass, 0 fail** (was 150; +12 `billAnalyticsUtils.test.js`, +9 `inventoryAnalyticsUtils.test.js`).
- `cd server; npm test` -> **125/125 pass, 0 fail** (was 118; +7 `billing.list.api.test.js`, dedicated `gola_billing_list_test` DB via `BILLING_LIST_TEST_MONGO_URI`).
- `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings** (all pre-existing).
- `cd gola-expo-preview; npx expo export --platform android` -> success. No tsconfig.json, so typecheck unavailable (unchanged).

**Remaining / blockers:** no physical-tablet or live-endpoint verification (no device tooling); the pre-existing server `/orders/analytics` F6 bug remains open (deliberately not used / not touched); no POS payment/printer work started (stop point of this phase). No blockers.

**Owner review required before any further work.** Full report: `docs/audits/README.md` section C.3.7.

---

## PHASE 4 "UI POLISH" (2026-10-12): KEYBOARD-SAFE FORMS, TREND HOURS, MENU IMAGES, INVENTORY LABELS - COMPLETE

**Status:** IMPLEMENTED in `gola-expo-preview/` + docs. No server source/schema/route/dependency/deploy change; protected directories untouched; existing live endpoints reused only. Bill generation / payment / idempotency / totals / reversal logic untouched. Full report: `docs/audits/README.md` section C.3.8.

**UI issues addressed:**
1. Keyboard hid form fields — no `KeyboardAvoidingView` existed anywhere in the app.
2. Dashboard "today's trend" drew all 24 buckets, so few orders looked like empty slivers.
3. Menu cards showed no item image even though items carry an `image` URL.
4. Inventory Activity had clutter ("Adjustments", "Total movements", per-item "A").

**Implemented:**
- New shared `gola-expo-preview/src/components/FormModal.js` (KeyboardAvoidingView + maxHeight card + scrollable keyboard-safe body + pinned footer).
- Refactored to it (and stripped now-unused imports/styles): `src/screens/Inventory/AddItemModal.js`, `src/screens/Stock/MovementModal.js`, `src/screens/MenuCategories/ItemFormModal.js`, `src/screens/UserCoupons/CouponFormModal.js`, `src/screens/MenuCategories/CategoryFormModal.js` (the last previously had no `ScrollView`).
- `src/components/orders/BillModal.js` body wrapped in `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` (payment input stays reachable).
- `src/screens/MenuCategories/MenuManagement.js` FlatList `keyboardShouldPersistTaps="handled"`.
- `src/utils/dashboardMetrics.js` +`.test.js`: new `populatedTrendHours`; `src/components/dashboard/OrdersTrend.js` renders only populated hours in a horizontal `ScrollView` with single empty state. `buildTodayTrend` (24 IST buckets) unchanged.
- `src/utils/menuUtils.js` +`.test.js`: new `itemImageUrl`; `src/screens/MenuCategories/MenuManagement.js` gains `MenuCardImage` (Ionicons fallback; `@expo/vector-icons` already a dependency).
- `src/screens/ReviewsAnalytics/AnalyticsTab.js`: Inventory Activity now shows Stock Added / Restock Events / Consumption Events; removed Adjustments + Total movements rows and the per-item "A" marker; added `"No stock activity in this range."` empty state.

**Files changed (Expo + docs only):** new `gola-expo-preview/src/components/FormModal.js`; `gola-expo-preview/src/screens/{Inventory/AddItemModal.js, Stock/MovementModal.js, MenuCategories/ItemFormModal.js, UserCoupons/CouponFormModal.js, MenuCategories/CategoryFormModal.js, MenuCategories/MenuManagement.js, ReviewsAnalytics/AnalyticsTab.js}`; `gola-expo-preview/src/components/orders/BillModal.js`; `gola-expo-preview/src/components/dashboard/OrdersTrend.js`; `gola-expo-preview/src/utils/{dashboardMetrics.js, dashboardMetrics.test.js, menuUtils.js, menuUtils.test.js}`; `docs/audits/README.md` (§C.3.8), this tracker.

**Test results (exact, 2026-10-12):**
- `cd gola-expo-preview; node --test src/utils/*.test.js` -> **182/182 pass, 0 fail** (was 176 at phase start; +4 `populatedTrendHours`, +2 `itemImageUrl`).
- `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings** (all pre-existing: 3 `unicode-bom`, 1 unused catch binding).
- `cd gola-expo-preview; npx expo export --platform android` -> success (Hermes `.hbc`, 3.9 MB); `dist/` git-ignored and removed afterwards. No tsconfig.json, so typecheck unavailable (unchanged).

**Preserved:** navigation, theme, audience selection, business rules; bill generation/payment/idempotency/totals/reversal untouched; no thermal printing / Bluetooth / QR / auto-print work started.

**Remaining / blockers:** no physical-tablet or live-endpoint verification (no device tooling) — keyboard-avoidance is code-reviewed, not device-tested; `src/utils/analyticsLoadUtils.js` + `.test.js` remain untracked and pre-date this phase. No blockers.

**Owner review required before any further work.** Full report: `docs/audits/README.md` section C.3.8.

---

## PHASE 4.1 "ANDROID APK SCROLLING & BOTTOM-CONTENT VISIBILITY" (2026-10-12): APP-WIDE LAYOUT/SAFE-AREA FIX - COMPLETE

**Status:** IMPLEMENTED in `gola-expo-preview/` + docs. No server source/schema/route/dependency/deploy change; protected directories untouched; existing live endpoints reused only. No API contract, order/menu/category/inventory/stock/user/coupon logic, or bill generation/payment/idempotency/totals/reversal logic touched. Navigation and theme preserved. Full report: `docs/audits/README.md` section C.3.9.

**Root causes (verified):**
1. No bottom safe-area handling anywhere (`grep` for `SafeAreaView`/`useSafeAreaInsets` across `src/` = zero consumers; only the provider in `App.js`). The app is edge-to-edge on Android and the drawer pads the header but not the screen body, so last list rows / bottom-pinned controls were drawn under the Android navigation/gesture bar. List bottom padding was a fixed `SPACING.xl` (24) / `SPACING.xl * 2` (48).
2. Bottom-sheet modals capped at `maxHeight: '90%'` had a `ScrollView` with no `flexShrink: 1` (Yoga default `0`), so long content clipped instead of scrolling. `FormModal` already had the fix (Phase 4); `SessionDetailsModal`, `BillModal`, `CreatedBillModal` did not.

**Implemented:**
- New `gola-expo-preview/src/hooks/useBottomInset.js` (`insets.bottom + extra`).
- New `gola-expo-preview/src/navigation/ScreenFrame.js` (`SafeAreaView edges={['bottom']}`, `COLORS.background`).
- `src/navigation/RootNavigator.js`: module-scope `frameScreen` wrapper applied to all 8 drawer screens (stable identity, no remount).
- `src/components/FormModal.js`: backdrop top/bottom padding now includes `insets.top`/`insets.bottom`.
- `src/components/orders/SessionDetailsModal.js`, `src/components/orders/BillModal.js`: scroll body `flexShrink: 1` + `insets.bottom` content padding.
- `src/screens/Billing/CreatedBillModal.js`: backdrop top/bottom insets + scroll body `flexShrink: 1`.
- `src/screens/Billing/BillingScreen.js`: narrow cart bottom sheet `paddingBottom: SPACING.lg + insets.bottom`.

**Files changed (Expo + docs only):** new `gola-expo-preview/src/hooks/useBottomInset.js`, `gola-expo-preview/src/navigation/ScreenFrame.js`; `gola-expo-preview/src/navigation/RootNavigator.js`, `gola-expo-preview/src/components/FormModal.js`, `gola-expo-preview/src/components/orders/{SessionDetailsModal.js, BillModal.js}`, `gola-expo-preview/src/screens/Billing/{CreatedBillModal.js, BillingScreen.js}`; `docs/audits/README.md` (§C.3.9), this tracker.

**Test results (exact, 2026-10-12):**
- `cd gola-expo-preview; node --test src/utils/*.test.js` -> **182/182 pass, 0 fail** (unchanged; no new pure helpers).
- `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings** (all pre-existing: 3 `unicode-bom`, 1 unused catch binding).
- `cd gola-expo-preview; npx expo export --platform android` -> success (Hermes `.hbc`, 3.9 MB); `dist/` git-ignored and removed afterwards. No tsconfig.json, so typecheck unavailable (unchanged).

**Preserved:** navigation, theme, audience selection, business rules; bill generation/payment/idempotency/totals/reversal untouched; no thermal printing / Bluetooth / QR / auto-print work started.

**Remaining / blockers:** no physical-tablet or live-endpoint verification (no device tooling) - safe-area/`flexShrink` behaviour is code-reviewed, not device-tested. Owner APK smoke test recommended (scroll each list to its end; open Session Details/Billing sheets + every form popup with long content and confirm the bottom is reachable above the Android system bar). No blockers.

**Owner review required before any further work.** Full report: `docs/audits/README.md` section C.3.9.

---

## PHASE 4.2 "INVENTORY ITEM DELETION REQUIREMENT FIX" (2026-10-12): PERMANENT CASCADE DELETE - COMPLETE

**Status:** IMPLEMENTED in `server/` (inventory delete path + its tests) + `gola-expo-preview/` (delete messages) + docs. No auth, no new dependencies, no deploy, no production DB access; protected directories untouched. No business rules changed other than item deletion. Full report: `docs/audits/README.md` section C.3.10.

**Reported symptom (owner):** deleting an inventory item with stock history (e.g. "Suger") silently **archived** it (`isActive=false`) and returned `"..." has stock history (...) so it was archived instead of deleted...`; the item could never be deleted. Requirement updated: confirming Delete must **permanently remove** the item, even with history.

**Audit findings (verified):**
- `deleteIngredient` (`server/controllers/inventoryController.js`) archived whenever `movementCount>0 || cycleCount>0`; hard-deleted only empty items (cycles then ingredient).
- `StockMovement.ingredientId` / `StockCycle.ingredientId` are indexed ObjectId refs (`ref 'Ingredient'`), not embedded.
- `getAnalytics` `totals` come from the whole movement ledger while `items` come from live ingredients, so orphaned movements would inflate totals with no matching item; `reconcile` ignores orphans. Dependents must therefore be deleted with the item.
- Delete is **not** transactional: deployment/tests use standalone MongoDB (`server/config/db.js`; test URI `mongodb://127.0.0.1:27017/gola_inventory_test`), which does not support multi-document transactions.

**Owner decision (obtained before the destructive change):** "Delete item + its history" — permanently delete the item together with all its `StockMovements` and `StockCycles` (that item's audit history is lost; analytics totals drop by its contribution).

**Implemented:**
- `server/controllers/inventoryController.js`: `deleteIngredient` now 404s if missing, counts movements/cycles, deletes movements -> cycles -> ingredient **last**, and returns `{ deleted:true, removedMovements, removedCycles, message }`. Archive branch removed; policy + non-transactional constraint documented in comments.
- `gola-expo-preview/src/api/inventoryService.js`: `deleteIngredient` comment updated to the permanent-cascade contract (no code-path change).
- `gola-expo-preview/src/screens/Inventory/InventoryScreen.js`: dialog names the item and warns history is permanently deleted/irreversible; `runDelete` always shows `Item deleted` with the server message (no `archived` branch), refreshes on success, and on failure shows the real error without refreshing so the item stays visible. `deletingId` guard / cancel / refresh preserved.

**Files changed (server + Expo + docs only):** `server/controllers/inventoryController.js`, `server/tests/inventory.api.test.js`, `gola-expo-preview/src/api/inventoryService.js`, `gola-expo-preview/src/screens/Inventory/InventoryScreen.js`; `docs/audits/README.md` (§C.3.10), this tracker.

**Test results (exact, 2026-10-12):**
- `cd server; node --test tests/inventory.api.test.js` -> **24/24 pass, 0 fail**.
- `cd server; npm test` -> **129/129 pass, 0 fail**.
- `cd gola-expo-preview; node --test src/utils/*.test.js` -> **182/182 pass, 0 fail**.
- `cd gola-expo-preview; npx expo lint` -> **0 errors, 4 warnings** (all pre-existing: 3 `unicode-bom`, 1 unused catch binding).
- `cd gola-expo-preview; npx expo export --platform android` -> success (Hermes `.hbc`, 3.9 MB); `dist/` removed afterwards. No tsconfig.json, so typecheck unavailable (unchanged).

**New/changed tests:** replaced the old "DELETE archives items with history" test with permanent-delete coverage (with movements, and a cycle-only branch), and added idempotent repeat-delete (404), unrelated-item preservation, and analytics-consistency (deleted history leaves `totals` consistent, no dangling `reconcile` mismatch). Pre-existing no-history and unknown-id tests retained; all restock/consumption/unit-cost/idempotency/concurrency regressions still pass.

**Preserved:** stock consumption/restock, unit cost, `idempotencyKey`, movement validation, insufficient-stock protection, low-stock/usage alerts (>=70% consumed), analytics/cycles, and the separate `activate`/`deactivate` soft mechanism (`Archived` pill). No order-driven stock deduction. No API contract change beyond the delete success body (archive body removed).

**Remaining / blockers:** no live-endpoint or physical-device verification (no device/backend tooling); cascade intentionally non-transactional (dependents deleted first; each step idempotent/retryable). `src/utils/analyticsLoadUtils.js` + `.test.js` remain untracked and pre-date this work. No blockers.

**Owner review required before any further work.** Full report: `docs/audits/README.md` section C.3.10.
