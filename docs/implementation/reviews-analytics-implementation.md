# Gola Restaurant — Phase 6: Reviews & Analytics Implementation Report

> Implementation report for the Reviews & Analytics module in the React Native (Expo) admin app. Scope limited to `gola-expo-preview/` and `docs/`. No backend changes were made. No `AdminDashbord/`, `client/`, `print-service/`, or `react native frontend/` files were modified. No production data was seeded or reset; all verification was read-only plus unit tests.

- **Date:** 2026-10-09
- **Target:** `gola-expo-preview/` (Expo Go on a physical Android tablet)
- **Reference UI:** supplied Reviews & Analytics wireframe (Gola Restaurant header, two tabs: Analytics / Review)
- **Reference clients:** `AdminDashbord/src/pages/{Analytics,Reviews}.jsx`, `client/src/components/FeedbackModal.jsx`

---

## 1. Audit findings (existing backend data)

The audit was performed before implementation and is summarised here. All endpoints below were confirmed against the actual server code.

### 1.1 Available endpoints and actual response shapes

| Method + path | Source | Response shape | Notes |
|---|---|---|---|
| `GET /api/orders` | `server/controllers/orderController.js:300` | Bare JSON **array** of order docs, `sort({createdAt:-1})` | No envelope, no pagination. Used for revenue/AOV/daily sales. |
| `GET /api/orders/analytics?range=1d\|7d\|30d` | `orderController.js:426` | `{ stats:{totalRevenue,totalOrders,avgOrderValue,retentionRate}, revenueTrend[], topItems[], peakTimes[] }` | **No `success`/`data` envelope.** Does **not** exclude cancelled orders; `retentionRate` is a mock proxy (`revenueTrend` uses `$dateToString`). |
| `GET /api/feedback` | `server/routes/feedbackRoutes.js:39` | Bare JSON **array** of feedback docs, populated `orderId` (`tableNumber orderType items status`) + `userId` (`name mobile`), `sort({createdAt:-1})` | No envelope, no pagination. |
| `POST /api/feedback` | `feedbackRoutes.js:9` | `201` raw feedback doc; `400 {message:"Feedback already submitted for this order"}`; `500 {message}` | Customer submission path — **unchanged**. |

Auth: the server has **no auth middleware** on any route. The Expo client uses the existing `apiClient` (`src/api/apiClient.js`), which is unchanged.

### 1.2 Feedback / review model (`server/models/Feedback.js`)

`orderId` (ObjectId → Order, **required, unique**), `userId` (ObjectId → User, optional), `rating` (Number, **required, min 1, max 5**), `message` (String), `tags` (`[String]`), `{timestamps:true}`. There is **no `name` field** — the customer name comes only from the populated `userId.name`; there is **no `comment` field** (it is `message`).

### 1.3 Order money fields (`server/models/Order.js`)

`totalAmount` (final payable = subtotal − discount), `grossTotal` (subtotal before discount), `couponCode`, `discountAmount`, `items[]` (`itemId, name, quantity, price, customizations`), `status`, `audience`, `createdAt`. **No `tax`, no `deliveryFee`, no `serviceCharge`, no stored `subtotal`.** Statuses include `PLACED, ACCEPTED, CHANGED, CANCELLED, COMPLETED` plus legacy values. Cancelled is stored uppercase `CANCELLED`.

### 1.4 Which requested metrics are accurate from existing data

| Metric | Accurate? | Basis |
|---|---|---|
| Total Revenue | Yes | `sum(totalAmount)` over non-cancelled orders (net sales, after discounts) |
| Customer Rating | Yes | `average(Feedback.rating)` filtered to valid 1–5 values |
| Average Order Value | Yes | `totalRevenue / eligible order count`, guarded against divide-by-zero |
| Daily Sales | Yes | Bucketed by `createdAt` local calendar day, revenue + order count |
| Inventory Purchases vs Sales | **No** | No purchase/inventory data exists (see 1.5) |

### 1.5 Inventory purchase and rating data — definitive findings

- **Inventory / stock / purchase records do NOT exist.** A repo-wide search for `inventory|stock|purchase|procurement|supplier|cost|stockMovement` across `server/` returned exactly one match: `server/utils/analytics.js:2` (`item.price - item.costPrice`), an orphaned ESM helper imported by nothing that references a `costPrice` field which exists on no model.
- **Menu items have no quantity/cost fields.** `Item` stores `available`/`availableForStaff` as **booleans** (not stock counts) and only `price`/`staffPrice` (no `cost`/`costPrice`).
- **Only 6 models exist:** `User`, `Order`, `Coupon`, `Feedback`, `Category`, `Item`.
- **Customer rating data DOES exist**, solely in `Feedback.rating` (1–5, one per order). `Item.rating` is a static, manually-seeded dish rating and is **not** computed from customer feedback.

