# Phase 2C.1 — Billing Regression Tests (2026-10-11)

**Status:** COMPLETE — all five Phase 2C gaps now have dedicated regression tests. Full server suite **118/118 pass**. No production code, database, configuration, dependency, or deployment change. No protected directory touched (`client/`, `AdminDashbord/`, `print-service/`, `react native frontend/` unchanged; `gola-expo-preview/` untouched). See `docs/audits/README.md` section C.3.3 for the originating audit.

**Scope:** tests + test-file-only fixes. The only source-touching edits are additions to existing/new test files; no implementation behavior changed.

## Files

| File | What |
|---|---|
| `server/tests/billing.gaps.api.test.js` (NEW) | Dedicated integration suite, DB `gola_billing_gaps_test` (override `BILLING_GAPS_TEST_MONGO_URI`), guarded by `assertTestDatabase()`. Contains one test per GAP plus the second concurrent-idempotency test (6 tests). |
| `server/utils/billingUtils.test.js` (MODIFIED) | Added one unit test for exact IST boundary instants; `parseIstBoundary` added to the existing require destructure. |
| `server/tests/inventory.api.test.js` (MODIFIED) | Test-only harness fix (see "Defect found and fixed" below). |
| `docs/implementation/implementation-progress-tracker.md` (MODIFIED) | Appended this phase's entry (append-only, history preserved). |

## Defect found and fixed (test harness only)

While stress-running the full suite, the pre-existing test file `server/tests/inventory.api.test.js` intermittently failed its two idempotency tests:
`idempotencyKey applies a movement exactly once` (`inventory.api.test.js:190`) and
`concurrent duplicate RESTOCK with one key never corrupts cycles or balance` (`inventory.api.test.js:363`).
Symptoms: a replay returned `201` instead of `200`, and a concurrent duplicate created 2 movements instead of 1
(`actual: 2, expected: 1`).

**Root cause (structural):** the file's `before()` called `mongoose.connection.dropDatabase()` but never rebuilt indexes.
Mongoose's asynchronous `autoIndex` build races the drop, so the load-bearing
`StockMovement {idempotencyKey:1}` unique-sparse index (and the `StockCycle {ingredientId,cycleNumber}` unique index)
was intermittently absent after the drop — turning a guaranteed 409/200 replay into a duplicate insert.
It is a latent harness race, independent of the billing changes; the fifth/fourth parallel integration file pushed
machine timing enough to surface it.

**Fix (test-only, this phase):** mirror the repo convention already used by `billing.api.test.js`, `billing.p13.api.test.js`,
and `billing.gaps.api.test.js` — require the three inventory models (`Ingredient`, `StockMovement`, `StockCycle`)
and call explicit `syncIndexes()` (Promise.all) right after `dropDatabase()` in `before()`.

**Verification:** after the fix the full suite passed **6 consecutive runs** (`npm test` -> 118/118 each) plus a solo
`node --test "tests/inventory.api.test.js"` -> 20/20. No assertion was weakened; the fix makes the existing tests deterministic.

## Test commands and results (exact)

```
cd server
node --test "tests/billing.gaps.api.test.js"   -> 6/6 pass, 0 fail
node --test "tests/inventory.api.test.js"      -> 20/20 pass, 0 fail (after harness fix)
npm test                                       -> 118/118 pass, 0 fail, 0 skipped, confirmed on 6 consecutive runs
```

Breakdown of the full suite: 61 util tests (was 60; +1 boundary unit test) + 57 integration tests
(16 billing.api + 9 billing.p13 + 6 billing.gaps + 20 inventory.api + 6 items.api, was 51; +6).

## GAP results

Legend: **PASS** = automated test proves the requirement; **(structural)** = proven by the state machine/design and cross-checked by assertions, not by a scripted drive of every interleaving.

