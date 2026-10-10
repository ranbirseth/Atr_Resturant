# Gola Restaurant — Phase 3 Step 5A: Menu & Categories + Dual-Pricing Backend Audit

> **Read-only investigation.** No source files, dependencies, schemas, records, environment variables, or deployments were modified. No `POST`, `PUT`, `PATCH` or `DELETE` API requests were sent; no menu items, categories, coupons, orders, or payments were created, edited, or deleted. No emulator was launched. The web admin (`AdminDashbord/`), customer app (`client/`), and existing services were only read.
>
> Every claim below is tagged **[CONFIRMED]** (verified in source with `file:line`) or **[RECOMMENDATION]** / **[ASSUMPTION]`. Where the codebase does not implement something, it is stated explicitly.

- **Date:** 2026-10-09
- **Scope:** `server/`, `client/`, `AdminDashbord/`, `gola-expo-preview/`, plus a structural glance at `react native frontend/`
- **Goal:** plan Menu & Categories Management with a Customer vs Staff dual-price model for the Expo admin

---

## 1. Existing architecture and file map

### 1.1 Runtime topology **[CONFIRMED]**

| Layer | Tech | Location | Notes |
|---|---|---|---|
| GOLA API (authoritative) | Node/Express + Mongoose | `server/` | Orders, items, categories, coupons, feedback, users, admin gate. Mounted in `server/server.js:95-101`. |
| Customer web app | React + Vite + axios | `client/` | `client/src/config.js:1` → `VITE_API_BASE_URL \|\| "http://localhost:5000/api"`. |
| Web admin | React + Vite + axios | `AdminDashbord/` | Main API `AdminDashbord/src/config.js:1`; **separate** billing/POS API `AdminDashbord/src/services/billingService.js:3-5`. |
| Expo admin (new) | Expo/React Native | `gola-expo-preview/` | Drawer nav implemented (Phase 2 Step 4); Menu & Categories is a placeholder. |
| Billing/POS API (external) | Unknown (cloud) | `https://resturent-billing.onrender.com/api` | Hardcoded in `billingService.js:4`. Own `menu-items` + `orders`. |
| Print service | Node | `print-service/` | `http://localhost:6001` (`AdminDashbord/src/services/printService.js:5`). |

### 1.2 Server file map **[CONFIRMED]**

| Area | Files |
|---|---|
| Models | `server/models/Item.js`, `Category.js`, `Order.js`, `Coupon.js`, `User.js`, `Feedback.js` |
| Controllers | `server/controllers/itemController.js`, `categoryController.js`, `orderController.js`, `authController.js`, `upsellController.js` (ESM, see note) |
| Routes | `server/routes/itemRoutes.js`, `categoryRoutes.js`, `orderRoutes.js`, `couponRoutes.js`, `feedbackRoutes.js`, `authRoutes.js`, `adminAuth.js`, `upsellRoutes.js` |
| Middleware | `server/middleware/upload.js` (multer image upload) |
| Scripts | `server/seedMenu.js` (155 items), `server/scripts/syncCategories.js`, `migrateOrderStatus.js`, `migrateExistingOrders.js` |
| Utils | `server/utils/SessionManager.js`, `orderIdGenerator.js`, `analytics.js` |
| Entry | `server/server.js` (mounts routes, Socket.IO, static `/uploads`) |

> **[CONFIRMED]** `server/controllers/upsellController.js` and `config/upsellRules.js` use ESM `import/export` while the rest of the server is CommonJS, and `upsellRoutes` is **not mounted** in `server/server.js`. This is dead/possibly broken code and is irrelevant to menu management.

### 1.3 Route map (GOLA API) **[CONFIRMED]**

