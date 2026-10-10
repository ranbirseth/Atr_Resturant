# Gola Restaurant — Phase 9A.1: Inventory Authentication & Implementation Readiness Review

> **Read-only review.** No files were edited, no packages installed, no database or deployment touched, no mutating API request made. Inspection scope: `server/`, `gola-expo-preview/`, `docs/`. `client/`, `AdminDashbord/`, `print-service/`, `react native frontend/` were not inspected or modified. No credentials, tokens, or database URIs are reproduced below.

**Date:** 2026-10-10
**Basis:** Phase 9A audit (`docs/audits/inventory-feature-audit.md`) + approved inventory scope (Phase 9A.1 §4)
**Status:** `READY FOR OWNER REVIEW` — audit only; no implementation started.

---

## 1. Existing authentication findings (with source references)

| # | Finding | Evidence |
|---|---|---|
| 1 | **No `server/middleware/adminAuth.js` exists.** `server/middleware/` contains only `upload.js`. Phase 9A listed it as a *proposed new file*, not an existing one. | `server/middleware/` directory listing |
| 2 | **No auth middleware anywhere.** `server.js` mounts routes with no guard (`app.use('/api/auth'…)`, `/api/items`, `/api/orders`, `/api/coupons`, `/api/feedback`, `/api/categories`, `/api/admin`) and no global `requireAuth`. | `server/server.js:95-101` |
| 3 | **The "admin gate" is a one-shot boolean.** `POST /api/admin/verify-code` compares `req.body.code` to `process.env.ADMIN_SECRET_CODE` with plain `===` and returns `{success:true/false}`. **No token, no session, no cookie, no expiry, no revocation, no rate limiting.** It protects nothing downstream. | `server/routes/adminAuth.js:5-47` (compare at `:29`) |
| 4 | **No credential storage or hashing exists server-side.** Repo-wide search: zero matches for `bcrypt`, `jsonwebtoken`, `jwt`, `argon2`, `helmet`, `express-rate-limit`. No `Admin`/`Session` model; only 6 models exist (`User, Order, Coupon, Feedback, Category, Item`). | `server/package.json:11-18` (deps: cors, dotenv, express, mongoose, multer, socket.io) |
| 5 | **Customer "login" is not authentication.** `POST /api/auth/login` takes `{name, mobile}` and auto-creates the user — no password. `GET /api/auth/all` (full user list) is public; its own comment admits "should be Admin, but strict auth is not implemented yet". | `server/controllers/authController.js:6-32, :56` (`:55` comment) |
| 6 | **The admin secret is effectively public.** The value `ADMIN2024` is committed as the documented default in at least 7 repo files (`.env.example`, deployment docs, root docs). The "secret" cannot be treated as secret. | `server/.env.example:14`; also `server/QUICK_DEPLOY.md:16,49`, `server/RAILWAY_DEPLOYMENT.md:76,164`, `server/DEPLOYMENT_SUMMARY.md:198,213`, `CHANGES.md:89`, `LOCAL_SETUP.md:59`, `github_deployment.md:79` |
| 7 | **Hardcoded database credential in repo.** `server/test.js:3` embeds a full Atlas connection string **including username and password** (value not reproduced here). This is a live security exposure independent of inventory. | `server/test.js:3` |
| 8 | **Expo app has no auth layer at all.** `apiClient.js` is plain `fetch` with no `Authorization` header injection. Zero usage of `SecureStore`, `AsyncStorage`, or MMKV anywhere in `gola-expo-preview`. `package.json` has no storage/auth dependency. No login screen exists; `Settings` is still a placeholder. | `gola-expo-preview/src/api/apiClient.js:3-43`; `gola-expo-preview/package.json:5-34`; repo-wide grep = 0 matches |
| 9 | **CORS allows no-origin requests** (Postman/mobile) and any `*.vercel.app` / `*.onrender.com` origin — fine for the customer app, but means bearer tokens are the only real boundary. | `server/server.js:38-39,68-81` |
| 10 | **No security report exists** in `docs/`; prior audits only document the absence of auth. | `docs/` inventory |

