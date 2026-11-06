'use strict';

// Focused unit tests for the Customer/Staff audience helpers used to gate POS
// and session bill creation.
// Run with: node --test src/utils/audienceBilling.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUDIENCES,
  normalizeAudience,
  audienceLabel,
  audienceUnitPrice,
  cartForAudience,
  buildPosPayload,
  canCreatePosBill,
  buildSessionPayload,
  makeIdempotencyKey,
  newCheckout,
} = require('./audienceBilling');
const { cartTotals, addItem } = require('./billingUtils');

const PANEER = {
  _id: 'i1',
  name: 'Paneer Tikka',
  price: 100,
  staffPrice: 70,
  category: 'Starters',
  available: true,
};

test('normalizeAudience trims/case-folds and rejects everything else', () => {
  assert.equal(AUDIENCES.length, 2);
  assert.equal(normalizeAudience('CUSTOMER'), 'CUSTOMER');
  assert.equal(normalizeAudience('staff'), 'STAFF');
  assert.equal(normalizeAudience(' Staff '), 'STAFF');
  assert.equal(normalizeAudience('Customer'), 'CUSTOMER');
  assert.equal(normalizeAudience('guest'), null);
  assert.equal(normalizeAudience(''), null);
  assert.equal(normalizeAudience(null), null);
  assert.equal(normalizeAudience(undefined), null);
  assert.equal(normalizeAudience(123), null);
});

test('audienceLabel maps the two audiences and is null otherwise', () => {
  assert.equal(audienceLabel('CUSTOMER'), 'Customer');
  assert.equal(audienceLabel('staff'), 'Staff');
  assert.equal(audienceLabel('nobody'), null);
  assert.equal(audienceLabel(null), null);
});

test('audienceUnitPrice uses manual staff price and falls back to customer price', () => {
  assert.equal(audienceUnitPrice({ price: 200, staffPrice: 100 }, 'CUSTOMER'), 200);
  assert.equal(audienceUnitPrice({ price: 200, staffPrice: 100 }, 'STAFF'), 100);
  assert.equal(audienceUnitPrice({ price: 200, staffPrice: null }, 'STAFF'), 200);
  assert.equal(audienceUnitPrice({ price: 200, staffPrice: 0 }, 'STAFF'), 0);
  assert.equal(audienceUnitPrice({ price: '100' }, 'STAFF'), 100);
  assert.equal(audienceUnitPrice({ price: -5 }, 'STAFF'), null);
  assert.equal(audienceUnitPrice({ price: 'abc' }, 'CUSTOMER'), null);
  assert.equal(audienceUnitPrice(null, 'STAFF'), null);
});

test('cartForAudience reprices a display copy without mutating the source', () => {
  const cart = addItem([], PANEER);
  cart.push({ itemId: 'i2', name: 'Butter Naan', price: 45, quantity: 2 });

  const customer = cartForAudience(cart, 'CUSTOMER');
  assert.equal(customer[0].price, 100);
  assert.equal(customer[1].price, 45);
  assert.equal(cartTotals(customer).subtotal, 190);

  const staff = cartForAudience(cart, 'STAFF');
  assert.equal(staff[0].price, 70);
  assert.equal(staff[1].price, 45);
  assert.equal(cartTotals(staff).subtotal, 160);

  // Source cart keeps the customer prices; only the returned copy changes.
  assert.equal(cart[0].price, 100);
  assert.equal(cart[1].price, 45);
});

test('changing audience changes the preview total using manual and fallback prices', () => {
  const cart = [
    { itemId: 'i1', name: 'Paneer', price: 100, staffPrice: 60, quantity: 1 },
    { itemId: 'i2', name: 'Naan', price: 45, quantity: 1 },
  ];
  assert.equal(cartTotals(cartForAudience(cart, 'CUSTOMER')).subtotal, 145);
  assert.equal(cartTotals(cartForAudience(cart, 'STAFF')).subtotal, 105);
  // No selection keeps the customer price for the preview.
  assert.equal(cartTotals(cartForAudience(cart, null)).subtotal, 145);
});

test('buildPosPayload sends only audience + itemId/quantity and needs a selection', () => {
  const cart = [
    { itemId: 'i1', name: 'Paneer', price: 100, quantity: 2 },
    { itemId: 'i2', name: 'Naan', price: 45, quantity: 1 },
  ];
  const customer = buildPosPayload('CUSTOMER', cart);
  assert.deepEqual(customer, {
    audience: 'CUSTOMER',
    items: [
      { itemId: 'i1', quantity: 2 },
      { itemId: 'i2', quantity: 1 },
    ],
  });
  // No prices/totals cross the wire - the server is authoritative.
  assert.equal(Object.prototype.hasOwnProperty.call(customer.items[0], 'price'), false);
});

test('changing the audience changes the payload audience but not the items', () => {
  const cart = [{ itemId: 'i1', name: 'Paneer', price: 100, quantity: 1 }];
  const customer = buildPosPayload('CUSTOMER', cart);
  const staff = buildPosPayload('STAFF', cart);
  assert.equal(customer.audience, 'CUSTOMER');
  assert.equal(staff.audience, 'STAFF');
  assert.deepEqual(customer.items, staff.items);
});

test('buildPosPayload returns null with no selection or an empty cart', () => {
  const cart = [{ itemId: 'i1', name: 'Paneer', price: 100, quantity: 1 }];
  assert.equal(buildPosPayload(null, cart), null);
  assert.equal(buildPosPayload('', cart), null);
  assert.equal(buildPosPayload('guest', cart), null);
  assert.equal(buildPosPayload('CUSTOMER', []), null);
  assert.equal(buildPosPayload('CUSTOMER', null), null);
  // Lines without an id or a positive quantity are dropped; none left -> null.
  assert.equal(buildPosPayload('CUSTOMER', [{ itemId: '', quantity: 1 }]), null);
  assert.equal(buildPosPayload('CUSTOMER', [{ itemId: 'i1', quantity: 0 }]), null);
});

test('canCreatePosBill blocks creation until an audience is selected', () => {
  const cart = [{ itemId: 'i1', name: 'Paneer', price: 100, quantity: 1 }];
  assert.equal(canCreatePosBill(cart, null), false);
  assert.equal(canCreatePosBill([], 'CUSTOMER'), false);
  assert.equal(canCreatePosBill(cart, 'CUSTOMER'), true);
  assert.equal(canCreatePosBill(cart, 'STAFF'), true);
});

test('buildSessionPayload carries the chosen audience and rejects none', () => {
  assert.deepEqual(buildSessionPayload('CUSTOMER'), { audience: 'CUSTOMER' });
  assert.deepEqual(buildSessionPayload('staff'), { audience: 'STAFF' });
  assert.equal(buildSessionPayload(null), null);
  assert.equal(buildSessionPayload('CUSTOMER ').audience, 'CUSTOMER');
});

test('makeIdempotencyKey is non-empty, prefixed, and unique per call', () => {
  const a = makeIdempotencyKey('pos');
  const b = makeIdempotencyKey('pos');
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 8);
  assert.ok(a.startsWith('pos-'));
  assert.notEqual(a, b);
  assert.ok(makeIdempotencyKey('sess').startsWith('sess-'));
  assert.ok(makeIdempotencyKey().startsWith('pos-'));
});

test('newCheckout starts with no audience and a fresh key (no reuse)', () => {
  const first = newCheckout();
  const second = newCheckout();
  assert.equal(first.audience, null);
  assert.equal(second.audience, null);
  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
});
