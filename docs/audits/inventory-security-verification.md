# GOLA_RESTAURANT — Phase 9A.3: Security Preparation Verification

> **Verification-only report.** No authentication or inventory code was implemented. No source files, packages, databases, or deployment settings were changed. Hosting state was not accessed. No secret values are printed. Protected directories (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/`) were not inspected or modified.

**Date:** 2026-10-10
**Environment inspected read-only:** local repo (`server/`, `gola-expo-preview/`, `docs/`); dependency metadata from authoritative registries; SDK compatibility from Expo SDK 57 docs.
**Local toolchain:** Node `v24.19.0`, npm `11.17.0`.
**Status:** `READY FOR OWNER REVIEW` — verification only; implementation remains gated.

---

## A. Status of each security blocker

| # | Blocker | Status |
|---|---|---|
| 1 | Owner rotated `ADMIN_SECRET_CODE` in the **actual hosting environment** | **UNVERIFIED** |
| 2 | Hardcoded DB credential still in `server/test.js` | **UNRESOLVED** (still present) |
| 3 | That DB credential rotated or revoked | **UNVERIFIED** |
| 4 | Committed placeholders / deployment docs could cause weak default reuse | **UNRESOLVED** (risk present) |

---

## B. Verification detail by task item

### 1. Hosting `ADMIN_SECRET_CODE` rotation — UNVERIFIED
Hosting environment variables live in the Render dashboard (production preset `atr-resturant.onrender.com`, `gola-expo-preview/src/api/config.js:9`) and are not visible from the repository. No hosting/API access was used. A local `server/.env` file exists (`Test-Path` = True), but its contents were **not read** and its presence does not prove the hosting value was rotated. Per instructions, rotation is **not** claimed. → **UNVERIFIED; owner confirmation required.**

### 2. Hardcoded credential in `server/test.js` — UNRESOLVED (still present)
A count-only check confirms `server/test.js` still contains **1** hardcoded `mongodb+srv://` connection string **with embedded credentials** (value not printed). The file has not been cleaned up. → Blocker remains **UNRESOLVED**.

### 3. Was that DB credential rotated/revoked? — UNVERIFIED
Whether the Atlas database user referenced by that string still exists, was password-rotated, or was revoked cannot be determined without Atlas/Render owner access. → **UNVERIFIED.**

### 4. Weak default reuse from committed placeholders/docs — UNRESOLVED (risk present)
- `server/.env.example` contains **1** concrete `ADMIN_SECRET_CODE=` placeholder value (a weak, repository-visible default; not printed).
- The variable is referenced across **29** committed `.md`/`.example`/`.js` occurrences outside `node_modules`, including `server/QUICK_DEPLOY.md`, `server/RAILWAY_DEPLOYMENT.md`, `server/DEPLOYMENT_SUMMARY.md`, and the `.env.example` template.
- **Risk:** anyone provisioning a new deployment by copying the docs/template could reuse the weak default, and the documented value is guessable. → **UNRESOLVED; must be replaced with a "generate-your-own" instruction and the live value rotated.**

### 5. Implementability without touching protected directories — VERIFIED
All proposed work is confined to allowed working areas:
- **server/** — new `AdminSession` model, `requireAdmin` middleware, `/api/admin/login|logout|logout-all|session` routes, inventory routes, mounting in `server.js` (already the mount point, `server.js:95-101`), plus devDependencies.
- **gola-expo-preview/** — `expo-secure-store`, Login screen, `apiClient` Bearer header (currently no auth injection, `apiClient.js:3-43`).

The existing `POST /api/admin/verify-code` (`server/routes/adminAuth.js`) is **retained unchanged** for the legacy React admin dashboard, so no protected directory needs modification. Auth middleware is scoped to `/api/admin` and `/api/inventory` only; customer routes stay public. → **VERIFIED implementable without changing protected directories.**

### 6. Dependency compatibility — VERIFIED (no installs performed)
- **`expo-secure-store`:** Expo SDK 57 lists the compatible range as **`~57.0.4`** (SDK 57 bundled-native-modules manifest), installable via `npx expo install expo-secure-store`. The SDK 57 docs confirm it is supported on Android/iOS and **included in Expo Go** (so no new native build is required for the current workflow).
- **`supertest`:** latest **`7.3.1`**; `engines.node >= 14.18.0` → compatible with Node 24.19.0 and Express 4.
- **`mongodb-memory-server`:** latest **`11.3.0`**; `engines.node >= 20.19.0` → compatible with Node 24.19.0 and Mongoose 7. **Caveat:** its `postinstall` downloads a MongoDB binary on first use (network + disk; can be pinned with `MONGOMS_VERSION` to match the production server version).
- Pure-logic tests continue to use the built-in `node --test` runner (already used for `menuUtils`/`couponUtils`).

→ **VERIFIED compatible versions identified without installing anything.**

### 7. Deployment constraints on session persistence & rate limiting — VERIFIED (constraint noted)
- **Sessions:** the proposed opaque-token model stores only `sha256(token)` in MongoDB with a TTL index. Because validation is a DB lookup, sessions **persist correctly** across process restarts (Render) and across serverless invocations/cold starts (Vercel entry via `server/vercel.json` + `server/api/index.js`). No in-memory session state is required.
- **Rate limiting:** a hand-rolled in-memory fixed-window limiter is **per-instance**. On the single-instance Render deployment (active preset) it behaves as intended; on Vercel serverless it is **not shared across instances/cold starts** and is therefore weaker. Mitigation: rely on Render as the authoritative path, or back the limiter with Mongo/a shared store if serverless admin traffic is enabled.
- **Residual:** DB-backed sessions/limiter depend on MongoDB availability (login fails if DB is down; the public customer app is unaffected).

→ **VERIFIED** — session persistence is deployment-safe; rate limiting has a documented serverless caveat.

### 8. Safe stock updates + immutable history on existing topology — VERIFIED (topology itself UNVERIFIED)
- **No multi-document transactions are required.** Each operation is a single-document atomic conditional update (`findOneAndUpdate({_id, currentQty:{$gte: qty}}, {$inc:{currentQty:-qty}})` for consumption) followed by an append-only `StockMovement` insert. Single-document atomicity holds on **standalone and replica sets** alike.
- **Rollback/reconciliation:** if the ledger insert fails after a successful balance `$inc`, issue a compensating reverse `$inc` and record the event; a `POST /api/inventory/stock/reconcile` endpoint recomputes balances from the immutable ledger to detect/correct drift. Unique `idempotencyKey` on movements prevents duplicate submissions.
- **Immutability:** no `PUT`/`DELETE` route on movements + Mongoose `immutable:true` on all movement fields (honest limitation: a direct DB connection could still alter rows; true tamper-evidence would need external audit logging — future).
- **Topology:** the actual production MongoDB topology cannot be verified read-only (no connection made) → **UNVERIFIED**, but it is **not blocking** because the design deliberately avoids transactions.

→ **VERIFIED** that safe implementation is achievable on the existing topology; **production topology UNVERIFIED**.

---

## C. Remaining implementation risks

1. **Credential state is unproven.** Until the hosting secret is rotated and the `test.js` credential is rotated/removed, building auth on top of the current secret would inherit the exposure.
2. **Weak-default reuse.** Committed placeholder + repeated deployment docs invite reusing a guessable value; the `.env.example` template should instruct generation, not supply a usable default.
3. **Serverless rate-limit gap.** In-memory limiter is not shared across Vercel instances; brute-force resistance depends on the Render path or a shared store.
4. **Shared admin identity.** All `StockMovement` rows attribute to a single `admin`; no per-person accountability (accepted for v1).
5. **`mongodb-memory-server` binary download.** First test run requires network/disk; version pin recommended to match production Mongo.
6. **DB-dependency.** Login/session validation and rate-limit (if DB-backed) fail closed when MongoDB is unavailable.
7. **Direct-DB tamper potential.** Ledger immutability is API/schema-level, not cryptographically enforced.

---

## D. Exact owner actions still required

1. **Rotate `ADMIN_SECRET_CODE` in the Render hosting environment** to a 24–32 char random value; confirm in the dashboard (do not share the value). *(Unblocks Blocker 1.)*
2. **Remove the hardcoded credential from `server/test.js`** and **rotate/revoke the referenced database user** in Atlas/Render. *(Clears Blockers 2 and 3.)*
3. **Replace the committed placeholder in `server/.env.example`** and the deployment doc references with a "generate your own" instruction. *(Reduces Blocker 4.)*
4. **Approve dependency additions** for the implementation phase: `expo-secure-store@~57.0.4`, `supertest@7.3.1`, `mongodb-memory-server@11.3.0`.
5. **Confirm the production MongoDB topology** (informational; only needed if a future phase wants transactions).
6. **Confirm the serverless posture** — i.e., that admin/inventory traffic is served by the Render instance (single-instance rate limiting) or approve a shared limiter.

---

## E. Recommended next phase

Once owner actions 1–3 are confirmed: **Phase 10 — Authentication Implementation (server first, then Expo)**, followed by the inventory build.

1. **Step 1 (server):** `AdminSession` model + `POST /api/admin/login|logout|logout-all` + `GET /api/admin/session` + `requireAdmin` middleware + rate limiting; retain `verify-code` for legacy compatibility. Tests via `supertest` + `mongodb-memory-server` + `node --test`.
2. **Step 2 (Expo):** `expo-secure-store`, Login screen, session-resume check, `apiClient` Bearer header + `401` handling.
3. **Step 3 (server):** inventory + stock models (`Unit`, `Ingredient`, `StockMovement`, `StockCycle`) with `OPENING/RESTOCK/CONSUMPTION/ADJUSTMENT`, explicit Need-to-Buy status, and reconciliation.
4. **Step 4 (Expo):** Inventory and Stock drawer destinations per the approved workflows.
5. **Step 5:** verification (tests, `expo lint`, `expo-doctor`, Android export, tablet check) + implementation report.

**Implementation must not begin until Blockers 1 and 2 are resolved.**

---

## F. Change confirmation

**No source files, packages, databases, or deployment settings were changed during this phase.** No authentication or inventory code was implemented. No package was installed or added to any `package.json`. No database was connected to or modified. No hosting/deployment configuration was accessed or altered. Hosting credential state was **not** retrieved. `server/` and `gola-expo-preview/` were read-only; protected directories were untouched. No secret values were printed. The only file written is this report (`docs/audits/inventory-security-verification.md`), created solely because the owner requested the report as a markdown file.

**Overall security-blocker status: 2 UNRESOLVED, 2 UNVERIFIED — implementation remains gated on owner actions D1–D3.**