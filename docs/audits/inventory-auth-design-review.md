# GOLA_RESTAURANT — Phase 9A.2: Authentication & Inventory Design Review

> **Strictly read-only review.** No source files were edited, created, deleted, renamed, or reformatted. No packages were installed. No databases were connected to or modified. No secrets, tokens, passwords, or database credentials are reproduced below. `client/`, `AdminDashbord/`, `print-service/`, and `react native frontend/` were not inspected or modified. `server/` and `gola-expo-preview/` were treated as read-only.

**Date:** 2026-10-10
**Basis:** Phase 9A audit (`docs/audits/inventory-feature-audit.md`), Phase 9A.1 review (`docs/audits/inventory-auth-readiness-review.md`), and the Phase 9A.2 requirements.
**Status:** `READY FOR OWNER REVIEW` — design review only; no implementation started.

---

## 1. Files and endpoints inspected

| Area | Files / endpoints |
|---|---|
| Admin verification endpoint | `server/routes/adminAuth.js` — `POST /api/admin/verify-code` |
| Route mounting | `server/server.js:95-101` (`/api/auth`, `/api/items`, `/api/orders`, `/api/coupons`, `/api/feedback`, `/api/categories`, `/api/admin`) |
| Middleware | `server/middleware/` → only `upload.js`; **no auth middleware exists** |
| Customer auth | `server/controllers/authController.js`, `server/routes/authRoutes.js` |
| Environment config | `server/.env.example` (`ADMIN_SECRET_CODE` present with a committed placeholder), `server/config/db.js` (`MONGO_URI`) |
| Deployment config | `server/vercel.json`, `server/api/index.js`, `server/package.json` (deps/scripts) |
| Suspected hardcoded credential | `server/test.js` — contains 1 hardcoded `mongodb+srv://` connection string **with credentials** (value not reproduced) |
| Expo API client | `gola-expo-preview/src/api/apiClient.js`, `gola-expo-preview/src/api/config.js` |
| Expo storage / headers | repo-wide search in `gola-expo-preview`: **0 matches** for `SecureStore`, `expo-secure-store`, `AsyncStorage`, `Authorization`, `Bearer` |
| Expo package | `gola-expo-preview/package.json` — no storage/auth dependency |
| Prior reports | `docs/audits/inventory-feature-audit.md`, `docs/audits/inventory-auth-readiness-review.md`, `docs/audits/menu-categories-dual-pricing-audit.md:61,299,302`, `docs/audits/orders-feature-audit.md:98,139` |

**Verification requested in Phase 9A.2 §2:**
- `ADMIN_SECRET_CODE` **does have a committed placeholder** in `server/.env.example` (line 14) and is repeated across deployment docs — the documented value is a weak, guessable placeholder and must be rotated. *(Value not printed.)*
- `server/test.js` **does contain hardcoded database credentials** inside a full `mongodb+srv://` connection string (1 match confirmed). *(Value not printed.)*

---

## 2. Current authentication state and risks

**State (confirmed, unchanged since 9A.1):**
1. **No auth middleware exists.** `server/middleware/` holds only `upload.js`. No `app.use` guard is mounted in `server.js`.
2. **The admin endpoint is a one-shot boolean.** `POST /api/admin/verify-code` compares `req.body.code` to `process.env.ADMIN_SECRET_CODE` with plain `===` and returns `{success:true|false}`. It issues **no token, no session, no cookie, no expiry, no revocation**, and **no rate limiting** (`server/routes/adminAuth.js:5-47`, compare at `:29`). It protects nothing downstream.
3. **No protected routes.** Every mutation across items, categories, orders, coupons, feedback is public; `GET /api/auth/all` exposes the full user list publicly (`authController.js:55` comment acknowledges this).
4. **No server-side credential store or hashing.** Zero uses of bcrypt/jwt/argon2/helmet/express-rate-limit; `server/package.json` deps are cors, dotenv, express, mongoose, multer, socket.io.
5. **Expo has no auth layer.** `apiClient.js` is plain `fetch` with no `Authorization` header; no SecureStore/AsyncStorage; no login screen; `Settings` is still a placeholder.

