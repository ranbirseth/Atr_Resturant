'use strict';

const mongoose = require('mongoose');
const {
    LOCK_PURPOSES,
    STALE_BILL_LOCK_MS,
    TRANSITION_LOCK_TTL_MS,
} = require('../utils/billingUtils');
const Bill = require('./Bill');

// OrderLock provides the per-order mutex that coordinates bill capture vs
// order cancel/update, and records which bill covers an order so the guard can
// reject changes (409 ORDER_ALREADY_BILLED) without querying every order.
//
// Indexes:
//   * { orderId: 1 } UNIQUE + partial (active: true)  -> exactly ONE active
//     lock per order at a time (either a BILL lock or a TRANSITION lock).
//     This is a scalar index (orderId is a single-valued field), supported on
//     every MongoDB >= 3.2. A BILL lock therefore blocks a concurrent
//     TRANSITION lock on the same order and vice versa.
//   * { transExpireAt: 1 } TTL -> TRANSITION locks auto-expire after
//     TRANSITION_LOCK_TTL_MS so a crashed cancel/update can never block a bill
//     forever. BILL locks set transExpireAt: null and are NEVER auto-expired:
//     the TTL monitor only deletes documents whose indexed field is a Date.
//
// Reconcile safety (see static reconcile): a BILL lock is deleted ONLY when
// (a) its Bill document no longer exists AND the lock is older than
// STALE_BILL_LOCK_MS, or (b) its Bill is VOID. A lock whose Bill is OPEN /
// SETTLED / VOIDING is a valid active bill's coverage and is NEVER deleted.

const orderLockSchema = new mongoose.Schema({
    requestId: { type: String, required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
    billNumber: { type: String, default: null },
    purpose: { type: String, enum: LOCK_PURPOSES, required: true },
    newStatus: { type: String, default: null },
    active: { type: Boolean, default: true, required: true },
    acquiredAt: { type: Date, default: Date.now, required: true },
    transExpireAt: { type: Date, default: null },
});

orderLockSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { active: true } });
orderLockSchema.index({ billId: 1 });
orderLockSchema.index({ transExpireAt: 1 }, { expireAfterSeconds: 0 });

function isDuplicateKeyError(error) {
    return Boolean(error && (error.code === 11000 || (error.name === 'MongoServerError' && error.code === 11000)));
}

function isFreshLock(lock, now) {
    if (!lock || !lock.acquiredAt) {
        return true;
    }
    return now.getTime() - new Date(lock.acquiredAt).getTime() < STALE_BILL_LOCK_MS;
}

function err(code, message, extra) {
    return Object.assign({ ok: false, code, message }, extra || {});
}

async function resolveConflict(Model, orderId, requestId, now, isTransition) {
    const lock = await Model.findOne({ orderId, active: true });
    if (!lock) {
        // Raced with a release; caller retries.
        return { lock: null, action: 'RETRY' };
    }
    if (lock.requestId === requestId) {
        // Our own in-flight lock (retry after a crash) -> adopt it.
        return { lock, action: 'ADOPT' };
    }
    if (lock.purpose === 'BILL') {
        const bill = lock.billId ? await Bill.findById(lock.billId) : null;
        if (bill && bill.status !== 'VOID') {
            return { lock, action: 'COVERED', bill };
        }
        if (!bill && isFreshLock(lock, now)) {
            // A concurrent capture whose Bill insert hasn't landed yet, or a
            // very fresh orphan. Treat as in-progress: do NOT delete.
            return { lock, action: 'IN_PROGRESS', bill: null };
        }
        // Bill VOID (locks not yet deleted) or a stale orphan whose Bill never
        // existed (crashed capture). Both are safe to clear.
        await Model.deleteOne({ _id: lock._id });
        return { lock: null, action: 'RETRY' };
    }
    // TRANSITION lock by another request.
    if (isTransition) {
        return { lock, action: 'IN_PROGRESS' };
    }
    const age = now.getTime() - new Date(lock.acquiredAt).getTime();
    if (age > TRANSITION_LOCK_TTL_MS) {
        // The TTL monitor should have cleaned this; clear it defensively.
        await Model.deleteOne({ _id: lock._id });
        return { lock: null, action: 'RETRY' };
    }
    return { lock, action: 'IN_PROGRESS' };
}

/**
 * Acquire the unique active lock on an order. Returns:
 *   { ok:true, lock }                 -> acquired (or adopted own stale one)
 *   { ok:false, code:'ORDER_ALREADY_BILLED', bill }
 *   { ok:false, code:'IN_PROGRESS' }
 *   { ok:false, code:'COVERED', bill } (bill capture only)
 */
