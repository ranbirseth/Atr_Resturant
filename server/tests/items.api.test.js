'use strict';

// Integration tests for P1.1 automatic staff pricing (60% of customer price).
// Run with:   node --test tests/items.api.test.js
//
// They connect to a DEDICATED local test database (never the app database) and
// drop it before and after the run. Override the target with
// ITEMS_TEST_MONGO_URI if needed.

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.ITEMS_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/gola_items_test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../server');
const Item = require('../models/Item');
const Category = require('../models/Category');

// Mirror of the server formula (menuUtils.computeStaffPrice) used only to
// compute expected values inside the test.
function expectedStaffPrice(price) {
    return Math.round(price * 0.6 * 100) / 100;
}

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
    if (response.status >= 500) {
        console.error('SERVER ERROR:', method, path, data);
    }
    return { status: response.status, data };
}

async function createCategory(name) {
    return Category.create({ name });
}

before(async () => {
    await waitForConnection();
    await mongoose.connection.dropDatabase();
    await Promise.all([Item.syncIndexes(), Category.syncIndexes()]);
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    const port = server.address().port;
    base = `http://127.0.0.1:${port}/api/items`;
    await createCategory('Starters');
    await createCategory('Beverages');
});

after(async () => {
    await mongoose.connection.dropDatabase();
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
});

test('POST /api/items succeeds without staffPrice and stores none', async () => {
    const res = await api('POST', '/', {
        name: 'Pure Veg Platter',
        category: 'Starters',
        price: 199,
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.price, 199);
    assert.equal(res.data.staffPrice, undefined);
    const stored = await Item.findOne({ name: 'Pure Veg Platter' }).lean();
    assert.equal(stored.price, 199);
    assert.equal(stored.staffPrice, undefined);
});

test('POST /api/items ignores a client-supplied staffPrice', async () => {
    const res = await api('POST', '/', {
        name: 'Hacked Masala',
        category: 'Starters',
        price: 250,
        staffPrice: 1,
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    const stored = await Item.findOne({ name: 'Hacked Masala' }).lean();
    assert.equal(stored.price, 250);
    assert.equal(stored.staffPrice, undefined);
});

test('customer listing keeps customer pricing and never exposes staff fields', async () => {
    await api('POST', '/', { name: 'Chai', category: 'Beverages', price: 99.99 });
    const res = await api('GET', '/');
    assert.equal(res.status, 200);
    const chai = res.data.find((item) => item.name === 'Chai');
    assert.ok(chai, 'Chai should be present for customers');
    assert.equal(chai.price, 99.99);
    assert.equal(chai.staffPrice, undefined);
    assert.equal(chai.availableForStaff, undefined);
});

test('staff listing exposes the derived 60% staff price', async () => {
    await api('POST', '/', { name: 'Burger X', category: 'Starters', price: 100 });
    await api('POST', '/', { name: 'Pasta Y', category: 'Starters', price: 99 });
    const res = await api('GET', '/?audience=staff');
    assert.equal(res.status, 200);
    const byName = {};
    res.data.forEach((item) => { byName[item.name] = item; });
    assert.equal(byName['Burger X'].staffPrice, 60);
    assert.equal(byName['Pasta Y'].staffPrice, 59.4);
    res.data.forEach((item) => {
        assert.equal(item.staffPrice, expectedStaffPrice(item.price), `staffPrice for ${item.name}`);
    });
});

test('legacy documents with a stored staffPrice stay readable and use the derived value', async () => {
    const legacy = await Item.create({
        name: 'Legacy Dish',
        category: 'Starters',
        price: 200,
        staffPrice: 150,
        availableForStaff: true,
    });
    const customer = await api('GET', '/');
    assert.equal(customer.status, 200);
    assert.ok(customer.data.some((item) => item.name === 'Legacy Dish'));

    const staff = await api('GET', '/?audience=staff');
    assert.equal(staff.status, 200);
    const row = staff.data.find((item) => item.name === 'Legacy Dish');
    assert.equal(row.staffPrice, 120, 'derived value wins over legacy 150');

    // Updating an unrelated field must preserve the stored legacy staffPrice.
    const put = await api('PUT', `/${legacy._id}`, { description: 'updated' });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const reloaded = await Item.findById(legacy._id).lean();
    assert.equal(reloaded.staffPrice, 150, 'legacy field preserved in the database');
    assert.equal(reloaded.description, 'updated');
});

test('staff listing retains staff availability fields', async () => {
    await Item.create({
        name: 'Staff Only Snack',
        category: 'Starters',
        price: 50,
        available: false,
        availableForStaff: true,
    });
    const res = await api('GET', '/?audience=staff');
    const row = res.data.find((item) => item.name === 'Staff Only Snack');
    assert.equal(row.availableForStaff, true);
    assert.equal(row.available, false);
    assert.equal(row.staffPrice, 30);
});