| Method | Path | Handler | Auth middleware | Notes |
|---|---|---|---|---|
| GET | `/api/items` | `getItems` | **None** | Returns all items (no audience filter, no pagination) |
| POST | `/api/items` | `createItem` | **None** | `upload.single('image')` multipart |
| PUT | `/api/items/:id` | `updateItem` | **None** | `upload.single('image')` |
| DELETE | `/api/items/:id` | `deleteItem` | **None** | |
| POST | `/api/items/seed` | `seedItems` | **None** | ⚠️ wipes all items then inserts 5 demo items |
| GET | `/api/categories` | `getCategories` | **None** | |
| POST | `/api/categories` | `createCategory` | **None** | duplicate-name pre-check |
| PUT | `/api/categories/:id` | `updateCategory` | **None** | |
| DELETE | `/api/categories/:id` | `deleteCategory` | **None** | no item guard |
| POST | `/api/orders` | `createOrder` | **None** | public |
| GET | `/api/orders`, `/api/orders/grouped`, `/api/orders/:id`, `/api/orders/analytics` | — | **None** | |
| PUT | `/api/orders/:id/status`, `/api/orders/:id/update`, `/api/orders/print-success` | — | **None** | |
| GET/POST/PUT/DELETE | `/api/coupons*` | inline in `couponRoutes.js` | **None** | |
| GET/POST | `/api/feedback` | inline | **None** | |
| POST | `/api/auth/login`, `/api/auth/check`, GET `/api/auth/all` | `authController` | **None** | mobile-based, no password |
| POST | `/api/admin/verify-code` | inline in `adminAuth.js` | — | compares `process.env.ADMIN_SECRET_CODE`, returns boolean; not tied to any subsequent request |

> **Key security fact [CONFIRMED]:** No route is protected by auth middleware. The `// @access Admin` comments on item/category handlers (`itemController.js:35,52,71`; `categoryController.js:17,40,62`) are **not enforced**. `server.js` has no `app.use` auth guard.

---

## 2. Existing menu/category schema

### 2.1 `Item` **[CONFIRMED]** — `server/models/Item.js:3-37`

| Field | Type | Constraints / default |
|---|---|---|
| `name` | String | required |
| `price` | Number | required (single price; no customer/staff split) |
| `description` | String | optional |
| `image` | String | optional; stored as `/uploads/<file>` or external URL |
| `category` | **String** | required — **plain string, NOT an ObjectId ref** to `Category` |
| `isVeg` | Boolean | default `true` |
| `estimatedPreparationTime` | Number | minutes, optional |
| `rating` | Number | default `0` |
| `available` | Boolean | default `true` |
| `createdAt`/`updatedAt` | Date | `{ timestamps: true }` |

> **There is no audience, staff price, role, or availability-by-audience field. [CONFIRMED]**

### 2.2 `Category` **[CONFIRMED]** — `server/models/Category.js:3-14`

| Field | Type | Constraints |
|---|---|---|
| `name` | String | required, `unique: true`, `trim: true` |
| `isVisible` | Boolean | default `true` |

> No ordering/position field, no image, no description, no audience/visibility split. **There is one global category list. [CONFIRMED]**

### 2.3 Category ↔ item integrity **[CONFIRMED]**

- `Item.category` is a free String; `itemController.createItem/updateItem` (`itemController.js:36-68`) do **not** verify the category exists in the `Category` collection. Items can reference non-existent categories.
- `categoryController.deleteCategory` (`categoryController.js:63-76`) deletes the category record only. It does **not** reassign, block, or warn about items whose `category` string matches. Deleted categories leave **orphan items**.
- `categoryController.updateCategory` (`categoryController.js:41-58`) renames only the `Category` document. Items keep the **old** `category` string, so a rename **silently disconnects** all its items from the category (customer `Home.jsx` filters by exact string equality — see §4).
- `server/scripts/syncCategories.js` is a one-way helper that creates categories from distinct `item.category` strings (exact-match, not case-insensitive); it is **not** run automatically.

### 2.4 `Order` **[CONFIRMED]** — `server/models/Order.js:3-66`

| Field | Notes |
|---|---|
| `orderId` | human-readable `ORD-YYYYMMDD-NNNN` (`orderIdGenerator.js`) |
| `userId` | required ObjectId ref `User` |
| `sessionId` | day-based per user (`SessionManager.js`) |
| `items[]` | `{ itemId (ObjectId ref Item), name, quantity, price, customizations[String] }` — **price is a stored snapshot** |
| `totalAmount` | required — "Final Payable Amount" |
| `grossTotal`, `couponCode`, `discountAmount` | optional |
| `orderType` | enum `['Dine-in','Takeaway']` required |
| `tableNumber` | optional |
| `status` | `PLACED/ACCEPTED/CHANGED/CANCELLED/COMPLETED` + legacy |
| `previousOrderSnapshot` | Mixed — old items/totals on modification |
| `deliveryAddress`, `isDelivery`, `feedbackStatus`, `completionConfig`, `kotPrinted`, `kotHistory` | — |