**Risks:**
- **Committed placeholder admin secret** — the documented default is weak and repository-visible; it cannot be treated as secret. Rotation is mandatory.
- **Hardcoded DB credentials in `server/test.js`** — a live exposure (a full SRV URI with user/password). Must be rotated/removed by the owner.
- **Unauthenticated writes to inventory would be unsafe** — stock balances and admin attribution require a real session before any inventory write ships.
- **No revocation path today** — the boolean endpoint cannot be logged out or expired.
- **CORS allows no-origin requests** (`server.js:38-39,68-81`) — acceptable for the customer app, but means a bearer token is the only real boundary for admin routes.

---

## 3. Recommended authentication design and remaining blockers

**Overall: the proposed design is sound.** Assessment of each proposed element:

| Proposed element | Verdict | Notes |
|---|---|---|
| Server-validated admin login via env secret | **Approve** | Reuse `ADMIN_SECRET_CODE` as the login secret but **rotate** it to a long random value (24–32 chars) and keep it in host env only. |
| Exchange login for random opaque token | **Approve** | `crypto.randomBytes(32).toString('hex')` (built-in, no new dependency). |
| Store only a hash of the token | **Approve** | Store `sha256(token)` in a new `AdminSession` collection; never store the raw token server-side. |
| 12-hour default lifetime | **Approve with a recommendation** | 12 h is reasonable for a single tablet shift. Make it env-configurable (`ADMIN_SESSION_TTL_HOURS`), add a Mongo TTL index on `expiresAt`. No sliding refresh in v1. |
| Rate-limit failed logins | **Approve** | Hand-rolled fixed-window (e.g. 5 failures / IP / 15 min → `429`) needs no new dependency; documented caveat: per-instance on serverless, adequate on the Render single instance. |
| Protect inventory read and write routes | **Approve** | Mount `requireAdmin` on the **entire** `/api/inventory` router (reads included — balances are business-sensitive and no customer endpoint calls them). |
| Store token in Expo SecureStore | **Approve** | Requires adding `expo-secure-store` (SDK-57-compatible, works in Expo Go; `npx expo install`). |
| `Authorization: Bearer <token>` on requests | **Approve** | Add header injection in `apiClient.js`; scope to admin calls. |
| Expired session → re-login | **Approve** | Validate at launch via `GET /api/admin/session`; on any `401`, clear SecureStore and route to Login. |
| Never embed admin secret in the app | **Enforce** | The secret is user-typed at login, never compiled in; verify the built bundle contains no secret. |

**Proposed auth contract (unchanged from 9A.1):**
```
POST /api/admin/login {code}     → 200 {token, expiresAt} | 401 generic | 429
POST /api/admin/logout           → 204 (revoke current)
POST /api/admin/logout-all       → 204 (revoke all)
GET  /api/admin/session          → 200 {valid, expiresAt} | 401
requireAdmin middleware: parses Authorization: Bearer, validates against AdminSession
                         (expiresAt > now && !revokedAt), attaches req.admin
```

**Remaining blockers (owner input required):**
1. **Rotate the committed placeholder `ADMIN_SECRET_CODE`** (owner/ops action).
2. **Rotate/remove the hardcoded DB credential in `server/test.js`** (owner action).
3. **Confirm production MongoDB topology** (needed only if a future phase wants multi-document transactions; not required for this release — see 9A.1 §5).
4. **Approve adding `expo-secure-store`** (and any test deps) — packages are not installed in this read-only phase.

**Compatibility with existing public endpoints:** the guard is mounted only on `/api/admin` and `/api/inventory`; `/api/items`, `/api/orders`, `/api/categories`, `/api/feedback`, `/api/auth/*` are untouched. No client/AdminDashbord behavior changes. This phase does **not** retrofit auth onto legacy endpoints (documented as separate future hardening).

---

## 4. Final proposed Inventory and Stock screen workflows

