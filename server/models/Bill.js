'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const {
    PAYMENT_METHODS,
    PAYMENT_STATUSES,
    BILL_STATUSES,
    validateVoidInput,
} = require('../utils/billingUtils');

// Message codes used across the billing API for a stable contract.
const CODES = {
    NOT_FOUND: 'BILL_NOT_FOUND',
    NO_ELIGIBLE_ORDERS: 'NO_ELIGIBLE_ORDERS',
    ALREADY_BILLED: 'ALREADY_BILLED',
    IN_PROGRESS: 'IN_PROGRESS',
    ORDER_ALREADY_BILLED: 'ORDER_ALREADY_BILLED',
    ORDER_STATE_CHANGED: 'ORDER_STATE_CHANGED',
    BILL_NOT_OPEN: 'BILL_NOT_OPEN',
    BILL_SETTLED: 'BILL_SETTLED',
    BILL_VOID: 'BILL_VOID',
    VP_IN_PROGRESS: 'VOID_IN_PROGRESS',
    REVERSAL_IN_PROGRESS: 'REVERSAL_IN_PROGRESS',
    ALREADY_REVERSED: 'ALREADY_REVERSED',
    ALREADY_VOID: 'ALREADY_VOID',
    EXCEEDS_BALANCE: 'EXCEEDS_BALANCE',
    DUPLICATE_PAYMENT: 'DUPLICATE_PAYMENT',
};

const paymentSchema = new mongoose.Schema(
    {
        paymentId: { type: String, required: true },
        amountPaise: { type: Number, required: true, min: 1 },
        method: { type: String, enum: PAYMENT_METHODS, required: true },
        reference: { type: String, default: '' },
        note: { type: String, default: '' },
        status: { type: String, enum: PAYMENT_STATUSES, default: 'RECORDED' },
        idempotencyKey: { type: String, required: true },
        receivedAt: { type: Date, default: Date.now },
        reversalKey: { type: String, default: null },
        reversalRequestedAt: { type: Date, default: null },
        reversedAt: { type: Date, default: null },
    },
    { _id: false },
);

const billLineSchema = new mongoose.Schema(
    {
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
        name: { type: String, default: '' },
        quantity: { type: Number, default: 0 },
        pricePaise: { type: Number, default: 0 },
        linePaise: { type: Number, default: 0 },
        customizations: { type: [String], default: [] },
    },
    { _id: false },
);

const billOrderSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
        orderNo: { type: String, default: '' },
        statusAtCapture: { type: String, default: '' },
        totalPaise: { type: Number, default: 0 },
        lines: { type: [billLineSchema], default: [] },
    },
    { _id: false },
);

