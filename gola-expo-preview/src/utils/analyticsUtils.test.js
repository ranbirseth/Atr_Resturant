'use strict';

// Focused unit tests for the pure Reviews & Analytics helpers.
// Run with: node --test src/utils/analyticsUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RANGE_OPTIONS,
  rangeDays,
  isCancelledOrder,
  filterOrdersByRange,
  buildDailySales,
  computeAnalytics,
  computeRatingStats,
  formatRating,
  reviewAuthor,
  reviewMessage,
  reviewTags,
  reviewOrderLabel,
} = require('./analyticsUtils');

// Fixed "now": 9 Oct 2026, 20:00 local time.
const NOW = new Date(2026, 9, 9, 20, 0, 0);

const ORDERS = [
  { id: 'o1', createdAt: new Date(2026, 9, 9, 10, 0, 0), totalAmount: 100, grossTotal: 120, discountAmount: 20, status: 'COMPLETED' },
  { id: 'o2', createdAt: new Date(2026, 9, 9, 12, 0, 0), totalAmount: 50, grossTotal: 50, discountAmount: 0, status: 'PLACED' },
  { id: 'o3', createdAt: new Date(2026, 9, 8, 23, 0, 0), totalAmount: 999, grossTotal: 999, discountAmount: 0, status: 'COMPLETED' },
  { id: 'o4', createdAt: new Date(2026, 9, 9, 13, 0, 0), totalAmount: 200, grossTotal: 200, discountAmount: 0, status: 'CANCELLED' },
  { id: 'o5', createdAt: new Date(2026, 9, 3, 9, 0, 0), totalAmount: 300, grossTotal: 300, discountAmount: 0, status: 'COMPLETED' },
  { id: 'o6', totalAmount: 500, status: 'COMPLETED' },
  { id: 'o7', createdAt: 'not-a-date', totalAmount: 500, status: 'COMPLETED' },
];

test('RANGE_OPTIONS exposes Today / 7 / 30 days', () => {
  assert.deepEqual(
    RANGE_OPTIONS.map((r) => r.key),
    ['1d', '7d', '30d'],
  );
});

test('isCancelledOrder is case-insensitive and null-safe', () => {
  assert.equal(isCancelledOrder({ status: 'CANCELLED' }), true);
  assert.equal(isCancelledOrder({ status: 'Cancelled' }), true);
  assert.equal(isCancelledOrder({ status: 'COMPLETED' }), false);
  assert.equal(isCancelledOrder(null), false);
  assert.equal(isCancelledOrder({}), false);
});

test('filterOrdersByRange Today keeps only the current calendar day', () => {
  const today = filterOrdersByRange(ORDERS, '1d', NOW).map((o) => o.id);
  assert.deepEqual(today, ['o1', 'o2', 'o4']);
});

test('filterOrdersByRange 7 days includes the 8th, 30 days excludes bad dates', () => {
  const week = filterOrdersByRange(ORDERS, '7d', NOW).map((o) => o.id);
  assert.deepEqual(week, ['o1', 'o2', 'o3', 'o4', 'o5']);

  const month = filterOrdersByRange(ORDERS, '30d', NOW).map((o) => o.id);
  assert.deepEqual(month, ['o1', 'o2', 'o3', 'o4', 'o5']);
});

test('computeAnalytics excludes cancelled orders from revenue, orders and AOV', () => {
  const result = computeAnalytics(ORDERS, '1d', NOW);
  assert.equal(result.totalRevenue, 150);
  assert.equal(result.grossSales, 170);
  assert.equal(result.totalDiscount, 20);
  assert.equal(result.orderCount, 2);
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.totalInRange, 3);
  assert.equal(result.avgOrderValue, 75);
});

test('computeAnalytics avoids divide-by-zero on an empty range', () => {
  const result = computeAnalytics([], '1d', NOW);
  assert.equal(result.totalRevenue, 0);
  assert.equal(result.orderCount, 0);
  assert.equal(result.avgOrderValue, 0);
  assert.equal(result.dailySales.length, 1);
  assert.equal(result.dailySales[0].orders, 0);
  assert.equal(result.dailySales[0].revenue, 0);
});

