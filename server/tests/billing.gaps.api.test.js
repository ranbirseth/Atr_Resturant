'use strict';

// Phase 2C.1 regression tests for the five billing gaps found in the Phase 2C
// audit. Run with:  node --test tests/billing.gaps.api.test.js
//
// Connects to a DEDICATED local test database (never the app database) and
// drops it before/after. Override with BILLING_GAPS_TEST_MONGO_URI.
//
// GAP-1  concurrent idempotency      -> exactly one bill, replays share it
// GAP-2  immutable snapshot          -> pricing survives pay/reverse/void/resume
// GAP-3  legacy bill readability     -> pre-P1.3 docs stay readable + payable
// GAP-4  safe re-billing             -> orders locked until void + reversals
// GAP-5  exact IST boundaries        -> date-only filters include/exclude the
//                                       correct UTC instants

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.BILLING_GAPS_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/gola_billing_gaps_test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Item = require('../models/Item');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const OrderLock = require('../models/OrderLock');
const Counter = require('../models/Counter');

let server;
let base;

// SAFETY: refuse to run unless the target is the dedicated test database.
function assertTestDatabase() {
    const dbName = mongoose.connection.db ? mongoose.connection.db.databaseName : (mongoose.connection.name || '');
    if (!/gola_billing_gaps_test$/.test(dbName)) {
        throw new Error('Refusing to run billing gaps tests against non-test database: ' + dbName);
    }
}

async function waitForConnection() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
        mongoose.connection.once('open', resolve);
        mongoose.connection.once('error', reject);
    });
}

