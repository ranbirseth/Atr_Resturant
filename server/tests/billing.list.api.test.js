'use strict';

// API tests for the read-only bill listing added for the Reviews & Analytics
// module (Phase 3): GET /api/billing/bills.
// Run with:  node --test tests/billing.list.api.test.js
//
// Connects to a DEDICATED local test database (never the app database) and
// drops it before/after. Override with BILLING_LIST_TEST_MONGO_URI.
//
// Coverage:
// - returns an array of PII-free DTOs sorted newest first
// - legacy bills (origin/audience absent) read back as SESSION / CUSTOMER and
//   survive the SESSION / CUSTOMER filters (buildBillAnalyticsMatch $in null)
// - origin / audience / status filters
// - exact IST date-only boundaries (date-only from/to resolve in Asia/Kolkata)

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.BILLING_LIST_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/gola_billing_list_test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../server');
const Bill = require('../models/Bill');

let server;
let base;

// SAFETY: refuse to run unless the target is the dedicated test database.
function assertTestDatabase() {
    const dbName = mongoose.connection.db ? mongoose.connection.db.databaseName : (mongoose.connection.name || '');
    if (!/gola_billing_list_test$/.test(dbName)) {
        throw new Error('Refusing to run billing list tests against non-test database: ' + dbName);
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

// IST is a fixed UTC+05:30. `ist(day, msIntoDay)` returns the UTC instant of
// `msIntoDay` milliseconds into the IST calendar day `day` of Oct 2026.
function ist(day, msIntoDay) {
    return Date.UTC(2026, 9, day) - (5 * 60 + 30) * 60 * 1000 + msIntoDay;
}

let seq = 0;

function billNumber(code) {
    seq += 1;
    return `${code}-${Date.now()}-${seq}`;
}

// Modern bill via the model (schema defaults apply). Status investments stay
// internally consistent (amountPaid + balanceDue = total).
async function seedBill(fields) {
    const totalPaise = Math.round((fields.total || 0) * 100);
    const paidPaise = fields.status === 'VOID' ? 0 : Math.round((fields.paid || 0) * 100);
    const doc = {
        billNumber: fields.billNumber || billNumber(fields.code),
        status: fields.status || 'OPEN',
        origin: fields.origin,
        audience: fields.audience,
        totalPaise,
        amountPaidPaise: paidPaise,
        balanceDuePaise: totalPaise - paidPaise,
        createdAt: fields.at,
    };
    if (fields.status === 'SETTLED') {
        doc.settledAt = fields.at;
    }
    if (fields.status === 'VOID') {
        doc.voidedAt = fields.at;
        doc.voidReason = 'cancelled';
    }
    return Bill.create(doc);
}

// Legacy bill: raw insert so origin/audience are GENUINELY absent (bypasses the
// schema defaults Mongoose would apply) - mirrors pre-P1.3 documents.
async function seedLegacyBill(fields) {
    const totalPaise = Math.round((fields.total || 0) * 100);
    return Bill.collection.insertOne({
        billNumber: fields.billNumber || billNumber(fields.code),
        sessionId: 'sess-legacy',
        status: fields.status || 'OPEN',
        totalPaise,
        amountPaidPaise: 0,
        balanceDuePaise: totalPaise,
        createdAt: fields.at,
    });
}

before(async () => {
    await waitForConnection();
    assertTestDatabase();
    await mongoose.connection.dropDatabase();
    await Bill.syncIndexes();
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    const port = server.address().port;
    base = `http://127.0.0.1:${port}/api/billing`;

    // Oct 9 2026 IST cluster (inside 1/7/30-day windows of "now" = Oct 9).
    await seedBill({ code: 'A', status: 'SETTLED', origin: 'POS', audience: 'STAFF', total: 120, paid: 120, at: new Date(ist(9, 10 * 3600 * 1000)) });
    await seedBill({ code: 'B', status: 'OPEN', origin: 'SESSION', audience: 'CUSTOMER', total: 80, paid: 50, at: new Date(ist(9, 11 * 3600 * 1000)) });
    await seedBill({ code: 'C', status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 200, paid: 200, at: new Date(ist(8, 23 * 3600 * 1000 + 30 * 60 * 1000)) });
    await seedLegacyBill({ code: 'D', status: 'OPEN', total: 60, at: new Date(ist(9, 12 * 3600 * 1000)) });
    await seedBill({ code: 'E', status: 'VOID', origin: 'POS', audience: 'CUSTOMER', total: 999, paid: 999, at: new Date(ist(9, 13 * 3600 * 1000)) });
    // Boundary probes for the date-only IST filter (GAP-5 semantics).
    await seedBill({ code: 'G', status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 10, paid: 10, at: new Date(ist(7, 24 * 3600 * 1000 - 1)) }); // Oct 7 23:59:59.999 IST
    await seedBill({ code: 'H', status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 20, paid: 20, at: new Date(ist(9, 24 * 3600 * 1000 - 1)) }); // Oct 9 23:59:59.999 IST
    await seedBill({ code: 'I', status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 30, paid: 30, at: new Date(ist(10, 0)) }); // Oct 10 00:00:00.000 IST
    // Far out of range (dropped from every Oct-window).
    await seedBill({ code: 'F', status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 9999, paid: 9999, at: new Date(Date.UTC(2026, 8, 1, 5, 0, 0)) });
});

after(async () => {
    await mongoose.connection.dropDatabase();
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
});

function codes(bills) {
    return (bills || []).map((b) => b.billNumber.split('-')[0]);
}

test('GET /bills returns all bills as PII-free DTOs sorted newest first', async () => {
    const res = await api('/bills', 'GET');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data), 'response must be an array');

    // Newest first by createdAt. I(Oct 10 00:00 IST) is newest, then H(E), D, A.
    const byCode = codes(res.data);
    assert.equal(byCode.length, 9);
    assert.equal(byCode[0], 'I');
    assert.equal(byCode[1], 'H');

    // DTO shape: rupees conversion + string ids.
    const dto = res.data.find((b) => b.billNumber.startsWith('A-'));
    assert.equal(typeof dto._id, 'string');
    assert.equal(dto.status, 'SETTLED');
    assert.equal(dto.origin, 'POS');
    assert.equal(dto.audience, 'STAFF');
    assert.equal(dto.totalAmount, 120);
    assert.equal(dto.amountPaid, 120);
    assert.equal(dto.balanceDue, 0);
    assert.equal(dto.orderCount, 0);
    assert.ok(Array.isArray(dto.orders));
    assert.ok(Array.isArray(dto.lines));
    assert.ok(Array.isArray(dto.payments));

    // Partial payment is exposed separately (amountPaid vs balanceDue).
    const b = res.data.find((x) => x.billNumber.startsWith('B-'));
    assert.equal(b.totalAmount, 80);
    assert.equal(b.amountPaid, 50);
    assert.equal(b.balanceDue, 30);
});