**Verdict:** There is **no** real admin identity, no credential validation (beyond one boolean), no expiring session/token, no logout, no revocation, and no protected-route mechanism. A server-validated session must be built from scratch.

---

## 2. Recommended login/session architecture (smallest secure design)

**Credential source — reuse with rotation, not replacement.** The existing `ADMIN_SECRET_CODE` env-var pattern is sound (server-held secret, not in code). It must be **rotated** to a long random value (24–32 chars, generated, stored only in the hosting platform's env) because the committed default is public (Finding 6). No user table is needed for a single-admin v1.

**Credential protection.** For one high-entropy shared code, appropriate controls are: constant-time comparison (`crypto.timingSafeEqual`), rate limiting, and short lockout — **not** password hashing (a hash of a code held in the same env adds no meaningful protection). Revisit only if multi-admin passwords arrive later (then `crypto.scrypt`, built-in, or bcrypt as a new dep).

**Session format — opaque bearer token in Mongo (not a JWT).** Recommended over JWT because it gives real revocation with **zero new server dependencies** (`crypto.randomBytes` is built-in), and works across restarts/serverless instances:

- **`POST /api/admin/login`** `{ "code": "…" }` → `200 { token, expiresAt, admin:{id:"admin"} }` | `401 { error:"Invalid code" }` (generic — no hint which field failed) | `429` when rate-limited.
- Token = 32 random bytes (hex); server stores only `sha256(token)` in a new `AdminSession` collection: `{ tokenHash (unique), expiresAt (TTL index), revokedAt, ip, createdAt }`.
- **Validation middleware:** hash the presented `Authorization: Bearer <token>`, look up the session, require `expiresAt > now && !revokedAt`, attach `req.admin`. TTL index auto-cleans expired docs.
- **Expiry:** default **12 h** (`ADMIN_SESSION_TTL_HOURS`), configurable. No sliding refresh in v1 — re-login is acceptable on a single tablet.
- **Logout:** `POST /api/admin/logout` (auth) → deletes/revokes that session → immediate effect on next request. **Revocation kill-switch:** `POST /api/admin/logout-all` or deleting all session docs (e.g., after code rotation).
- **Rate limiting:** hand-rolled fixed-window counter (in-memory `Map`, 5 failed logins / IP / 15 min → `429`), plus identical generic error text/timing. Caveat documented: per-instance on serverless; primary deploy is Render (single instance per docs), so adequate for v1. `express-rate-limit` can be added later if owner approves a new dep.
- **Expo side:** add **`expo-secure-store`** (install via `npx expo install expo-secure-store`; verified available for SDK 57 and **included in Expo Go**, so no new native build is required). Admin types the code once on a new Login screen → token stored in SecureStore (Android Keystore/iOS Keychain) → `apiClient` attaches `Authorization: Bearer <token>` to all requests → `401` anywhere clears the token and returns to Login. **No secret is embedded in the APK** — the code is user-typed, never compiled in.
- **Navigation fit:** the app uses React Navigation (drawer), not Expo Router, despite AGENTS.md guidance — follow the **existing** pattern: an auth state gate that swaps the drawer for a `Login` screen when no valid session exists (validated on launch via `GET /api/admin/session`). No framework migration.

**Compatibility with public customer endpoints:** the middleware is mounted **only** on `/api/admin` (new session routes) and `/api/inventory`. `/api/items` (customer/staff audience), `/api/orders`, `/api/categories`, `/api/feedback`, `/api/auth/*` remain exactly as today. Nothing global changes.

**Out of scope (documented, not fixed):** legacy public mutation endpoints (`/api/items` POST/PUT/DELETE, `/seed`, coupons, feedback, orders, `GET /api/auth/all`) stay unprotected this phase per instructions; the no-origin CORS policy; `server/test.js` credential cleanup is flagged in §8 as a risk, not performed here.

---

## 3. Required environment configuration & deployment steps (for implementation later)

| Variable | Purpose | Notes |
|---|---|---|
| `ADMIN_SECRET_CODE` | Login code | **Rotate** off the committed default to a 24–32 char random value; set only in Render (and local `.env`, gitignored) |
| `ADMIN_SESSION_SECRET` | Not needed | Opaque-token design requires no signing secret; listed only to document the deliberate omission |
| `ADMIN_SESSION_TTL_HOURS` | Session lifetime | Default 12 |
| `ADMIN_LOGIN_MAX_ATTEMPTS` / `WINDOW_MIN` | Rate limit knobs | Optional; defaults 5 / 15 |

Deployment steps (owner/ops): (1) rotate `ADMIN_SECRET_CODE` in Render env; (2) deploy server with new session + inventory routes; (3) verify `POST /api/admin/login` returns a token and `401` is returned for inventory writes without it; (4) Expo: `npx expo install expo-secure-store`, add Login screen + header injection, `npx expo lint` / `expo-doctor` / `export --platform android`, reload on tablet; (5) update `.env.example` to a placeholder (`<generate-24+char-random>`) instead of a real-looking value.

---

## 4. Proposed inventory write-route protection

```
server.js:   app.use('/api/admin', adminSessionRoutes);          // login/logout/session
             app.use('/api/inventory', requireAdmin, inventoryRoutes);
```

- `requireAdmin` (new `server/middleware/adminSession.js`): parses `Authorization: Bearer`, validates against `AdminSession`, `401 { error:"Authentication required" }` / `"Session expired"` otherwise. Applied to the **entire** inventory router — reads too (stock levels and costs are business-sensitive; no customer endpoint calls them).
- Writes additionally enforce: movement payloads take `createdBy` **from `req.admin`**, never from the request body.
- Customer traffic is untouched because the guard is scoped to two mounts.

---

## 5. Database topology findings & unresolved questions

- **Local dev:** documented default is a plain localhost instance (`server/.env.example:11`); setup docs describe "local instance or Atlas" with no replica-set instructions. No code depends on topology today: **grep finds zero uses of `startSession` / `withTransaction` in `server/`** — the app has never used multi-document transactions.
- **Production:** all deployment guides prescribe MongoDB **Atlas** (`mongodb+srv` template strings in `server/QUICK_DEPLOY.md`, `server/RAILWAY_DEPLOYMENT.md`, `server/DEPLOYMENT_SUMMARY.md`), and `server/test.js:3` contains an Atlas SRV string with embedded credentials — suggesting Atlas is in use. **Per instructions, I do not infer replica-set topology from a connection string, and the actual Render `MONGO_URI` value is not visible read-only. → UNRESOLVED BLOCKER: production topology (replica set vs. other) is unverified and requires owner access to confirm.** It is non-blocking for this release, because:
- **The first inventory release can safely avoid multi-document transactions.** With manual additions/corrections only (no order-driven deductions), each operation is: (a) one **atomic single-document** update on `Ingredient.onHandQty` using a conditional `findOneAndUpdate({_id, onHandQty:{$gte: needed}}, {$inc})` — atomicity guaranteed on standalone *and* replica sets; then (b) insert the ledger `StockMovement` with a unique `idempotencyKey`. If (b) fails after (a), compensate by reversing the `$inc` (rare, logged), and ship a **`POST /api/inventory/stock/reconcile`** helper that recomputes balances from the append-only ledger to detect/correct any drift. Low-frequency admin writes make the residual race window negligible. Transactions remain a "nice to have" only if future phases need atomic multi-collection writes — then topology must be confirmed first.

---

## 6. Inventory schema/API changes needed (vs. Phase 9A proposal)

Approved decisions applied → these are the deltas from Phase 9A §7:

| Change | Rationale |
|---|---|
| **Drop `Recipe` from v1** (was "core" in 9A) | Recipes only matter for automatic order deduction, which the approved scope removes. Reintroduce in a later phase with deduction. |
| **Drop `sourceRef.orderId/itemId`, `unitCost`** from `StockMovement` | No order linkage, no purchase-invoice subsystem in v1. Keep optional free-text `refNo`. |
| **Drop `allowedOversell` from `Ingredient`** | Insufficient-stock deductions must be **blocked with a clear warning** — no per-ingredient override in v1. |
| **Movement types restricted to `ADDITION` and `CORRECTION`** | "Manual stock additions and corrections only." Downward corrections that would push balance below 0 → rejected `409`. |
| **`createdBy` populated from `req.admin`, immutable** | "Authenticated admin attribution." With a single shared code the identity is `admin` (attribution granularity limited — see §10). |
| **Ledger immutability:** no `PUT`/`DELETE` route on `/api/inventory/stock` + Mongoose `immutable:true` on all movement fields | "History cannot be silently deleted or edited." Note honestly: this blocks all API paths and accidental saves, but a direct DB connection could still alter data — full tamper-proofing would need external audit logging (future). |
| **`reorderLevel` (nullable) + `atOrBelowThreshold` computed flag** | Low-stock thresholds and visible warnings; Expo shows a warning badge/banner; no auto-reorder. |
| **Keep:** `Ingredient{name, nameKey(unique), baseUnit, onHandQty, reorderLevel, isActive, timestamps}`, `Unit{name, symbol, toBaseFactor}`, `StockMovement{ingredientId, type, quantityDelta (base units), unit snapshot, note (required for CORRECTION), idempotencyKey(unique), createdBy, timestamps}`; balance changes **only** via movements (no direct balance `PUT`). | Core of the approved model. |

**Draft API surface (all under `requireAdmin` except login):**
```
POST   /api/admin/login {code}                → {token, expiresAt}   (public, rate-limited)
POST   /api/admin/logout | /logout-all        → 204
GET    /api/admin/session                     → {valid, expiresAt}
GET    /api/inventory/units        | POST /units
GET    /api/inventory/ingredients  (?lowStock=1) | POST | PUT /:id   (name/reorderLevel/baseUnit/isActive only)
POST   /api/inventory/stock {ingredientId, type:ADDITION|CORRECTION, quantity, unitId?, note, idempotencyKey?}
                                       → 201 | 409 INSUFFICIENT_STOCK {message, availableQty}
GET    /api/inventory/stock?ingredientId&from&to&limit&cursor   (paged, append-only)
POST   /api/inventory/stock/reconcile          → drift report
(no PUT/DELETE on /stock)
```

---

## 7. Testing and acceptance criteria

**Server (extend `node --test` pattern; endpoint tests need owner-approved devDeps `supertest` + `mongodb-memory-server`):**
1. Login: correct code → token; wrong code → `401` with identical generic message; 6th attempt inside window → `429`; missing `ADMIN_SECRET_CODE` → `500` generic config error.
2. Session: valid token → `200`; expired/revoked/garbage token → `401`; logout then reuse → `401`; TTL index present.
3. Inventory: writes/reads without token → `401`; with token → `201/200`; `createdBy` reflects session, body-supplied `createdBy` ignored.
4. Stock math: ADDITION increases balance; CORRECTION below zero → `409` with clear message and **unchanged** balance; concurrent duplicate `idempotencyKey` → single ledger row; reconcile reports zero drift after a seeded sequence.
5. Immutability: `PUT/DELETE /api/inventory/stock/:id` → `404/405`; movement docs reject `save()` edits (`immutable:true`).
6. Regression: existing `menuUtils`/`couponUtils` tests still pass; customer flows (`GET /items?audience=customer`, `POST /orders`, feedback) work **without** any token.

**Expo:** `npx expo lint` 0 errors, `npx expo-doctor` clean, `npx expo export --platform android` succeeds; manual acceptance — login persists across app restart (SecureStore), wrong code shows a friendly error, expired session forces re-login, inventory screens hidden until authenticated, `401` mid-session routes to Login, and **no secret string appears in the built bundle**.

---

## 8. Risks, dependencies and rollback plan

**Risks**
- **Committed default secret** (Finding 6) and **hardcoded Atlas credential in `server/test.js:3`** (Finding 7) — rotation/removal required before this auth is meaningful; owner action, not performed here.
- Session store in Mongo → login fails if DB is down (acceptable; customer app unaffected).
- In-memory rate limiter is per-instance (weaker on Vercel serverless; fine on Render single instance).
- Token in SecureStore persists across iOS reinstall (platform behavior) — acceptable for an admin code that can be rotated server-side.
- Single shared code = all movement rows attributed to `admin` (no per-person attribution).

**Dependencies:** new Expo dep `expo-secure-store` (SDK-57-compatible, works in Expo Go); optional later: `express-rate-limit`, `supertest`, `mongodb-memory-server` (need owner approval); no new server runtime deps required for the recommended design.

**Rollback:** everything is additive. Gate middleware behind `INVENTORY_AUTH_ENABLED=true` env — set `false` and inventory routes return `503` (or are simply unreachable) with zero impact elsewhere; sessions become inert; Expo falls back to the current drawer with Inventory hidden. No existing schema is altered (only new collections `adminsessions`, `ingredients`, `units`, `stockmovements`). Revocation of all access = delete session docs + rotate code.

---

## 9. Ordered implementation phases (each independently shippable)

1. **Credential hygiene (owner/ops):** rotate `ADMIN_SECRET_CODE`; scrub the hardcoded `server/test.js` credential; replace committed defaults in `.env.example`/docs with placeholders.
2. **Server session layer:** `AdminSession` model, `POST /api/admin/login|logout|logout-all`, `GET /api/admin/session`, `requireAdmin` middleware, rate limiting (+ tests).
3. **Server inventory core:** `Unit`, `Ingredient`, `StockMovement` models; `inventoryUtils` (unit→base conversion, threshold math, idempotency keys) + `node --test` suite; read routes; movement routes with conditional `$inc` + compensation + reconcile.
4. **Expo auth:** `expo-secure-store`, Login screen, session resume check, `apiClient` `Authorization` header + `401` handling (lint/Doctor/export).
5. **Expo Inventory module:** drawer destination + ingredients list (low-stock badges), add/correct movement forms, paginated history (immutable — no edit/delete UI).
6. **Verification & docs:** full test pass, `expo-doctor`, Android export, tablet visual check, Phase 9A.1 implementation report in `docs/implementation/`.

---

## 10. Explicit owner decisions still required

1. **Rotate `ADMIN_SECRET_CODE`** to a strong random value — approve + execute (value handled privately, never committed).
2. **Rotate/remove the hardcoded database credential in `server/test.js:3`** — approve cleanup.
3. **Session TTL:** approve 12 h default (or specify).
4. **Inventory reads:** approve requiring auth for GET inventory routes too (recommended) vs. leaving reads public.
5. **Identity granularity:** accept single `admin` attribution for v1, or require per-admin accounts now (larger scope).
6. **`Recipe` deferral:** confirm dropping recipes from v1 (unusable without auto-deduction).
7. **Test dependencies:** approve adding `supertest` + `mongodb-memory-server` (and optionally `express-rate-limit`) as devDependencies.
8. **Production MongoDB topology:** owner to confirm Atlas/replica-set status from the hosting dashboard (only needed if a future phase wants multi-doc transactions; not required for v1).
9. **Legacy endpoints:** confirm they remain unprotected this phase (documented as a separate future hardening task).

---

**`READY FOR OWNER REVIEW`**