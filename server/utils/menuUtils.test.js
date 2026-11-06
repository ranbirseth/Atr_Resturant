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
    computeStaffPrice,
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
            // Explicit staff price; tests can override with missing, null, or zero.
            staffPrice: 150,
            available: true,
            availableForStaff: true,
        },
        overrides
    );
}

test('validateItemInput requires name, category and price on create (no staffPrice)', () => {
    const { errors, value } = validateItemInput({}, { partial: false });
    assert.ok(errors.length >= 3);
    assert.equal(value.price, undefined);
    assert.equal(value.staffPrice, undefined);
});

test('validateItemInput create succeeds without a staff price (customer-price fallback)', () => {
    const { errors, value } = validateItemInput(
        { name: 'Tea', category: 'Beverages', price: 20 },
        { partial: false }
    );
    assert.deepEqual(errors, []);
    assert.equal(value.price, 20);
    assert.equal(value.staffPrice, undefined);
});

test('validateItemInput accepts and normalizes staffPrice', () => {
    const { errors, value } = validateItemInput(
        { name: 'Tea', category: 'Beverages', price: 20, staffPrice: 999 },
        { partial: false }
    );
    assert.deepEqual(errors, []);
    assert.equal(value.price, 20);
    assert.equal(value.staffPrice, 999);
});

test('validateItemInput accepts null staffPrice for customer-price fallback', () => {
    const { errors, value } = validateItemInput(
        { name: 'Tea', category: 'Beverages', price: 20, staffPrice: null },
        { partial: false }
    );
    assert.deepEqual(errors, []);
    assert.equal(value.staffPrice, null);
});

test('validateItemInput rejects negative and malformed staff prices', () => {
    const base = { name: 'X', category: 'Y', price: 200 };
    for (const staffPrice of [-1, 'abc', Infinity, NaN, {}]) {
        assert.ok(
            validateItemInput({ ...base, staffPrice }, { partial: false }).errors.length > 0,
            `expected ${String(staffPrice)} to be rejected`
        );
    }
});

test('validateItemInput accepts zero prices', () => {
    const { errors, value } = validateItemInput(
        { name: 'Water', category: 'Beverages', price: 0 },
        { partial: false }
    );
    assert.deepEqual(errors, []);
    assert.equal(value.price, 0);
    assert.equal(value.staffPrice, undefined);
});

test('validateItemInput rejects negative, NaN, infinite and malformed prices', () => {
    const base = { name: 'X', category: 'Y' };
    assert.ok(validateItemInput({ ...base, price: -1 }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: 'abc' }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: Infinity }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: NaN }, { partial: false }).errors.length > 0);
    assert.ok(validateItemInput({ ...base, price: {} }, { partial: false }).errors.length > 0);
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

test('computeStaffPrice uses explicit staffPrice, including zero', () => {
    assert.equal(computeStaffPrice(200, 100), 100);
    assert.equal(computeStaffPrice(200, 0), 0);
});

test('computeStaffPrice is null-safe and rejects malformed input', () => {
    assert.equal(computeStaffPrice(200, null), 200);
    assert.equal(computeStaffPrice(200, undefined), 200);
    assert.equal(computeStaffPrice(undefined, null), null);
    assert.equal(computeStaffPrice(200, -1), null);
    assert.equal(computeStaffPrice(200, 'abc'), null);
    assert.equal(computeStaffPrice(200, Infinity), null);
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

test('buildAuthoritativeOrder uses staffPrice 100 instead of customer price 200', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ staffPrice: 100 })],
        audience: 'STAFF',
    });
    assert.equal(result.ok, true);
    assert.equal(result.lines[0].price, 100);
    assert.equal(result.subtotal, 100);
    assert.equal(result.audience, 'STAFF');
});

test('buildAuthoritativeOrder falls back to customer price when staffPrice is null', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ staffPrice: null })],
        audience: 'STAFF',
    });
    assert.equal(result.ok, true);
    assert.equal(result.lines[0].price, 200);
});

test('buildAuthoritativeOrder uses a zero staff price instead of falling back', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ staffPrice: 0 })],
        audience: 'STAFF',
    });
    assert.equal(result.ok, true);
    assert.equal(result.lines[0].price, 0);
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

test('buildAuthoritativeOrder uses staffPrice when customer price is missing', () => {
    const result = buildAuthoritativeOrder({
        requestedItems: [{ itemId: '507f1f77bcf86cd799439011', quantity: 1 }],
        dbItems: [dbItem({ price: undefined, staffPrice: 150 })],
        audience: 'STAFF',
    });
    assert.equal(result.ok, true);
    assert.equal(result.lines[0].price, 150);
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
