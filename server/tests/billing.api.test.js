'use strict';

// Integration tests for the Phase 2B Bills + Payments API. Run with:
//   node --test tests/billing.api.test.js
//
// They connect to a DEDICATED local test database (never the app database) and
// drop it before and after the run. Override the target with
// BILLING_TEST_MONGO_URI if needed.

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.BILLING_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/gola_billing_test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const OrderLock = require('../models/OrderLock');
const Counter = require('../models/Counter');
const { assertPaymentConsistency, toBillDTO } = require('../utils/billingUtils');

let server;
let base;
let orderBase;

async function waitForConnection() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
        mongoose.connection.once('open', resolve);
        mongoose.connection.once('error', reject);
    });
}

async function api(basePath, method, path, body) {
    const response = await fetch(`${basePath}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (response.status >= 500) {
        console.error('SERVER ERROR:', method, path, data);
    }
    return { status: response.status, data };
}

let userSeq = 0;
async function createUser() {
    userSeq += 1;
    return User.create({ name: 'Raju', mobile: `98${String(userSeq).padStart(8, '0')}` });
}

let orderSeq = 0;
async function createOrder({ user, sessionId, status, totalAmount, items }) {
    orderSeq += 1;
    const order = await Order.create({
        userId: user._id,
        sessionId,
        items: items || [{ name: 'Item', quantity: 1, price: totalAmount }],
        totalAmount,
        grossTotal: totalAmount,
        discountAmount: 0,
        orderType: 'Takeaway',
        orderId: `ORD-${Date.now()}-${orderSeq}`,
        status,
    });
    return order;
}

async function generateSessionBill(sessionId, body) {
    return api(base, 'POST', `/sessions/${sessionId}/bills`, body);
}

async function billingOf(billId) {
    const res = await api(base, 'GET', `/bills/${billId}`);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
}

function assertInvariants(dto) {
    const bill = dto;
    const result = assertPaymentConsistency({
        _id: bill._id,
        status: bill.status,
        totalPaise: Math.round((bill.totalAmount || 0) * 100),
        amountPaidPaise: Math.round((bill.amountPaid || 0) * 100),
        balanceDuePaise: Math.round((bill.balanceDue || 0) * 100),
        payments: (bill.payments || []).map(function (p) {
            return { amountPaise: Math.round((p.amount || 0) * 100), status: p.status };
        }),
    });
    assert.equal(result.ok, true, result.issues.join('; '));
    return bill;
}

before(async () => {
    await waitForConnection();
    await mongoose.connection.dropDatabase();
    // dropDatabase() wipes the indexes mongoose auto-built at require time. The
    // OrderLock {orderId, active:true} partial-unique mutex index is load-bearing,
    // so rebuild the schema indexes explicitly before running.
    await Promise.all([
        Bill.syncIndexes(),
        OrderLock.syncIndexes(),
        Counter.syncIndexes(),
    ]);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    const port = server.address().port;
    base = `http://127.0.0.1:${port}/api/billing`;
    orderBase = `http://127.0.0.1:${port}/api/orders`;
});

after(async () => {
    await mongoose.connection.dropDatabase();
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
});

test('generate captures only billable orders with exact paise totals (D1)', async () => {
    const user = await createUser();
    const sessionId = `sess-billable-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 100 });
    await createOrder({ user, sessionId, status: 'Ready', totalAmount: 50.5 });
    await createOrder({ user, sessionId, status: 'PLACED', totalAmount: 200 });
    await createOrder({ user, sessionId, status: 'CANCELLED', totalAmount: 300 });

    const res = await generateSessionBill(sessionId);
    assert.equal(res.status, 201, JSON.stringify(res.data));
    const bill = res.data;
    assert.equal(bill.orderCount, 2);
    assert.equal(bill.totalAmount, 150.5);
    assert.equal(bill.balanceDue, 150.5);
    assert.equal(bill.paymentStatus, 'UNPAID');
    assert.match(bill.billNumber, /^BILL-\d{8}-\d{4}$/);
    const statuses = bill.orders.map(function (o) {
        return o.orderNo;
    });
    assert.equal(statuses.length, 2);
    assertInvariants(bill);
});

test('billing responses are PII-free (issue 1)', async () => {
    const user = await createUser();
    const sessionId = `sess-pii-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 55 });
    const res = await generateSessionBill(sessionId);
    assert.equal(res.status, 201);