Two **separate** drawer destinations, matching the requirement that item setup is separate from day-to-day stock changes.

### 4.1 Inventory (item/setup management)
- **List:** all inventory items with name, unit, minimum stock level, current quantity, and a status chip.
- **Add/Edit item:** fields — `name` (required, unique), `unit` (required, chosen/created), `minimum stock level` (required, ≥ 0), `expected demand` (optional, ≥ 0; used for purchase suggestions). No day-to-day quantities are edited here.
- **Deactivate item** (soft, `isActive=false`) instead of hard delete when movement history exists.
- No stock-movement entry on this screen.

### 4.2 Stock (day-to-day operations)
- **List:** per item — current available quantity + unit, **usage %** and **remaining stock** for the current cycle, and three independent status chips:
  - **Low stock** — `0 < available ≤ minimumStockLevel`
  - **Out of stock** — `available ≤ 0`
  - **Need to buy** — independently flagged/suggested (see §5.6)
- **Record consumption:** admin enters `quantity consumed` (+ optional date, note). Blocked (`409`) if `quantity > available`. Never negative.
- **Restock:** admin enters `quantity`, `unit`, `date`, `note`. On save, the current cycle closes and a new cycle opens (see §5.4).
- **Purchase suggestion:** displayed per item as `suggestedQty = max(0, minimumStockLevel + expectedDemand − available)`.
- **History:** two tabs/segments — *Usage history* (consumption movements) and *Restock history* (restock movements), both append-only and never editable/deletable. Past **cycles** (with their final usage %) remain visible after a new restock.
- Statuses are shown **separately** — low stock does not imply need-to-buy, and out-of-stock is distinct from both.

---

## 5. Proposed data model and stock calculation rules

### 5.1 Collections
| Collection | Purpose | Key fields |
|---|---|---|
| `Unit` | Unit definitions | `name` (unique), `symbol`, `toBaseFactor` (Number > 0, default 1) |
| `Ingredient` | Inventory item **setup** | `name`, `nameKey` (unique, normalized), `unit` (ref), `minimumStockLevel` (Number ≥ 0), `expectedDemand` (Number ≥ 0, default 0), `isActive`, `currentQty` (materialized balance), `purchaseStatus` (optional, see §5.6), timestamps |
| `StockMovement` | **Immutable** ledger (source of truth) | `ingredientId`, `type` (`OPENING` \| `RESTOCK` \| `CONSUMPTION` \| `ADJUSTMENT`), `quantityDelta` (signed, base units), unit snapshot, `movementDate`, `note`, `cycleId` (ref), `createdBy` (from session), `idempotencyKey` (unique), timestamps; all fields `immutable:true` |
| `StockCycle` | Preserves per-cycle usage % across restocks | `ingredientId`, `cycleNumber`, `baselineQty` (start total), `restockedQty`, `carriedOverQty`, `startedAt`, `closedAt`, `status` (`OPEN`/`CLOSED`) |

### 5.2 Balances and audit history
- `StockMovement` is the **authoritative ledger**; `Ingredient.currentQty` is a materialized balance maintained by atomic `$inc` on each accepted movement.
- History is append-only: **no `PUT`/`DELETE` route** on movements, and Mongoose `immutable:true` on all movement fields.
- `POST /api/inventory/stock/reconcile` recomputes balances from the ledger to detect drift (honest limitation: a direct DB connection could still alter data; true tamper-proofing needs external audit logging — future).

### 5.3 Consumption and movement date
- Consumption = `StockMovement{ type: CONSUMPTION, quantityDelta: −qty, movementDate, note, cycleId, createdBy }`.
- `movementDate` is admin-supplied (defaults to now; backdating allowed — **owner decision**, default: allow).
- Blocking rule: conditional atomic update `findOneAndUpdate({_id, currentQty: {$gte: qty}}, {$inc:{currentQty:-qty}})`; if it does not match → `409 { error:'INSUFFICIENT_STOCK', availableQty }`.

