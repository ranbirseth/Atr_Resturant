'use strict';

// Focused unit tests for the pure POS Billing helpers.
// Run with: node --test src/utils/billingUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_QUANTITY,
  toQuantity,
  isItemSellable,
  lineFromItem,
  addItem,
  setQuantity,
  cartQuantity,
  incrementItem,
  decrementItem,
  removeItem,
  clearCart,
  lineTotal,
  cartTotals,
  sanitizeDiscount,
  computePayable,
  canGenerateBill,
} = require('./billingUtils');

const PANEER = { _id: 'i1', name: 'Paneer Tikka', price: 240, category: 'Starters', available: true };
const NAAN = { _id: 'i2', name: 'Butter Naan', price: 45, category: 'Breads', available: true };

test('toQuantity floors, rejects non-positive/invalid, and clamps to MAX_QUANTITY', () => {
  assert.equal(toQuantity(3), 3);
  assert.equal(toQuantity('2'), 2);
  assert.equal(toQuantity(2.9), 2);
  assert.equal(toQuantity(0), 0);
  assert.equal(toQuantity(-5), 0);
  assert.equal(toQuantity('abc'), 0);
  assert.equal(toQuantity(null), 0);
  assert.equal(toQuantity(MAX_QUANTITY + 500), MAX_QUANTITY);
});

test('isItemSellable requires id, availability, and a usable customer price', () => {
  assert.equal(isItemSellable(PANEER), true);
  assert.equal(isItemSellable({ ...PANEER, available: false }), false);
  assert.equal(isItemSellable({ ...PANEER, _id: '' }), false);
  assert.equal(isItemSellable({ ...PANEER, _id: undefined }), false);
  assert.equal(isItemSellable({ ...PANEER, price: 'nope' }), false);
  assert.equal(isItemSellable({ ...PANEER, price: null }), false);
  assert.equal(isItemSellable(null), false);
});

test('lineFromItem derives a line from customer price with safe fallbacks', () => {
  const line = lineFromItem(PANEER);
  assert.deepEqual(line, {
    itemId: 'i1',
    name: 'Paneer Tikka',
    price: 240,
    category: 'Starters',
    quantity: 1,
  });

  const fallback = lineFromItem({ _id: 9, name: '   ', price: 10 });
  assert.equal(fallback.itemId, '9');
  assert.equal(fallback.name, 'Item');
  assert.equal(fallback.category, '');
});

test('addItem appends a new line and does not mutate the input cart', () => {
  const original = [];
  const cart = addItem(original, PANEER);
  assert.equal(original.length, 0);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 1);
  assert.equal(cart[0].itemId, 'i1');
});

test('addItem increments an existing line and supports an explicit step', () => {
  let cart = addItem([], PANEER);
  cart = addItem(cart, PANEER);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2);

  cart = addItem(cart, PANEER, 3);
  assert.equal(cart[0].quantity, 5);
});

test('addItem ignores unsellable items', () => {
  const cart = addItem([], { ...PANEER, available: false });
  assert.deepEqual(cart, []);
});

test('setQuantity updates a line and removes it when the quantity clamps to 0', () => {
  let cart = addItem(addItem([], PANEER), NAAN);
  cart = setQuantity(cart, 'i1', 4);
  assert.equal(cartQuantity(cart, 'i1'), 4);

  cart = setQuantity(cart, 'i1', 0);
  assert.equal(cartQuantity(cart, 'i1'), 0);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].itemId, 'i2');
});

test('incrementItem / decrementItem bound the quantity at 1 and remove at the floor', () => {
  let cart = addItem([], PANEER);
  cart = incrementItem(cart, 'i1');
  assert.equal(cartQuantity(cart, 'i1'), 2);

  cart = decrementItem(cart, 'i1');
  cart = decrementItem(cart, 'i1');
  assert.equal(cartQuantity(cart, 'i1'), 0);
  assert.equal(cart.length, 0);
});

test('cartQuantity, removeItem, and clearCart are null-safe', () => {
  assert.equal(cartQuantity(null, 'i1'), 0);
  let cart = addItem(addItem([], PANEER), NAAN);
  cart = removeItem(cart, 'i1');
  assert.equal(cart.length, 1);
  assert.deepEqual(clearCart(), []);
  assert.equal(removeItem(null, 'i1').length, 0);
});

test('lineTotal multiplies price by quantity and never returns NaN', () => {
  assert.equal(lineTotal({ price: 240, quantity: 3 }), 720);
  assert.equal(lineTotal({ price: 'bad', quantity: 3 }), 0);
  assert.equal(lineTotal({ price: 240, quantity: 0 }), 0);
  assert.equal(lineTotal(null), 0);
});

test('cartTotals sums subtotal and unit count with guards', () => {
  let cart = addItem([], PANEER);
  cart = addItem(cart, PANEER);
  cart = addItem(cart, NAAN);
  const totals = cartTotals(cart);
  assert.equal(totals.lineCount, 2);
  assert.equal(totals.unitCount, 3);
  assert.equal(totals.subtotal, 240 * 2 + 45);

  assert.deepEqual(cartTotals(null), { lineCount: 0, unitCount: 0, subtotal: 0 });
});

test('sanitizeDiscount clamps to [0, subtotal]', () => {
  assert.equal(sanitizeDiscount(50, 240), 50);
  assert.equal(sanitizeDiscount(999, 240), 240);
  assert.equal(sanitizeDiscount(-10, 240), 0);
  assert.equal(sanitizeDiscount('abc', 240), 0);
  assert.equal(sanitizeDiscount(50, 0), 0);
});

test('computePayable subtracts a sanitized discount and never goes negative', () => {
  assert.equal(computePayable(240, 40), 200);
  assert.equal(computePayable(240, 999), 0);
  assert.equal(computePayable(240, 0), 240);
  assert.equal(computePayable(null, 40), 0);
});

test('canGenerateBill requires an id, quantity, and price on every line', () => {
  const cart = addItem([], PANEER);
  assert.equal(canGenerateBill(cart), true);
  assert.equal(canGenerateBill([]), false);
  assert.equal(canGenerateBill([{ itemId: '', price: 10, quantity: 1 }]), false);
  assert.equal(canGenerateBill([{ itemId: 'i1', price: 'bad', quantity: 1 }]), false);
  assert.equal(canGenerateBill([{ itemId: 'i1', price: 10, quantity: 0 }]), false);
});