> **There is NO payment field (`paymentMethod`, `paymentStatus`, `paid`, `amountPaid`, `transactionId`) and NO audience/customer-vs-staff field on `Order`. [CONFIRMED]**

### 2.5 `User` **[CONFIRMED]** — `server/models/User.js:3-19`
Only `name` (letters/spaces) and `mobile` (10-digit Indian). **No password, no `role`, no `isStaff`.**

---

## 3. Existing API endpoints and response shapes

### 3.1 Items **[CONFIRMED]**
- `GET /api/items` → **bare JSON array** of Item documents (`itemController.js:6-13`). Customer app assigns directly (`client/src/context/AppContext.jsx:53-54`).
- `POST /api/items` → created item (201) or `400 {message}`. Accepts multipart; if `req.file` present, `image = /uploads/<filename>` (`itemController.js:36-48`).
- `PUT /api/items/:id` → updated item or `404`/`400`.
- `DELETE /api/items/:id` → `{message:'Item removed'}` or 404.
- No duplicate-name check, no price validation (negative/zero allowed), no pagination.

### 3.2 Categories **[CONFIRMED]**
- `GET /api/categories` → bare array (`_id`, `name`, `isVisible`, timestamps).
- `POST /api/categories` → checks `Category.findOne({name})` and returns `400 'Category already exists'` (`categoryController.js:21-25`); else 201.
- `PUT /api/categories/:id` → updates `name`/`isVisible`.
- `DELETE /api/categories/:id` → `{message:'Category removed'}`; **no item handling**.

### 3.3 Orders **[CONFIRMED]**
- `POST /api/orders` body: `{ userId, items[{itemId,name,quantity,price,customizations}], totalAmount, grossTotal, couponCode, discountAmount, orderType, tableNumber, deliveryAddress, isDelivery }` (`orderController.js:10-11`). Stores `items` and `totalAmount` **verbatim**. Emits `sessionOrderUpdate` + `newOrder` over Socket.IO.
- `GET /api/orders/:id` → order (populated `userId`).
- `PUT /api/orders/:id/status` → validates transitions (`orderController.js:188-222`), returns the **session's full order array**.
- `GET /api/orders/grouped` → session-grouped view with summed `totalAmount/grossTotal/discountAmount` (`orderController.js:239-350`).
- `GET /api/orders/analytics?range=1d|7d|30d` → revenue/orders/top-items by **stored snapshot** `items.name`/`items.price` (`orderController.js:428-444`).

---

## 4. Customer app dependencies on the current API

**[CONFIRMED]** (from `client/src`, full read):

| API call | Location | Assumed shape |
|---|---|---|
| `GET /items` | `AppContext.jsx:53` | **bare array**, assigned with `setMenuItems(res.data)` |
| `GET /categories` | `AppContext.jsx:68` | bare array; uses `_id`, `name` |
| `POST /auth/login` | `AppContext.jsx:77` | `{_id,name,mobile}` |
| `POST /coupons/validate` | `AppContext.jsx:129` | `{discountAmount,...}` |
| `POST /orders` | `AppContext.jsx:155` | reads only `res.data._id` |
| `GET /orders/:id`, `PUT /orders/:id/status`, `POST /feedback` | `Countdown.jsx`, `FeedbackModal.jsx` | — |

Fields the customer UI reads **[CONFIRMED]**:
- `_id` (only id; `id` never used), `name`, `description`, `price` (single), `category` (exact string match to `Category.name`), `image`, `available`.
- **Does not read** `isVeg`, `rating`, or `estimatedPreparationTime` anywhere.
- **Unguarded** `.toLowerCase()`/`.toUpperCase()` on `name`/`description`/`category` (`Home.jsx:13-16`, `FoodCard.jsx:18`, `FoodDetails.jsx:26`) — missing fields throw.
- `available` omission ⇒ item shows permanently "Sold Out" (`FoodCard.jsx:86-93`).

Order payload built in `OrderType.jsx:57-75` and sent in `AppContext.jsx:153-163`:

```js
items: cart.map(item => ({
  itemId: item._id, name: item.name, quantity: item.quantity,
  price: item.price, customizations: [...]
})),
totalAmount: getFinalTotal(), grossTotal: getCartTotal(),
couponCode, discountAmount, orderType, tableNumber, isDelivery, deliveryAddress
```