### 1.6 How customer reviews enter the backend

`client/src/components/FeedbackModal.jsx:26` posts `{orderId, userId, rating, message, tags}` to `POST /api/feedback` (no auth). It is shown from `client/src/pages/Countdown.jsx` once the order's `feedbackStatus` becomes `Requested`/`Submitted`-eligible. The Expo app only **reads** via `GET /api/feedback`; submission behaviour is untouched.

---

## 2. Files created / modified

**Added (Expo):**
| File | Purpose |
|---|---|
| `src/api/reviewsService.js` | `getFeedbacks()` → `GET /feedback`, returns a bare array (safe-empty if not an array). |
| `src/utils/analyticsUtils.js` | Pure CommonJS metric helpers: range filtering, daily buckets, revenue/anchor calculations, rating stats, review display formatters. |
| `src/utils/analyticsUtils.test.js` | Unit tests for all helpers (14 tests). |
| `src/components/menu/StateView.js` | Reused loading / error+retry / empty view (already present, now consumed here). |
| `src/screens/ReviewsAnalytics/ReviewsAnalyticsScreen.js` | Drawer screen: "Gola Restaurant" header + Analytics/Review tabs. |
| `src/screens/ReviewsAnalytics/AnalyticsTab.js` | Analytics metrics, range filter, daily-sales chart, sales breakdown, inventory gap card. |
| `src/screens/ReviewsAnalytics/ReviewTab.js` | Read-only review list, average + distribution, tags, dates, order label. |

**Modified (Expo):**
| File | Change |
|---|---|
| `src/navigation/RootNavigator.js` | Registers the `ReviewsAnalytics` drawer destination (pre-existing). |
| `src/screens/ReviewsAnalytics/ReviewTab.js` | Refresh failure now keeps already-loaded reviews and shows an inline retry banner (matching Dashboard/Orders) instead of blanking the list. |
| `src/utils/analyticsUtils.test.js` | Added tests for unknown range keys and non-array/invalid inputs. |

**Not touched:** `server/`, `client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`, the database, `RootNavigator.js` options, `theme.js`, `apiClient.js`, `config.js`.

---

## 3. Metrics implemented and exact calculation rules

All analytics are computed **client-side** from the existing read-only endpoints `GET /api/orders` and `GET /api/feedback`. Range options are **Today (1d)**, **7 Days (7d)**, **30 Days (30d)** (`RANGE_OPTIONS` in `src/utils/analyticsUtils.js`). The date filter uses the device-local calendar day and `order.createdAt`; orders with a missing/invalid `createdAt` are excluded from all calculations (they cannot be placed reliably).

**Eligible order set** = orders whose `createdAt` is inside the selected range **and** whose `status` is not `CANCELLED` (case-insensitive; `isCancelledOrder`).

| Metric | Rule |
|---|---|
| **Total Revenue** | `Σ totalAmount` over eligible orders. This is **net sales after discounts** (the server already stores `totalAmount = subtotal − discount`). Cancelled orders are excluded. No tax/delivery fee exists to include. |
| **AOV** | `Total Revenue ÷ eligibleOrderCount`; returns `0` when there are no eligible orders (no divide-by-zero). Only eligible (non-cancelled) orders in range are included. |
| **Total Orders** | Count of eligible orders (excludes cancelled). |
| **Customer Rating** | `average(Feedback.rating)` over ratings that are finite and in `[1,5]`; other values are ignored, not coerced. Shown as `—` when no valid ratings exist. |
| **Daily Sales** | One bucket per calendar day in the range (oldest first), each with summed `totalAmount` and order count; days with no eligible orders show `0`. Displayed as a bar per day with value and order count. |
| **Sales Breakdown** | Gross sales `Σ grossTotal` (fallback `totalAmount` when `grossTotal` is absent), less discounts `Σ discountAmount`, equals Net revenue (= Total Revenue); plus count of cancelled orders excluded. Makes the revenue definition explicit on-screen. |
| **Inventory Purchases vs Sales** | **Not computed.** A labelled gap card states the backend has no inventory/stock/market-purchase records and explains that revenue minus purchase spending is not profit. |

A default range of **7 days** is selected on open; changing the range recomputes instantly from already-loaded data (no extra API call).

---

## 4. Review tab — fields displayed

Data source: `GET /api/feedback` (read-only). For each review the UI shows only fields actually present in the response:

| Element | Source | Fallback |
|---|---|---|
| Customer name | `userId.name` | `Guest Customer` (no name field exists in the schema) |
| Rating | `rating` (1–5 stars) | empty stars when absent/invalid |
| Review text | `message` | `No message provided` when empty |
| Submission date | `createdAt` | formatted by `orderUtils.formatDate` |
| Tags | `tags[]` | hidden when empty |
| Order context | `orderId.orderType` + `orderId.tableNumber` | hidden when absent |

