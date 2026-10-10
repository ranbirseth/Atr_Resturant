# Gola Restaurant — Phase 2 Step 3A: Orders Feature Audit

> **Read-only investigation.** No source files, dependencies, backend, database, or deployments were modified. No orders/menu/DB records were created, updated, or deleted (no `PUT`/`POST`/`DELETE` was sent during this audit). Backend calls were read-only `GET`s plus a Socket.IO handshake probe. Physical printer / print-service / Bluetooth was not touched. No emulator was launched. The legacy web apps (`AdminDashbord/`, `client/`) were only read.

- **Date:** 2026-10-09
- **Scope:** Existing React admin Orders module (`AdminDashbord/src/pages/Orders.jsx` + supporting files) vs. the React Native Expo target (`gola-expo-preview`).
- **Goal:** Map the Orders UI, API surface, Socket.IO events, session grouping, and status-transition rules; flag verified bugs/risks; and define an Expo Go-safe implementation plan. **No implementation performed.**

---

## 0. Verification: backend reachable? (read-only)

| Check | Result |
|---|---|
| `GET http://localhost:5000/api/orders` | **HTTP 200** — 73 orders |
| `GET http://localhost:5000/api/orders/grouped` | **HTTP 200** — **28 sessions** grouping all 73 orders |
| `GET http://localhost:5000/socket.io/?EIO=4&transport=polling` | **HTTP 200** — handshake OK (`sid`, `upgrades:["websocket"]`, `pingInterval:25000`, `pingTimeout:20000`) |
| `GET http://192.168.31.222:5000/socket.io/?EIO=4&transport=polling` (LAN) | **HTTP 200** — LAN handshake OK |

The Expo app targets LAN, not localhost: `gola-expo-preview/src/api/config.js:7` `lan: 'http://192.168.31.222:5000/api'`, selected at `:16` (`currentBaseUrl = PRESETS.lan`). Socket URL = base minus `/api` → `http://192.168.31.222:5000`.

**Verified live order status distribution (73 orders):** matches the dashboard audit — `Cancelled` 25, `ACCEPTED` 19, `COMPLETED` 14, `Pending` 8, `Completed` 4, `Accepted` 2, `Preparing` 1. No `PLACED`, `CHANGED`, `PREPARING`, or `READY` rows currently exist.

**Verified grouped-session shape:** each session contains `sessionId`, `userId` (populated `{_id, name, mobile}`), `orders[]`, `totalAmount`, `grossTotal`, `discountAmount`, `status`, `orderType`, `tableNumber`, `createdAt`, `updatedAt`. `isDelivery`/`deliveryAddress` are omitted when absent. Each element of `orders[]` is a **full order document** (`sessionId`, `status`, `items`, `isDelivery`, `kotPrinted`, timestamps, etc.).

---

## 1. Orders component / file map

| File | Responsibility |
|---|---|
| `AdminDashbord/src/pages/Orders.jsx` (~716 lines) | **The entire Orders page** — fetch, socket subscription, view mode, filters, search, session grouping, status updates, details + bill modals |
| `AdminDashbord/src/components/SessionOrderCard.jsx` (~386 lines) | Per-session card: customer header, order list, per-status action buttons, KOT button, Bill button |
| `AdminDashbord/src/services/orderService.js` | `getOrders`, `getGroupedOrders`, `updateOrderStatus`, `getAnalytics` (axios) |
| `AdminDashbord/src/services/printService.js` | `printOrder`, `confirmPrintSuccess` → **print-service** (out of scope) |
| `AdminDashbord/src/context/SocketContext.jsx` | Single `io(SOCKET_URL)` connection, provided via context, `newSocket.close()` on cleanup |
| `AdminDashbord/src/components/OrderNotificationListener.jsx` | In-app toast + `new Audio('/notification.mp3')` on `newOrder` |
| `AdminDashbord/src/layouts/AdminLayout.jsx:13-36` | **Second, duplicate `newOrder` listener** → top-right toast |
| `AdminDashbord/src/utils/api.js`, `src/config.js` | axios instance; `API_URL`, `SOCKET_URL` |
| `AdminDashbord/src/components/ui/{Card,Badge,Button,Modal,Table,Input}.jsx` | UI primitives used by Orders |
| `AdminDashbord/src/App.jsx` | `/orders` route wrapped by `AdminLayout` + `AdminAuth` |
| `AdminDashbord/package.json` | `socket.io-client@^4.8.1`, `jspdf`, `jspdf-autotable`, `lucide-react`, `react-router-dom` |