const json = JSON.stringify(res.data).toLowerCase();
    for (const forbidden of ['mobile', 'address']) {
        assert.equal(json.includes(forbidden), false, 'leaked: ' + forbidden);
    }
    const listResponse = await api(base, 'GET', `/sessions/${sessionId}/bills`);
    assert.equal(listResponse.status, 200);
    assert.equal(Array.isArray(listResponse.data), true);
    assert.equal(listResponse.data.length, 1);
});

test('delta bills cover only new eligible orders (D2)', async () => {
    const user = await createUser();
    const sessionId = `sess-delta-${user._id}`;
    const first = await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 80 });
    const bill1 = await generateSessionBill(sessionId);
    assert.equal(bill1.status, 201);
    assert.equal(bill1.data.orderCount, 1);

    const second = await createOrder({ user, sessionId, status: 'COMPLETED', totalAmount: 20 });

    // Scoped capture: only the new eligible order, never the already-covered one.
    const bill2 = await generateSessionBill(sessionId, { orderIds: [String(second._id)] });
    assert.equal(bill2.status, 201, JSON.stringify(bill2.data));
    assert.equal(bill2.data.orderCount, 1);
    assert.notEqual(bill2.data.billNumber, bill1.data.billNumber);
    const covered = await billingOf(bill2.data._id);
    assert.equal(covered.orders[0].orderNo, second.orderId);
    assertInvariants(covered);

    // Full re-capture when nothing new remains -> rejected.
    const again = await generateSessionBill(sessionId);
    assert.equal(again.status, 409);
    assert.equal(again.data.error, 'ALREADY_BILLED');
});

test('cancel/change of a billed order is blocked, void unblocks (D3)', async () => {
    const user = await createUser();
    const sessionId = `sess-guard-${user._id}`;
    const orderA = await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 60 });
    const orderB = await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 40 });

    // Bill FIRST: only a billed (covered) order must be guarded.
    const bill = await generateSessionBill(sessionId);
    assert.equal(bill.status, 201, JSON.stringify(bill.data));
    assert.equal(bill.data.orderCount, 2);

    const cancelBlocked = await api(orderBase, 'PUT', `/${orderA._id}/status`, { status: 'CANCELLED' });
    assert.deepEqual({ status: cancelBlocked.status, error: cancelBlocked.data && cancelBlocked.data.error },
        { status: 409, error: 'ORDER_ALREADY_BILLED' }, JSON.stringify(cancelBlocked.data));

    const changeBlocked = await api(orderBase, 'PUT', `/${orderA._id}/update`, {
        items: [{ name: 'Other', quantity: 1, price: 500 }],
        totalAmount: 500,
    });
    assert.deepEqual({ status: changeBlocked.status, error: changeBlocked.data && changeBlocked.data.error },
        { status: 409, error: 'ORDER_ALREADY_BILLED' }, JSON.stringify(changeBlocked.data));

    // Non-cancel/change transitions stay allowed on a billed order.
    const complete = await api(orderBase, 'PUT', `/${orderA._id}/status`, { status: 'COMPLETED' });
    assert.equal(complete.status, 200, JSON.stringify(complete.data));

    const voidRes = await api(base, 'POST', `/bills/${bill.data._id}/void`, { reason: 'wrong session' });
    assert.equal(voidRes.status, 200, JSON.stringify(voidRes.data));
    assert.equal(voidRes.data.status, 'VOID');
    assertInvariants(voidRes.data);

    // After void the lock is released -> a valid cancel on the STILL-ACCEPTED
    // order B succeeds.
    const cancelAfterVoid = await api(orderBase, 'PUT', `/${orderB._id}/status`, { status: 'CANCELLED' });
    assert.equal(cancelAfterVoid.status, 200, JSON.stringify(cancelAfterVoid.data));
    const freshB = await Order.findById(orderB._id);
    assert.equal(freshB.status, 'CANCELLED');
});

