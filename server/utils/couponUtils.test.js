'use strict';

// Pure unit tests for the extracted coupon discount rules.
// Run with: node --test server/utils/couponUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeCouponDiscount } = require('./couponUtils');

test('PERCENT coupon discounts a percentage of the subtotal', () => {
    const result = computeCouponDiscount({ discountType: 'PERCENT', value: 10, minOrderAmount: 0 }, 200);
    assert.equal(result.ok, true);
    assert.equal(result.discountAmount, 20);
});

test('FLAT coupon discounts a fixed amount', () => {
    const result = computeCouponDiscount({ discountType: 'FLAT', value: 50, minOrderAmount: 0 }, 200);
    assert.equal(result.ok, true);
    assert.equal(result.discountAmount, 50);
});

test('discount is capped at the cart total', () => {
    const result = computeCouponDiscount({ discountType: 'FLAT', value: 500, minOrderAmount: 0 }, 200);
    assert.equal(result.ok, true);
    assert.equal(result.discountAmount, 200);
});

test('below the minimum order amount is rejected', () => {
    const result = computeCouponDiscount({ discountType: 'FLAT', value: 50, minOrderAmount: 300 }, 200);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'BELOW_MINIMUM');
    assert.equal(result.minOrderAmount, 300);
});

test('missing or malformed coupons are rejected', () => {
    assert.equal(computeCouponDiscount(null, 100).ok, false);
    assert.equal(computeCouponDiscount({}, 100).ok, false);
    assert.equal(computeCouponDiscount({ discountType: 'PERCENT', value: 10 }, 'abc').ok, false);
});

test('zero subtotal yields a zero discount without exceeding the total', () => {
    const result = computeCouponDiscount({ discountType: 'FLAT', value: 50, minOrderAmount: 0 }, 0);
    assert.equal(result.ok, true);
    assert.equal(result.discountAmount, 0);
});

test('an unknown discount type yields no discount', () => {
    const result = computeCouponDiscount({ discountType: 'MYSTERY', value: 50 }, 100);
    assert.equal(result.ok, true);
    assert.equal(result.discountAmount, 0);
});
