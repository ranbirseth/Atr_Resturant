# Gola Restaurant — Phase 2 Step 2A: Dashboard Feature Audit

> **Read-only investigation.** No source files, dependencies, database, or deployments were modified. No orders/menu/DB records were created, updated, or deleted. Backend calls were read-only `GET`s. Physical printer / print-service was not touched. No emulator was launched.

- **Date:** 2026-10-09
- **Scope:** Existing React admin Dashboard (`AdminDashbord/src/pages/Dashboard.jsx`) vs. the parallel React Native Expo target (`gola-expo-preview`).
- **Goal:** Map every dashboard UI element and metric to its API and backend calculation, flag incorrect/hardcoded/random values, and define an Expo Go-safe implementation plan. **No implementation performed.**

---

## 0. Verification: is the backend reachable? (read-only)

| Check | Result |
|---|---|
| `GET http://localhost:5000/api/categories` | **HTTP 200**, 17 categories (matches prior audit) |
| `GET http://localhost:5000/api/orders` | **HTTP 200**, **73 orders** returned |
| `GET http://localhost:5000/api/orders/analytics?range=7d` | **HTTP 200** but all-zero (`stats.totalRevenue=0`, `revenueTrend=[]`) |

The Expo app targets a LAN IP, not localhost: `gola-expo-preview/src/api/config.js:11` sets `lan: 'http://192.168.31.222:5000/api'` and `:16` selects it (`let currentBaseUrl = PRESETS.lan`). The server itself is confirmed up and serving the same data.

Actual data shape (sample order): `status: "COMPLETED"`, `items[].name/quantity/price/customizations`, **no `category` field on items**, `createdAt` serialized as an ISO string.

---

## 1. Existing dashboard component / file map

| File | Responsibility |
|---|---|
| `AdminDashbord/src/pages/Dashboard.jsx` (341 lines) | **The entire Dashboard page** — stat cards, 2 charts, popular-items table, all derived calculations |
| `AdminDashbord/src/services/orderService.js` | `getOrders()` → `GET /orders` (also `getGroupedOrders`, `updateOrderStatus`, `getAnalytics`) |
| `AdminDashbord/src/utils/api.js` | axios instance, `baseURL` from config |
| `AdminDashbord/src/config.js` | `API_URL` (`http://localhost:5000/api`), `SOCKET_URL` |
| `AdminDashbord/src/components/ui/Card.jsx` | `Card`, `CardContent`, `CardHeader` primitives |
| `AdminDashbord/src/App.jsx:45` | `index` route → `<Dashboard />`; gated behind `AdminAuth` (`App.jsx:33-35`) |
| `AdminDashbord/src/pages/Analytics.jsx` (257 lines) | **Separate** page; uses `getAnalytics(range)` with 1d/7d/30d |
| `AdminDashbord/package.json` | `recharts`, `lucide-react`, `axios`, `react-router-dom` (web-only) |

Expo side:

| File | State |
|---|---|
| `gola-expo-preview/src/screens/Dashboard/DashboardScreen.js:1-6` | Just `<PlaceholderScreen title="Dashboard" />` |
| `gola-expo-preview/src/components/PlaceholderScreen.js` | Static title + connectivity widget |
| `gola-expo-preview/src/api/apiClient.js` | Central `api.get/post/put/patch/delete` + `checkBackend()` |
| `gola-expo-preview/src/api/config.js` | Presets (`lan` active) |
| `gola-expo-preview/src/components/ConnectionStatus.js` | "Backend Connected/Failed" + Retry |

> Note: `gola-expo-preview/AGENTS.md` talks about **Expo Router**, but the actual app uses **React Navigation bottom tabs** (`src/navigation/RootNavigator.js`). Implement inside the existing tab screen.

---

## 2. Dashboard UI elements and interactions

