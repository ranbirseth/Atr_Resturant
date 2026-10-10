# Gola Restaurant — Phase 3 Step 5B: Menu & Categories + Dual-Pricing Implementation Report

> Implementation report for dual-pricing (Customer/Staff) and server-authoritative order pricing in `server/`, plus the React Native (Expo) Menu & Categories module. Scope limited to `server/`, `gola-expo-preview/`, and `docs/`. No `AdminDashbord/`, `client/`, `print-service/`, `react native frontend/`, or database files/data were modified. No order, item, or category was created, edited, or deleted — all verification used read-only GETs and unit tests.

- **Date:** 2026-10-09
- **Target:** `server/` (Node/Express/Mongoose API) + `gola-expo-preview/` (Expo Go on a physical Android tablet)
- **Reference:** `AdminDashbord/src/pages/` menu + category management, `client/` checkout contract
- **Audit this implements:** [Menu & Categories + Dual-Pricing Audit (Phase 3 Step 5A)](../audits/menu-categories-dual-pricing-audit.md)

---

## 1. Files added or modified

### Backend — modified
| File | Change |
|---|---|
| `server/models/Item.js` | Added `staffPrice` (finite ≥ 0; `required` only for new docs via `function() { return this.isNew; }`) and `availableForStaff` (Boolean, default true). |
| `server/models/Category.js` | Added `customerVisible` and `staffVisible` (Boolean, default true). Legacy `isVisible` retained. |
| `server/models/Order.js` | Added `audience` (String, enum `['CUSTOMER','STAFF']`, default `'CUSTOMER'`). |
| `server/controllers/itemController.js` | Audience-aware `getItems` (customer default, bare array, staff-only fields hidden from customers); create/update validation + field whitelist; category-existence check (update only when the category changes); seed data now sets `staffPrice`. |
| `server/controllers/categoryController.js` | Create/update validation + whitelist; case-insensitive duplicate check; rename cascades to items; delete blocked while items reference the category. |
| `server/controllers/orderController.js` | Server-authoritative line items & subtotal; audience normalization; staff-hidden-category enforcement; server-side coupon recomputation; `status` set explicitly to `'PLACED'`; correct `estimatedPreparationTime`. |
| `server/routes/couponRoutes.js` | `validateCoupon` refactored onto the shared `computeCouponDiscount` (identical semantics). |

### Backend — added
| File | Purpose |
|---|---|
| `server/utils/menuUtils.js` | Pure, Mongoose-free helpers: price/boolean/quantity coercion, `normalizeAudience`, `categoryKey`, `validateItemInput`, `validateCategoryInput`, `buildAuthoritativeOrder` (+ writable-field lists). |
| `server/utils/couponUtils.js` | `computeCouponDiscount(coupon, cartTotal)` → `{ ok, discountAmount }` or `{ ok: false, reason }` (`INVALID_COUPON` / `INVALID_TOTAL` / `BELOW_MINIMUM`). |
| `server/utils/menuUtils.test.js` | Focused unit tests for the backend helpers. |
| `server/utils/couponUtils.test.js` | Focused unit tests for coupon math. |

### Expo (`gola-expo-preview/`) — added
| File | Purpose |
|---|---|
| `src/api/menuService.js` | Thin `apiClient` wrapper: `getItems(audience)`, `createItem`, `updateItem`, `deleteItem`, `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`. |
| `src/utils/menuUtils.js` | Pure CommonJS helpers (testable in Node): price formatting, `audiencePrice`, `hasStaffPrice`, `filterItems`, `itemCountForCategory`, form validators, `getErrorMessage`. |
| `src/utils/menuUtils.test.js` | 13 focused unit tests. |
| `src/components/menu/StateView.js` | Shared loading / error+retry / empty state. |
| `src/screens/MenuCategories/ItemFormModal.js` | Add/edit item form (customer + staff price, category picker, veg, prep time, availability). |
| `src/screens/MenuCategories/MenuManagement.js` | Item list (search, category + veg filters, responsive columns), dual-price cards, delete confirmation. |
| `src/screens/MenuCategories/CategoryManagement.js` | Category list with per-audience visibility badges, live item counts, delete guarding. |
| `src/screens/MenuCategories/CategoryFormModal.js` | Add/edit category form (name + customer/staff visibility toggles). |