### 5.4 Restock and usage-cycle rules
- Restock = `StockMovement{ type: RESTOCK, quantityDelta: +qty, … }`.
- On restock: `carriedOverQty = max(0, currentQty)`; `baselineQty(newCycle) = carriedOverQty + restockedQty`; close the current `StockCycle` (recording its final usage %) and open a new one; `currentQty += restockedQty`.
- This satisfies both stated rules: (a) after a completed restock a new cycle starts for the newly restocked quantity; (b) if stock is added while stock remains, remaining + new are combined as the new baseline.

### 5.5 Calculation rules
```
usage%      = (baselineQty − currentQty) / baselineQty × 100      (clamped 0–100)
remaining%  = currentQty / baselineQty × 100
suggestedQty = max(0, minimumStockLevel + expectedDemand − currentQty)
lowStock    = currentQty > 0 AND currentQty ≤ minimumStockLevel
outOfStock  = currentQty ≤ 0
needToBuy   = explicit purchase status OR suggestedQty > 0        (see 5.6 / owner decision)
```
Worked example (kg, minStock 10, expectedDemand 20): opening RESTOCK 50 → cycle 1 baseline 50; consume 20 → usage 40%; consume 15 → usage 70%; restock 40 with 15 remaining → cycle 1 closes at 70%, cycle 2 baseline 55, current 55, usage 0%; consume 5 → usage 9.1%. Corrections (`ADJUSTMENT`) adjust `currentQty` and therefore the displayed usage %, and are listed separately in history.

### 5.6 `Need to Buy` independent of low stock
- Requirement explicitly separates need-to-buy from low stock, so a purely derived value is insufficient. **Recommended:** a lightweight `purchaseStatus` on the item: `NONE | NEEDED | ORDERED | COMPLETED`, set/cleared by the admin. A `RESTOCK` movement can carry a reference and mark the status `COMPLETED`. This is a **status**, not a supplier/invoice module (out of scope). **Owner decision:** explicit status vs. derived-only.

### 5.7 Purchase completion
- A purchase is "completed" when the corresponding `RESTOCK` movement is recorded; the optional `purchaseStatus` transitions to `COMPLETED` and `needToBuy` clears. No supplier, invoice, or wastage concepts are introduced.

### 5.8 Purchase suggestion
- `targetLevel = minimumStockLevel + expectedDemand`; `suggestedQty = max(0, targetLevel − currentQty)`.
- **Owner decision:** how `expectedDemand` is sourced — manual per item (recommended, deterministic for v1) vs. rolling average of past per-cycle consumption (future enhancement).

### 5.9 Duplicate submissions and consistency
- `idempotencyKey` unique index on `StockMovement` (client-generated per submit) → double-taps/replays are rejected as already-processed.
- Atomic conditional `$inc` guards against negative balances under concurrency.
- No multi-document transactions required: each operation is a single-document atomic balance update followed by a ledger insert, with compensation + reconcile for the rare insert failure (consistent with 9A.1 §5; safe on standalone **and** replica sets).

### 5.10 Are `ADDITION`/`CORRECTION` sufficient?
**No — the 9A.1 movement types are too coarse for these requirements.** A restock and a correction must behave differently: a **restock starts a new usage cycle**, whereas a **correction does not**. Therefore the type set should be semantic: **`OPENING`, `RESTOCK`, `CONSUMPTION`, `ADJUSTMENT`** (with `purchaseStatus` as a separate lightweight status field, not a movement type). This is a schema change from 9A.1 and requires owner approval.

### 5.11 Review of the remaining design questions
- **12-hour session:** appropriate; configurable. *(Owner confirm.)*
- **Shared admin identity:** acceptable for v1, but **all movements are attributed to a single `admin`** — no per-person accountability. *(Owner decision: accept vs. add named admins.)*
- **Protected GET routes:** recommended **yes** for `/api/inventory` (balances are sensitive; no customer consumer). *(Owner confirm.)*
- **Testing dependencies:** `supertest` + `mongodb-memory-server` recommended for endpoint tests; `node --test` remains for pure logic. New deps require owner approval.