test('payment recording: partial, full settle, overpay reject, idempotent replay', async () => {
    const user = await createUser();
    const sessionId = `sess-pay-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 100 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    const partial = await api(base, 'POST', `/bills/${billId}/payments`, {
        amount: 40,
        method: 'CASH',
        idempotencyKey: 'pay-1',
        note: 'advance',
    });
    assert.equal(partial.status, 201);
    assertInvariants(partial.data);
    assert.equal(partial.data.amountPaid, 40);
    assert.equal(partial.data.balanceDue, 60);
    assert.equal(partial.data.paymentStatus, 'PARTIALLY_PAID');

    const replay = await api(base, 'POST', `/bills/${billId}/payments`, {
        amount: 40,
        method: 'CASH',
        idempotencyKey: 'pay-1',
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.alreadyProcessed, true);
    assertInvariants(replay.data.bill);

    const over = await api(base, 'POST', `/bills/${billId}/payments`, {
        amount: 70,
        method: 'UPI',
        idempotencyKey: 'pay-2',
    });
    assert.equal(over.status, 409);
    assert.equal(over.data.error, 'EXCEEDS_BALANCE');
    const afterOver = await billingOf(billId);
    assert.equal(afterOver.balanceDue, 60);

    const full = await api(base, 'POST', `/bills/${billId}/payments`, {
        amount: 60,
        method: 'UPI',
        idempotencyKey: 'pay-3',
    });
    assert.equal(full.status, 201);
    assert.equal(full.data.balanceDue, 0);
    assert.equal(full.data.status, 'SETTLED');
    assert.equal(full.data.paymentStatus, 'PAID');
    assertInvariants(full.data);

    const afterSettle = await api(base, 'POST', `/bills/${billId}/payments`, {
        amount: 5,
        method: 'CASH',
        idempotencyKey: 'pay-4',
    });
    assert.equal(afterSettle.status, 409);
    assert.equal(afterSettle.data.error, 'BILL_SETTLED');
});

test('payment reversal restores the balance exactly once (R1 -> R2)', async () => {
    const user = await createUser();
    const sessionId = `sess-rev-${user._id}`;
    await createOrder({ user, sessionId, status: 'Ready', totalAmount: 200 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    await api(base, 'POST', `/bills/${billId}/payments`, { amount: 150, method: 'WALLET', idempotencyKey: 'rev-pay' });
    let current = await billingOf(billId);
    const paymentId = current.payments[0].paymentId;
    assert.equal(current.balanceDue, 50);
    assert.equal(current.amountPaid, 150);

    const reverse = await api(base, 'POST', `/bills/${billId}/payments/${paymentId}/reverse`, { reversalKey: 'rev-1' });
    assert.equal(reverse.status, 200, JSON.stringify(reverse.data));
    assertInvariants(reverse.data);
    assert.equal(reverse.data.amountPaid, 0);
    assert.equal(reverse.data.balanceDue, 200);
    assert.equal(reverse.data.payments[0].status, 'REVERSED');

    const replay = await api(base, 'POST', `/bills/${billId}/payments/${paymentId}/reverse`, { reversalKey: 'rev-1' });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.alreadyReversed, true);
    assertInvariants(replay.data);
    assert.equal(replay.data.balanceDue, 200, 'No double restore on replay');
});

test('reversal on a settled bill is refused; void of a settled bill works', async () => {
    const user = await createUser();
    const sessionId = `sess-revsettle-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 50 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    const pay = await api(base, 'POST', `/bills/${billId}/payments`, { amount: 50, method: 'CASH', idempotencyKey: 'full-k' });
    assert.equal(pay.status, 201);
    assert.equal(pay.data.status, 'SETTLED');
    const paymentId = pay.data.payments[0].paymentId;

    const reverseSettled = await api(base, 'POST', `/bills/${billId}/payments/${paymentId}/reverse`, { reversalKey: 'k2' });
    assert.equal(reverseSettled.status, 409);
    assert.equal(reverseSettled.data.error, 'BILL_SETTLED');

    const voidRes = await api(base, 'POST', `/bills/${billId}/void`, { reason: 'test' });
    assert.equal(voidRes.status, 200, JSON.stringify(voidRes.data));
    assert.equal(voidRes.data.status, 'VOID');
    assert.equal(voidRes.data.amountPaid, 0);
    assert.equal(voidRes.data.balanceDue, 0);
    assertInvariants(voidRes.data);
});