### Expo — modified
| File | Change |
|---|---|
| `src/screens/MenuCategories/MenuCategoriesScreen.js` | Replaced the placeholder with the real two-section container (Menu Management / Category Management) that owns and reloads shared data. |

### Not touched
`AdminDashbord/`, `client/`, `print-service/`, `react native frontend/`, the database contents, `RootNavigator.js`, `theme.js`, `apiClient.js`.

---

## 2. Backend schema & data model

| Model | Field | Notes |
|---|---|---|
| `Item` | `staffPrice` | Finite number ≥ 0. `required` only when `isNew`, so legacy documents load and can still be edited; new items cannot be created without it. |
| `Item` | `availableForStaff` | Boolean, default `true`. |
| `Category` | `customerVisible`, `staffVisible` | Boolean, default `true`. Effective customer visibility = `isVisible && customerVisible`. |
| `Order` | `audience` | `'CUSTOMER'` \| `'STAFF'`, default `'CUSTOMER'`. Missing/legacy values are treated as CUSTOMER. |

The backend never substitutes `price` for a missing `staffPrice` and never rejects legacy reads.

---

## 3. Server-authoritative pricing & order creation

`POST /api/orders` (`orderController.createOrder`) now:

1. Normalizes `audience` (`normalizeAudience`).
2. Rejects empty carts and any non-ObjectId `itemId` up front.
3. Loads the referenced items from MongoDB and, for **STAFF** orders only, hides items whose category has `staffVisible: false`. (Customer checkout behavior is unchanged.)
4. Builds line items via `buildAuthoritativeOrder` — **client-supplied `price`, `totalAmount`, `grossTotal`, and `discountAmount` are ignored**. Quantity must be an integer 1–999; audience availability is enforced.
5. Recomputes the coupon against the **server** subtotal (`computeCouponDiscount`); an unknown/inactive/below-minimum coupon returns HTTP 400.
6. Sets `totalAmount = max(0, subtotal − discount)`, `grossTotal = subtotal`, `status = 'PLACED'`, and `audience`.
7. Derives preparation time from the real `estimatedPreparationTime` field (the previous code read a non-existent field). Socket `sessionOrderUpdate` / `newOrder` events are preserved.

`GET /api/items?audience=staff|customer` — customer is the default and returns a bare array with `staffPrice`/`availableForStaff` projected out; staff returns them. `audience` is a display switch, **not** an auth boundary (auth is out of scope).

---

## 4. Category integrity rules

- **Duplicate guard:** create/rename reject a name that collides case- and whitespace-insensitively.
- **Rename cascade:** renaming a category updates every referencing item's `category` string so items never orphan.
- **Delete guard:** deleting a category with items returns HTTP 400 with an `itemCount`; nothing is silently deleted or reassigned.
- **Update safety:** an item's category is validated against the collection only when it actually changes, preserving the existing web admin's whole-object update behavior.

---

## 5. Expo UI

One drawer destination, two in-screen sections (segmented control, no bottom tabs). The container owns `items` + `categories`, loads them with `Promise.all`, reloads on focus, and passes an `onChanged` callback so any child mutation refreshes both lists (keeping item counts and the category picker consistent).

