'use strict';

// Pure unit tests for menu/pricing validation helpers.
// Run with: node --test server/utils/menuUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validateItemInput,
    validateCategoryInput,
    buildAuthoritativeOrder,
    normalizeAudience,
    normalizeCategoryName,
    categoryKey,
    toFinitePrice,
    isValidQuantity,
    isValidPrice,
} = require('./menuUtils');

function dbItem(overrides) {
    return Object.assign(
        {
            _id: '507f1f77bcf86cd799439011',
            name: 'Paneer Tikka',
            category: 'Starters',
            price: 200,
            staffPrice: 150,
            available: true,
            availableForStaff: true,
        },
        overrides
    );
}

test('validateItemInput requires name, category, price and staffPrice on create', () => {
    const { errors, value } = validateItemInput({}, { partial: false });
    assert.ok(errors.length >= 4);
    assert.equal(value.price, undefined);
    assert.equal(value.staffPrice, undefined);
});

test('validateItemInput rejects a missing staff price on create (no silent fallback)', () => {
    const { errors, value } = validateItemInput(
        { name: 'Tea', category: 'Beverages', price: 20 },
        { partial: false }
    );
    assert.ok(errors.some((message) => /staff price/i.test(message)));
    assert.equal(value.staffPrice, undefined);
});

test('validateItemInput accepts zero prices', () => {
    const { errors, value } = validateItemInput(
        { name: 'Water', category: 'Beverages', price: 0, staffPrice: 0 },
        { partial: false }
    );
    assert.deepEqual(errors, []);
    assert.equal(value.price, 0);
    assert.equal(value.staffPrice, 0);
});

test('validateItemInput rejects negative, NaN, infinite and malformed prices', () => {
    const base = { name: 'X', category: 'Y' };
    assert.ok(validateItemInput({ ...base, price: -1, staffPrice: 1 }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: 1, staffPrice: -5 }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: 'abc', staffPrice: 1 }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: Infinity, staffPrice: 1 }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: 1, staffPrice: NaN }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: {}, staffPrice: 1 }, { partial: false }).errors.length > 0);
});

test('validateItemInput partial update validates only supplied fields', () => {
    const { errors, value } = validateItemInput({ available: 'false' }, { partial: true });
    assert.deepEqual(errors, []);
    assert.equal(value.available, false);
    assert.equal(value.price, undefined);
    assert.equal(value.staffPrice, undefined);
});

test('validateItemInput coerces boolean strings from multipart forms', () => {
    const { errors, value } = validateItemInput({ isVeg: 'true', availableForStaff: 'false' }, { partial: true });
    assert.deepEqual(errors, []);
    assert.equal(value.isVeg, true);
    assert.equal(value.availableForStaff, false);
});

test('validateCategoryInput requires a name and validates booleans', () => {
    assert.ok(validateCategoryInput({}, { partial: false }).errors.length > 0);
    const { errors, value } = validateCategoryInput(
        { name: '  Main   Course ', customerVisible: 'false', staffVisible: true },
        { partial: false }
    );
    assert.deepEqual(errors, []);
    assert.equal(value.name, 'Main Course');
    assert.equal(value.customerVisible, false);
    assert.equal(value.staffVisible, true);
});

test('normalize helpers handle audience and category names', () => {
    assert.equal(normalizeAudience('staff'), 'STAFF');
    assert.equal(normalizeAudience(' STAFF '), 'STAFF');
    assert.equal(normalizeAudience('customer'), 'CUSTOMER');
    assert.equal(normalizeAudience(undefined), 'CUSTOMER');
    assert.equal(normalizeAudience('random'), 'CUSTOMER');
    assert.equal(normalizeCategoryName('  Main   Course  '), 'Main Course');
    assert.equal(categoryKey(' MAIN course '), 'main course');
});

test('price and quantity helpers reject bad input', () => {
    assert.equal(toFinitePrice('99'), 99);
    assert.equal(toFinitePrice(-1), null);
    assert.equal(toFinitePrice(Infinity), null);
    assert.equal(isValidPrice(0), true);
    assert.equal(isValidPrice(''), false);
    assert.equal(isValidQuantity(1), true);
    assert.equal(isValidQuantity(0), false);
    assert.equal(isValidQuantity(1.5), false);
    assert.equal(isValidQuantity(1000), false);
    assert.equal(isValidQuantity(999), true);
});

test('buildAuthoritativeOrder uses the customer price for CUSTOMER orders', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 2 }],
        dbItems: [dbItem()],
        audience: 'CUSTOMER',
    });
    assert.equal(result.ok, true);
    assert.equal(result.lines[0].price, 200);
    assert.equal(result.subtotal, 400);
    assert.equal(result.audience, 'CUSTOMER');
});

test('buildAuthoritativeOrder uses the staff price for STAFF orders', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 3 }],
        dbItems: [dbItem()],
        audience: 'STAFF',
    });
    assert.equal(result.ok, true);
    assert.equal(result.lines[0].price, 150);
    assert.equal(result.subtotal, 450);
    assert.equal(result.audience, 'STAFF');
});

test('buildAuthoritativeOrder ignores tampered client prices and totals', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [
            { itemId: '507f1f77bcf86cd799439011', quantity: 1, price: 1, totalAmount: 1, grossTotal: 1 },
        ],
        dbItems: [dbItem()],
        audience: 'CUSTOMER',
    });
    assert.equal(result.ok, true);
    assert.equal(result.lines[0].price, 200);
    assert.equal(result.subtotal, 200);
});

test('buildAuthoritativeOrder rejects a staff order with a missing staff price', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ staffPrice: undefined })],
        audience: 'STAFF',
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /staff price/i);
});

test('buildAuthoritativeOrder rejects unavailable items for the audience', () => {
    const customer = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ available: false })],
        audience: 'CUSTOMER',
    });
    assert.equal(customer.ok, false);

    const staff = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ availableForStaff: false })],
        audience: 'STAFF',
    });
    assert.equal(staff.ok, false);
});

test('buildAuthoritativeOrder rejects hidden categories for the audience', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ category: 'Hidden' })],
        audience: 'STAFF',
        hiddenCategories: new Set(['hidden']),
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /not available/i);
});

test('buildAuthoritativeOrder rejects missing items, invalid ids and bad quantities', () => {
    assert.equal(
        buildAuthoritativeOrder({ requestedItems: [], dbItems: [dbItem()] }).ok,
        false
    );
    assert.equal(
        buildAuthoritativeOrder({
            requestedItems: [{ itemId: 'nope', quantity: 1 }],
            dbItems: [dbItem()],
        }).ok,
        false
    );
    assert.equal(
        buildAuthoritativeOrder({
            requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: -1 }],
            dbItems: [dbItem()],
        }).ok,
        false
    );
});

test('buildAuthoritativeOrder sanitizes customizations', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [
            {
                itemId: '507f1f77bcf86cd799439011',
                quantity: 1,
                customizations: [' Extra cheese ', '', 42, 'Extra spicy'],
            },
        ],
        dbItems: [dbItem()],
        audience: 'CUSTOMER',
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.lines[0].customizations, ['Extra cheese', 'Extra spicy']);
});

test('buildAuthoritativeOrder keeps line name and itemId from the database', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1, name: 'Tampered' }],
        dbItems: [dbItem()],
        audience: 'CUSTOMER',
    });
    assert.equal(result.lines[0].name, 'Paneer Tikka');
    assert.equal(String(result.lines[0].itemId), '507f1f77bcf86cd799439011');
});