> **Backward-compat implication:** any added `Item` fields are ignored by the customer app (it reads only the fields above), so additive schema changes are safe **[CONFIRMED]**. The customer app **must keep receiving a `price` field** and a bare-array `GET /items` response.

---

## 5. Current order price and total calculation lifecycle

**[CONFIRMED]** — trace:

1. Menu fetched: `GET /items` → cached in `AppContext` (`AppContext.jsx:53-54`).
2. Displayed: `₹{item.price}` (`FoodCard.jsx:74`, `FoodDetails.jsx:78`).
3. Cart add: the **whole item object** is spread into cart state (`AppContext.jsx:111`) and **persisted to `localStorage`** (`AppContext.jsx:12-19,46-48`).
4. Totals computed **client-side** from the cached copy: `subTotal = Σ(item.price × qty)` (`AppContext.jsx:122-124`); `getFinalTotal = subtotal − coupon.discountAmount` (`AppContext.jsx:147-151`).
5. Order sent to `POST /api/orders` with **client-computed** `price`, `totalAmount`, `grossTotal`, `discountAmount`, `couponCode`.
6. Server `createOrder` (`orderController.js:10-96`) stores `items` and `totalAmount` **verbatim, with no re-validation**. The only DB lookup is for prep time, and it uses a **non-existent field** `item.preparationTime` (model field is `estimatedPreparationTime`), so it always falls back to 15 (`orderController.js:28-36`). ⚠️ bug.
7. Order/billing screens read **stored snapshot** `item.price`/`totalAmount` (`AdminDashbord/src/pages/Orders.jsx:641`, `Dashboard.jsx:120,138`; `SessionOrderCard.jsx:370`).
8. Payment: **none** in the GOLA backend (see §6).
9. Historical orders after a price change: unchanged, because the price is embedded in `items[]` **[CONFIRMED]**.

### 5.1 Where the authoritative price is selected **[CONFIRMED — critical]**
- Today the **authoritative price is effectively the client**. The server trusts `req.body` prices/totals. A tampered `localStorage` cart or a crafted `POST /orders` can set any price/total.
- The coupon **discount math** is server-side (`couponRoutes.js:142-183`), but the **applied value at order time is echoed by the client** and not re-validated by `POST /orders`.
- **How an order identifies customer vs staff today:** it does **not** — there is no audience/role/staff marker on `Order` or `User`. **[CONFIRMED]**

### 5.2 Historical price preservation
Already satisfied for GOLA orders via the embedded item price snapshot **[CONFIRMED]**. `previousOrderSnapshot` (Mixed) preserves the prior version on edits (`orderController.js:581-589`). The external billing POS documents the same intent (`MenuForm.jsx:115`).

---

## 6. Existing customer/staff payment behavior (evidence)

**[CONFIRMED]** — what exists vs. what does not:

**Exists (external POS only, not GOLA):**
- `AdminDashbord/src/services/billingService.js:3-5` targets a **separate hardcoded backend** `https://resturent-billing.onrender.com/api`.
- Billing totals: `subtotal = Σ(price × qty)`; **hardcoded 5% GST**; `total = round(subtotal + gst − discount)` (`BillingScreen.jsx:62-64`).
- A payment **mode label** only: `paymentMode` state default `'Cash'`, options `['Cash','UPI','Card']` (`BillingScreen.jsx:14,226`), posted as `{items, discount, paymentMode}` (`BillingScreen.jsx:70-74`), printed on the bill (`PrintableBill.jsx:113`).
- The POS bill is stored by the external backend (`POST {billing}/orders`).

**Does NOT exist anywhere:**
- ❌ No `paymentMethod`, `paymentStatus`, `paid`, `isPaid`, `amountPaid`, `transactionId`, gateway SDK (Stripe/Razorpay), capture/verify/refund, or payment endpoint — in GOLA server, `client/`, or `AdminDashbord/` (`paymentMethod|paymentStatus|isPaid|\bpaid\b` → 0 hits).
- ❌ No staff-specific payment process — there is no staff concept at all.
- ❌ No link between the external POS bill and a GOLA order/session; the two have separate `/orders` routes on different hosts.
- ❌ GOLA `Order` starts at `PLACED` and moves through statuses, but is never marked paid.