1. **Header** — "Dashboard Overview" (static text).
2. **Stats grid** — 4 `StatCard`s: Total Revenue, Total Orders, Pending Orders, Completed Orders. Each shows an icon, a **trend badge** (arrow + %), a title, and a value. `StatCard` is defined at `Dashboard.jsx:50-74`.
3. **Orders Trend** — Recharts `LineChart`, subtitle "Daily order count for the last 7 days" (`Dashboard.jsx:198-246`).
4. **Revenue by Category** — Recharts horizontal `BarChart`, subtitle "Total revenue breakdown per food category" (`Dashboard.jsx:249-293`).
5. **Popular Items** — HTML `<table>` with columns Item Name / Total Sales / Revenue / Growth, top 5 (`Dashboard.jsx:297-338`).

**Interactions / behavior**

- Loads once on mount (`useEffect`, `Dashboard.jsx:80-92`). **No date-range filter, no refresh button, no auto-refresh, no Socket.IO subscription, no clickable drill-down/navigation** from any card or row.
- **States:** loading skeletons for stats (`:66-68`), "Loading charts..." for charts (`:206`, `:256`), skeleton rows for the table (`:315-317`); empty states: "No data available" / "No data available yet" (`:258`, `:319`). **Error state: none in UI** — fetch failure is only `console.error` (`:86`), then it renders zeros/empty.
- **No "recent activity" section exists.**

---

## 3. Metric → API → backend calculation mapping

Single data source for the whole page: `getOrders()` → **`GET /api/orders`** (`orderService.js:3-6`) → `server/routes/orderRoutes.js:8` → `getOrders` (`server/controllers/orderController.js:227-234`): `Order.find({}).populate('userId','name mobile').sort({createdAt:-1})`. **All calculations happen in the frontend**; the backend returns raw order documents.

| UI value | Frontend calculation (`Dashboard.jsx`) | Backend returns? |
|---|---|---|
| **Total Revenue** | `orders.reduce(sum + o.totalAmount\|0)` — all orders, no status/date filter (`:95`) | Raw data only |
| **Total Orders** | `orders.length` (`:96`) | Raw data only |
| **Pending Orders** | `orders.filter(o => o.status === 'Pending').length` (`:97`) | Raw data only |
| **Completed Orders** | `orders.filter(o => o.status === 'Completed').length` (`:98`) | Raw data only |
| **Trend % badges** | **Hardcoded** 12.5 / 8.2 / 5.4 / 10.1 (`:162,171,179,190`) | Not from API |
| **Orders Trend** | Last 7 calendar days; `orders.filter(o => o.createdAt.startsWith(date)).length` (`:101-111`) | Raw data only |
| **Revenue by Category** | Groups `order.items` by `item.category \|\| 'Other'`, sums `price*quantity` (`:114-128`) | **Order.items has no `category`** (`Order.js:8-16`) |
| **Popular Items (5)** | Aggregates by `item.name`, sums sales/revenue, sorts by sales, top 5 (`:131-144`) | Raw data only |
| **Popular Items Growth** | `Math.floor(Math.random() * 20)` (`:145`) | Not from API at all |

Unused endpoints/models relevant here: `GET /api/orders/analytics` (`orderRoutes.js:5`, `orderController.js:355-495`) is **not used by the Dashboard** (only by `Analytics.jsx`). It does provide server-side aggregates (`totalRevenue`, `totalOrders`, `avgOrderValue`, `retentionRate`, `revenueTrend`, `topItems`, `peakTimes`).

**Status representation (verified against live data — 73 orders):**

| Status (exact case) | Count | Classification |
|---|---|---|
| `Cancelled` | 25 | legacy |
| `ACCEPTED` | 19 | new |
| `COMPLETED` | 14 | new |
| `Pending` | 8 | legacy |
| `Completed` | 4 | legacy |
| `Accepted` | 2 | legacy |
| `Preparing` | 1 | legacy |

Newer enum in `Order.js:25-30` is `PLACED/ACCEPTED/CHANGED/CANCELLED/COMPLETED` (+ legacy). **No `PLACED`, `PREPARING`, `READY`, or `CHANGED` orders currently exist in the DB.**