| GAP | Result | Test name | Evidence |
|---|---|---|---|
| 1a POS concurrent idempotency | **PASS** | `GAP-1 concurrent POS idempotency: same key+payload creates exactly one bill` — `billing.gaps.api.test.js:176` | 6 parallel identical checkouts -> exactly one 201 and five 200 replays all referencing the same `_id`/`billNumber`; exactly 1 persisted bill; reused key with different payload -> 409 `IDEMPOTENCY_KEY_REUSED`. |
| 1b SESSION concurrent idempotency | **PASS** | `GAP-1 concurrent SESSION idempotency: exactly one bill despite parallel captures` — `billing.gaps.api.test.js:220` | 6 parallel captures -> exactly one session bill; every successful response shares one `_id`/`billNumber`; permitted 409s are retryable (`IN_PROGRESS`/`ALREADY_BILLED`), never a 500; different payload on the key -> 409; winning bill holds exactly one active BILL lock. |
| 2 Immutable snapshot | **PASS** | `GAP-2 immutable snapshot preserved across payment, reversal, void and resume` — `billing.gaps.api.test.js:273` | Captures audience, per-order and root lines (qty/unit price/line total), `subtotalPaise`, `discountPaise`, `couponCode`, `totalPaise`; deep-equal after payment (50), after reversal, after re-payment to SETTLED (150), after void, and after resume. Resume asserts status stays `VOID` (no invalid reopen); amount/balance invariants asserted at each step. |
| 3 Legacy bill readability | **PASS** | `GAP-3 legacy bills (no P1.3 fields) stay readable, payable and analysable` — `billing.gaps.api.test.js:340` | Raw Phase 2B-shaped document (no `origin`/`audience`/`lines`/`subtotal`/`coupon`/idempotency) inserted via `Bill.collection.insertOne`. GET single bill -> 200 with `origin=SESSION`, `audience=CUSTOMER`, `totalAmount=45`; session listing includes it; payment (20) and reversal still work; analytics counts it under CUSTOMER/SESSION; the stored document still lacks all P1.3 keys (no destructive backfill). |
| 4 Safe re-billing | **PASS** | `GAP-4 source orders release for re-billing only after full void + reversals` — `billing.gaps.api.test.js:411` | Re-bill rejected 409 `ALREADY_BILLED` while OPEN, after a payment reversal (reversal alone does NOT release), and after SETTLED; after void the ORDER lock is gone (0 active) and re-billing succeeds (201, second bill); the new bill re-protects the order. |
| 5 Exact IST boundaries | **PASS** | (a) `GAP-5 exact IST boundaries: date-only filters include only the intended day` — `billing.gaps.api.test.js:473`; (b) `GAP-5 IST date-only boundaries resolve to the exact UTC instants` — `billingUtils.test.js:255` | Bills inserted with explicit `createdAt` just before (18:29:59.999Z), exactly at (18:30:00.000Z), mid, exactly at end (18:29:59.999Z) and just after (18:30:00.000Z) the day boundaries. Date-only `from/to` filters count exactly 1 / 3 / 1 bills for the three IST days and exclude the adjacent-day instants; the echoed range is the exact UTC span; unit test asserts `2026-10-11` -> `2026-10-10T18:30:00.000Z` .. `2026-10-11T18:29:59.999Z`, offset-less timestamps treated as IST, and open-ended/invalid inputs. |

## Automated evidence vs structural reasoning (separated)

- **Automated (all GAPs):** every assertion above runs against the real HTTP API and MongoDB within the dedicated throwaway DB. No mocked modules; no assertions weakened; pre-existing tests unchanged in behavior.
- **Structural reasoning still relied on (not scripted):** the precise interleaving of which concurrent session request wins the OrderLock race (asserted to be safe/consistent, not which specific request); the fact that no pricing-write path exists at all (verified by route/controller inspection, `billingRoutes.js` exposes no update/PATCH). These are documented in the originating audit (section C.3.3) and remain covered by reasoning plus the state-machine tests already present in `billing.api.test.js`.

## Changes made

- New test file `server/tests/billing.gaps.api.test.js` (6 tests): GAP-1a POS, GAP-1b SESSION, GAP-2, GAP-3, GAP-4, GAP-5.
- `server/utils/billingUtils.test.js`: +1 unit test (exact IST instants); `parseIstBoundary` added to the require list.
- `server/tests/inventory.api.test.js`: added explicit `syncIndexes()` for the three inventory models after the DB drop (test-harness fix; see above).
- **No production code, schema, migration, dependency, or deployment change.** No protected directory touched.

## Implemented

- Automated regression coverage for all five Phase 2C gaps (as above).

## Remaining (optional, out of scope for this phase)

- Physical-tablet / live-endpoint verification of billing (requires device tooling; unchanged from prior phases).
- Doc-only repair of the pre-existing control-character corruption in `docs/audits/README.md` section C.3.2 and the tracker P1.3 entry (flagged as a confirmation in Phase 2C; still pending owner approval).

## Owner-approval-required

- Approval of this Phase 2C.1 report and the new tests before deployment.
- Sign-off that the SESSION reuse semantics (same key returns the original bill even if the order later changed) are the desired contract.