> **Distinction:** two menu prices (proposed future) do **not** imply two payment methods. Minimum change: a menu price tier. Payment capture is a **separate, currently non-existent** capability and a **separate future implementation**.

---

## 7. Recommended dual-pricing data model and category model

### 7.1 Recommendation: **Option A — one shared item with audience-specific prices** **[RECOMMENDATION]**

Extend `Item` additively:

| Field | Purpose |
|---|---|
| `price` | **keep as-is** → canonical Customer price; preserved for the customer app + external POS + historical display |
| `staffPrice` | optional Number; staff-facing price |
| `available` | keep (customer availability) |
| `availableForStaff` | optional Boolean (default mirrors `available` or `true`) |

**Why A over B (separate records):**
- Orders reference items by a single `itemId`; analytics group by item `name`/`price`. Separate records would duplicate `itemId` identity and split reporting **[CONFIRMED context: `Order.items[].itemId` ref + `getAnalytics` grouping]**.
- The customer app expects a bare `/items` array with one `price`; Option B would require filtering a dedicated customer collection anyway.
- Avoids duplicate items/categories and keeps a single edit surface; matches the existing single `price` field, so migration is additive.
- Trade-offs of A: a single document holds fields for two audiences (slightly more complex validation/visibility logic); risk of accidentally exposing `staffPrice` (mitigate by audience-filtering API responses).

**Option B (separate customer/staff collections)** only makes sense if staff items diverge structurally (different photos/descriptions/workflows). No evidence of that need exists today. **[RECOMMENDATION: reject B unless requirements expand]**

### 7.2 Category model **[RECOMMENDATION]**
- **Share one `Category` collection** (avoid duplicate categories and inconsistent references), and add audience **visibility** flags: `customerVisible` (or reuse `isVisible`) and `staffVisible`.
- **Fix the string `Item.category` fragility**: migrate `Item.category` from the current name String to an ObjectId ref (`ref: 'Category'`) **or**, if a migration is too risky now, add server-side validation that `category` matches an existing category name (case-insensitive) and cascade rename/delete handling. The ref model is the durable fix but is a breaking schema change requiring a migration **[RECOMMENDATION]**.
- Category delete should **block or reassign** items; rename should **cascade** to items. Currently neither happens **[CONFIRMED]**.

---

## 8. Proposed backward-compatible backend changes

All additive; keep existing `price` and bare-array responses. **[RECOMMENDATION]**

1. `Item` schema: add optional `staffPrice`, `availableForStaff`. Keep `price`. (No required fields → no migration breaks.)
2. `GET /api/items?audience=customer|staff` (default `customer`):
   - `customer` → respond exactly today's shape (including `price`) — **unchanged** for the customer app.
   - `staff` → additionally expose `staffPrice` / staff availability; **never** leak `staffPrice` to customer responses.
3. `POST/PUT /items`: accept and validate `staffPrice` (Number ≥ 0, only when provided).
4. `POST /api/orders`: **server-side price authority** —
   - Accept `audience: 'CUSTOMER'|'STAFF'` (default `CUSTOMER`).
   - Load each `itemId`, compute the authoritative unit price for the audience, recompute line totals, `grossTotal`, apply server-validated coupon, and store the computed `totalAmount`. Reject mismatches (400) rather than trusting client values. Keeps historical snapshot semantics (store the computed price in `items[]`).
   - Add `audience` to `Order` with default `CUSTOMER` (backward compatible).
5. Category: add visibility flags; guard delete (block if items reference), cascade rename.
6. Response shapes remain arrays/objects with superset fields → existing web clients unaffected **[CONFIRMED: clients read only known fields]**.
7. Admin auth for mutations is recommended but out of scope here (see §10).

---

## 9. Proposed Expo screen/component/service changes

**[RECOMMENDATION]** — target a tablet-friendly `MenuCodes` area with two sub-destinations:

- **Menu Category** — list/create/edit/delete categories; visibility toggles; item counts. Mirror `AdminDashbord/src/pages/Categories.jsx`.
- **Menu Management** — item list + editor with an **audience selector: Customer Menu / Staff Menu**; fields: name, category (picker), description, image (URL/upload), isVeg, `estimatedPreparationTime`, customer price, staff price, availability (per audience).

