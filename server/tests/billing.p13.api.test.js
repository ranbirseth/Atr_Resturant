'use strict';

// Integration tests for P1.3: independent billing (SESSION + POS), audience
// rules, coupon preservation, creation idempotency and bill-based analytics.
// Run with:  node --test tests/billing.p13.api.test.js
//
// Connects to a DEDICATED local test database (never the app database) and
// drops it before/after. Override with BILLING_TEST_MONGO_URI.

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.BILLING_P13_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/gola_billing_p13_test';

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
    if (!/gola_billing_p13_test$/.test(dbName)) {
        throw new Error('Refusing to run P1.3 tests against non-test database: ' + dbName);
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

test('session CUSTOMER bill is independently priced at current menu prices', async () => {
    const user = await createUser();
    const sessionId = `sess-p13-cust-${user._id}`;
    const item = await createItem({ name: 'Paneer', price: 40 });
    // Stored order price is deliberately wrong (999) to prove it is ignored.
    await createOrder({
        user,
        sessionId,
        status: 'ACCEPTED',
        audience: 'CUSTOMER',
        items: [{ itemId: item._id, name: 'Paneer', quantity: 2, price: 999 }],
        totalAmount: 1998,
    });

    const res = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.origin, 'SESSION');
    assert.equal(res.data.audience, 'CUSTOMER');
    assert.equal(res.data.subtotal, 80);
    assert.equal(res.data.discount, 0);
    assert.equal(res.data.totalAmount, 80, 'billed at current menu price, not stored order price');
    assert.equal(res.data.orders[0].originalTotal, 1998);
    assert.equal(res.data.orders[0].billedTotal, 80);
    assert.equal(res.data.orders[0].items[0].price, 40);
});

test('session STAFF bill prices at 60% and carries no coupon', async () => {
    const user = await createUser();
    const sessionId = `sess-p13-staff-${user._id}`;
    const item = await createItem({ name: 'Thali', price: 100 });
    await createOrder({
        user,
        sessionId,
        status: 'ACCEPTED',
        audience: 'STAFF',
        items: [{ itemId: item._id, name: 'Thali', quantity: 2, price: 100 }],
        totalAmount: 200,
        discountAmount: 50,
        couponCode: 'SHOULD-BE-IGNORED',
    });

    const res = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'STAFF' });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.audience, 'STAFF');
    assert.equal(res.data.subtotal, 120);
    assert.equal(res.data.discount, 0, 'staff bills carry no coupon');
    assert.equal(res.data.couponCode, '');
    assert.equal(res.data.totalAmount, 120);
});

test('session CUSTOMER bill preserves the source coupon discount (decision B)', async () => {
    const user = await createUser();
    const sessionId = `sess-p13-coupon-${user._id}`;
    const item = await createItem({ name: 'Combo', price: 100 });
    await createOrder({
        user,
        sessionId,
        status: 'ACCEPTED',
        audience: 'CUSTOMER',
        items: [{ itemId: item._id, name: 'Combo', quantity: 1, price: 100 }],
        totalAmount: 70,
        discountAmount: 30,
        couponCode: 'SAVE30',
    });

    const res = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.subtotal, 100);
    assert.equal(res.data.discount, 30);
    assert.equal(res.data.couponCode, 'SAVE30');
    assert.equal(res.data.totalAmount, 70, 'total = current subtotal - preserved discount');
});

test('preserved discount is clamped so the total never goes negative', async () => {
    const user = await createUser();
    const sessionId = `sess-p13-clamp-${user._id}`;
    const item = await createItem({ name: 'Tea', price: 40 });
    await createOrder({
        user,
        sessionId,
        status: 'ACCEPTED',
        audience: 'CUSTOMER',
        items: [{ itemId: item._id, name: 'Tea', quantity: 1, price: 40 }],
        totalAmount: 0,
        discountAmount: 500,
        couponCode: 'BIG',
    });
    const res = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.subtotal, 40);
    assert.equal(res.data.discount, 40, 'discount clamped to subtotal');
    assert.equal(res.data.totalAmount, 0);
});

