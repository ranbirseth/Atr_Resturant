'use strict';

// Focused unit tests for the pure Users & Coupons helpers.
// Run with: node --test src/utils/userCouponUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterUsers,
  userInitials,
  formatDiscount,
  formatMinOrder,
  formatDate,
  validateCouponForm,
  buildCouponPayload,
} = require('./userCouponUtils');

const USERS = [
  { id: '1', name: 'Aarav Sharma', email: 'N/A', phone: '9876543210', joined: '2026-01-02T10:00:00.000Z', status: 'Active', orders: 4 },
  { id: '2', name: 'Priya Verma', email: 'N/A', phone: '9123456780', joined: '2026-02-03T10:00:00.000Z', status: 'Active', orders: 0 },
  { id: '3', name: 'Rahul Mehta', email: 'N/A', phone: '7000000000', joined: '2026-03-04T10:00:00.000Z', status: 'Active', orders: 9 },
];

test('filterUsers returns all users for an empty query', () => {
  assert.equal(filterUsers(USERS, '').length, 3);
  assert.equal(filterUsers(USERS, '   ').length, 3);
  assert.equal(filterUsers(undefined, '').length, 0);
});

test('filterUsers searches name, phone and email case-insensitively', () => {
  assert.equal(filterUsers(USERS, 'aarav').length, 1);
  assert.equal(filterUsers(USERS, 'PRIYA').length, 1);
  assert.equal(filterUsers(USERS, '9876').length, 1);
  assert.equal(filterUsers(USERS, '0000').length, 1);
  assert.equal(filterUsers(USERS, 'zzz').length, 0);
});

test('filterUsers ignores malformed entries without throwing', () => {
  assert.equal(filterUsers([null, 5, USERS[0]], 'aarav').length, 1);
});

test('userInitials builds up to two letters', () => {
  assert.equal(userInitials('Aarav Sharma'), 'AS');
  assert.equal(userInitials('Priya'), 'PR');
  assert.equal(userInitials('  '), 'NA');
  assert.equal(userInitials(null), 'NA');
});

test('formatDiscount renders percent and flat values', () => {
  assert.equal(formatDiscount({ discountType: 'PERCENT', value: 20 }), '20% OFF');
  assert.equal(formatDiscount({ discountType: 'FLAT', value: 50 }), '\u20B950 OFF');
  assert.equal(formatDiscount({ discountType: 'OTHER', value: 50 }), '\u2014');
  assert.equal(formatDiscount(null), '\u2014');
});

test('formatMinOrder returns a currency string or "No minimum"', () => {
  assert.equal(formatMinOrder({ minOrderAmount: 500 }), '\u20B9500');
  assert.equal(formatMinOrder({ minOrderAmount: 0 }), 'No minimum');
  assert.equal(formatMinOrder({}), 'No minimum');
});

test('formatDate handles valid and invalid dates', () => {
  assert.notEqual(formatDate('2026-01-02T10:00:00.000Z'), 'N/A');
  assert.equal(formatDate('not-a-date'), 'N/A');
  assert.equal(formatDate(null), 'N/A');
});

test('validateCouponForm requires code, type and a positive value', () => {
  const result = validateCouponForm({ code: '', discountType: 'PERCENT', value: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.code);
  assert.ok(result.errors.value);
});

test('validateCouponForm rejects zero/negative values and bad types', () => {
  const result = validateCouponForm({ code: 'SAVE', discountType: 'BAD', value: '0' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.discountType);
  assert.ok(result.errors.value);

  assert.equal(validateCouponForm({ code: 'SAVE', discountType: 'FLAT', value: '-5' }).valid, false);
});

test('validateCouponForm accepts a minimal valid coupon', () => {
  const result = validateCouponForm({ code: 'WELCOME10', discountType: 'PERCENT', value: '10' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('validateCouponForm validates optional minimum order amount', () => {
  const bad = validateCouponForm({ code: 'SAVE', discountType: 'FLAT', value: '50', minOrderAmount: '-1' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.minOrderAmount);

  const ok = validateCouponForm({ code: 'SAVE', discountType: 'FLAT', value: '50', minOrderAmount: '' });
  assert.equal(ok.valid, true);
});

test('buildCouponPayload trims/uppercases the code and defaults minOrderAmount to 0', () => {
  const payload = buildCouponPayload({ code: ' welcome10 ', discountType: 'PERCENT', value: '10' });
  assert.deepEqual(payload, {
    code: 'WELCOME10',
    discountType: 'PERCENT',
    value: 10,
    minOrderAmount: 0,
    isActive: true,
  });
});

test('buildCouponPayload coerces numbers and honours a provided minimum', () => {
  const payload = buildCouponPayload({ code: 'save50', discountType: 'FLAT', value: '50', minOrderAmount: '300' });
  assert.equal(payload.value, 50);
  assert.equal(payload.minOrderAmount, 300);
});