---

## 4. Incorrect, hardcoded, random, or inconsistent values (verified)

1. **`Completed Orders` is wrong on the live dataset.** Dashboard uses case-sensitive `status === 'Completed'` → matches only the **4** legacy rows, silently ignoring **14** `COMPLETED` orders. Real completed ≈ 18.
2. **`Pending Orders` ignores the new lifecycle.** Matches only legacy `'Pending'` (8). Any `'PLACED'` orders (the model default) would count as 0.
3. **`Total Revenue` includes cancelled orders.** It sums `totalAmount` over all orders with no status filter; 25 cancelled orders are included. With status filtering the number would drop.
4. **`Revenue by Category` is effectively broken.** `Order.items` never stores `category` (verified: no item in any of the 73 orders has a `category` key), so the map collapses to a single `'Other'` bar covering all revenue (~₹27,378 by gross item price). The mock `categoryData` constant (`:36-41`) shows the original intent.
5. **Popular Items `growth` is random** (`Math.random()`, `:145`) — changes every render; the green/red badge is meaningless.
6. **Trend badges are hardcoded** (`12.5/8.2/5.4/10.1`) with fake direction arrows, unrelated to data.
7. **Three dead mock constants** never rendered: `orderData` (`:26-34`), `categoryData` (`:36-41`), and the top-level `popularItems` (`:43-48`, shadowed by the computed one at `:142`).
8. **`Orders Trend` is currently a flat zero line** — the newest order is `2026-09-30` while "today" is `2026-10-09`; no order falls in the last 7 days.
9. **No date-range control on the Dashboard**, unlike `Analytics.jsx` (1d/7d/30d). Dashboard revenue = lifetime, yet the KPI framing ("today") implies a daily view.
10. **Client-side full-list aggregation**: Dashboard downloads all 73 (grows unbounded) orders and computes in JS, even though a server aggregate endpoint exists.
11. **Label inconsistency in Analytics** (adjacent page): the "Total Revenue" card says subtitle "Total lifetime revenue" while actually being range-filtered (`Analytics.jsx:104-105`).

---

## 5. Proposed React Native implementation plan (for approval — not implemented)

**Architecture**

1. Add a thin service `gola-expo-preview/src/api/dashboardService.js` exposing `getOrders()` that reuses the existing centralized `api.get('/orders')` (`apiClient.js:34-35`). No new HTTP stack.
2. Replace `DashboardScreen.js` (currently a placeholder) with a `ScrollView` + `RefreshControl` screen composed of small presentational components under `src/screens/Dashboard/` (or `src/components/dashboard/`).

**Data & metric parity (with the fixes above flagged for decision)**

3. Fetch orders once on mount + pull-to-refresh; keep `loading`, `error`, `refreshing` states. Add a real **error UI with Retry** (the web dashboard lacks one).
4. Compute the same metrics client-side for parity, but **normalize status to uppercase** and map legacy→canonical (`Pending→PLACED`, `Accepted→ACCEPTED`, `Preparing→PREPARING`, `Completed→COMPLETED`, `Cancelled→CANCELLED`) so counts match the current DB. **Decision needed:** whether to keep excluding cancelled orders from revenue (web includes them) — recommend excluding cancelled, but flag it.
5. Category chart: since `Order.items` has no category, either (a) render the same single `'Other'` bar for parity, or (b) omit the chart until the backend exposes category. **Decision needed.** (Backend change is out of scope this phase.)
6. Popular Items: same aggregation, top 5. **Do not use `Math.random()`** — either drop the Growth column or compute real period-over-period growth; flag as a deviation from web behavior.

**Charts on React Native (no web chart libs)**