Expo side:

| File | State |
|---|---|
| `gola-expo-preview/src/screens/Orders/OrdersScreen.js` | 6-line `<PlaceholderScreen title="Orders" />` |
| `gola-expo-preview/src/api/apiClient.js` | Central `api.get/post/put/patch/delete` |
| `gola-expo-preview/src/api/config.js` | Presets (`lan` active) |
| `gola-expo-preview/package.json` | **no `socket.io-client`** yet; no TypeScript |

---

## 2. Orders UI elements and actual interactions

1. **Header** — "Orders Management".
2. **View mode** — a single "Grouped" button; `viewMode` starts `'grouped'` and **nothing sets `'individual'`** → individual view is unreachable dead code.
3. **Status filter chips** — `All`, `PLACED`, `ACCEPTED`, `CHANGED`, `CANCELLED`, `COMPLETED`, `Pending`, `Preparing`, `Ready`, `Cancelled`; client-side equality match on session `status`.
4. **Search** — client-side match on customer name, mobile, or `sessionId`.
5. **Session grid** — `SessionOrderCard` list (1/2/3 responsive columns).
6. **`SessionOrderCard`**
   - Header: customer name/mobile, session time; shows order type / table / delivery tag.
   - Shows the first 2 orders with an expand toggle; each order row: orderId + time, status badge, amount, first 3 items, customizations, and a previous-order snapshot indicator when present.
   - **Status action buttons** (per order): PLACED/Pending → "Accept Order" (`ACCEPTED`); CHANGED/ChangeRequested/Updated → "Re-Accept" (`ACCEPTED`); ACCEPTED/Accepted → "Start Preparing" (`Preparing`); Preparing → "Mark as Ready" (`Ready`); Ready → "Complete Order" (`COMPLETED`); CANCELLED/Cancelled and COMPLETED/Completed show static text. **There is no Cancel action in the UI.**
   - **KOT button** — a non-functional placeholder (`console.log('TODO: Print KOT')`).
   - **Bill button** — opens the web-only bill modal (jsPDF / WhatsApp share).
   - Footer: per-session total computed over **visible** orders only; "View Session Details".
7. **Session Details modal** — all orders + items + totals for the session.
8. **Bill Options modal** — Save PDF / Share on WhatsApp (`jsPDF`, `jspdf-autotable`) — **web-only, cannot run in Expo Go.**
9. **States** — loading spinner; empty "No orders found"; **fetch error only `console.error`** → also renders "No orders found". No retry.
10. **Real-time** — `sessionOrderUpdate` upserts/refreshes a session; `newOrder` shows a banner/toast (+ sound via `OrderNotificationListener`, plus a **second** toast in `AdminLayout`).

**Side effects that must NOT be ported:** on "Accept Order", the web page dynamically imports `printService` and calls `printOrder(printableOrder, 'BOTH')` which `POST`s to `http://localhost:6001/print` (legacy print-service), then `confirmPrintSuccess` (`PUT /orders/print-success`). Bill/PDF/WhatsApp are all web-only.

---

## 3. Backend API + Socket.IO map

`server/routes/orderRoutes.js` (registered before the `/:id` catch-alls where order matters):