async function api(path, method, body) {
    const response = await fetch(`${base}${path}`, {
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

let itemSeq = 0;
async function createItem({ name, price, category, available, availableForStaff }) {
    itemSeq += 1;
    return Item.create({
        name: name || `Item-${itemSeq}`,
        price,
        category: category || 'Mains',
        available: available !== undefined ? available : true,
        availableForStaff: availableForStaff !== undefined ? availableForStaff : true,
    });
}

let orderSeq = 0;
async function createOrder({ user, sessionId, status, audience, items, totalAmount, discountAmount, couponCode }) {
    orderSeq += 1;
    return Order.create({
        userId: user._id,
        sessionId,
        audience: audience || 'CUSTOMER',
        items: items || [],
        totalAmount: totalAmount !== undefined ? totalAmount : 0,
        grossTotal: totalAmount !== undefined ? totalAmount : 0,
        discountAmount: discountAmount || 0,
        couponCode: couponCode || undefined,
        orderType: 'Takeaway',
        orderId: `ORD-${Date.now()}-${orderSeq}`,
        status,
    });
}

// Canonical projection of every write-once pricing field on a Bill (GAP-2).
function pricingSnapshot(bill) {
    function linesOf(list) {
        return (list || []).map((line) => [
            line.itemId ? String(line.itemId) : null,
            line.name || '',
            line.quantity,
            line.pricePaise,
            line.linePaise,
            (line.customizations || []).join('|'),
        ]);
    }
    return {
        audience: bill.audience,
        origin: bill.origin,
        subtotalPaise: bill.subtotalPaise,
        discountPaise: bill.discountPaise,
        couponCode: bill.couponCode || '',
        totalPaise: bill.totalPaise,
        lines: linesOf(bill.lines),
        orders: (bill.orders || []).map((o) => ({
            orderId: o.orderId ? String(o.orderId) : null,
            orderNo: o.orderNo || '',
            statusAtCapture: o.statusAtCapture || '',
            totalPaise: o.totalPaise,
            originalTotalPaise: o.originalTotalPaise === null || o.originalTotalPaise === undefined ? null : o.originalTotalPaise,
            billedTotalPaise: o.billedTotalPaise === null || o.billedTotalPaise === undefined ? null : o.billedTotalPaise,
            discountPaise: o.discountPaise === null || o.discountPaise === undefined ? null : o.discountPaise,
            couponCode: o.couponCode || '',
            lines: linesOf(o.lines),
        })),
    };
}

async function readBill(billId) {
    const bill = await Bill.findById(billId);
    assert.ok(bill, 'bill must exist in the DB');
    return bill;
}

async function assertSnapshot(billId, expected) {
    const bill = await readBill(billId);
    assert.deepEqual(pricingSnapshot(bill), expected);
}

before(async () => {
    await waitForConnection();
    assertTestDatabase();
    await mongoose.connection.dropDatabase();
    await Promise.all([
        Bill.syncIndexes(),
        OrderLock.syncIndexes(),
        Counter.syncIndexes(),
        Item.syncIndexes(),
        Category.syncIndexes(),
    ]);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    const port = server.address().port;
    base = `http://127.0.0.1:${port}/api/billing`;
});

after(async () => {
    await mongoose.connection.dropDatabase();
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
});

test('GAP-1 concurrent POS idempotency: same key+payload creates exactly one bill', async () => {
    const item = await createItem({ name: 'Chai', price: 20 });

    // Fire the same checkout six times in parallel with the identical payload.
    const results = await Promise.all(
        Array.from({ length: 6 }, () => api('/pos/bills', 'POST', {
            audience: 'CUSTOMER',
            items: [{ itemId: String(item._id), quantity: 2 }],
            idempotencyKey: 'gap1-pos',
            createdBy: 'counter-1',
        })),
    );

    const created = results.filter((r) => r.status === 201);
    const replays = results.filter((r) => r.status === 200);
    assert.equal(created.length, 1, `exactly one 201 expected, got ${created.length}`);
    assert.equal(replays.length, results.length - 1, 'every other request must replay 200');

    // Every successful response references the same single bill.
    const billIds = new Set(results.filter((r) => r.status === 200 || r.status === 201).map((r) => r.data._id));
    const billNumbers = new Set(results.filter((r) => r.status === 200 || r.status === 201).map((r) => r.data.billNumber));
    assert.equal(billIds.size, 1, 'all responses must return the same bill');
    assert.equal(billNumbers.size, 1, 'all responses must return the same billNumber');
    results.forEach((r) => {
        if (r.status === 200) {
            assert.equal(r.data.alreadyProcessed, true);
        }
    });

    // Only one persisted bill for the key.
    const persisted = await Bill.find({ idempotencyKey: 'POS:gap1-pos' });
    assert.equal(persisted.length, 1, 'exactly one bill document in the DB');
    assert.equal(await Bill.countDocuments({ origin: 'POS' }), 1, 'exactly one POS bill persisted');

    // Same key reused with a different payload is a conflict.
    const reused = await api('/pos/bills', 'POST', {
        audience: 'CUSTOMER',
        items: [{ itemId: String(item._id), quantity: 3 }],
        idempotencyKey: 'gap1-pos',
    });
    assert.equal(reused.status, 409, JSON.stringify(reused.data));
    assert.equal(reused.data.error, 'IDEMPOTENCY_KEY_REUSED');
});

test('GAP-1 concurrent SESSION idempotency: exactly one bill despite parallel captures', async () => {
    const user = await createUser();
    const sessionId = `sess-gap1-${user._id}`;
    const item = await createItem({ name: 'Biryani', price: 60 });
    await createOrder({
        user,
        sessionId,
        status: 'ACCEPTED',
        audience: 'CUSTOMER',
        items: [{ itemId: item._id, name: 'Biryani', quantity: 1, price: 60 }],
        totalAmount: 60,
    });

    const payload = { audience: 'CUSTOMER', idempotencyKey: 'gap1-sess' };
    const results = await Promise.all(
        Array.from({ length: 6 }, () => api(`/sessions/${sessionId}/bills`, 'POST', payload)),
    );

    const ok = results.filter((r) => r.status === 201 || r.status === 200);
    assert.ok(ok.length >= 1, 'at least one capture must succeed');

    const billIds = new Set(ok.map((r) => r.data._id));
    const billNumbers = new Set(ok.map((r) => r.data.billNumber));
    assert.equal(billIds.size, 1, 'all successful responses must reference one bill');
    assert.equal(billNumbers.size, 1);

    // Lock-contending requests are allowed to surface a retryable 409
    // (IN_PROGRESS / ALREADY_BILLED), never a 500 and never a duplicate.
    results.forEach((r) => {
        assert.ok(r.status === 200 || r.status === 201 || r.status === 409,
            `unexpected status ${r.status}: ${JSON.stringify(r.data)}`);
        if (r.status === 409) {
            assert.ok(r.data.error === 'IN_PROGRESS' || r.data.error === 'ALREADY_BILLED',
                '409 must be a retryable billing conflict');
        }
    });

    const bills = await api(`/sessions/${sessionId}/bills`, 'GET');
    assert.equal(bills.data.length, 1, 'exactly one session bill persisted');
    assert.equal(await Bill.countDocuments({ idempotencyKey: 'SESSION:gap1-sess' }), 1);

    // Same key with a different payload is a conflict, not a silent replay.
    const reused = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'STAFF', idempotencyKey: 'gap1-sess' });
    assert.equal(reused.status, 409, JSON.stringify(reused.data));
    assert.equal(reused.data.error, 'IDEMPOTENCY_KEY_REUSED');

    // The winning bill still holds exactly one active BILL lock on the order.
    const order = await Order.findOne({ sessionId });
    const locks = await OrderLock.find({ orderId: order._id, purpose: 'BILL', active: true });
    assert.equal(locks.length, 1, 'winning bill keeps exactly one active lock');
    assert.equal(String(locks[0].billId), bills.data[0]._id);
});

test('GAP-2 immutable snapshot preserved across payment, reversal, void and resume', async () => {
    const user = await createUser();
    const sessionId = `sess-gap2-${user._id}`;
    const tea = await createItem({ name: 'Tea', price: 40 });
    const combo = await createItem({ name: 'Combo', price: 100 });
    await createOrder({
        user,
        sessionId,
        status: 'ACCEPTED',
        audience: 'CUSTOMER',
        items: [
            { itemId: tea._id, name: 'Tea', quantity: 2, price: 999 },
            { itemId: combo._id, name: 'Combo', quantity: 1, price: 999 },
        ],
        totalAmount: 1998,
        discountAmount: 30,
        couponCode: 'SAVE30',
    });

    const res = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    const billId = res.data._id;

    const baseline = pricingSnapshot(await readBill(billId));
    assert.equal(baseline.audience, 'CUSTOMER');
    assert.equal(baseline.subtotalPaise, 18000, '2x40 + 1x100 repriced at current menu');
    assert.equal(baseline.discountPaise, 3000, 'source coupon discount preserved once');
    assert.equal(baseline.totalPaise, 15000);
    assert.equal(baseline.lines.length, 2);

    // 1) partial payment
    const pay1 = await api(`/bills/${billId}/payments`, 'POST', { amount: 50, method: 'CASH', idempotencyKey: 'gap2-p1' });
    assert.equal(pay1.status, 201, JSON.stringify(pay1.data));
    assert.equal(pay1.data.amountPaid, 50);
    assert.equal(pay1.data.balanceDue, 100);
    await assertSnapshot(billId, baseline);

    // 2) reversal of that payment
    const rev = await api(`/bills/${billId}/payments/${pay1.data.payments[0].paymentId}/reverse`, 'POST', {});
    assert.equal(rev.status, 200, JSON.stringify(rev.data));
    assert.equal(rev.data.payments[0].status, 'REVERSED');
    assert.equal(rev.data.amountPaid, 0);
    assert.equal(rev.data.balanceDue, 150);
    await assertSnapshot(billId, baseline);

    // 3) full payment -> auto-settle
    const pay2 = await api(`/bills/${billId}/payments`, 'POST', { amount: 150, method: 'UPI', idempotencyKey: 'gap2-p2' });
    assert.equal(pay2.status, 201, JSON.stringify(pay2.data));
    assert.equal(pay2.data.status, 'SETTLED');
    assert.equal(pay2.data.amountPaid, 150);
    await assertSnapshot(billId, baseline);

    // 4) void (reverses the payment via V2, then VOID)
    const voidRes = await api(`/bills/${billId}/void`, 'POST', { reason: 'GAP-2 test' });
    assert.equal(voidRes.status, 200, JSON.stringify(voidRes.data));
    assert.equal(voidRes.data.status, 'VOID');
    assert.equal(voidRes.data.amountPaid, 0);
    assert.equal(voidRes.data.balanceDue, 0);
    await assertSnapshot(billId, baseline);

    // 5) resume on a VOID bill must not permit an invalid transition.
    const resume = await api(`/bills/${billId}/resume`, 'POST', {});
    assert.equal(resume.status, 200, JSON.stringify(resume.data));
    assert.equal(resume.data.status, 'VOID', 'resume must not reopen a VOID bill');
    await assertSnapshot(billId, baseline);
});

test('GAP-3 legacy bills (no P1.3 fields) stay readable, payable and analysable', async () => {
    const user = await createUser();
    const sessionId = 'sess-gap3-legacy';

    // A Phase 2B-era Bill: no origin/audience/lines/subtotal/discount/coupon/
    // idempotencyKey/createdBy. Inserted raw, exactly as Phase 2B would have.
    const legacyId = new mongoose.Types.ObjectId();
    const legacyOrderId = new mongoose.Types.ObjectId();
    await Bill.collection.insertOne({
        _id: legacyId,
        billNumber: 'LEG-BILL-1',
        sessionId,
        userId: user._id,
        status: 'OPEN',
        orders: [
            {
                orderId: legacyOrderId,
                orderNo: 'ORD-LEG-1',
                statusAtCapture: 'ACCEPTED',
                totalPaise: 4500,
            },
        ],
        totalPaise: 4500,
        amountPaidPaise: 0,
        balanceDuePaise: 4500,
        payments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // 1) GET single bill - DTO defaults hold, no crash, no fabricated amounts.
    const byId = await api(`/bills/${legacyId}`, 'GET');
    assert.equal(byId.status, 200, JSON.stringify(byId.data));
    assert.equal(byId.data.origin, 'SESSION', 'legacy bills default to SESSION');
    assert.equal(byId.data.audience, 'CUSTOMER', 'legacy bills default to CUSTOMER');
    assert.equal(byId.data.totalAmount, 45);
    assert.equal(byId.data.discount, 0);
    assert.equal(byId.data.orderCount, 1);
    assert.equal(byId.data.orders[0].total, 45);

    // 2) GET session listing includes the legacy bill.
    const list = await api(`/sessions/${sessionId}/bills`, 'GET');
    assert.ok(list.data.some((b) => String(b._id) === String(legacyId)), 'legacy bill in session listing');

    // 3) The legacy bill can still accept a payment (Phase 2B flow).
    const pay = await api(`/bills/${legacyId}/payments`, 'POST', { amount: 20, method: 'CASH', idempotencyKey: 'gap3-pay' });
    assert.equal(pay.status, 201, JSON.stringify(pay.data));
    assert.equal(pay.data.amountPaid, 20);
    assert.equal(pay.data.balanceDue, 25);

    // 4) Reversal still works on the legacy bill.
    const rev = await api(`/bills/${legacyId}/payments/${pay.data.payments[0].paymentId}/reverse`, 'POST', {});
    assert.equal(rev.status, 200, JSON.stringify(rev.data));
    assert.equal(rev.data.balanceDue, 45);

    // 5) No destructive migration: the stored document still lacks P1.3 keys.
    const raw = await Bill.collection.findOne({ _id: legacyId });
    assert.equal('origin' in raw, false, 'no origin field was backfilled');
    assert.equal('audience' in raw, false, 'no audience field was backfilled');
    assert.equal('lines' in raw, false, 'no lines field was backfilled');
    assert.equal('subtotalPaise' in raw, false, 'no subtotal was backfilled');

    // 6) Analytics counts the legacy bill as CUSTOMER/SESSION revenue.
    const ana = await api('/analytics', 'GET');
    assert.equal(ana.status, 200);
    const customer = ana.data.byAudience.find((x) => x.audience === 'CUSTOMER');
    const session = ana.data.byOrigin.find((x) => x.origin === 'SESSION');
    assert.ok(customer && customer.recognized >= 1, 'legacy bill recognized as CUSTOMER');
    assert.ok(session && session.recognized >= 1, 'legacy bill recognized as SESSION');
});

test('GAP-4 source orders release for re-billing only after full void + reversals', async () => {
    const user = await createUser();
    const sessionId = `sess-gap4-${user._id}`;
    const item = await createItem({ name: 'Thali', price: 100 });
    await createOrder({
        user,
        sessionId,
        status: 'ACCEPTED',
        audience: 'CUSTOMER',
        items: [{ itemId: item._id, name: 'Thali', quantity: 2, price: 100 }],
        totalAmount: 200,
    });
    const order = await Order.findOne({ sessionId });

    // First capture.
    const first = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const bill1Id = first.data._id;
    assert.equal((await OrderLock.find({ orderId: order._id, active: true })).length, 1, 'order is locked by bill 1');

    // Premature re-bill while OPEN.
    const prematureOpen = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(prematureOpen.status, 409, JSON.stringify(prematureOpen.data));
    assert.equal(prematureOpen.data.error, 'ALREADY_BILLED');
    assert.equal((await api(`/sessions/${sessionId}/bills`, 'GET')).data.length, 1);

    // A payment reversal alone does NOT release the order for re-billing.
    const pay = await api(`/bills/${bill1Id}/payments`, 'POST', { amount: 50, method: 'CASH', idempotencyKey: 'gap4-pay' });
    assert.equal(pay.status, 201, JSON.stringify(pay.data));
    const rev = await api(`/bills/${bill1Id}/payments/${pay.data.payments[0].paymentId}/reverse`, 'POST', {});
    assert.equal(rev.status, 200);
    const prematureAfterReversal = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(prematureAfterReversal.status, 409, 'reversal alone must not release orders');
    assert.equal(prematureAfterReversal.data.error, 'ALREADY_BILLED');
    assert.equal((await api(`/sessions/${sessionId}/bills`, 'GET')).data.length, 1);

    // Settle, then void - only now does the lock release.
    const settle = await api(`/bills/${bill1Id}/payments`, 'POST', { amount: 200, method: 'UPI', idempotencyKey: 'gap4-settle' });
    assert.equal(settle.status, 201, JSON.stringify(settle.data));
    assert.equal(settle.data.status, 'SETTLED');
    const prematureSettled = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(prematureSettled.status, 409, 'SETTLED bill still protects the order');
    assert.equal((await api(`/sessions/${sessionId}/bills`, 'GET')).data.length, 1);

    const voidRes = await api(`/bills/${bill1Id}/void`, 'POST', { reason: 'GAP-4 test' });
    assert.equal(voidRes.status, 200, JSON.stringify(voidRes.data));
    assert.equal(voidRes.data.status, 'VOID');
    assert.equal((await OrderLock.find({ orderId: order._id, active: true })).length, 0, 'locks released only on VOID');

    // Permitted re-bill after the full release condition.
    const again = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(again.status, 201, JSON.stringify(again.data));
    assert.notEqual(again.data._id, bill1Id);
    assert.equal((await api(`/sessions/${sessionId}/bills`, 'GET')).data.length, 2, 'bill 2 created after full void');

    // The new bill re-protects the order.
    const premature3 = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(premature3.status, 409);
    assert.equal(premature3.data.error, 'ALREADY_BILLED');
    assert.equal((await OrderLock.find({ orderId: order._id, active: true })).length, 1);
});

test('GAP-5 exact IST boundaries: date-only filters include only the intended day', async () => {
    // Fixed IST calendar day used throughout: 2026-10-11 (UTC 2026-10-10T18:30Z
    // to 2026-10-11T18:29:59.999Z). Bills are created directly with an explicit
    // createdAt so the exact boundary instants are under test.
    const isoT = (iso) => new Date(iso);
    const seed = [
        { billNumber: 'IST-A', at: '2026-10-10T18:29:59.999Z', paise: 1000 }, // just BEFORE start -> IST 10th
        { billNumber: 'IST-B', at: '2026-10-10T18:30:00.000Z', paise: 2000 }, // exactly AT start     -> IST 11th
        { billNumber: 'IST-C', at: '2026-10-11T06:00:00.000Z', paise: 3000 }, // mid-day             -> IST 11th
        { billNumber: 'IST-D', at: '2026-10-11T18:29:59.999Z', paise: 4000 }, // exactly AT end      -> IST 11th
        { billNumber: 'IST-E', at: '2026-10-11T18:30:00.000Z', paise: 5000 }, // just AFTER end      -> IST 12th
    ];

    const docs = seed.map((s) => ({
        billNumber: s.billNumber,
        sessionId: null,
        userId: null,
        origin: 'POS',
        audience: 'STAFF',
        status: 'OPEN',
        orders: [],
        lines: [],
        subtotalPaise: s.paise,
        discountPaise: 0,
        couponCode: '',
        totalPaise: s.paise,
        amountPaidPaise: 0,
        balanceDuePaise: s.paise,
        payments: [],
        createdAt: isoT(s.at),
        updatedAt: isoT(s.at),
    }));
    await Bill.collection.insertMany(docs);

    const filter = '?origin=POS&audience=STAFF';
    const day = async (fromTo) => {
        const res = await api(`/analytics${filter}&from=${fromTo[0]}&to=${fromTo[1]}`, 'GET');
        assert.equal(res.status, 200, JSON.stringify(res.data));
        return res.data;
    };

    // The 10th (UTC 09th 18:30Z .. 10th 18:29:59.999Z) holds only IST-A.
    const d10 = await day(['2026-10-10', '2026-10-10']);
    assert.equal(d10.totals.recognizedBills, 1);
    assert.equal(d10.totals.recognizedTotal, 10);

    // The 11th holds exactly IST-B, IST-C, IST-D - both boundary instants of the
    // 10th and the 12th are excluded, and the echoed range is the exact UTC span.
    const d11 = await day(['2026-10-11', '2026-10-11']);
    assert.equal(d11.totals.recognizedBills, 3);
    assert.equal(d11.totals.recognizedTotal, 90, '20 + 30 + 40 - the boundary instants counted once');
    assert.equal(d11.range.from, '2026-10-10T18:30:00.000Z');
    assert.equal(d11.range.to, '2026-10-11T18:29:59.999Z');

    // The 12th (UTC 11th 18:30Z .. 12th 18:29:59.999Z) holds only IST-E.
    const d12 = await day(['2026-10-12', '2026-10-12']);
    assert.equal(d12.totals.recognizedBills, 1);
    assert.equal(d12.totals.recognizedTotal, 50);
});