- **Option A (recommended for Expo Go):** render charts with core RN primitives — horizontal bars via `View` widths; the 7-day trend as a simple bar/segmented view. **Zero new native dependencies**, guaranteed to run in the current Expo Go preview.
- **Option B:** install a charting stack via `npx expo install` (e.g. `react-native-svg` + a lightweight chart lib such as `react-native-chart-kit` or `victory-native`). Requires confirming Expo SDK 57 / Expo Go compatibility; may force a development build. **Not chosen unless approved.**

**Icons / UI**

- Replace `lucide-react` with `@expo/vector-icons` (bundled with Expo) or plain text. Avoid DOM (`<table>`) — use `View`/`FlatList`. Avoid `react-router` (already on React Navigation).

**Explicitly out of scope (per restrictions):** Orders module, printer/Bluetooth/KOT/PDF/print-service, backend/DB/AdminDashbord/client changes, and the `react native frontend/` CLI project.

---

## 6. Dependencies needed

| Need | Recommendation | Notes |
|---|---|---|
| HTTP | **None** — reuse `apiClient.js` | Already present |
| Charts | **Option A: none** (core RN Views) | Keeps Expo Go working |
| Charts (alt) | `react-native-svg` + chart lib via `npx expo install` | Only if Option B approved; verify SDK 57/Expo Go support, may need dev build |
| Icons | `@expo/vector-icons` (ships with Expo) | Replaces `lucide-react` |
| Navigation | None — reuse `@react-navigation/bottom-tabs` | Already present |
| No web deps | Do **not** add `recharts`, `react-router-dom`, `lucide-react` | Web-only |

---

## 7. Test cases for the Expo Go tablet preview

1. **Connectivity** — `ConnectionStatus` shows "Backend Connected" via the LAN preset; Retry works with server stopped/running.
2. **Loading state** — skeletons/placeholders appear before data resolves.
3. **Metric correctness** — compare on-screen Total Orders (73), Total Revenue, Pending, Completed against these read-only API totals; verify status normalization yields Completed ≈ 18, not 4.
4. **Orders Trend** — confirms all-zero for the last 7 days (correct, not an error), and correct counts when test data falls in range.
5. **Revenue by Category** — expected single `'Other'` bar (or omitted, per decision).
6. **Popular Items** — verify ordering by sales (top = "Chilli Paneer Dry", 32) and that Growth is stable across re-renders (no randomness).
7. **Empty DB** — with no orders, show empty states, no crash.
8. **Error path** — server offline → visible error + Retry (new behavior vs web).
9. **Pull-to-refresh** — re-fetches without breaking layout.
10. **Robustness** — missing `userId`, empty `items`, or legacy vs new statuses don't crash.
11. **Tablet layout** — responsive grid (2-col stats on wide screens), scrollable content, no overflow.
12. **No regression** — other 7 tabs and connectivity still work.

---

## 8. Files that would need modification (implementation phase)

**To modify**
- `gola-expo-preview/src/screens/Dashboard/DashboardScreen.js` (replace placeholder)

**To add**
- `gola-expo-preview/src/api/dashboardService.js` (thin wrapper over `api.get`)
- `gola-expo-preview/src/components/dashboard/StatCard.js` (optional)
- `gola-expo-preview/src/components/dashboard/Charts.js` (View-based charts) and/or `PopularItemsTable.js` (optional)
- `gola-expo-preview/src/utils/format.js` (currency/number/date formatting) (optional)

**Possibly modify**
- `gola-expo-preview/package.json` — **only** if chart/icon Option B is approved

**Must NOT touch**
- `server/`, `AdminDashbord/`, `client/`, `print-service/`, `react native frontend/`, and the DB.

---

## 9. Open decisions before implementation

1. **Cancelled orders in Total Revenue:** mirror web (include) or fix (exclude)?
2. **Revenue by Category:** keep the single "Other" bar (parity) or omit until backend exposes `category`?
3. **Popular Items Growth:** drop it, or compute real growth (not random)?
4. **Charts:** Option A (pure RN, Expo Go-safe) vs Option B (chart library, may need dev build)?
5. Whether to keep the hardcoded trend badges at all.
