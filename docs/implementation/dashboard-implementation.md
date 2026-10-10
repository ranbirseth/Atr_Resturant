# Gola Restaurant — Phase 2 Step 2B: Dashboard Implementation Report

> Implementation report for the React Native (Expo) admin Dashboard. Scope limited to `gola-expo-preview/`. No backend, database, `AdminDashbord/`, `client/`, `print-service/`, or `react native frontend/` files were modified. No orders were created.

- **Date:** 2026-10-09
- **Target:** `gola-expo-preview/` (Expo Go on a physical Android tablet)
- **Reference:** `AdminDashbord/src/pages/Dashboard.jsx`
- **Audit this implements:** [Dashboard Feature Audit (Phase 2 Step 2A)](../audits/dashboard-feature-audit.md)

---

## 1. Files added or modified

### Added
| File | Purpose |
|---|---|
| `gola-expo-preview/src/api/dashboardService.js` | Thin wrapper: `getOrders()` via existing `api.get('/orders')`; validates the response is an array |
| `gola-expo-preview/src/utils/dashboardMetrics.js` | Pure, dependency-free metric functions (status normalization, stats, 7-day trend, popular items, formatting) |
| `gola-expo-preview/src/utils/dashboardMetrics.test.js` | 16 focused unit tests (Node built-in test runner) |
| `gola-expo-preview/src/theme.js` | Shared design tokens (colors, spacing, radius) |
| `gola-expo-preview/src/components/dashboard/StatCard.js` | Stat card component |
| `gola-expo-preview/src/components/dashboard/OrdersTrend.js` | Native `View`-bar 7-day trend chart |
| `gola-expo-preview/src/components/dashboard/PopularItems.js` | Top-5 popular items table (native views) |
| `gola-expo-preview/eslint.config.js` | Created automatically by `npx expo lint` (flat config using `eslint-config-expo`) |

### Modified
| File | Change |
|---|---|
| `gola-expo-preview/src/screens/Dashboard/DashboardScreen.js` | Replaced `PlaceholderScreen` with full dashboard (was a 6-line placeholder) |
| `gola-expo-preview/package.json` | Added `lint` script and devDependencies `eslint`, `eslint-config-expo` (auto-added by `expo lint`) |
| `gola-expo-preview/package-lock.json` | Updated by the ESLint install |

### Not touched
`server/`, `AdminDashbord/`, `client/`, `print-service/`, `react native frontend/`, database, `RootNavigator.js` (all 8 tabs preserved), `apiClient.js`, `api/config.js`.

---

## 2. Metrics implemented and exact definitions

All logic lives in `src/utils/dashboardMetrics.js` and is covered by unit tests.

| Metric | Definition |
|---|---|
| **Total Orders** | `orders.length` — every order returned by `GET /api/orders`. |
| **Pending Orders** | Count of orders whose normalized status is `PENDING` or `PLACED`. Status is `String(status).trim().toUpperCase()`. Cancelled is never counted as pending. |
| **Completed Orders** | Count of orders whose normalized status is `COMPLETED` (so both `COMPLETED` and legacy `Completed` match). |
| **Total Revenue** | Sum of `totalAmount` over **non-cancelled** orders only (`CANCELLED` / `Cancelled` excluded). Labeled on-screen as "From non-cancelled orders". Invalid/missing amounts treated as `0` (never `NaN`). |
| **Orders Trend** | Last 7 **local** calendar days, oldest→newest, including today. Orders counted by local calendar date of `createdAt`. Zero days render as zero-height bars. |
| **Popular Items** | Items aggregated by normalized name (`trim`, collapse whitespace, case-insensitive grouping). Sums quantity sold and gross revenue (`price × quantity`, only for non-negative numeric values). Sorted by quantity (then revenue, then name), top 5. |

**Removed deliberately (per Step 2B requirements):**
- Hardcoded stat trend percentages.
- Fake up/down trend arrows.
- Random `Growth` column.
- "Revenue by Category" chart (the `Order` model does not store item categories; the audit confirmed it would always collapse to a single "Other" bar).

On-screen stat labels/hints: Total Revenue ("From non-cancelled orders"), Total Orders ("All orders returned by the API"), Pending Orders ("PLACED + PENDING"), Completed Orders ("COMPLETED (incl. legacy Completed)").

---

## 3. UI and behavior