| Method | Path | Controller | Notes |
|---|---|---|---|
| GET | `/api/orders` | `getOrders` (`orderController.js:227-234`) | All orders, `populate('userId','name mobile')`, `sort({createdAt:-1})` |
| GET | `/api/orders/grouped` | `getGroupedOrders` | Groups by `sessionId`, newest-first sessions |
| GET | `/api/orders/analytics` | `getAnalytics` | Aggregates (used by Dashboard/Analytics, not Orders) |
| GET | `/api/orders/:id` | `getOrderById` | Single order, populated; `404` if missing |
| POST | `/api/orders` | `createOrder` | New order; default status `PLACED`; emits `sessionOrderUpdate` + `newOrder` |
| PUT | `/api/orders/:id/status` | `updateOrderStatus` | Body `{status, feedbackStatus}`; validates transition; returns the **whole session's orders array** |
| PUT | `/api/orders/:id/update` | `updateOrder` | Edit items; blocked for CANCELLED/COMPLETED; stores snapshot, sets `CHANGED`; emits `sessionOrderUpdate` |
| PUT | `/api/orders/print-success` | `confirmPrintStatus` | Marks `kotPrinted`, pushes `kotHistory`; emits `sessionOrderUpdate` |

**Socket.IO (`server/server.js`)** — server broadcasts to **all** connected clients (no rooms). Only two events are emitted:

- `sessionOrderUpdate` — `{ sessionId, orders }` (emitted from `createOrder` :73, `updateOrderStatus` :169, `updateOrder` :537, `confirmPrintStatus` :616).
- `newOrder` — `{ orderId, sessionId, tableNumber, orderType, isDelivery, deliveryAddress, totalAmount, itemsCount, customerName }` (from `createOrder` :79).

**Auth:** none of the order routes have any auth/authorization middleware.

**Status values (`server/models/Order.js:25-31`)** — enum: `PLACED, ACCEPTED, CHANGED, CANCELLED, COMPLETED` + legacy `Pending, Accepted, Preparing, Ready, ChangeRequested, Updated`. Default `PLACED`. **Uppercase `PREPARING`/`READY` are not in the enum.**

---

## 4. Session grouping + status transitions

- **Session id (`server/utils/SessionManager.js`):** `user_{userId}_date_{YYYYMMDD}` built from the **server-local** date (`getFullYear/getMonth/getDate`), not UTC. `createdAt` is stored in UTC — orders near local midnight depend on server timezone.
- **Grouping** is done in three places and they are not perfectly consistent:
  - Server `getGroupedOrders` — sorts orders **newest-first**.
  - Socket handler inside `Orders.jsx` — sorts session orders **oldest-first** (`createdAt: 1`).
  - REST response consumed as-is.
  `orders[0]` is used for customer/type fields, so the chosen representative order can differ between a REST load and a socket update.
- **Session totals:** both server grouping and the socket handler sum `totalAmount` over **all** orders; the `SessionOrderCard` footer sums only **visible** orders (cancelled/changed hidden) → inconsistent session totals.
- **Session status:** "worst"/highest-priority active status across the session's orders; client and server use slightly different priority tables (e.g. initial `'Completed'`).
- **Transition whitelist (canonical, from `updateOrderStatus`):**
  - `PLACED → ACCEPTED, CANCELLED`
  - `ACCEPTED → PREPARING, READY, COMPLETED, CANCELLED`
  - `CHANGED → ACCEPTED, CANCELLED`
  - `PREPARING → READY, COMPLETED, CANCELLED`
  - `READY → COMPLETED, CANCELLED`
  - `CANCELLED → (none)`, `COMPLETED → (none)`
  - Legacy canonicalization: `PENDING→PLACED`, `CHANGEREQUESTED/UPDATED→CHANGED`.
- **Ordering flip, double update:** a status change is applied both by the HTTP response (whole session array) and by the incoming `sessionOrderUpdate` socket event → two state writes for one action; combined with the different array ordering this can cause visible reorder/flicker.

