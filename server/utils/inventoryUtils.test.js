'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    UNITS,
    nameKey,
    isValidUnit,
    round2,
    computeUsagePercent,
    computeSuggestedQty,
    computeStockStatus,
    needToBuyFromStatus,
    validateIngredientInput,
    validateMovementInput,
    movementDelta,
    filterStockItems,
} = require('./inventoryUtils');

test('nameKey normalizes case and whitespace', () => {
    assert.equal(nameKey('  Basmati   Rice '), 'basmati rice');
    assert.equal(nameKey('BASMATI RICE'), 'basmati rice');
});

test('unit allowlist rejects unknown units', () => {
    assert.equal(isValidUnit('kg'), true);
    assert.equal(isValidUnit('Tonnes'), false);
    assert.deepEqual(UNITS.includes('pieces'), true);
});

test('round2 keeps two decimals and avoids float dust', () => {
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(2.005), 2.01);
    assert.equal(round2('3.456'), 3.46);
});

test('computeUsagePercent clamps and handles empty baseline', () => {
    assert.equal(computeUsagePercent(50, 30), 40);
    assert.equal(computeUsagePercent(50, 0), 100);
    assert.equal(computeUsagePercent(50, 80), 0);
    assert.equal(computeUsagePercent(0, 0), null);
});

test('computeSuggestedQty floors at zero', () => {
    assert.equal(computeSuggestedQty(10, 20, 5), 25);
    assert.equal(computeSuggestedQty(10, 20, 40), 0);
    assert.equal(computeSuggestedQty(10, undefined, 12), 0);
});

test('computeStockStatus keeps low/out/available independent', () => {
    assert.deepEqual(computeStockStatus(5, 10), { available: false, lowStock: true, outOfStock: false });
    assert.deepEqual(computeStockStatus(0, 10), { available: false, lowStock: false, outOfStock: true });
    assert.deepEqual(computeStockStatus(20, 10), { available: true, lowStock: false, outOfStock: false });
});

test('needToBuyFromStatus is explicit status driven', () => {
    assert.equal(needToBuyFromStatus('NEEDED'), true);
    assert.equal(needToBuyFromStatus('ORDERED'), true);
    assert.equal(needToBuyFromStatus('NONE'), false);
    assert.equal(needToBuyFromStatus('COMPLETED'), false);
});

test('validateIngredientInput requires name/unit/min and non-negative numbers', () => {
    const bad = validateIngredientInput({ name: '  ', unit: 'kg', minimumStockLevel: -1 }, { partial: false });
    assert.equal(bad.errors.length, 2);

    const good = validateIngredientInput(
        { name: 'Paneer', unit: 'kg', minimumStockLevel: '5', expectedDemand: '2', isActive: 'true' },
        { partial: false },
    );
    assert.deepEqual(good.errors, []);
    assert.equal(good.value.name, 'Paneer');
    assert.equal(good.value.minimumStockLevel, 5);
    assert.equal(good.value.expectedDemand, 2);
    assert.equal(good.value.isActive, true);
});

test('validateIngredientInput partial allows single-field update', () => {
    const result = validateIngredientInput({ minimumStockLevel: 8 }, { partial: true });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.value, { minimumStockLevel: 8 });
});

test('validateMovementInput enforces positive quantity for non-adjustments', () => {
    const bad = validateMovementInput({ ingredientId: 'abc', type: 'CONSUMPTION', quantity: 0 });
    assert.equal(bad.errors.length, 1);

    const good = validateMovementInput({ ingredientId: 'abc', type: 'RESTOCK', quantity: '2.5', unit: 'kg' });
    assert.deepEqual(good.errors, []);
    assert.equal(good.value.quantity, 2.5);
});

test('validateMovementInput uses signed quantityDelta for adjustments', () => {
    const bad = validateMovementInput({ ingredientId: 'abc', type: 'ADJUSTMENT', quantityDelta: 0 });
    assert.equal(bad.errors.length, 1);

    const out = validateMovementInput({ ingredientId: 'abc', type: 'ADJUSTMENT', quantityDelta: -1.5 });
    assert.deepEqual(out.errors, []);
    assert.equal(movementDelta(out.value), -1.5);
});

test('movementDelta signs each type correctly', () => {
    assert.equal(movementDelta({ type: 'CONSUMPTION', quantity: 3 }), -3);
    assert.equal(movementDelta({ type: 'RESTOCK', quantity: 3 }), 3);
    assert.equal(movementDelta({ type: 'OPENING', quantity: 3 }), 3);
});

test('filterStockItems applies each stock filter and search', () => {
    const rows = [
        { name: 'Rice', available: true, lowStock: false, outOfStock: false, needToBuy: false },
        { name: 'Oil', available: false, lowStock: true, outOfStock: false, needToBuy: true },
        { name: 'Salt', available: false, lowStock: false, outOfStock: true, needToBuy: false },
    ];
    assert.equal(filterStockItems(rows, { filter: 'all' }).length, 3);
    assert.equal(filterStockItems(rows, { filter: 'low' })[0].name, 'Oil');
    assert.equal(filterStockItems(rows, { filter: 'out' })[0].name, 'Salt');
    assert.equal(filterStockItems(rows, { filter: 'need-to-buy' })[0].name, 'Oil');
    assert.equal(filterStockItems(rows, { filter: 'available', query: 'ric' })[0].name, 'Rice');
});
