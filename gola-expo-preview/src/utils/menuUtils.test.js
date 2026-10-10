'use strict';

// Focused unit tests for the pure Menu & Categories helpers.
// Run with: node --test src/utils/menuUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toFinitePrice,
  isValidPrice,
  hasStaffPrice,
  normalizeCategoryName,
  categoryKey,
  formatPrice,
  audiencePrice,
  filterItems,
  itemCountForCategory,
  validateItemForm,
  validateCategoryForm,
} = require('./menuUtils');

const ITEMS = [
  { _id: '1', name: 'Paneer Tikka', description: 'Grilled', category: 'Starters', isVeg: true, price: 200, staffPrice: 150 },
  { _id: '2', name: 'Chicken Biryani', description: 'Aromatic', category: 'Main', isVeg: false, price: 350, staffPrice: 300 },
  { _id: '3', name: 'Dal Makhani', description: 'Lentils', category: 'Main', isVeg: true, price: 180 },
];

test('price helpers reject negative and malformed values', () => {
  assert.equal(toFinitePrice('99'), 99);
  assert.equal(toFinitePrice(0), 0);
  assert.equal(toFinitePrice('-1'), null);
  assert.equal(toFinitePrice('abc'), null);
  assert.equal(toFinitePrice(Infinity), null);
  assert.equal(isValidPrice(0), true);
  assert.equal(isValidPrice(undefined), false);
});

test('hasStaffPrice flags legacy items without a staff price', () => {
  assert.equal(hasStaffPrice(ITEMS[0]), true);
  assert.equal(hasStaffPrice(ITEMS[2]), false);
  assert.equal(hasStaffPrice(null), false);
});

test('category helpers normalize whitespace and case', () => {
  assert.equal(normalizeCategoryName('  Main   Course '), 'Main Course');
  assert.equal(categoryKey(' MAIN course '), 'main course');
});

test('formatPrice returns a rupee string or an em dash', () => {
  assert.equal(formatPrice(200), '\u20B9200');
  assert.equal(formatPrice(undefined), '\u2014');
});

test('audiencePrice picks the right price per audience', () => {
  assert.equal(audiencePrice(ITEMS[0], 'CUSTOMER'), 200);
  assert.equal(audiencePrice(ITEMS[0], 'STAFF'), 150);
  assert.equal(audiencePrice(ITEMS[2], 'STAFF'), null);
});

test('filterItems searches name and description', () => {
  assert.equal(filterItems(ITEMS, { query: 'biryani' }).length, 1);
  assert.equal(filterItems(ITEMS, { query: 'grilled' }).length, 1);
  assert.equal(filterItems(ITEMS, { query: 'nope' }).length, 0);
  assert.equal(filterItems(ITEMS, { query: '  ' }).length, 3);
});

test('filterItems filters by category and veg state', () => {
  assert.equal(filterItems(ITEMS, { category: 'Main' }).length, 2);
  assert.equal(filterItems(ITEMS, { category: 'All' }).length, 3);
  assert.equal(filterItems(ITEMS, { veg: 'veg' }).length, 2);
  assert.equal(filterItems(ITEMS, { veg: 'nonveg' }).length, 1);
});

test('filterItems combines every filter', () => {
  assert.equal(filterItems(ITEMS, { query: 'a', category: 'Main', veg: 'veg' }).length, 1);
  assert.equal(filterItems(ITEMS, { query: 'biryani', category: 'Starters', veg: 'veg' }).length, 0);
});

test('itemCountForCategory matches case/whitespace-insensitively', () => {
  assert.equal(itemCountForCategory(ITEMS, 'main'), 2);
  assert.equal(itemCountForCategory(ITEMS, ' Main '), 2);
  assert.equal(itemCountForCategory(ITEMS, 'Starters'), 1);
  assert.equal(itemCountForCategory(ITEMS, 'Missing'), 0);
});

test('validateItemForm requires both prices for new items', () => {
  const result = validateItemForm({ name: 'Tea', category: 'Beverages', price: '20' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.staffPrice);
});

test('validateItemForm accepts zero prices and valid prep time', () => {
  const result = validateItemForm({
    name: 'Water',
    category: 'Beverages',
    price: '0',
    staffPrice: '0',
    estimatedPreparationTime: '0',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('validateItemForm rejects bad prices and prep times', () => {
  const result = validateItemForm({
    name: 'X',
    category: 'Y',
    price: '-1',
    staffPrice: 'abc',
    estimatedPreparationTime: '-5',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.price);
  assert.ok(result.errors.staffPrice);
  assert.ok(result.errors.estimatedPreparationTime);
});

test('validateCategoryForm requires a name', () => {
  assert.equal(validateCategoryForm({ name: '  ' }).valid, false);
  assert.equal(validateCategoryForm({ name: 'Desserts' }).valid, true);
});
