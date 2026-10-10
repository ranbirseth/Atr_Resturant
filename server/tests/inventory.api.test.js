'use strict';

// Integration tests for the Inventory + Stock API. Run with:
//   node --test tests/inventory.api.test.js
//
// They connect to a DEDICATED local test database (never the app database) and
// drop it before and after the run. Override the target with
// INVENTORY_TEST_MONGO_URI if needed.

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.INVENTORY_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/gola_inventory_test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../server');

let server;
let base;

async function waitForConnection() {
    if (mongoose.connection.readyState === 1) return;
    await new Promise((resolve, reject) => {
        mongoose.connection.once('open', resolve);
        mongoose.connection.once('error', reject);
    });
}

async function api(method, path, body) {
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
    return { status: response.status, data };
}

async function createItem(payload) {
    const res = await api('POST', '/ingredients', {
        name: payload.name,
        unit: payload.unit || 'kg',
        minimumStockLevel: payload.minimumStockLevel ?? 0,
        expectedDemand: payload.expectedDemand ?? 0,
        openingQty: payload.openingQty ?? 0,
        purchasePrice: payload.purchasePrice,
        openingUnitCost: payload.openingUnitCost,
        openingNote: payload.openingNote,
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data;
}

before(async () => {
    await waitForConnection();
    await mongoose.connection.dropDatabase();
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/api/inventory`;
});

after(async () => {
    await mongoose.connection.dropDatabase();
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
});

test('GET /units returns the fixed unit catalog', async () => {
    const res = await api('GET', '/units');
    assert.equal(res.status, 200);
    const names = res.data.map((u) => u.name);
    for (const unit of ['kg', 'g', 'litre', 'ml', 'pieces', 'packets']) {
        assert.ok(names.includes(unit), `missing ${unit}`);
    }
});

test('POST /ingredients validates required fields, units and duplicates', async () => {
    assert.equal((await api('POST', '/ingredients', { unit: 'kg', minimumStockLevel: 1 })).status, 400);
    assert.equal((await api('POST', '/ingredients', { name: 'Bad Unit', unit: 'tonnes', minimumStockLevel: 1 })).status, 400);
    assert.equal((await api('POST', '/ingredients', { name: 'Neg', unit: 'kg', minimumStockLevel: -2 })).status, 400);

    const first = await api('POST', '/ingredients', { name: 'Basmati Rice', unit: 'kg', minimumStockLevel: 5 });
    assert.equal(first.status, 201);

    const duplicate = await api('POST', '/ingredients', { name: '  basmati   RICE ', unit: 'kg', minimumStockLevel: 5 });
    assert.equal(duplicate.status, 400);
});

test('opening quantity seeds balance, an OPENING movement and an open cycle', async () => {
    const item = await createItem({ name: 'Onion', unit: 'kg', minimumStockLevel: 5, openingQty: 10 });
    assert.equal(item.currentQty, 10);
    assert.equal(item.usagePercent, 0);
    assert.equal(item.available, true);

    const movements = await api('GET', `/stock/movements?ingredientId=${item._id}`);
    assert.equal(movements.status, 200);
    assert.equal(movements.data.length, 1);
    assert.equal(movements.data[0].type, 'OPENING');
    assert.equal(movements.data[0].quantityDelta, 10);

    const cycles = await api('GET', `/stock/cycles?ingredientId=${item._id}`);
    assert.equal(cycles.data.length, 1);
    assert.equal(cycles.data[0].status, 'OPEN');
    assert.equal(cycles.data[0].baselineQty, 10);
});

test('consumption reduces balance and records a CONSUMPTION movement', async () => {
    const item = await createItem({ name: 'Tomato', unit: 'kg', minimumStockLevel: 2, openingQty: 20 });
    const res = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'CONSUMPTION',
        quantity: 8,
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.ingredient.currentQty, 12);
    assert.equal(res.data.movement.quantityDelta, -8);
    assert.equal(res.data.ingredient.usagePercent, 40);
});

test('consumption beyond available returns 409 and does not change balance', async () => {
    const item = await createItem({ name: 'Butter', unit: 'kg', minimumStockLevel: 1, openingQty: 3 });
    const res = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'CONSUMPTION',
        quantity: 5,
    });
    assert.equal(res.status, 409);
    assert.equal(res.data.error, 'INSUFFICIENT_STOCK');
    assert.equal(res.data.availableQty, 3);

    const after = await api('GET', `/ingredients/${item._id}`);
    assert.equal(after.data.currentQty, 3);

    const movements = await api('GET', `/stock/movements?ingredientId=${item._id}&type=CONSUMPTION`);
    assert.equal(movements.data.length, 0);
});

test('restock closes the current cycle and starts a new accumulated cycle', async () => {
    const item = await createItem({ name: 'Milk', unit: 'litre', minimumStockLevel: 4, openingQty: 10 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'CONSUMPTION', quantity: 6 });

    const restock = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'RESTOCK',
        quantity: 15,
    });
    assert.equal(restock.status, 201, JSON.stringify(restock.data));
    // 4 remaining + 15 restocked = 19 baseline, usage resets to 0.
    assert.equal(restock.data.ingredient.currentQty, 19);
    assert.equal(restock.data.cycle.baselineQty, 19);
    assert.equal(restock.data.cycle.carriedOverQty, 4);
    assert.equal(restock.data.ingredient.usagePercent, 0);

    const cycles = await api('GET', `/stock/cycles?ingredientId=${item._id}`);
    const closed = cycles.data.find((c) => c.status === 'CLOSED');
    assert.ok(closed, 'previous cycle should be closed');
    assert.equal(closed.finalUsagePercent, 60);
});

test('purchase states: NEEDED -> ORDERED, direct COMPLETED rejected, restock completes', async () => {
    const item = await createItem({ name: 'Paneer', unit: 'kg', minimumStockLevel: 1, expectedDemand: 5, openingQty: 1 });
    assert.equal(item.needToBuy, false);

    const needed = await api('POST', `/ingredients/${item._id}/purchase-status`, { status: 'NEEDED' });
    assert.equal(needed.status, 200);
    assert.equal(needed.data.needToBuy, true);

    const ordered = await api('POST', `/ingredients/${item._id}/purchase-status`, { status: 'ORDERED' });
    assert.equal(ordered.status, 200);
    assert.equal(ordered.data.purchaseStatus, 'ORDERED');

    const directComplete = await api('POST', `/ingredients/${item._id}/purchase-status`, { status: 'COMPLETED' });
    assert.equal(directComplete.status, 400);

    const restock = await api('POST', '/stock/movements', { ingredientId: item._id, type: 'RESTOCK', quantity: 10 });
    assert.equal(restock.status, 201, JSON.stringify(restock.data));
    assert.equal(restock.data.ingredient.purchaseStatus, 'COMPLETED');
    assert.equal(restock.data.ingredient.needToBuy, false);
});

test('idempotencyKey applies a movement exactly once', async () => {
    const item = await createItem({ name: 'Sugar', unit: 'kg', minimumStockLevel: 1, openingQty: 10 });
    const key = `test-idem-${Date.now()}`;

    const first = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'CONSUMPTION',
        quantity: 3,
        idempotencyKey: key,
    });
    assert.equal(first.status, 201);

    const replay = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'CONSUMPTION',
        quantity: 3,
        idempotencyKey: key,
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.alreadyProcessed, true);

    const after = await api('GET', `/ingredients/${item._id}`);
    assert.equal(after.data.currentQty, 7);

    const movements = await api('GET', `/stock/movements?ingredientId=${item._id}&type=CONSUMPTION`);
    assert.equal(movements.data.length, 1);
});

test('concurrent consumption never drives stock negative', async () => {
    const item = await createItem({ name: 'Concurrent Oil', unit: 'litre', minimumStockLevel: 0, openingQty: 10 });

    const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
            api('POST', '/stock/movements', {
                ingredientId: item._id,
                type: 'CONSUMPTION',
                quantity: 1,
                idempotencyKey: `conc-${item._id}-${i}`,
            }),
        ),
    );

    const successes = results.filter((r) => r.status === 201).length;
    const conflicts = results.filter((r) => r.status === 409).length;
    assert.equal(successes, 10, 'exactly the available units should be consumed');
    assert.equal(conflicts, 10);

    const after = await api('GET', `/ingredients/${item._id}`);
    assert.ok(after.data.currentQty >= 0);
    assert.equal(after.data.currentQty, 0);
});

test('unit mismatch is rejected and movements cannot be edited or deleted', async () => {
    const item = await createItem({ name: 'Unit Guard', unit: 'kg', minimumStockLevel: 0, openingQty: 5 });
    const mismatch = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'CONSUMPTION',
        quantity: 1,
        unit: 'litre',
    });
    assert.equal(mismatch.status, 400);

    const movements = await api('GET', `/stock/movements?ingredientId=${item._id}`);
    const movementId = movements.data[0]._id;
    const put = await api('PUT', `/stock/movements/${movementId}`, { quantityDelta: 999 });
    const del = await api('DELETE', `/stock/movements/${movementId}`);
    assert.ok(put.status === 404 || put.status === 405);
    assert.ok(del.status === 404 || del.status === 405);
});

test('reconcile reports zero drift after a movement sequence', async () => {
    const item = await createItem({ name: 'Reconcile', unit: 'kg', minimumStockLevel: 0, openingQty: 30 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'CONSUMPTION', quantity: 5 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'RESTOCK', quantity: 10 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'ADJUSTMENT', quantityDelta: -2 });

    const res = await api('POST', '/stock/reconcile', {});
    assert.equal(res.status, 200);
    const mine = res.data.mismatches.filter((m) => String(m.ingredientId) === String(item._id));
    assert.equal(mine.length, 0, JSON.stringify(mine));
});

test('stock list filters by stock status', async () => {
    const name = `Filter Check ${Date.now()}`;
    await createItem({ name, unit: 'kg', minimumStockLevel: 5, openingQty: 0 });

    const out = await api('GET', `/stock?filter=out&query=${encodeURIComponent(name)}`);
    assert.equal(out.status, 200);
    assert.ok(out.data.some((row) => row.name === name && row.outOfStock === true));

    const low = await api('GET', `/stock?filter=low&query=${encodeURIComponent(name)}`);
    assert.equal(low.data.length, 0);
});

test('purchase price and opening cost/note are captured and persisted', async () => {
    const item = await createItem({
        name: `Costed ${Date.now()}`,
        unit: 'kg',
        minimumStockLevel: 1,
        openingQty: 4,
        purchasePrice: 120,
        openingUnitCost: 110,
        openingNote: '  first delivery  ',
    });
    assert.equal(item.purchasePrice, 120);

    const opening = await api('GET', `/stock/movements?ingredientId=${item._id}&type=OPENING`);
    assert.equal(opening.data.length, 1);
    assert.equal(opening.data[0].unitCost, 110);
    assert.equal(opening.data[0].note, 'first delivery');

    const restock = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'RESTOCK',
        quantity: 6,
        unitCost: 130,
        note: 'second delivery',
    });
    assert.equal(restock.status, 201, JSON.stringify(restock.data));
    assert.equal(restock.data.movement.unitCost, 130);
    assert.equal(restock.data.movement.note, 'second delivery');

    const movements = await api('GET', `/stock/movements?ingredientId=${item._id}&type=RESTOCK`);
    assert.equal(movements.data.length, 1);
    assert.equal(movements.data[0].unitCost, 130);

    const bad = await api('POST', '/stock/movements', {
        ingredientId: item._id,
        type: 'RESTOCK',
        quantity: 1,
        unitCost: -3,
    });
    assert.equal(bad.status, 400);
});

test('75%-used cycle raises usageAlert and remainingPercent', async () => {
    const item = await createItem({ name: `Alert ${Date.now()}`, unit: 'kg', minimumStockLevel: 0, openingQty: 10 });
    assert.equal(item.usageAlert, false);
    assert.equal(item.remainingPercent, 100);

    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'CONSUMPTION', quantity: 2 });
    const at20 = await api('GET', `/ingredients/${item._id}`);
    assert.equal(at20.data.usagePercent, 20);
    assert.equal(at20.data.remainingPercent, 80);
    assert.equal(at20.data.usageAlert, false);

    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'CONSUMPTION', quantity: 6 });
    const at80 = await api('GET', `/ingredients/${item._id}`);
    assert.equal(at80.data.usagePercent, 80);
    assert.equal(at80.data.remainingPercent, 20);
    assert.equal(at80.data.usageAlert, true);

    // Restock resets the cycle usage (carry-over included) -> alert clears.
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'RESTOCK', quantity: 5 });
    const afterRestock = await api('GET', `/ingredients/${item._id}`);
    assert.equal(afterRestock.data.usageAlert, false);

    const alerts = await api('GET', '/alerts');
    assert.equal(alerts.status, 200);
    assert.ok(Array.isArray(alerts.data));
});

test('concurrent duplicate RESTOCK with one key never corrupts cycles or balance', async () => {
    const item = await createItem({ name: `DupRestock ${Date.now()}`, unit: 'kg', minimumStockLevel: 0, openingQty: 10 });
    const key = `dup-restock-${item._id}`;

    const [a, b] = await Promise.all([
        api('POST', '/stock/movements', { ingredientId: item._id, type: 'RESTOCK', quantity: 5, idempotencyKey: key }),
        api('POST', '/stock/movements', { ingredientId: item._id, type: 'RESTOCK', quantity: 5, idempotencyKey: key }),
    ]);

    const created = [a, b].filter((r) => r.status === 201);
    const other = [a, b].find((r) => r.status !== 201);
    assert.equal(created.length, 1, `exactly one request creates the movement (${a.status}/${b.status})`);
    // The duplicate is either acknowledged (200 alreadyProcessed) or rejected as
    // still-in-progress (409) — never silently double-applied.
    assert.ok([200, 409].includes(other.status), `duplicate returned ${other.status}`);

    const after = await api('GET', `/ingredients/${item._id}`);
    assert.equal(after.data.currentQty, 15, 'balance incremented exactly once');
    assert.equal(after.data.purchaseStatus, 'NONE', 'no spurious COMPLETED status');

    const restocks = await api('GET', `/stock/movements?ingredientId=${item._id}&type=RESTOCK`);
    assert.equal(restocks.data.length, 1, 'exactly one RESTOCK movement persists');

    const cycles = await api('GET', `/stock/cycles?ingredientId=${item._id}`);
    const open = cycles.data.filter((c) => c.status === 'OPEN');
    const closed = cycles.data.filter((c) => c.status === 'CLOSED');
    assert.equal(open.length, 1, 'exactly one open cycle remains');
    assert.equal(closed.length, 1, 'the opening cycle is closed exactly once');
    assert.equal(open[0].baselineQty, 15);

    const recon = await api('POST', '/stock/reconcile', {});
    const mine = recon.data.mismatches.filter((m) => String(m.ingredientId) === String(item._id));
    assert.equal(mine.length, 0, JSON.stringify(mine));
});

test('analytics aggregates the ledger and suggests purchases', async () => {
    const name = `Analytics ${Date.now()}`;
    const item = await createItem({ name, unit: 'kg', minimumStockLevel: 5, expectedDemand: 8, openingQty: 10 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'CONSUMPTION', quantity: 4 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'RESTOCK', quantity: 5 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'ADJUSTMENT', quantityDelta: -1 });

    const res = await api('GET', '/analytics');
    assert.equal(res.status, 200);

    const row = res.data.items.find((i) => String(i.ingredientId) === String(item._id));
    assert.ok(row, 'item present in analytics');
    assert.equal(row.currentQty, 10);
    assert.equal(row.additions, 15);
    assert.equal(row.consumption, 4);
    assert.equal(row.adjustment, -1);
    assert.equal(row.netChange, 10);
    assert.equal(row.suggestedQty, 3);
    assert.ok(res.data.purchaseSuggestions.some((s) => String(s.ingredientId) === String(item._id)));

    const future = await api('GET', '/analytics?from=2099-01-01&to=2099-12-31');
    assert.equal(future.data.totals.additions, 0);
    assert.equal(future.data.totals.consumption, 0);
    assert.equal(future.data.totals.movementCount, 0);

    const bad = await api('GET', '/analytics?from=not-a-date');
    assert.equal(bad.status, 400);
});

test('alerts endpoint lists items with usage/low/out/need-to-buy flags', async () => {
    const name = `AlertList ${Date.now()}`;
    const item = await createItem({ name, unit: 'kg', minimumStockLevel: 0, openingQty: 10 });
    await api('POST', '/stock/movements', { ingredientId: item._id, type: 'CONSUMPTION', quantity: 8 });

    const res = await api('GET', '/alerts');
    assert.equal(res.status, 200);
    const row = res.data.find((r) => r.name === name);
    assert.ok(row, 'flagged item appears in alerts');
    assert.equal(row.usageAlert, true);
});