---

## 6. Unresolved owner decisions (with recommended defaults)

| # | Decision | Recommended default |
|---|---|---|
| 1 | Rotate committed placeholder `ADMIN_SECRET_CODE` | Rotate to 24–32 char random value (approve) |
| 2 | Rotate/remove hardcoded DB credential in `server/test.js` | Rotate the DB user password and remove the file's credential (approve) |
| 3 | Session lifetime | 12 h, env-configurable |
| 4 | Protect inventory GET routes too | Yes |
| 5 | Single shared `admin` identity vs. named admins | Single `admin` for v1 |
| 6 | Movement type set | `OPENING/RESTOCK/CONSUMPTION/ADJUSTMENT` (replaces `ADDITION/CORRECTION`) |
| 7 | `Need to Buy` source | Explicit `purchaseStatus` field (not derived-only) |
| 8 | `expectedDemand` source | Manual per item for v1; rolling-average later |
| 9 | Backdated movement dates | Allowed, defaults to now |
| 10 | `usage%` definition under corrections | `(baseline − currentQty)/baseline`; adjustments shown separately |
| 11 | Approve test deps (`supertest`, `mongodb-memory-server`) and `expo-secure-store` | Approve |
| 12 | Legacy endpoint auth | Out of scope this phase (documented separately) |

---

## 7. Test plan

**Authentication**
- Login: correct code → token; wrong code → `401` with identical generic message; 6th attempt in window → `429`; missing `ADMIN_SECRET_CODE` → generic `500`.
- Session: valid → `200`; expired/revoked/garbage/absent token → `401`; logout then reuse → `401`; TTL index removes expired docs.
- Route protection: every `/api/inventory` read and write without a token → `401`; with token → `200`/`201`.
- Component: no admin secret appears in the built Expo bundle; token round-trips through SecureStore across app restart.

**Consumption**
- Consume ≤ available → balance decreases, ledger row appended with `CONSUMPTION`, `movementDate`, `createdBy` from session.
- Consume > available → `409 INSUFFICIENT_STOCK`, balance **unchanged**, no ledger row.
- Duplicate `idempotencyKey` → single ledger row (replay yields already-processed).
- Concurrent consume requests cannot drive balance below 0.

**Restocking and cycles**
- Restock with 0 remaining → new cycle baseline = restock qty; previous cycle closed.
- Restock with remaining stock → new baseline = remaining + restock qty; previous cycle's final usage % preserved.
- Usage % recalculates for the new cycle starting at 0%; historical cycle percentages remain queryable.

**Purchase status / need-to-buy**
- Low stock, out-of-stock, and need-to-buy are reported independently.
- `suggestedQty` respects `minimumStockLevel + expectedDemand − currentQty` and floors at 0.
- Recording a linked restock marks the purchase `COMPLETED` and clears need-to-buy.

**Stock history**
- `StockMovement` has no update/delete route (`404`/`405`); `immutable:true` rejects `save()` edits.
- Reconcile reports zero drift after a seeded movement sequence.
- Usage and restock history lists return append-only paged results.

**Regression**
- Existing `node --test` suites (`menuUtils`, `couponUtils`) still pass; customer flows (`GET /api/items?audience=customer`, `POST /api/orders`, feedback) work with no token.
- Expo: `npx expo lint` 0 errors, `npx expo-doctor` clean, `npx expo export --platform android` succeeds.

---

## 8. Confirmation of read-only state

**No files, packages, or databases were changed during this review.** The only file written is this report (`docs/audits/inventory-auth-design-review.md`), created solely because the owner requested the audit be delivered in a markdown file. No packages were installed or removed; no `package.json` was touched; no database was connected to or modified; no production/deployment configuration was altered; `server/` and `gola-expo-preview/` source was treated as read-only; `client/`, `AdminDashbord/`, `print-service/`, and `react native frontend/` were not inspected or modified. No secret values were printed.

---

**`READY FOR OWNER REVIEW`**