Proposed structure (Expo, `gola-expo-preview/`):
- `src/api/menuService.js` (or split `itemService.js` + `categoryService.js`) — wrappers over `apiClient` for the §3/§8 endpoints.
- `src/utils/menuUtils.js` (+ `menuUtils.test.js`) — pure helpers: validation, price formatting, audience field selection, duplicate detection.
- `src/screens/MenuCategories/MenuCategoriesScreen.js` — top-level with two tabs (Category / Menu).
- `src/screens/MenuCategories/CategoryListScreen.js`, `ItemListScreen.js`, `ItemFormScreen.js` / modal.
- `src/components/menu/*` — `ItemCard`, `AudienceSelector`, `CategoryPicker`, `PriceField`, `ConfirmDialog`, `EmptyState`, `LoadingState`, `ErrorState`.

UI/UX requirements to cover: search (name), category filter, veg/non-veg, availability indicator, per-audience price display, loading/error/empty states, destructive-action confirmations (delete item/category), and pull-to-refresh. **Navigation is already implemented (Phase 2 Step 4 drawer, 7 sections); the audit does not modify it.** The Menu & Categories destination is currently a placeholder: `gola-expo-preview/src/screens/MenuCategories/MenuCategoriesScreen.js:1-6` renders `<PlaceholderScreen title="Menu & Categories" />`. Legacy `src/screens/Menu/MenuScreen.js` and `src/screens/Category/CategoryScreen.js` exist but are **not routed** in `src/navigation/RootNavigator.js`.

---

## 10. Migration, security and historical-order risks

### Migration **[RECOMMENDATION / ASSUMPTION]**
- Adding optional fields to `Item`/`Order` requires **no data backfill** to function (`staffPrice` simply absent until set). A script could seed `staffPrice = price` if the business wants staff price to default to customer price.
- Moving `Item.category` from String to ObjectId is a **breaking** change requiring a lookup/transform script and coordinated route changes; treat as a separate, opt-in migration.
- Existing 155 seeded items (`server/seedMenu.js`) contain only `price`; they remain valid.
- **Historical orders are safe**: prices are embedded snapshots (`Order.js:8-16`), so menu changes cannot rewrite past orders. The external POS explicitly documents the same (`MenuForm.jsx:115`).

### Security **[CONFIRMED risks]**
- **No auth on any menu/category/order mutation** — anyone who can reach the API can create/edit/delete the menu and orders. The admin gate (`/api/admin/verify-code`) returns a boolean only and protects nothing. **Recommend adding an auth middleware (token/role) in the implementation phase** — explicitly out of scope now.
- **Client-supplied price is trusted** by `POST /orders` (`orderController.js:10-96`) → price tampering / revenue loss. The §8 change addresses this.
- **Staff price leakage risk**: if `staffPrice` is added and `GET /items` is not audience-filtered, customer clients could read it. Filter by audience.
- **Public `/api/items/seed`** (`itemRoutes.js:10`) wipes and reseeds items with no auth — high-risk; recommend removing/guarding.
- File upload: multer accepts only image MIME/ext (`middleware/upload.js:22-35`) and 5 MB cap; but `PUT` trust of `{...item}` can set arbitrary fields.

### Compatibility **[CONFIRMED]**
- Customer app depends on: bare-array `GET /items`, the `price` field, `_id`, `name`, `description`, `category`, `image`, `available`. Additive fields are ignored. Any removal/rename of `price` or wrapping the array would break it.
- Web admin `Menu.jsx` reads a single `price`; adding `staffPrice` will need a UI update to edit it (future step).
- External POS is a **separate backend**; changing GOLA `Item` does not affect it, but the two menus will **diverge** unless unified (unresolved decision).

---

## 11. Test plan (fixtures for both audiences)

**[RECOMMENDATION]** — follow the repo's existing lightweight Node test style (`gola-expo-preview/src/utils/*.test.js` uses `node --test`; `react native frontend/` has Jest configured). Pure-logic tests run without a DB; endpoint tests should use an in-memory Mongo (`mongodb-memory-server`) + `supertest` (to be added in the implementation phase — not now).

Fixtures:
- Items: `ITEM_SHARED` (price 100, staffPrice 80), `ITEM_NO_STAFF` (price 50, no staffPrice), `ITEM_UNAVAILABLE_STAFF` (available true, availableForStaff false).
- Categories: `CAT_SHARED` (both visible), `CAT_STAFF_ONLY` (customerVisible false).