test('reversal cannot begin after VOIDING (guard), void blocked while REVERSING, recovery via resume', async () => {
    const user = await createUser();
    const sessionId = `sess-race-${user._id}`;
    // 400 total, 300 paid -> bill stays OPEN (a reversal can legally begin).
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 400 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    await api(base, 'POST', `/bills/${billId}/payments`, { amount: 300, method: 'CASH', idempotencyKey: 'race-pay' });
    const seeded = await billingOf(billId);
    const paymentId = seeded.payments[0].paymentId;

    // Simulate a crash right after R1 (status flips to REVERSING, balance not
    // yet restored): bills stays OPEN with an in-flight reversal.
    await Bill.updateOne(
        { _id: billId, 'payments.paymentId': paymentId },
        { $set: { 'payments.$.status': 'REVERSING', 'payments.$.reversalKey': 'seed-race', 'payments.$.reversalRequestedAt': new Date() } },
    );

    // A void MUST NOT begin while a reversal is in flight -> 409.
    const voidDuring = await api(base, 'POST', `/bills/${billId}/void`, {});
    assert.equal(voidDuring.status, 409);
    assert.equal(voidDuring.data.error, 'REVERSAL_IN_PROGRESS');

    // A second reversal with a different key while REVERSING -> 409.
    const secondReversal = await api(base, 'POST', `/bills/${billId}/payments/${paymentId}/reverse`, { reversalKey: 'other' });
    assert.equal(secondReversal.status, 409);
    assert.equal(secondReversal.data.error, 'REVERSAL_IN_PROGRESS');

    // resume completes the crashed reversal.
    const resumed = await api(base, 'POST', `/bills/${billId}/resume`, {});
    assert.equal(resumed.status, 200, JSON.stringify(resumed.data));
    assert.equal(resumed.data.payments[0].status, 'REVERSED');
    assert.equal(resumed.data.amountPaid, 0);
    assert.equal(resumed.data.balanceDue, 400);
    assertInvariants(resumed.data);

    // Idempotent resume: nothing left in flight -> still 200 with stable state.
    const resumedAgain = await api(base, 'POST', `/bills/${billId}/resume`, {});
    assert.equal(resumedAgain.status, 200);
    assert.equal(resumedAgain.data.amountPaid, 0);

    // The recovered bill can now be voided normally.
    const voidRes = await api(base, 'POST', `/bills/${billId}/void`, {});
    assert.equal(voidRes.status, 200, JSON.stringify(voidRes.data));
    assert.equal(voidRes.data.status, 'VOID');
    assertInvariants(voidRes.data);

    // Separate crash state: bill parked in VOIDING with a RECORDED payment.
    // A reversal MUST NOT begin while the void is in flight.
    const session2 = `sess-race2-voiding-${user._id}`;
    await createOrder({ user, sessionId: session2, status: 'ACCEPTED', totalAmount: 300 });
    const bill2 = await generateSessionBill(session2);
    const bill2Id = bill2.data._id;
    await api(base, 'POST', `/bills/${bill2Id}/payments`, { amount: 300, method: 'CASH', idempotencyKey: 'race2-pay' });
    const second = await billingOf(bill2Id);
    const secondPaymentId = second.payments[0].paymentId;
    await Bill.updateOne({ _id: bill2Id }, { $set: { status: 'VOIDING', voidRequestedAt: new Date() } });

    const reversalAfterVoiding = await api(base, 'POST', `/bills/${bill2Id}/payments/${secondPaymentId}/reverse`, { reversalKey: 'late' });
    assert.equal(reversalAfterVoiding.status, 409);
    assert.equal(reversalAfterVoiding.data.error, 'VOID_IN_PROGRESS');

    // resume finalises the crash-parked void.
    const resumeFinal = await api(base, 'POST', `/bills/${bill2Id}/resume`, {});
    assert.equal(resumeFinal.status, 200, JSON.stringify(resumeFinal.data));
    assert.equal(resumeFinal.data.status, 'VOID');
    assert.equal(resumeFinal.data.payments[0].status, 'REVERSED');
    assertInvariants(resumeFinal.data);
});