---

## 5. Verified bugs / limitations / risks

1. **No error UI / retry.** Fetch failure is only `console.error`; the screen then shows "No orders found" (misleading) with no way to retry.
2. **Duplicate `newOrder` listeners.** `AdminLayout.jsx:31` and `OrderNotificationListener.jsx` both subscribe to `newOrder` → two toasts (and sound) per order.
3. **Double state update per status change.** HTTP response + `sessionOrderUpdate` both mutate state.
4. **Order array ordering inconsistency.** REST `grouped` = newest-first; socket `sessionOrderUpdate` = oldest-first; `orders[0]` customer/type can change.
5. **Session total inconsistency.** Card footer uses visible (non-hidden) orders; details modal / `session.totalAmount` / socket handler use all orders.
6. **Hidden orders can empty a card.** `SessionOrderCard` filters out CANCELLED/CHANGED orders; if all are hidden it returns `null`, so a session can silently disappear — and the `CANCELLED` filter chip can appear to have no results.
7. **No Cancel action** in the admin UI despite the filter chip, backend support, and a real `CANCELLED` state.
8. **KOT button is a no-op** placeholder (`console.log`).
9. **`viewMode 'individual'` is unreachable** dead code (only the Grouped button exists).
10. **Accept has a printing side effect** (`print-service` on `localhost:6001`), with browser `alert`/Notification APIs. Printing is out of scope for Expo.
11. **Status update bypasses schema validation.** `updateOrderStatus` uses `Order.updateOne(...)` **without `runValidators`**, so the enum is not enforced on write (transition whitelist is the only guard).
12. **No auth on any order endpoint** — anyone who can reach the server can read all orders and change statuses. CORS additionally allows no-origin requests (mobile/Postman). Security risk.
13. **Server-local date grouping** — `SessionManager` uses server timezone, so session boundaries can differ from the customer's local day.
14. **Unbounded fetches / no pagination.** `getOrders` and `getGroupedOrders` return every order.
15. **Broadcast to everyone.** Socket.IO has no rooms/scoping; all connected admins/kitchen receive everything.
16. **Bill/PDF/WhatsApp and KOT print are web-only**; `jsPDF`/`jspdf-autotable`/`printService` cannot be reused in Expo Go.

> Not verified live (would require a mutation, which this phase forbids): that `updateOrderStatus` persistence actually writes — inferred from code (`Order.updateOne`), not executed.

---

## 6. Proposed React Native implementation plan (for approval — not implemented)

**Scope for Expo Orders (no printing, no PDF, no KOT):**

1. **Service** `gola-expo-preview/src/api/orderService.js` (reuse `apiClient`):
   `getOrders()`, `getGroupedOrders()`, `getOrderById(id)`, `updateOrderStatus(id, status)` (`PUT /orders/:id/status`). **Do NOT add** `printOrder`, `confirmPrintSuccess`, or `/update`.
2. **Socket client** `gola-expo-preview/src/api/socketClient.js` — `socket.io-client` connecting to the base URL with `/api` stripped, exposing `subscribeToOrders(handlers)` / `disconnect()`. Pure-JS client → Expo Go compatible; install via `npx expo install socket.io-client`.
3. **Pure utils** `gola-expo-preview/src/utils/orderUtils.js` (+ `orderUtils.test.js` via `node --test`, mirroring `dashboardMetrics`): canonical status map, status→badge color, session status priority, session totals (consistent rule), visible-orders filter, action-list per status. Reuse currency/number formatting from `dashboardMetrics.js`.
4. **Components** under `src/components/orders/`: `SessionOrderCard.js`, `StatusBadge.js`, `OrderItemRow.js`, `SessionDetailsModal.js` (RN `Modal`), optional `FilterChips.js`/`SearchBar.js`.
5. **Screen** — replace the placeholder `src/screens/Orders/OrdersScreen.js` with a `FlatList`/`ScrollView` + `RefreshControl` screen: header, status chips, search, session grid, real **loading / empty / error+Retry** states, pull-to-refresh.
6. **Status actions** (no side effects): Accept (`PLACED→ACCEPTED`), Re-Accept (`CHANGED→ACCEPTED`), Start Preparing (`ACCEPTED→Preparing`), Mark Ready (`Preparing→Ready`), Complete (`Ready→COMPLETED`). Optional Cancel action (`PLACED/ACCEPTED/…→CANCELLED`) — **decision needed** since the web UI omits it.
7. **Real-time** — subscribe `sessionOrderUpdate` (upsert the session with a consistent sort) and `newOrder` (in-app banner; **no** system Notification API, avoid `expo-notifications`). One listener per mount, cleaned up on unmount to avoid the web's duplicate-listener bug.
8. **Explicitly out of scope:** printing/Bluetooth/KOT, PDF/WhatsApp bill, individual view (dead in web), backend/DB changes.

