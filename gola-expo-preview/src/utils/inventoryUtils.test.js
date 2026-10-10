'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  UNITS,
  formatQty,
  parseDateInput,
  validateIngredientForm,
  validateMovementForm,
  computeUsagePercent,
  computeSuggestedQty,
  filterStockList,
  purchaseStatusLabel,
  getErrorMessage,
} = require('./inventoryUtils');

test('UNITS exposes the required measurement units', () => {
  for (const unit of ['kg', 'g', 'litre', 'ml', 'pieces', 'packets']) {
    assert.ok(UNITS.includes(unit), `missing ${unit}`);
  }
});

test('formatQty renders value with unit and a dash for invalid input', () => {
  assert.equal(formatQty(2.5, 'kg'), '2.5 kg');
  assert.equal(formatQty('3', 'pieces'), '3 pieces');
  assert.equal(formatQty('abc', 'kg'), '\u2014 kg');
});

test('parseDateInput defaults to a Date, accepts YYYY-MM-DD, rejects others', () => {
  assert.ok(parseDateInput('') instanceof Date);
  assert.ok(parseDateInput(undefined) instanceof Date);
  assert.ok(parseDateInput('2026-01-05') instanceof Date);
  assert.equal(parseDateInput('05/01/2026'), null);
  assert.equal(parseDateInput('nope'), null);
});

test('validateIngredientForm covers required and numeric rules', () => {
  const bad = validateIngredientForm({ name: '', unit: 'tonnes', minimumStockLevel: 'x' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.name);
  assert.ok(bad.errors.unit);
  assert.ok(bad.errors.minimumStockLevel);

  const good = validateIngredientForm({ name: 'Rice', unit: 'kg', minimumStockLevel: '5', expectedDemand: '2', openingQty: '10' });
  assert.equal(good.valid, true);
  assert.deepEqual(good.errors, {});
});

test('validateIngredientForm rejects negative opening quantity', () => {
  const res = validateIngredientForm({ name: 'Rice', unit: 'kg', minimumStockLevel: 5, openingQty: -1 });
  assert.equal(res.valid, false);
  assert.ok(res.errors.openingQty);
});

test('validateMovementForm requires positive quantity for consume/restock', () => {
  assert.equal(validateMovementForm({ quantity: '0', date: '2026-01-01' }, 'CONSUMPTION').valid, false);
  assert.equal(validateMovementForm({ quantity: '2', date: '2026-01-01' }, 'RESTOCK').valid, true);
  assert.equal(validateMovementForm({ quantity: '2', date: 'bad' }, 'RESTOCK').valid, false);
});

test('validateMovementForm allows signed delta for adjustments', () => {
  assert.equal(validateMovementForm({ quantityDelta: '0' }, 'ADJUSTMENT').valid, false);
  assert.equal(validateMovementForm({ quantityDelta: '-3.5' }, 'ADJUSTMENT').valid, true);
});

test('computeUsagePercent and computeSuggestedQty match the backend rules', () => {
  assert.equal(computeUsagePercent(50, 30), 40);
  assert.equal(computeUsagePercent(0, 0), null);
  assert.equal(computeSuggestedQty(10, 20, 5), 25);
  assert.equal(computeSuggestedQty(10, 20, 40), 0);
});

test('filterStockList applies all stock status filters', () => {
  const rows = [
    { name: 'Rice', available: true, lowStock: false, outOfStock: false, needToBuy: false },
    { name: 'Oil', available: false, lowStock: true, outOfStock: false, needToBuy: true },
    { name: 'Salt', available: false, lowStock: false, outOfStock: true, needToBuy: false },
  ];
  assert.equal(filterStockList(rows, { filter: 'all' }).length, 3);
  assert.equal(filterStockList(rows, { filter: 'low' })[0].name, 'Oil');
  assert.equal(filterStockList(rows, { filter: 'out' })[0].name, 'Salt');
  assert.equal(filterStockList(rows, { filter: 'need-to-buy' })[0].name, 'Oil');
  assert.equal(filterStockList(rows, { filter: 'available', query: 'ric' })[0].name, 'Rice');
});

test('purchaseStatusLabel maps states to friendly labels', () => {
  assert.equal(purchaseStatusLabel('NEEDED'), 'Need to Buy');
  assert.equal(purchaseStatusLabel('ORDERED'), 'Ordered');
  assert.equal(purchaseStatusLabel('COMPLETED'), 'Purchased');
  assert.equal(purchaseStatusLabel('NONE'), 'None');
});

test('getErrorMessage prefers the server message', () => {
  assert.equal(getErrorMessage({ data: { message: 'Server says no' } }, 'fallback'), 'Server says no');
  assert.equal(getErrorMessage({ message: 'boom' }, 'fallback'), 'boom');
  assert.equal(getErrorMessage(null, 'fallback'), 'fallback');
});