Cases:
1. `GET /items` (customer) returns `price`, does **not** expose `staffPrice`; shape still a bare array.
2. `GET /items?audience=staff` exposes `staffPrice`/availability.
3. Order as CUSTOMER uses customer price; order as STAFF uses staff price (falls back to `price` when `staffPrice` missing).
4. **Tamper test**: POST an order with a client price of 1 while menu price is 100 → server stores 100 and computed total (regression guard for §8).
5. Category delete with assigned items → blocked (or documented behavior).
6. Category rename cascades/documented behavior for items.
7. Historical order price after a menu price change → unchanged.
8. Expo `menuUtils` unit tests: validation (required name, price ≥ 0), audience field selection, search/filter, duplicate category detection.
9. Regression: existing `orderUtils.test.js` + `dashboardMetrics.test.js` still pass; `npx expo lint`; `npx expo export --platform android`.

---

## 12. Exact files to modify in the implementation phase

**Server (backend changes) — [RECOMMENDATION]:**
- `server/models/Item.js` (add `staffPrice`, `availableForStaff`)
- `server/models/Category.js` (add audience visibility flags)
- `server/models/Order.js` (add `audience` field)
- `server/controllers/itemController.js` (audience query, staff-price validation, no staffPrice leakage)
- `server/controllers/categoryController.js` (delete guard + rename cascade)
- `server/controllers/orderController.js` (server-side price authority + `audience`)
- `server/routes/itemRoutes.js`, `server/routes/categoryRoutes.js` (audience query param; auth middleware hook)
- `server/middleware/` (new `adminAuth` middleware — optional, pending security approval)
- `server/scripts/` (new `migrateMenuPrices.js` / `migrateCategoryRefs.js` if applicable)

**Expo app (`gola-expo-preview/`):**
- `src/api/menuService.js` (+ `categoryService.js`) — new
- `src/utils/menuUtils.js` (+ `menuUtils.test.js`) — new
- `src/screens/MenuCategories/MenuCategoriesScreen.js` (replace placeholder) and new sub-screens/components under `src/screens/MenuCategories/` and `src/components/menu/`

**Do NOT modify:** `client/`, `AdminDashbord/`, `print-service/`, `react native frontend/` (unless a later approved step covers the web admin price UI or POS unification).

---

## 13. Unresolved business decisions

1. **Do staff prices apply to all items or a subset?** (Recommend optional `staffPrice`; items without it fall back to `price`.)
2. **What identifies a staff order?** No existing field. Options: (a) `audience` flag on the order (recommended, default CUSTOMER), (b) a staff user account/role, (c) a new order type. `User` currently has no role and requires a valid mobile. **[needs decision]**
3. **Are categories shared with per-audience visibility, or fully separate?** (Recommend shared + visibility flags.)
4. **Payment:** two prices do **not** define two payment methods. Is staff payment handled by the existing external POS (`resturent-billing.onrender.com`) or should GOLA gain a payment step? **No GOLA payment flow exists** — separate future implementation.
5. **Menu unification:** should the GOLA menu and the external POS menu become one source of truth, or intentionally remain separate?
6. **Security:** who may set staff prices, and should menu mutations require auth? (No auth exists today.)
7. **Category integrity fix scope:** do the String→ObjectId migration now, or add validation/cascade on the existing String model?
8. **Should the customer app/website expose a staff entry point**, or is the staff menu exclusively for the Expo admin/internal use? (Customer app has no staff UI.)

---

## 14. Updated project progress tracker

| Phase | Step | Deliverable | Status |
|---|---|---|---|
| 1 | — | Thermal printer compatibility audit | Done |
| 2 | 2A | Dashboard feature audit | Done |
| 2 | 2B | Dashboard RN implementation | Done — verified on tablet |
| 3 | 3A | Orders feature audit | Done |
| 3 | 3B | Orders RN implementation | Done — pending tablet visual check |
| 2 | 4 | Hamburger navigation redesign (7-section drawer) | Done — pending tablet visual check |
| 3 | **5A** | **Menu & Categories + dual-pricing backend audit** | **Done — awaiting approval** |
| 3 | 5B | Menu & Categories RN implementation | Not started |

> Next step requires approval. **No implementation was performed in this audit.**
