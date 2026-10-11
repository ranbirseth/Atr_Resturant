'use strict';

// Focused unit tests for the pure Menu & Categories helpers.
// Run with: node --test src/utils/menuUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toFinitePrice,
  isValidPrice,
  computeStaffPrice,
  normalizeCategoryName,
  categoryKey,
  formatPrice,
  formatPriceExact,
  audiencePrice,
  filterItems,
  itemCountForCategory,
  validateItemForm,
  validateCategoryForm,
} = require('./menuUtils');

// Items 1 and 2 carry a LEGACY stored `staffPrice` to prove the derived pricing
// ignores it (P1.2). Item 3 has no legacy value and still derives.
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

test('computeStaffPrice is exactly 60% of the customer price, rounded to 2dp (matches backend)', () => {
  // Same expected values as server/utils/menuUtils.test.js so the display rule
  // cannot silently diverge from the server-authoritative formula.
  assert.equal(computeStaffPrice(100), 60);
  assert.equal(computeStaffPrice(99), 59.4);
  assert.equal(computeStaffPrice(99.99), 59.99);
  assert.equal(computeStaffPrice(0), 0);
  assert.equal(computeStaffPrice(200), 120);
});

test('computeStaffPrice handles half-paise boundaries and float dust (matches backend)', () => {
  // 0.075 -> 4.5 paise -> rounds up to 5 paise -> 0.05
  assert.equal(computeStaffPrice(0.075), 0.05);
  // 99.9916666... -> 59.995 -> 60.00
  assert.equal(computeStaffPrice(99.99166666666667), 60);
  assert.equal(computeStaffPrice(199.99), 119.99);
});

test('computeStaffPrice is null-safe and rejects malformed input', () => {
  assert.equal(computeStaffPrice(undefined), null);
  assert.equal(computeStaffPrice(null), null);
  assert.equal(computeStaffPrice(''), null);
  assert.equal(computeStaffPrice(-1), null);
  assert.equal(computeStaffPrice('abc'), null);
  assert.equal(computeStaffPrice(Infinity), null);
});

test('category helpers normalize whitespace and case', () => {
  assert.equal(normalizeCategoryName('  Main   Course '), 'Main Course');
  assert.equal(categoryKey(' MAIN course '), 'main course');
});

test('formatPrice returns a rupee string or an em dash (customer display unchanged)', () => {
  assert.equal(formatPrice(200), '\u20B9200');
  assert.equal(formatPrice(undefined), '\u2014');
});

test('formatPriceExact keeps two decimals for the derived staff price', () => {
  assert.equal(formatPriceExact(59.4), '\u20B959.40');
  assert.equal(formatPriceExact(59.99), '\u20B959.99');
  assert.equal(formatPriceExact(120), '\u20B9120.00');
  assert.equal(formatPriceExact(undefined), '\u2014');
});

test('audiencePrice: CUSTOMER unchanged, STAFF derived from price (legacy value ignored)', () => {
  assert.equal(audiencePrice(ITEMS[0], 'CUSTOMER'), 200);
  assert.equal(audiencePrice(ITEMS[1], 'CUSTOMER'), 350);
  // Item 1 stores legacy staffPrice 150 but must derive 200 * 0.6 = 120.
  assert.equal(audiencePrice(ITEMS[0], 'STAFF'), 120);
  // Item 2 stores legacy staffPrice 300 but must derive 350 * 0.6 = 210.
  assert.equal(audiencePrice(ITEMS[1], 'STAFF'), 210);
  assert.equal(audiencePrice(ITEMS[2], 'STAFF'), 108);
  assert.equal(audiencePrice(null, 'STAFF'), null);
  assert.equal(audiencePrice({ price: undefined }, 'STAFF'), null);
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

test('validateItemForm no longer requires a staff price (derived)', () => {
  const result = validateItemForm({ name: 'Tea', category: 'Beverages', price: '20' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('validateItemForm ignores a legacy staffPrice in the form object', () => {
  const result = validateItemForm({
    name: 'Tea',
    category: 'Beverages',
    price: '20',
    staffPrice: 'not-a-number',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('validateItemForm accepts zero customer price and valid prep time', () => {
  const result = validateItemForm({
    name: 'Water',
    category: 'Beverages',
    price: '0',
    estimatedPreparationTime: '0',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('validateItemForm rejects bad customer prices and prep times', () => {
  const result = validateItemForm({
    name: 'X',
    category: 'Y',
    price: '-1',
    estimatedPreparationTime: '-5',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.price);
  assert.ok(result.errors.estimatedPreparationTime);
});

test('validateCategoryForm requires a name', () => {
  assert.equal(validateCategoryForm({ name: '  ' }).valid, false);
  assert.equal(validateCategoryForm({ name: 'Desserts' }).valid, true);
});