test('mixed-audience sessions and audience mismatches are rejected', async () => {
    const user = await createUser();
    const item = await createItem({ name: 'Shared', price: 10 });

    const mixedSession = `sess-p13-mixed-${user._id}`;
    await createOrder({ user, sessionId: mixedSession, status: 'ACCEPTED', audience: 'CUSTOMER', items: [{ itemId: item._id, quantity: 1, price: 10 }], totalAmount: 10 });
    await createOrder({ user, sessionId: mixedSession, status: 'ACCEPTED', audience: 'STAFF', items: [{ itemId: item._id, quantity: 1, price: 10 }], totalAmount: 10 });
    const mixed = await api(`/sessions/${mixedSession}/bills`, 'POST', {});
    assert.equal(mixed.status, 400);
    assert.equal(mixed.data.error, 'MIXED_AUDIENCE');

    const matchSession = `sess-p13-mismatch-${user._id}`;
    await createOrder({ user, sessionId: matchSession, status: 'ACCEPTED', audience: 'CUSTOMER', items: [{ itemId: item._id, quantity: 1, price: 10 }], totalAmount: 10 });
    const mismatch = await api(`/sessions/${matchSession}/bills`, 'POST', { audience: 'STAFF' });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.data.error, 'AUDIENCE_MISMATCH');

    const invalid = await api(`/sessions/${matchSession}/bills`, 'POST', { audience: 'WHOLESALE' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.error, 'INVALID_AUDIENCE');
});

test('session bill creation is idempotent (same key+payload) and rejects reuse', async () => {
    const user = await createUser();
    const sessionId = `sess-p13-idem-${user._id}`;
    const item = await createItem({ name: 'Biryani', price: 60 });
    await createOrder({ user, sessionId, status: 'ACCEPTED', audience: 'CUSTOMER', items: [{ itemId: item._id, quantity: 1, price: 60 }], totalAmount: 60 });

    const first = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER', idempotencyKey: 'k-1' });
    assert.equal(first.status, 201, JSON.stringify(first.data));

    const replay = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'CUSTOMER', idempotencyKey: 'k-1' });
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.alreadyProcessed, true);
    assert.equal(replay.data.billNumber, first.data.billNumber);

    const bills = await api(`/sessions/${sessionId}/bills`, 'GET');
    assert.equal(bills.data.length, 1, 'replay must not create a duplicate bill');

    // Same key, different payload -> conflict.
    const reused = await api(`/sessions/${sessionId}/bills`, 'POST', { audience: 'STAFF', idempotencyKey: 'k-1' });
    assert.equal(reused.status, 409, JSON.stringify(reused.data));
    assert.equal(reused.data.error, 'IDEMPOTENCY_KEY_REUSED');
});