test('legacy bills (no origin/audience) read back as SESSION / CUSTOMER', async () => {
    const res = await api('/bills', 'GET');
    const legacy = res.data.find((b) => b.billNumber.startsWith('D-'));
    assert.ok(legacy, 'legacy bill must appear in the list');
    assert.equal(legacy.origin, 'SESSION');
    assert.equal(legacy.audience, 'CUSTOMER');
    assert.equal(legacy.totalAmount, 60);
    assert.equal(legacy.status, 'OPEN');
});

test('?origin filter: POS excludes legacy; SESSION includes it', async () => {
    const pos = await api('/bills?origin=POS', 'GET');
    assert.equal(codes(pos.data).sort().join(','), 'A,E');

    const sess = await api('/bills?origin=SESSION', 'GET');
    assert.ok(codes(sess.data).includes('D'), 'legacy bill must match the SESSION filter');
    assert.ok(!codes(sess.data).includes('A') && !codes(sess.data).includes('E'));
});

test('?audience filter: STAFF is exact, CUSTOMER includes legacy', async () => {
    const staff = await api('/bills?audience=STAFF', 'GET');
    assert.equal(codes(staff.data).sort().join(','), 'A');

    const cust = await api('/bills?audience=CUSTOMER', 'GET');
    const custCodes = codes(cust.data).sort();
    assert.deepEqual(custCodes, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], 'every CUSTOMER-or-legacy bill, but not STAFF A');
    assert.ok(custCodes.includes('D'), 'legacy bill must match the CUSTOMER filter');
    assert.ok(!custCodes.includes('A'));
});

test('?status filter returns only that bill status', async () => {
    const voided = await api('/bills?status=VOID', 'GET');
    assert.equal(codes(voided.data).sort().join(','), 'E');

    const open = await api('/bills?status=OPEN', 'GET');
    assert.deepEqual(codes(open.data).sort(), ['B', 'D']);
});

test('date-only from/to resolve as IST calendar days (GAP-5 boundaries)', async () => {
    // from=2026-10-08 -> 2026-10-08T00:00:00.000 IST; to=2026-10-09 ->
    // 2026-10-09T23:59:59.999 IST. G sits at Oct 7 23:59:59.999 IST (excluded),
    // I at Oct 10 00:00:00.000 IST (excluded), H at Oct 9 end (included).
    const res = await api('/bills?from=2026-10-08&to=2026-10-09', 'GET');
    assert.equal(res.status, 200);
    const found = codes(res.data).sort();
    assert.ok(found.includes('A') && found.includes('B') && found.includes('C') && found.includes('D') && found.includes('E') && found.includes('H'));
    assert.ok(!found.includes('G'), 'Oct 7 23:59:59.999 IST must be excluded');
    assert.ok(!found.includes('I'), 'Oct 10 00:00:00.000 IST must be excluded');
    assert.ok(!found.includes('F'));
});

test('invalid filters are rejected with 400 + a stable error code', async () => {
    const badRange = await api('/bills?from=not-a-date', 'GET');
    assert.equal(badRange.status, 400);
    assert.equal(badRange.data.error, 'INVALID_RANGE');

    const badOrigin = await api('/bills?origin=KITCHEN', 'GET');
    assert.equal(badOrigin.status, 400);
    assert.equal(badOrigin.data.error, 'INVALID_ORIGIN');

    const badAudience = await api('/bills?audience=GUEST', 'GET');
    assert.equal(badAudience.status, 400);
    assert.equal(badAudience.data.error, 'INVALID_AUDIENCE');

    const badStatus = await api('/bills?status=NOPE', 'GET');
    assert.equal(badStatus.status, 400);
    assert.equal(badStatus.data.error, 'INVALID_STATUS');

    const badOrder = await api('/bills?from=2026-10-09&to=2026-10-08', 'GET');
    assert.equal(badOrder.status, 400);
    assert.equal(badOrder.data.error, 'INVALID_RANGE');
});