test('computeAnalytics over 7 days includes the earlier order and excludes cancelled', () => {
  const result = computeAnalytics(ORDERS, '7d', NOW);
  assert.equal(result.totalRevenue, 1449);
  assert.equal(result.orderCount, 4);
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.avgOrderValue, 362.25);
  assert.equal(result.grossSales, 1469);
});

test('buildDailySales returns one bucket per day, oldest first', () => {
  const eligible = ORDERS.filter((o) => o.status !== 'CANCELLED');
  const buckets = buildDailySales(eligible, '7d', NOW);
  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].orders, 1); // Oct 3
  assert.equal(buckets[0].revenue, 300);
  assert.equal(buckets[6].orders, 2); // Oct 9
  assert.equal(buckets[6].revenue, 150);
});

test('computeRatingStats averages only valid 1-5 ratings', () => {
  const stats = computeRatingStats([
    { rating: 5 },
    { rating: 4 },
    { rating: 5 },
    { rating: 0 },
    { rating: 6 },
    { rating: null },
    { rating: 'x' },
    { rating: 3 },
  ]);
  assert.equal(stats.count, 4);
  assert.equal(stats.total, 8);
  assert.equal(stats.average, 4.25);
  assert.deepEqual(
    stats.distribution.map((d) => d.count),
    [2, 1, 1, 0, 0],
  );
});

test('computeRatingStats handles no reviews without dividing by zero', () => {
  const stats = computeRatingStats([]);
  assert.equal(stats.average, 0);
  assert.equal(stats.count, 0);
  assert.equal(stats.total, 0);
  assert.deepEqual(
    stats.distribution.map((d) => d.count),
    [0, 0, 0, 0, 0],
  );
});

test('formatRating shows one decimal only when ratings exist', () => {
  assert.equal(formatRating(4.25, 4), '4.3');
  assert.equal(formatRating(5, 1), '5.0');
  assert.equal(formatRating(0, 0), '\u2014');
});

test('rangeDays falls back to 30 days for unknown keys', () => {
  assert.equal(rangeDays('1d'), 1);
  assert.equal(rangeDays('7d'), 7);
  assert.equal(rangeDays('30d'), 30);
  assert.equal(rangeDays('nonsense'), 30);
  assert.equal(rangeDays(undefined), 30);
});

test('range helpers tolerate non-array input and an invalid now', () => {
  assert.deepEqual(filterOrdersByRange(null, '7d', NOW), []);
  assert.deepEqual(filterOrdersByRange('nope', '7d', NOW), []);

  const buckets = buildDailySales(undefined, '7d', 'not-a-date');
  assert.equal(buckets.length, 7);

  const result = computeAnalytics(undefined, 'bad-range', undefined);
  assert.equal(result.totalRevenue, 0);
  assert.equal(result.avgOrderValue, 0);
  assert.equal(result.dailySales.length, 30);
});

test('review display helpers fall back safely', () => {
  assert.equal(reviewAuthor({ userId: { name: ' Aarav ' } }), 'Aarav');
  assert.equal(reviewAuthor({ userId: null }), 'Guest Customer');
  assert.equal(reviewAuthor(null), 'Guest Customer');

  assert.equal(reviewMessage({ message: ' Great food ' }), 'Great food');
  assert.equal(reviewMessage({}), '');

  assert.deepEqual(reviewTags({ tags: ['Food', '', 3, 'Service'] }), ['Food', 'Service']);
  assert.deepEqual(reviewTags(null), []);

  assert.equal(
    reviewOrderLabel({ orderId: { orderType: 'Dine-in', tableNumber: '5' } }),
    'Dine-in \u2022 Table 5',
  );
  assert.equal(reviewOrderLabel({ orderId: { orderType: 'Takeaway' } }), 'Takeaway');
  assert.equal(reviewOrderLabel({}), '');
});