- **Menu Management:** search + category chips + veg filter, responsive grid (1/2/3 columns by width). Each card shows customer and staff price (`Not set` + warning for legacy items), customer/staff availability, and Edit/Delete. Delete asks for confirmation.
- **Category Management:** cards show per-audience visibility badges and a live item count. Add/Edit uses a modal with name + customer/staff visibility toggles; the legacy `isVisible` flag is kept in sync with the customer toggle. Delete surfaces the server's "still in use" message.
- Forms are validated client-side with the shared `menuUtils` helpers; server errors are shown inline via `getErrorMessage`.
- Only React Native core components are used; no new dependencies. Modals are mounted fresh (keyed) rather than reset via `useEffect`, satisfying the project's React hooks lint rules.

---

## 6. Verification summary

| Check | Command | Result |
|---|---|---|
| Backend unit tests | `node --test server/utils/menuUtils.test.js server/utils/couponUtils.test.js` | **25/25 pass** |
| Backend module load | `node -e "require(...)"` for all changed server modules | OK |
| Expo menu unit tests | `node --test src/utils/menuUtils.test.js` | **13/13 pass** |
| Expo combined utils | `node --test src/utils/{menuUtils,orderUtils,dashboardMetrics}.test.js` | **47/47 pass** |
| Lint | `npx expo lint` | **0 errors**, 7 pre-existing warnings (BOM + unused `e` in untouched files) |
| Bundle compile | `npx expo export --platform android` | Success — `dist/` bundle produced (gitignored) |
| Scope diff | `git status --short` | Only `server/`, `gola-expo-preview/`, `docs/` changed |

---

## 7. API connectivity check (read-only, no mutations)

| Check | Result |
|---|---|
| `GET /api/categories` | HTTP 200 — 17 categories |
| `GET /api/items?audience=staff` | HTTP 200 — 178 items |
| `GET /api/items?audience=customer` | HTTP 200 — 178 items, **no `staffPrice` field present** (projection verified) |
| Mutations performed | **None** — read-only GETs only |

---

## 8. Important operational finding (legacy data)

**All 178 existing items are legacy:** none currently has a `staffPrice` (or `availableForStaff`) value. The staff-facing item list renders each of these as **`Not set`** with a "Staff price needs to be configured" warning, and a **STAFF** order for such an item is rejected server-side until a staff price is added. Staff prices must be entered through the new Menu Management screen (or the web admin, once updated) before staff ordering will work for those items.

---

## 9. Deliberate scope limits

- **No authentication/security fix.** `audience` and the admin endpoints remain unauthenticated (documented in the Step 5A audit).
- **`PUT /api/orders/:id/update`** still trusts the client for re-priced items and is intentionally unchanged (out of scope).
- **No printing / KOT / PDF** code or dependencies were added.
- The Expo app exposes only item/category CRUD and staff/customer listings; it does not call the order-modification route.

---

## 10. Remaining limitations

- **Tablet visual check pending.** The agent cannot drive the physical tablet; the Android bundle compiles and the LAN API is reachable, but the author must visually confirm rendering.
- **AdminDashbord "Add item" will now fail** (HTTP 400) because the web admin does not yet send `staffPrice`. This is an expected, documented consequence of making `staffPrice` required for new items; updating the web admin is out of scope for this step.
- Existing web-admin coupon validation semantics are preserved; no behavior change was intended or observed.
- Pre-existing BOM warnings in untouched placeholder screens remain.

---

## 11. Tablet preview checklist

**Not yet verified visually by the author.** Reload the app on the tablet (Expo Go → shake → Reload), open **Menu & Categories**.

1. The two section buttons switch between Menu Management and Category Management.
2. Menu list shows item cards with Customer and Staff prices; legacy items show `Not set` + warning.
3. Search, category chips, veg filter, and pull-to-refresh work; stop the backend to confirm the error + Retry state.
4. Add an item (both prices required); it appears in the list and its category count increments.
5. Edit an item; changes persist after refresh.
6. Add a category; rename it and confirm referencing items follow; try deleting a category with items and confirm the "still in use" message.
7. Delete an item; it disappears and the category count decrements.
8. Confirm the other drawer sections (Dashboard, Orders, etc.) still work.