test('concurrent duplicate payments with one idempotency key record exactly once', async () => {
    const user = await createUser();
    const sessionId = `sess-conc-${user._id}`;
    await createOrder({ user, sessionId, status: 'COMPLETED', totalAmount: 100 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    const results = await Promise.all(
        Array.from({ length: 20 }, function () {
            return api(base, 'POST', `/bills/${billId}/payments`, {
                amount: 50,
                method: 'CASH',
                idempotencyKey: 'same-key',
            });
        }),
    );
    const created = results.filter(function (r) {
        return r.status === 201;
    });
    const others = results.filter(function (r) {
        return r.status !== 201;
    });
    assert.equal(created.length, 1, 'exactly one payment is recorded');
    for (const other of others) {
        assert.ok(other.status === 200 || other.status === 409, 'duplicate must be 200/409, got ' + other.status);
    }

    const after = await billingOf(billId);
    assert.equal(after.payments.length, 1);
    assert.equal(after.amountPaid, 50);
    assert.equal(after.balanceDue, 50);
    assertInvariants(after);
});

test('concurrent distinct payments sum exactly and auto-settle', async () => {
    const user = await createUser();
    const sessionId = `sess-conc2-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 1000 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    const results = await Promise.all(
        Array.from({ length: 10 }, function (_, i) {
            return api(base, 'POST', `/bills/${billId}/payments`, {
                amount: 100,
                method: 'UPI',
                idempotencyKey: `distinct-${i}`,
            });
        }),
    );
    const created = results.filter(function (r) {
        return r.status === 201;
    });
    assert.equal(created.length, 10, results.map(function (r) { return r.status; }).join(','));

    const after = await billingOf(billId);
    assert.equal(after.balanceDue, 0);
    assert.equal(after.status, 'SETTLED');
    assert.equal(after.amountPaid, 1000);
    assertInvariants(after);
});

test('concurrent reversal + void settle on one consistent outcome', async () => {
    const user = await createUser();
    const sessionId = `sess-race2-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 500 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    // Partial payment keeps the bill OPEN so the reversal can actually begin
    // and truly race the void (a settled bill would just 409 the reversal).
    const pay = await api(base, 'POST', `/bills/${billId}/payments`, { amount: 300, method: 'CARD', idempotencyKey: 'race2-pay' });
    assert.equal(pay.status, 201);
    const paymentId = pay.data.payments[0].paymentId;
    assert.equal(pay.data.paymentStatus, 'PARTIALLY_PAID');

    // Fire both concurrently; the state machine must converge to a VOID bill
    // with all payments REVERSED and zero balances.
    const [revRes, voidRes] = await Promise.all([
        api(base, 'POST', `/bills/${billId}/payments/${paymentId}/reverse`, { reversalKey: 'race2-rev' }),
        api(base, 'POST', `/bills/${billId}/void`, { reason: 'race2' }),
    ]);

    const allowed = [200, 409];
    assert.ok(allowed.includes(revRes.status), 'reverse status ' + revRes.status + ' ' + JSON.stringify(revRes.data));
    assert.ok(allowed.includes(voidRes.status), 'void status ' + voidRes.status);

    // Whatever the interleaving, a retried void converges to VOID once the
    // in-flight reversal is out of the way (approved recovery semantics).
    const finalVoid = await api(base, 'POST', `/bills/${billId}/void`, { reason: 'race2-retry' });
    assert.equal(finalVoid.status, 200, JSON.stringify(finalVoid.data));

    const final = await billingOf(billId);
    assert.equal(final.status, 'VOID', 'bill must end VOID regardless of interleaving');
    assert.equal(final.amountPaid, 0);
    assert.equal(final.balanceDue, 0);
    assert.equal(final.payments[0].status, 'REVERSED');
    assertInvariants(final);
});

test('retry fuzz: identical states after repeated replays of every operation', async () => {
    const user = await createUser();
    const sessionId = `sess-fuzz-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 250 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;

    const payRes = await api(base, 'POST', `/bills/${billId}/payments`, { amount: 100, method: 'CASH', idempotencyKey: 'fuzz-k' });
    assert.equal(payRes.status, 201);
    assert.equal(payRes.data.paymentStatus, 'PARTIALLY_PAID');
    const paymentId = payRes.data.payments[0].paymentId;

    for (let i = 0; i < 3; i++) {
        const replayPay = await api(base, 'POST', `/bills/${billId}/payments`, { amount: 100, method: 'CASH', idempotencyKey: 'fuzz-k' });
        assert.equal(replayPay.status, 200);
        assert.equal(replayPay.data.alreadyProcessed, true);
    }

    let lastState = await billingOf(billId);
    for (let i = 0; i < 3; i++) {
        const reverse = await api(base, 'POST', `/bills/${billId}/payments/${paymentId}/reverse`, { reversalKey: 'fuzz-rev' });
        assert.equal(reverse.status, 200);
        if (i > 0) assert.equal(reverse.data.alreadyReversed, true);
        const state = reverse.data;
        assert.equal(state.amountPaid, 0);
        assert.equal(state.balanceDue, 250);
        assertInvariants(state);
        lastState = state;
    }

    for (let i = 0; i < 3; i++) {
        const voidRes = await api(base, 'POST', `/bills/${billId}/void`, { reason: 'fuzz' });
        assert.equal(voidRes.status, 200, JSON.stringify(voidRes.data));
        assert.equal(voidRes.data.status, 'VOID');
        assert.equal(voidRes.data.amountPaid, 0);
        assert.equal(voidRes.data.balanceDue, 0);
        assertInvariants(voidRes.data);
        lastState = voidRes.data;
    }
    assert.equal(lastState.status, 'VOID');

    const resume = await api(base, 'POST', `/bills/${billId}/resume`, {});
    assert.equal(resume.status, 200);
    assert.equal(resume.data.status, 'VOID');
    assertInvariants(resume.data);
});

test('OrderLock reconcile never touches a valid active bill lock (issue 4)', async () => {
    const user = await createUser();
    const sessionId = `sess-lock-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 75 });
    const bill = await generateSessionBill(sessionId);
    const billId = bill.data._id;
    const trialLocks = function () {
        return OrderLock.countDocuments({ billId, purpose: 'BILL', active: true });
    };

    // 0) Exactly one valid BILL lock for this bill exists.
    assert.equal(await trialLocks(), 1);

    // 1) Valid OPEN bill -> lock retained by reconcile (never touched).
    const before = await OrderLock.reconcile({ olderThanMs: 0 });
    assert.equal(before.removed, 0, 'a valid OPEN bill lock must never be removed');
    assert.equal(await trialLocks(), 1);

    // 2) Void releases the locks itself (V3 -> releaseByBill).
    const voidRes = await api(base, 'POST', `/bills/${billId}/void`, {});
    assert.equal(voidRes.status, 200);
    assert.equal(await trialLocks(), 0, 'void releases its locks after V3');

    // 2b) reconcile still cleans up ANY lock left pointing at a VOID bill
    // (e.g. a crash between V3 and the release call).
    const leftoverOrder = await createOrder({ user, sessionId: 'orphan-leftover', status: 'COMPLETED', totalAmount: 5 });
    await OrderLock.create({
        requestId: 'void-leftover',
        orderId: leftoverOrder._id,
        billId,
        purpose: 'BILL',
        active: true,
        acquiredAt: new Date(),
    });
    const afterVoid = await OrderLock.reconcile({ olderThanMs: 0 });
    assert.equal(afterVoid.removed, 1, 'a VOID bill lock is safe to remove');
    assert.equal(await trialLocks(), 0);

    // 3) Orphan lock whose Bill never existed + stale -> removed; fresh is kept.
    const staleTarget = await createOrder({ user, sessionId: 'orphan-stale', status: 'COMPLETED', totalAmount: 10 });
    const freshTarget = await createOrder({ user, sessionId: 'orphan-fresh', status: 'COMPLETED', totalAmount: 10 });
    const stale = await OrderLock.create({
        requestId: 'crash-orphan',
        orderId: staleTarget._id,
        billId: new mongoose.Types.ObjectId(), // no such Bill document
        purpose: 'BILL',
        active: true,
        acquiredAt: new Date(Date.now() - OrderLock.STALE_BILL_LOCK_MS - 1000),
    });
    const fresh = await OrderLock.create({
        requestId: 'crash-fresh',
        orderId: freshTarget._id,
        billId: new mongoose.Types.ObjectId(),
        purpose: 'BILL',
        active: true,
        acquiredAt: new Date(),
    });
    const recon = await OrderLock.reconcile({ olderThanMs: OrderLock.STALE_BILL_LOCK_MS });
    assert.ok(!(await OrderLock.findById(stale._id)), 'stale orphan removed');
    assert.ok(await OrderLock.findById(fresh._id), 'fresh orphan kept (too young to be an orphan)');
});