test('POS bill requires audience/items and is independently priced with no Order', async () => {
    const noAudience = await api('/pos/bills', 'POST', { items: [], idempotencyKey: 'p0' });
    assert.equal(noAudience.status, 400);
    assert.equal(noAudience.data.error, 'AUDIENCE_REQUIRED');

    const item = await createItem({ name: 'Late', price: 50 });
    const badItem = await api('/pos/bills', 'POST', { audience: 'CUSTOMER', items: [{ itemId: 'not-an-id', quantity: 1 }], idempotencyKey: 'p1' });
    assert.equal(badItem.status, 400);

    const noKey = await api('/pos/bills', 'POST', { audience: 'CUSTOMER', items: [{ itemId: String(item._id), quantity: 1 }] });
    assert.equal(noKey.status, 400);
    assert.equal(noKey.data.error, 'IDEMPOTENCY_KEY_REQUIRED');

    const billCountBefore = await Bill.countDocuments({ origin: 'POS' });
    const created = await api('/pos/bills', 'POST', {
        audience: 'CUSTOMER',
        items: [{ itemId: String(item._id), quantity: 2 }],
        idempotencyKey: 'p2',
        createdBy: 'counter-1',
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.origin, 'POS');
    assert.equal(created.data.audience, 'CUSTOMER');
    assert.equal(created.data.totalAmount, 100);
    assert.equal(created.data.orderCount, 0, 'POS bills do not fabricate orders');
    assert.equal(created.data.sessionId, null);
    assert.equal(created.data.createdBy, 'counter-1');

    // Idempotent replay with the same payload.
    const replay = await api('/pos/bills', 'POST', {
        audience: 'CUSTOMER',
        items: [{ itemId: String(item._id), quantity: 2 }],
        idempotencyKey: 'p2',
        createdBy: 'counter-1',
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.alreadyProcessed, true);
    assert.equal(replay.data.billNumber, created.data.billNumber);

    // Reused key with a different payload -> conflict.
    const reused = await api('/pos/bills', 'POST', {
        audience: 'CUSTOMER',
        items: [{ itemId: String(item._id), quantity: 3 }],
        idempotencyKey: 'p2',
    });
    assert.equal(reused.status, 409, JSON.stringify(reused.data));
    assert.equal(reused.data.error, 'IDEMPOTENCY_KEY_REUSED');

    assert.equal(await Bill.countDocuments({ origin: 'POS' }), billCountBefore + 1, 'exactly one POS bill persisted');
});

test('POS STAFF pricing and eligibility are enforced server-side', async () => {
    const item = await createItem({ name: 'StaffOnly', price: 100, availableForStaff: false });
    const hidden = await createItem({ name: 'Hidden', price: 100 });

    const unavailable = await api('/pos/bills', 'POST', {
        audience: 'STAFF',
        items: [{ itemId: String(item._id), quantity: 1 }],
        idempotencyKey: 'staff-unavail',
    });
    assert.equal(unavailable.status, 400, JSON.stringify(unavailable.data));

    const staffItem = await createItem({ name: 'StaffOK', price: 100 });
    const ok = await api('/pos/bills', 'POST', {
        audience: 'STAFF',
        items: [{ itemId: String(staffItem._id), quantity: 1 }],
        idempotencyKey: 'staff-ok',
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.totalAmount, 60, '60% staff price');

    // Item hidden from staff via category.
    await Category.create({ name: 'Secret', staffVisible: false });
    const secret = await createItem({ name: 'Secret Dish', price: 80, category: 'Secret' });
    const hiddenRes = await api('/pos/bills', 'POST', {
        audience: 'STAFF',
        items: [{ itemId: String(secret._id), quantity: 1 }],
        idempotencyKey: 'staff-hidden',
    });
    assert.equal(hiddenRes.status, 400, JSON.stringify(hiddenRes.data));

    // Sanity: an unrelated item is untouched.
    assert.ok(hidden);
});

test('bill-based analytics recognizes OPEN/SETTLED, separates voids and groups by audience/origin', async () => {
    const user = await createUser();
    const custItem = await createItem({ name: 'AnalyticsCust', price: 100 });
    const staffItem = await createItem({ name: 'AnalyticsStaff', price: 200 });

    // 1) OPEN customer session bill of 100.
    const sessOpen = `sess-an-open-${user._id}`;
    await createOrder({ user, sessionId: sessOpen, status: 'ACCEPTED', audience: 'CUSTOMER', items: [{ itemId: custItem._id, quantity: 1, price: 100 }], totalAmount: 100 });
    const open = await api(`/sessions/${sessOpen}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(open.status, 201, JSON.stringify(open.data));

    // 2) SETTLED customer session bill of 100.
    const sessSettle = `sess-an-settle-${user._id}`;
    await createOrder({ user, sessionId: sessSettle, status: 'ACCEPTED', audience: 'CUSTOMER', items: [{ itemId: custItem._id, quantity: 1, price: 100 }], totalAmount: 100 });
    const settleBill = await api(`/sessions/${sessSettle}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(settleBill.status, 201);
    const pay = await api(`/bills/${settleBill.data._id}/payments`, 'POST', { amount: 100, method: 'CASH', idempotencyKey: 'an-settle-pay' });
    assert.equal(pay.status, 201, JSON.stringify(pay.data));

    // 3) POS staff bill of 120 (60% of 200).
    const pos = await api('/pos/bills', 'POST', { audience: 'STAFF', items: [{ itemId: String(staffItem._id), quantity: 1 }], idempotencyKey: 'an-pos' });
    assert.equal(pos.status, 201, JSON.stringify(pos.data));
    assert.equal(pos.data.totalAmount, 120);

    // 4) A voided customer bill that must NOT be recognized as revenue.
    const sessVoid = `sess-an-void-${user._id}`;
    await createOrder({ user, sessionId: sessVoid, status: 'ACCEPTED', audience: 'CUSTOMER', items: [{ itemId: custItem._id, quantity: 1, price: 100 }], totalAmount: 100 });
    const voided = await api(`/sessions/${sessVoid}/bills`, 'POST', { audience: 'CUSTOMER' });
    assert.equal(voided.status, 201);
    const voidRes = await api(`/bills/${voided.data._id}/void`, 'POST', { reason: 'test analytics' });
    assert.equal(voidRes.status, 200, JSON.stringify(voidRes.data));

    const res = await api('/analytics', 'GET');
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const totals = res.data.totals;
    assert.ok(totals.recognizedBills >= 3, 'OPEN + SETTLED recognized');
    assert.ok(totals.voidedBills >= 1);
    assert.ok(totals.recognizedTotal >= 320, 'recognized revenue includes OPEN + SETTLED');
    assert.equal(totals.recognizedTotal, Math.round(totals.recognizedTotal * 100) / 100);
    assert.ok(totals.amountPaid >= 100);
    assert.ok(totals.voidedTotal >= 100, 'voided amount is reported separately');

    const customer = res.data.byAudience.find((x) => x.audience === 'CUSTOMER');
    const staff = res.data.byAudience.find((x) => x.audience === 'STAFF');
    assert.ok(customer && customer.recognized >= 2);
    assert.ok(staff && staff.recognized >= 1);

    const session = res.data.byOrigin.find((x) => x.origin === 'SESSION');
    const posOrigin = res.data.byOrigin.find((x) => x.origin === 'POS');
    assert.ok(session && session.recognized >= 2);
    assert.ok(posOrigin && posOrigin.recognized >= 1);

    // Filters + validation.
    const onlyPos = await api('/analytics?origin=POS', 'GET');
    assert.equal(onlyPos.status, 200);
    assert.ok(onlyPos.data.byOrigin.every((x) => x.origin === 'POS'));

    const badOrigin = await api('/analytics?origin=ONLINE', 'GET');
    assert.equal(badOrigin.status, 400);
    assert.equal(badOrigin.data.error, 'INVALID_ORIGIN');

    const badAudience = await api('/analytics?audience=WHOLESALE', 'GET');
    assert.equal(badAudience.status, 400);
    assert.equal(badAudience.data.error, 'INVALID_AUDIENCE');

    // IST date-only range that includes today must include the new bills.
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const y = nowIst.getUTCFullYear();
    const m = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(nowIst.getUTCDate()).padStart(2, '0');
    const todayIst = `${y}-${m}-${d}`;
    const ranged = await api(`/analytics?from=${todayIst}&to=${todayIst}`, 'GET');
    assert.equal(ranged.status, 200, JSON.stringify(ranged.data));
    assert.ok(ranged.data.totals.recognizedBills >= 3, 'IST today range includes the bills just created');
});
