# Gola Restaurant — Phase 7: POS Billing Implementation Report

> Implementation report for the Billing module in the React Native (Expo) admin app. Scope limited to `gola-expo-preview/` and `docs/`. No backend changes were made. No `server/`, `AdminDashbord/`, `client/`, `print-service/`, or `react native frontend/` files were modified. Verification was read-only plus unit tests.

- **Date:** 2026-10-09
- **Target:** `gola-expo-preview/` (Expo Go on a physical Android tablet)
- **Reference clients:** `AdminDashbord/src/services/billingService.js`, `server/controllers/orderController.js`, `server/routes/couponRoutes.js`

---

## 1. Audit findings (Phase 7A)

### 1.1 There is no persisted billing/POS concept in the backend

- Only **6 models exist:** `User`, `Order`, `Coupon`, `Feedback`, `Category`, `Item`. There is **no `Bill`, `Invoice`, `Payment`, or `Session` model.**
- Orders are the only money record. `Order` stores `totalAmount` (final, after discount), `grossTotal` (pre-discount), `discountAmount`, `couponCode`, `items[]`, `status`, `audience`, and `createdAt`. **No `tax`, `serviceCharge`, or `deliveryFee` field exists.**
- The Orders module derives "sessions" purely on read from `GET /api/orders` (session ids like `user_<userId>_date_<YYYY-MM-DD>`); sessions are **not** stored or closable.

### 1.2 Order creation is the intended write path — and the blocker

`POST /api/orders` (`server/controllers/orderController.js`) is the only way to persist an order. It was inspected and **cannot be safely called from a tablet POS**:

- The `Order` schema requires `userId` (required) and `orderType` (`enum ['Dine-in','Takeaway']`). `createOrder` also reads the current socket session via `SessionManager.getCurrentSessionId(userId)`.
- Creating an order **emits customer-facing Socket.IO events** (`newOrder`, `sessionOrderUpdate`) and requires a real customer `userId`.

There is no anonymous/table-side order endpoint, and fabricating a `userId` would corrupt customer order history and push phantom orders to the customer app. **Decision: the POS "Generate Bill" produces a local, in-memory preview only. It does not POST, does not persist, and does not record payment.**

### 1.3 The legacy external billing API is defunct

`AdminDashbord/src/services/billingService.js` points at `https://resturent-billing.onrender.com/api`. It was probed and is **defunct** (503 / timeouts). The Expo app does **not** call it and references no external billing host.

### 1.4 Coupon validation is a real, read-only contract

`POST /api/coupons/validate` (`server/routes/couponRoutes.js`) takes `{ code, cartTotal }` and returns `{ success, code, discountType, value, discountAmount }`. Invalid/expired returns `404 {message:'Invalid or expired coupon code'}`; below-minimum returns `400 {message}`. This is read-only (no persistence, no redemption), so the Expo app uses it to show a verified discount.

### 1.5 Pricing rule

All bill prices come from the **customer-facing `price`** on items fetched via `GET /api/items?audience=customer`. The server remains the source of truth. The bill subtotal is `Σ(price × quantity)`; no price, tax, or discount is invented on the client.

---

## 2. Files created / modified

**Added (Expo):**
| File | Purpose |
|---|---|
| `src/utils/billingUtils.js` | Pure CommonJS cart/coupon math: quantity clamping, sellability, add/increment/decrement/remove/clear, totals, discount sanitizing, payable, `canGenerateBill`, `formatCurrency`. |
| `src/utils/billingUtils.test.js` | Unit tests for all helpers (14 tests). |
| `src/api/billingService.js` | `validateCoupon(code, cartTotal)` → `POST /coupons/validate`. |
| `src/screens/Billing/BillPanel.js` | Cart/bill panel: line steppers, remove, clear, coupon input/apply, subtotal/discount/payable, payment note, Generate Bill. |
| `src/screens/Billing/BillPreviewModal.js` | Local preview modal labelled "Preview only — not saved / Payment not recorded". |

**Modified (Expo):**
| File | Change |
|---|---|
| `src/screens/Billing/BillingScreen.js` | Replaced the `<PlaceholderScreen title="Billing" />` stub with the full POS screen (menu picker + cart + preview). |

Navigation is unchanged: `src/navigation/RootNavigator.js` already registered `BillingScreen`, so the drawer "Billing" destination now renders the real screen.

---

## 3. Behavior implemented

- **Header:** "Gola Restaurant — Billing" with a subtitle stating it is a local preview and payment is not recorded.
- **Menu picker:** customer menu (`audience=customer`), search by name, category chips derived from the loaded items, price and availability shown. `available === false` items are disabled. Cards expose Add, then a `− / qty / +` stepper overlapping the cart.
- **Cart / bill:** quantity steppers (1–99, "−" at 1 removes), per-line remove, Clear with an `Alert` confirm, subtotal, verified coupon discount, and **Final Payable**.
- **Coupon:** optional `POST /coupons/validate` lookup. Applying validates against the current subtotal; any cart change clears the coupon and prompts re-apply so a stale discount can never persist. Discount is clamped to `[0, subtotal]`.
- **Generate Bill:** enabled only for a valid, non-empty cart. Opens a **local preview modal** with a timestamped line list and totals, a prominent "Preview only — not saved" banner, and "Payment not recorded". No network write occurs.
- **Responsive:** two-pane (menu + fixed bill side panel) at width ≥ 900; single-pane with a bottom summary bar and a slide-up cart modal below that. Grid is 1/2/3 columns by width.
- **States:** loading, error+retry, pull-to-refresh, empty-menu and no-match empty states, and a non-blocking stale-data error banner.

### Explicitly out of scope (not implemented)
Payment collection/gateways, invoice persistence, session closing, GST/tax/service charge, PDF export, thermal/KOT printing, printer discovery, and backend order creation. `POST /api/orders` is intentionally never called.

---

## 4. Verification

- `node --test src/utils/*.test.js` → **88/88 pass** (14 new billing tests; 74 pre-existing).
- `npx expo lint` → **0 errors**, 4 pre-existing warnings (unused arg in `apiClient.js`; BOM in the 3 untouched placeholder screens `Category`, `Menu`, `Settings`).
- `npx expo-doctor` → **21/21 checks passed**.
- `npx expo export --platform android` → **success** (Metro bundled 1432 modules).

Pending: visual check on a physical tablet.

---

## 5. Known limitations / follow-ups

- The bill is **ephemeral**: closing or reloading the screen discards it. Persisting a bill requires a backend endpoint that does not currently exist.
- To make "Generate Bill" create a real order, the backend needs a POS-safe order path (e.g. a table-side audience and a `userId` strategy that does not disturb customer order/session tracking). This is a backend change and outside this phase.
- Settings is the only remaining admin module from the roadmap.