async function acquire({ orderId, requestId, purpose, newStatus = null, billId = null, billNumber = null, now = new Date() }) {
    let attempt = 0;
    while (attempt < 5) {
        attempt += 1;
        try {
            const lock = await this.create({
                requestId,
                orderId,
                purpose,
                newStatus,
                billId,
                billNumber,
                active: true,
                acquiredAt: now,
                transExpireAt: purpose === 'TRANSITION' ? new Date(now.getTime() + TRANSITION_LOCK_TTL_MS) : null,
            });
            return { ok: true, lock };
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
        }

        const resolved = await resolveConflict(this, orderId, requestId, now, purpose === 'TRANSITION');
        if (resolved.action === 'ADOPT') {
            return { ok: true, lock: resolved.lock };
        }
        if (resolved.action === 'COVERED') {
            return err('ORDER_ALREADY_BILLED', 'This order is already covered by an active bill', { bill: resolved.bill });
        }
        if (resolved.action === 'IN_PROGRESS') {
            return err('IN_PROGRESS', 'Another billing/order operation on this order is already in progress', {
                existing: resolved.lock,
            });
        }
        if (resolved.action === 'RETRY') {
            continue;
        }
        return resolved;
    }
    return err('IN_PROGRESS', 'Could not acquire the order lock after retries');
}

orderLockSchema.statics.acquireTransitionLock = async function acquireTransitionLock(input) {
    const orderId = input.orderId;
    if (!orderId) {
        throw new Error('acquireTransitionLock requires an orderId');
    }
    return acquire.call(this, Object.assign({ purpose: 'TRANSITION' }, input));
};

orderLockSchema.statics.acquireBillLock = async function acquireBillLock(input) {
    const orderId = input.orderId;
    if (!orderId) {
        throw new Error('acquireBillLock requires an orderId');
    }
    return acquire.call(this, Object.assign({ purpose: 'BILL' }, input));
};

// Release the caller's active lock on an order (used after a transition
// completes or fails). Deleting is safe: the unique partial index guarantees
// there is at most one active lock per order.
orderLockSchema.statics.release = async function release(orderId) {
    return this.deleteOne({ orderId, active: true });
};

// Release every BILL lock owned by a bill (called by the void's V3, AFTER the
// bill commits to VOID, so no gap where a bill is VOIDING but uncovered).
orderLockSchema.statics.releaseByBill = async function releaseByBill(billId) {
    return this.deleteMany({ billId, purpose: 'BILL', active: true });
};

// Find the covering active bill for an order, or null. Used by the order guard
// (redundant vs acquireTransitionLock but cheap for reads).
orderLockSchema.statics.coveringBill = async function coveringBill(orderId) {
    const lock = await this.findOne({ orderId, purpose: 'BILL', active: true });
    if (!lock || !lock.billId) {
        return null;
    }
    return Bill.findById(lock.billId);
};

/**
 * Reconcile stale/void BILL locks. Never touches a lock whose Bill is valid
 * and active (OPEN/SETTLED/VOIDING). Returns { removed, billCount }.
 * `olderThanMs` is injectable for tests (default STALE_BILL_LOCK_MS).
 */
orderLockSchema.statics.reconcile = async function reconcile({ olderThanMs = STALE_BILL_LOCK_MS, now = new Date() } = {}) {
    const locks = await this.find({ purpose: 'BILL', active: true });
    let removed = 0;
    const billCount = { active: 0, void: 0, missing: 0 };
    for (let i = 0; i < locks.length; i++) {
        const lock = locks[i];
        const bill = lock.billId ? await Bill.findById(lock.billId) : null;
        if (bill) {
            if (bill.status === 'VOID') {
                await this.deleteOne({ _id: lock._id });
                removed += 1;
                billCount.void += 1;
            } else {
                billCount.active += 1; // valid coverage - NEVER touched
            }
            continue;
        }
        const missingAge = now.getTime() - new Date(lock.acquiredAt).getTime();
        if (missingAge > olderThanMs) {
            await this.deleteOne({ _id: lock._id });
            removed += 1;
            billCount.missing += 1;
        } else {
            billCount.active += 1; // too fresh to call orphaned
        }
    }
    return { removed, billCount };
};

const OrderLock = mongoose.model('OrderLock', orderLockSchema);
OrderLock.TRANSITION_LOCK_TTL_MS = TRANSITION_LOCK_TTL_MS;
OrderLock.STALE_BILL_LOCK_MS = STALE_BILL_LOCK_MS;

module.exports = OrderLock;