test('bill numbers are monotonic per day via the Counter', async () => {
    const user = await createUser();
    const sessionIdA = `sess-seq-a-${user._id}`;
    const sessionIdB = `sess-seq-b-${user._id}`;
    await createOrder({ user, sessionId: sessionIdA, status: 'ACCEPTED', totalAmount: 10 });
    await createOrder({ user, sessionId: sessionIdB, status: 'ACCEPTED', totalAmount: 11 });
    const a = await generateSessionBill(sessionIdA);
    const b = await generateSessionBill(sessionIdB);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const seqA = parseInt(a.data.billNumber.split('-')[2], 10);
    const seqB = parseInt(b.data.billNumber.split('-')[2], 10);
    assert.equal(seqB - seqA, 1);
});

test('bill generation rejects a session with zero billable orders', async () => {
    const user = await createUser();
    const sessionId = `sess-none-${user._id}`;
    await createOrder({ user, sessionId, status: 'PLACED', totalAmount: 30 });
    await createOrder({ user, sessionId, status: 'CANCELLED', totalAmount: 30 });
    const res = await generateSessionBill(sessionId);
    assert.equal(res.status, 409);
    assert.equal(res.data.error, 'NO_ELIGIBLE_ORDERS');

    const missing = await generateSessionBill('sess-does-not-exist');
    assert.equal(missing.status, 404);
});

test('purpose-built toBillDTO works through the API for get endpoints', async () => {
    const user = await createUser();
    const sessionId = `sess-get-${user._id}`;
    await createOrder({ user, sessionId, status: 'ACCEPTED', totalAmount: 42 });
    const created = await generateSessionBill(sessionId);
    const single = await api(base, 'GET', `/bills/${created.data._id}`);
    assert.equal(single.status, 200);
    assert.equal(single.data.billNumber, created.data.billNumber);

    const badId = await api(base, 'GET', `/bills/${new mongoose.Types.ObjectId()}`);
    assert.equal(badId.status, 404);
    assert.equal(badId.data.error, 'BILL_NOT_FOUND');
});