The header summarises the average (from valid ratings only), total valid rating count, and a 5→1 star distribution bar. No reply, moderation, deletion, or editing is offered (not supported by the backend, and deliberately out of scope).

---

## 5. UI / states

- Header **Gola Restaurant** with subtitle, and two tabs **Analytics** / **Review** (in-screen segmented tabs — no bottom navigation, no redesign of other screens).
- Hamburger drawer navigation and the existing theme tokens (`COLORS`, `SPACING`, `RADIUS`) are reused unchanged.
- **Analytics tab:** loading, full-error + Retry (only when no data yet), stale-data error banner + Retry, empty "No sales in this range" note, and pull-to-refresh.
- **Review tab:** loading, full-error + Retry (only when no data yet), stale-data error banner + Retry, empty state, and pull-to-refresh.
- Responsive: stat cards and review cards switch 1/2 (≥600 px) and 1/2/3 (≥680/1000 px) columns based on window width.

---

## 6. Tests and validation results

| Check | Command | Result |
|---|---|---|
| Expo unit tests (all utils) | `node --test src/utils/*.test.js` | **74/74 pass** (14 in `analyticsUtils.test.js`) |
| Lint | `npx expo lint` | **0 errors**, 5 pre-existing warnings (`apiClient.js` unused `e`; BOM in 4 untouched placeholder screens). None in Phase 6 files. |
| Expo Doctor | `npx expo-doctor` | **21/21 checks passed. No issues detected.** |
| Android export | `npx expo export --platform android` | **Success** — Hermes `.hbc` bundle produced in `dist/` (gitignored). |

New/updated tests explicitly cover: metric calculations, date-range filtering (Today/7/30, boundary day, bad dates), invalid/missing values (missing `createdAt`, non-numeric totals/ratings), cancelled-order exclusion from revenue/AOV/count, divide-by-zero on empty ranges, unknown range-key fallback, non-array inputs, and rating averaging/distribution.

---

## 7. Data gaps and remaining work

1. **No inventory purchasing subsystem.** The "Inventory Purchases vs Sales" comparison cannot be implemented accurately. It would require a new backend model/route (date, item, quantity, unit cost) and admin entry UI — **not created**, per the explicit instruction not to add an unrelated subsystem or change the schema without approval. The UI shows an honest gap card instead.
2. **No revenue-vs-profit metric.** Only revenue is available; `Item` has no cost field, so gross margin/profit cannot be computed.
3. **`GET /api/orders/analytics` is not used.** Its `totalRevenue` includes cancelled orders and its `retentionRate` is a mock proxy, so the module computes metrics client-side from `GET /api/orders` instead. A backend fix (exclude cancelled; real analytics route) is a candidate for a future approved change.
4. **No server-side pagination** on `/orders` or `/feedback`. Metrics remain correct (full scan client-side) but large datasets will increase payload size.
5. **Average-rating endpoint absent.** Rating averages are computed client-side from the full feedback list.
6. **Tablet visual check pending** — the bundle compiles and passes Doctor, but the author must confirm rendering on the physical tablet.

---

## 8. Updated project tracker

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Thermal printer compatibility audit | Done |
| 2 | Dashboard RN implementation | Done — verified on tablet |
| 3 | Orders RN implementation | Done — pending tablet visual check |
| 4 | Hamburger navigation redesign (7-section drawer) | Done — pending tablet visual check |
| 5 | Menu & Categories + dual-pricing | Done — pending tablet visual check |
| 6 | Users & Coupons RN module | Done (implemented; now reflected in tracker) |
| 7 | **Reviews & Analytics RN module (this report)** | **Done** — tests 74/74, lint 0 errors, Doctor 21/21, Android export OK — pending tablet visual check |
| 8+ | Billing module | Not started (placeholder) |
| 8+ | Settings module | Not started (placeholder) |

**Completed:** Dashboard, Orders, Navigation, Menu & Categories, Users & Coupons, Reviews & Analytics.
**In progress:** none.
**Remaining:** Billing, Settings; optional backend analytics hardening.
**Blocked:** Inventory Purchases vs Sales (blocked on a non-existent inventory-purchase backend; requires approval + schema/model work).

---

## 9. Deliberate scope limits

- No backend changes; nothing in `server/` was modified.
- No authentication/security change (the API remains unauthenticated, as documented in prior audits).
- No fabricated analytics, reviews, identities, ratings, purchase costs, or profit.
- No changes to customer review submission, orders, menu, coupons, or user management.
- No bottom navigation and no redesign of other screens.