const billSchema = new mongoose.Schema(
    {
        billNumber: { type: String, required: true },
        sessionId: { type: String, required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: BILL_STATUSES, default: 'OPEN', index: true },
        orders: { type: [billOrderSchema], default: [] },
        totalPaise: { type: Number, required: true, min: 0 },
        amountPaidPaise: { type: Number, default: 0, min: 0 },
        balanceDuePaise: { type: Number, required: true, min: 0 },
        payments: { type: [paymentSchema], default: [] },
        settledAt: { type: Date, default: null },
        voidReason: { type: String, default: null },
        voidRequestedAt: { type: Date, default: null },
        voidedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

billSchema.index({ billNumber: 1 }, { unique: true });
// Unique idempotency guard for payments: sparse avoids the multikey `null`
// collision that a plain unique index would create on bills with no payments
// (repo convention from StockMovement.idempotencyKey).
billSchema.index({ 'payments.paymentId': 1 }, { unique: true, sparse: true });
// Covered-orders query (multikey, read-only safety check during capture).
billSchema.index({ sessionId: 1, status: 1, 'orders.orderId': 1 });

function notFound() {
    return { ok: false, code: CODES.NOT_FOUND, httpStatus: 404 };
}

function err(code, httpStatus, message, extra) {
    return Object.assign({ ok: false, code, httpStatus, message }, extra || {});
}

// ---- Payment recording (exactly-once via the atomic {<balance guard>,
// <duplicate-guard>} filter). ----
billSchema.statics.recordPayment = async function recordPayment(billId, input, now = new Date()) {
    const { amountPaise, method, reference, note, idempotencyKey } = input;

    const updated = await this.findOneAndUpdate(
        {
            _id: billId,
            status: 'OPEN',
            balanceDuePaise: { $gte: amountPaise },
            'payments.idempotencyKey': { $ne: idempotencyKey },
        },
        {
            $push: {
                payments: {
                    paymentId: randomUUID(),
                    amountPaise,
                    method,
                    reference: reference || '',
                    note: note || '',
                    status: 'RECORDED',
                    idempotencyKey,
                    receivedAt: now,
                },
            },
            $inc: { amountPaidPaise: amountPaise, balanceDuePaise: -amountPaise },
        },
        { new: true },
    );

    if (updated) {
        // Auto-settle the instant the balance reaches zero (D6: each bill
        // settles independently). Guarded so a concurrent duplicate cannot
        // settle a still-open bill with remaining balance.
        if (updated.balanceDuePaise <= 0) {
            await this.updateOne(
                { _id: billId, status: 'OPEN', balanceDuePaise: 0 },
                { $set: { status: 'SETTLED', settledAt: now } },
            );
        }
        const bill = await this.findById(billId);
        return { ok: true, bill, code: 'PAYMENT_RECORDED' };
    }

    // No match -> classify why.
    const existing = await this.findById(billId);
    if (!existing) {
        return notFound();
    }
    const dup = existing.payments.find(function (p) {
        return p.idempotencyKey === idempotencyKey;
    });
    if (dup) {
        return { ok: true, code: 'DUPLICATE_PAYMENT', alreadyProcessed: true, bill: existing, payment: dup };
    }
    if (existing.status === 'SETTLED') {
        return err(CODES.BILL_SETTLED, 409, 'Bill is already settled and cannot accept more payments', { bill: existing });
    }
    if (existing.status === 'VOIDING') {
        return err(CODES.BILL_NOT_OPEN, 409, 'Bill is being voided', { bill: existing });
    }
    if (existing.status === 'VOID') {
        return err(CODES.BILL_VOID, 409, 'Bill is voided', { bill: existing });
    }
    if (existing.balanceDuePaise < amountPaise) {
        return err(CODES.EXCEEDS_BALANCE, 409, 'Payment exceeds the balance due', { bill: existing });
    }
    return err(CODES.IN_PROGRESS, 409, 'Payment conflicted with a concurrent update; retry', { bill: existing });
};

// ---- Reversal state machine: RECORDED -> REVERSING (R1) -> REVERSED (R2). ----
billSchema.statics.reversePayment = async function reversePayment(billId, paymentId, reversalKey, now = new Date()) {
    if (!paymentId) {
        return err('PAYMENT_REQUIRED', 400, 'paymentId is required');
    }
    // R1: claim the payment as in-flight. Requires the bill to be OPEN, so a
    // reversal can NEVER begin (mutate) after the bill enters VOIDING.
    const claimed = await this.findOneAndUpdate(
        {
            _id: billId,
            status: 'OPEN',
            payments: { $elemMatch: { paymentId, status: 'RECORDED' } },
        },
        {
            $set: {
                'payments.$.status': 'REVERSING',
                'payments.$.reversalKey': reversalKey || randomUUID(),
                'payments.$.reversalRequestedAt': now,
            },
        },
        { new: true },
    );

    if (claimed) {
        return asyncFinishReversal(this, billId, paymentId, claimed, now);
    }

    const existing = await this.findById(billId);
    if (!existing) {
        return notFound();
    }
    const payment = existing.payments.find(function (p) {
        return p.paymentId === paymentId;
    });
    if (!payment) {
        return err('PAYMENT_NOT_FOUND', 404, 'Payment not found on this bill', { bill: existing });
    }
    if (payment.status === 'REVERSED') {
        return { ok: true, code: CODES.ALREADY_REVERSED, alreadyReversed: true, bill: existing };
    }
    if (payment.status === 'REVERSING') {
        if (reversalKey && payment.reversalKey === reversalKey) {
            return asyncFinishReversal(this, billId, paymentId, existing, now);
        }
        return err(CODES.REVERSAL_IN_PROGRESS, 409, 'Another reversal is already in progress for this payment', {
            bill: existing,
        });
    }
    if (existing.status === 'VOIDING') {
        return err(CODES.VP_IN_PROGRESS, 409, 'Bill is being voided; the void will complete the reversal', { bill: existing });
    }
    if (existing.status === 'VOID') {
        return err(CODES.BILL_VOID, 409, 'Bill is voided', { bill: existing });
    }
    if (existing.status === 'SETTLED') {
        return err(CODES.BILL_SETTLED, 409, 'Reversal is only allowed before settlement; void the bill instead', {
            bill: existing,
        });
    }
    return err(CODES.IN_PROGRESS, 409, 'Reversal conflicted with a concurrent update; retry', { bill: existing });
};

// R2: finish a claimed (REVERSING) payment. Exactly one writer can flip the
// payment; if the void claimed the bill mid-reversal this returns null and the
// void's own V2 completes the flip instead.
async function asyncFinishReversal(Model, billId, paymentId, fromBill, now) {
    const amountPaise = (fromBill.payments || []).find(function (p) {
        return p.paymentId === paymentId;
    });
    const safeAmount = amountPaise ? amountPaise.amountPaise : 0;

    const completed = await Model.findOneAndUpdate(
        {
            _id: billId,
            status: 'OPEN',
            payments: { $elemMatch: { paymentId, status: 'REVERSING' } },
        },
        {
            $set: { 'payments.$.status': 'REVERSED', 'payments.$.reversedAt': now },
            $inc: { amountPaidPaise: -safeAmount, balanceDuePaise: safeAmount },
        },
        { new: true },
    );

    if (completed) {
        return { ok: true, code: 'PAYMENT_REVERSED', bill: completed };
    }

    // The bill may have been claimed by a void while we were finishing.
    const existing = await Model.findById(billId);
    if (!existing) {
        return notFound();
    }
    const payment = existing.payments.find(function (p) {
        return p.paymentId === paymentId;
    });
    if (payment && payment.status === 'REVERSED') {
        return { ok: true, code: CODES.ALREADY_REVERSED, alreadyReversed: true, bill: existing };
    }
    if (existing.status === 'VOIDING') {
        return err(CODES.VP_IN_PROGRESS, 409, 'Bill entered VOIDING; the void will complete the reversal', {
            bill: existing,
        });
    }
    if (existing.status === 'VOID') {
        return err(CODES.BILL_VOID, 409, 'Bill is voided', { bill: existing });
    }
    return err(CODES.REVERSAL_IN_PROGRESS, 409, 'Reversal conflicted with a concurrent update; retry', { bill: existing });
}

// Complete any crashed REVERSING payments on an OPEN bill (guarded, idempotent).
billSchema.statics.resumeReversals = async function resumeReversals(billId, now = new Date()) {
    const bill = await this.findById(billId);
    if (!bill) {
        return notFound();
    }
    if (bill.status === 'VOIDING' || bill.status === 'VOID') {
        return { ok: true, code: 'VOID_HANDLES_REVERSALS', bill };
    }
    let current = bill;
    for (let i = 0; i < (Array.isArray(current.payments) ? current.payments.length : 0); i++) {
        const payment = current.payments[i];
        if (payment && payment.status === 'REVERSING') {
            const finished = await asyncFinishReversal(this, billId, payment.paymentId, current, now);
            if (finished && finished.bill && finished.ok) {
                current = finished.bill;
            } else if (finished && !finished.ok) {
                // The reversal refused to progress (conflict/void claimed it).
                // Surfacing the 409 beats returning a stale "resumed" bill.
                return finished;
            }
        }
    }
    return { ok: true, code: 'REVERSALS_RESUMED', bill: current };
};

// ---- Void state machine: OPEN|SETTLED -> VOIDING (V1) -> reverse all (V2) -> VOID (V3). ----
billSchema.statics.voidBill = async function voidBill(billId, reason, now = new Date()) {
    const { value } = validateVoidInput({ reason });
    // V1: claim. BLOCKED while any reversal is in flight (REVERSING), so a
    // void can never begin during a reversal.
    const claimed = await this.findOneAndUpdate(
        {
            _id: billId,
            status: { $in: ['OPEN', 'SETTLED'] },
            payments: { $not: { $elemMatch: { status: 'REVERSING' } } },
        },
        { $set: { status: 'VOIDING', voidReason: value.reason, voidRequestedAt: now } },
        { new: true },
    );

    if (claimed) {
        return finishVoid(this, billId, now, reason);
    }

    const existing = await this.findById(billId);
    if (!existing) {
        return notFound();
    }
    if (existing.status === 'VOID') {
        const bill = await this.findById(billId);
        return { ok: true, code: CODES.ALREADY_VOID, bill };
    }
    if (existing.status === 'VOIDING') {
        return finishVoid(this, billId, now, reason);
    }
    const pending = existing.payments.find(function (p) {
        return p && p.status === 'REVERSING';
    });
    if (pending) {
        return err(CODES.REVERSAL_IN_PROGRESS, 409, 'A payment reversal is in progress; retry after it completes', {
            bill: existing,
        });
    }
    return err(CODES.IN_PROGRESS, 409, 'Void conflicted with a concurrent update; retry', { bill: existing });
};

// V2 (reverse every RECORDED/REVERSING payment) then V3 (finalize). Only the
// void owner can mutate payments while the bill is VOIDING, so the loop
// converges; V3's guard refuses to finalize while any payment is still
// RECORDED or REVERSING.
async function finishVoid(Model, billId, now, reason) {
    // V2
    let current = await Model.findById(billId);
    if (!current) {
        return notFound();
    }
    let guard = 0;
    while (current && current.status === 'VOIDING' && guard < 1000) {
        const payment = current.payments.find(function (p) {
            return p && (p.status === 'RECORDED' || p.status === 'REVERSING');
        });
        if (!payment) {
            break;
        }
        const flipped = await Model.findOneAndUpdate(
            {
                _id: billId,
                status: 'VOIDING',
                payments: { $elemMatch: { paymentId: payment.paymentId, status: { $in: ['RECORDED', 'REVERSING'] } } },
            },
            {
                $set: { 'payments.$.status': 'REVERSED', 'payments.$.reversedAt': now },
                $inc: { amountPaidPaise: -payment.amountPaise, balanceDuePaise: payment.amountPaise },
            },
            { new: true },
        );
        if (!flipped) {
            current = await Model.findById(billId);
            continue;
        }
        current = flipped;
        guard += 1;
    }

    // V3
    const finalized = await Model.findOneAndUpdate(
        {
            _id: billId,
            status: 'VOIDING',
            payments: { $not: { $elemMatch: { status: { $in: ['RECORDED', 'REVERSING'] } } } },
        },
        { $set: { status: 'VOID', voidedAt: now, amountPaidPaise: 0, balanceDuePaise: 0, settledAt: null } },
        { new: true },
    );

    if (finalized) {
        return { ok: true, code: 'BILL_VOIDED', bill: finalized };
    }
    // Someone else is still reversing; re-check.
    const existing = await Model.findById(billId);
    if (!existing) {
        return notFound();
    }
    const pending = existing.payments.find(function (p) {
        return p && (p.status === 'RECORDED' || p.status === 'REVERSING');
    });
    if (pending) {
        return err(CODES.REVERSAL_IN_PROGRESS, 409, 'A payment is still being reversed; retry void', { bill: existing });
    }
    if (existing.status === 'VOID') {
        return { ok: true, code: CODES.ALREADY_VOID, bill: existing };
    }
    return err(CODES.IN_PROGRESS, 409, 'Void conflicted with a concurrent update; retry', { bill: existing });
}

// Crash recovery: completes VOIDING (V2+V3) or OPEN (resumeReversals).
billSchema.statics.resumeBill = async function resumeBill(billId, now = new Date()) {
    const bill = await this.findById(billId);
    if (!bill) {
        return notFound();
    }
    if (bill.status === 'VOIDING') {
        return finishVoid(this, billId, now, bill.voidReason);
    }
    if (bill.status === 'VOID') {
        return { ok: true, code: CODES.ALREADY_VOID, bill };
    }
    return this.resumeReversals(billId, now);
};

// Create a bill with a pre-generated _id/billNumber (locks already acquired).
billSchema.statics.createBillRecord = async function createBillRecord({ billId, billNumber, sessionId, userId, orders, totalPaise }) {
    const bill = await this.create({
        _id: billId,
        billNumber,
        sessionId,
        userId,
        status: 'OPEN',
        orders,
        totalPaise,
        amountPaidPaise: 0,
        balanceDuePaise: totalPaise,
        payments: [],
    });
    return bill;
};

billSchema.statics.getSessionBills = async function getSessionBills(sessionId, sort = { createdAt: -1 }) {
    return this.find({ sessionId }).sort(sort);
};

billSchema.statics.getById = function getById(billId) {
    return this.findById(billId);
};

const Bill = mongoose.model('Bill', billSchema);
Bill.CODES = CODES;

module.exports = Bill;