- **Header:** "Dashboard Overview" + subtitle "Live snapshot from GET /api/orders".
- **Four stat cards** in a responsive grid: two columns when the window width ≥ 600 dp, one column otherwise. Card width computed from `useWindowDimensions()`.
- **Orders Trend:** native `View` bars, no chart library (Expo Go safe). Shows "No orders in the last 7 days." when all counts are zero.
- **Popular Items:** top-5 table (Item / Qty / Revenue) built from native views.
- **States:** loading skeleton (4 stat blocks + 2 section blocks), full-screen error with **Retry**, inline refresh-error banner (when data already exists), empty state, and **pull-to-refresh** via `RefreshControl`.
- **Data fetching:** `useFocusEffect` fetches on first open and on each return to the tab. Failures are caught and never crash the app.
- **API:** reuses `src/api/apiClient.js` and the centralized LAN config (`http://192.168.31.222:5000/api`). No new HTTP client; no backend changes.
- **No web-only libraries** (`recharts`, `react-router-dom`, `lucide-react`) and no HTML elements. Navigation (8 tabs) unchanged.

---

## 4. Lint / test results

### Tests (16/16 pass)
Command: `node --test src/utils/dashboardMetrics.test.js`

Verified cases:
- `Completed` and `COMPLETED` both counted as completed.
- `Pending` and `PLACED` counted as pending; cancelled not pending.
- Cancelled orders excluded from Total Revenue.
- Missing/invalid `items`, names, prices, quantities handled safely (no `NaN`).
- Empty orders produce valid zero values.
- 7-day chart schedules exactly 7 buckets and handles zero-order days / invalid `createdAt`.
- Popular items aggregation, normalization, ordering, and top-5 limit.
- Currency/number formatting never emits `NaN`.

### Lint
Command: `npx expo lint`

- **0 errors and 0 warnings in all new/modified Dashboard files.**
- 9 pre-existing problems remain in **untouched** files: 1 error in `src/components/ConnectionStatus.js` (`react-hooks/set-state-in-effect`) and 8 warnings (unused `e` in `apiClient.js`; BOM in the other 7 placeholder screens). These predate this work and were left unchanged to respect scope.

### Typecheck
No TypeScript in this project (`npx tsc --noEmit` not applicable — no `tsconfig.json` / `typescript`).

### Bundle compile
Requested the Android bundle from the running Metro server: `GET /index.bundle?platform=android&dev=true` → **HTTP 200 (~5.0 MB)**. Confirms all Dashboard imports resolve and the JSX/JS compiles.

---

## 5. API connectivity result

| Check | Result |
|---|---|
| `GET http://localhost:5000/api/categories` | HTTP 200 (17 categories) |
| `GET http://192.168.31.222:5000/api/categories` (configured LAN preset) | HTTP 200 (17 categories) |
| Machine Wi-Fi IP | `192.168.31.222` (matches `src/api/config.js`) |
| Metro dev server | Running on port 8081 (reused; `/status` = `packager-status:running`) |

### Metric verification against live data (73 real orders, read-only)
Running the implemented functions against `GET /api/orders` produced:
- Total Orders: **73**
- Pending Orders: **8** (`Pending`; no `PLACED` present)
- Completed Orders: **18** (`Completed` 4 + `COMPLETED` 14) — corrects the web Dashboard's bug that showed only 4
- Total Revenue: **₹15,339** (non-cancelled only; the web dashboard's ₹26,743 incorrectly included 25 cancelled orders)
- 7-day trend: **all zero** (newest order is 2026-09-30; correct, not an error)
- Popular Items top 5: Chilli Paneer Dry (32, ₹7,680), Chilli Paneer Gravy (21, ₹5,040), Chilli Mushroom Gravy (10, ₹2,400), Szechwan Paneer Dry (8, ₹1,920), Kumpow Paneer (6, ₹1,500)

---

## 6. Remaining limitations

- Category-based revenue is intentionally not shown (no category field on order items).
- Revenue is **non-cancelled order value**, not confirmed collected/paid revenue (API exposes no payment confirmation).
- Data set spans older dates, so the 7-day trend is currently flat zero; it will populate when orders occur within the last week.
- No emulator was used and the tablet has not yet been visually confirmed by the author.
- `ConnectionStatus.js` retains a pre-existing lint error (out of scope).

---

## 7. Tablet preview verification

**Not yet verified visually by the author.** The Metro dev server is already running on port 8081 for this project, and a fresh Android bundle compiles successfully. Please reload the app on the tablet (Expo Go → shake → Reload, or wait for Fast Refresh) and confirm the Dashboard renders.

Manual check requested:
1. Dashboard tab shows "Dashboard Overview", 4 stat cards, trend bars, popular items.
2. Cards show Total 73 / Pending 8 / Completed 18 / Revenue ₹15,339.
3. Pull-to-refresh works; stop the backend and confirm the error + Retry state.