---

## 7. Dependencies needed

| Need | Recommendation | Notes |
|---|---|---|
| HTTP | None — reuse `apiClient.js` | Already present |
| Real-time | `socket.io-client` via `npx expo install` | Pure JS, Expo Go compatible; server is v4 |
| Icons | `@expo/vector-icons` | Already bundled; avoid `lucide-react` |
| Do **not** add | `jspdf`, `jspdf-autotable`, `printService`, `react-router-dom` | Web-only |

---

## 8. Test cases for the Expo Go tablet preview

1. **Load** — grouped sessions render; count matches read-only API (28 sessions / 73 orders).
2. **Status chips** — filtering matches session status.
3. **Search** — by name / mobile / sessionId.
4. **Expand / collapse** and **Session Details modal**.
5. **Pull-to-refresh** re-fetches without layout breakage.
6. **Error + Retry** — server offline shows a clear error and Retry (new vs web).
7. **Empty** — no orders → empty state, no crash.
8. **Real-time** — with a second client/order, session refreshes and a banner appears; verify **no duplicate banners/listeners**.
9. **Socket reconnect** — toggle Wi-Fi; connection recovers.
10. **Status update persists** — Accept a `PLACED` order and confirm it sticks after refresh. *(Note: this mutates data; requires a throwaway/test order and explicit approval before running.)*
11. **Robustness** — missing `userId`, empty `items`, legacy vs new statuses.
12. **No regression** — other tabs and `ConnectionStatus` still work.

---

## 9. Files that would need modification (implementation phase)

**To modify**
- `gola-expo-preview/src/screens/Orders/OrdersScreen.js` (replace placeholder)
- `gola-expo-preview/src/api/config.js` (add `getSocketUrl()`, optional)
- `gola-expo-preview/package.json` (add `socket.io-client` via `expo install`)

**To add**
- `gola-expo-preview/src/api/orderService.js`
- `gola-expo-preview/src/api/socketClient.js`
- `gola-expo-preview/src/utils/orderUtils.js` (+ `orderUtils.test.js`)
- `gola-expo-preview/src/components/orders/{SessionOrderCard,StatusBadge,OrderItemRow,SessionDetailsModal}.js`
- `gola-expo-preview/src/components/orders/{FilterChips,SearchBar}.js` (optional)

**Must NOT touch**
- `server/`, `AdminDashbord/`, `client/`, `print-service/`, `react native frontend/`, and the DB.

---

## 10. Open decisions before implementation

1. **Cancel action** — add it to the RN UI (backend supports it) or mirror the web and omit it?
2. **Real-time dependency** — approve adding `socket.io-client`, or start with HTTP + pull-to-refresh only?
3. **Individual view** — omit (dead in web) or implement?
4. **Session totals** — adopt the all-orders total (server/socket) everywhere, or keep the visible-only total?
5. **Testing mutations** — how to validate status updates on-device without polluting real data (throwaway order vs. mock)?
