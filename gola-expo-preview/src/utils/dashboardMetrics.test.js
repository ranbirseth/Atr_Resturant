'use strict';

// Focused unit tests for the pure dashboard metric functions.
// Run with: node --test src/utils/dashboardMetrics.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeStatus,
  toNumber,
  computeStats,
  buildSevenDayTrend,
  computePopularItems,
  formatNumber,
  formatCurrency,
  localDateKey,
} = require('./dashboardMetrics');

test('normalizeStatus trims and upper-cases, tolerating bad input', () => {
  assert.equal(normalizeStatus('  completed '), 'COMPLETED');
  assert.equal(normalizeStatus('Pending'), 'PENDING');
  assert.equal(normalizeStatus(null), '');
  assert.equal(normalizeStatus(undefined), '');
  assert.equal(normalizeStatus(42), '');
});

test('toNumber is safe against missing / invalid values', () => {
  assert.equal(toNumber(10), 10);
  assert.equal(toNumber('12.5'), 12.5);
  assert.equal(toNumber('abc'), 0);
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(NaN), 0);
  assert.equal(toNumber(Infinity), 0);
});

test('Completed and COMPLETED are both counted as completed', () => {
  const stats = computeStats([
    { status: 'Completed', totalAmount: 100 },
    { status: 'COMPLETED', totalAmount: 200 },
  ]);
  assert.equal(stats.completedOrders, 2);
  assert.equal(stats.totalOrders, 2);
});

test('Pending and PLACED are both counted as pending, cancelled is not', () => {
  const stats = computeStats([
    { status: 'Pending', totalAmount: 100 },
    { status: 'PLACED', totalAmount: 200 },
    { status: 'Cancelled', totalAmount: 500 },
    { status: 'CANCELLED', totalAmount: 500 },
  ]);
  assert.equal(stats.pendingOrders, 2);
  assert.equal(stats.totalOrders, 4);
});

test('cancelled orders are excluded from Total Revenue', () => {
  const stats = computeStats([
    { status: 'COMPLETED', totalAmount: 250 },
    { status: 'Cancelled', totalAmount: 999 },
    { status: 'CANCELLED', totalAmount: 999 },
    { status: 'ACCEPTED', totalAmount: 50 },
  ]);
  assert.equal(stats.totalRevenue, 300);
});

test('missing or invalid totalAmount does not produce NaN in revenue', () => {
  const stats = computeStats([
    { status: 'COMPLETED', totalAmount: 100 },
    { status: 'COMPLETED' },
    { status: 'COMPLETED', totalAmount: 'oops' },
    { status: 'COMPLETED', totalAmount: null },
  ]);
  assert.equal(stats.totalRevenue, 100);
  assert.ok(!Number.isNaN(stats.totalRevenue));
});

test('empty orders produce valid zero values', () => {
  assert.deepEqual(computeStats([]), {
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
  });
  assert.deepEqual(computeStats(null), {
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
  });
});

test('seven-day trend returns exactly seven buckets ending today', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0); // Oct 9 2026 local
  const trend = buildSevenDayTrend([], now);
  assert.equal(trend.length, 7);
  assert.equal(trend[6].key, '2026-10-09');
  assert.equal(trend[0].key, '2026-10-03');
});

test('seven-day trend counts orders on their local calendar day', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0);
  const orders = [
    { createdAt: new Date(2026, 9, 9, 9, 0, 0).toISOString() },
    { createdAt: new Date(2026, 9, 9, 20, 0, 0).toISOString() },
    { createdAt: new Date(2026, 9, 7, 1, 0, 0).toISOString() },
  ];
  const trend = buildSevenDayTrend(orders, now);
  const byKey = {};
  trend.forEach(function (d) {
    byKey[d.key] = d.count;
  });
  assert.equal(byKey['2026-10-09'], 2);
  assert.equal(byKey['2026-10-07'], 1);
  assert.equal(byKey['2026-10-08'], 0);
});

test('seven-day trend ignores orders with invalid / missing createdAt', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0);
  const trend = buildSevenDayTrend(
    [{}, { createdAt: 'not-a-date' }, { createdAt: null }],
    now,
  );
  const total = trend.reduce(function (sum, d) {
    return sum + d.count;
  }, 0);
  assert.equal(total, 0);
});

test('seven-day trend handles dates with zero orders (all zero, no crash)', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0);
  const trend = buildSevenDayTrend([], now);
  trend.forEach(function (d) {
    assert.equal(d.count, 0);
    assert.ok(typeof d.key === 'string');
    assert.ok(typeof d.label === 'string');
  });
});

test('popular items aggregates by normalized name, top 5, sorted by quantity', () => {
  const orders = [
    {
      items: [
        { name: 'Chilli Paneer Dry', price: 240, quantity: 2 },
        { name: '  chilli   paneer dry ', price: 240, quantity: 1 }, // same item, messy name
      ],
    },
    { items: [{ name: 'Naan', price: 40, quantity: 5 }] },
  ];
  const popular = computePopularItems(orders, 5);
  assert.equal(popular.length, 2);
  assert.equal(popular[0].name, 'Naan');
  assert.equal(popular[0].quantitySold, 5);
  assert.equal(popular[1].name, 'Chilli Paneer Dry');
  assert.equal(popular[1].quantitySold, 3);
  assert.equal(popular[1].revenue, 720);
});

test('popular items respects the limit (top five)', () => {
  const orders = [
    {
      items: [
        { name: 'A', price: 1, quantity: 6 },
        { name: 'B', price: 1, quantity: 5 },
        { name: 'C', price: 1, quantity: 4 },
        { name: 'D', price: 1, quantity: 3 },
        { name: 'E', price: 1, quantity: 2 },
        { name: 'F', price: 1, quantity: 1 },
      ],
    },
  ];
  const popular = computePopularItems(orders, 5);
  assert.equal(popular.length, 5);
  assert.equal(popular[4].name, 'E');
});

test('popular items handles missing/empty items and invalid numbers safely', () => {
  const orders = [
    {},
    { items: null },
    { items: [] },
    { items: [{}, { name: '' }, { name: 'Rice', price: 'x', quantity: 'y' }] },
    { items: [{ name: 'Rice', price: 50, quantity: null }] },
  ];
  const popular = computePopularItems(orders, 5);
  assert.equal(popular.length, 1);
  assert.equal(popular[0].name, 'Rice');
  assert.equal(popular[0].quantitySold, 0);
  assert.equal(popular[0].revenue, 0);
  assert.ok(!Number.isNaN(popular[0].revenue));
});

test('formatCurrency/formatNumber do not emit NaN', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber('bad'), '0');
  assert.equal(formatNumber(26743.1), '26,743');
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatCurrency(undefined), '\u20B90');
  assert.equal(formatCurrency(2500), '\u20B92,500');
});

test('localDateKey formats local calendar dates with zero padding', () => {
  assert.equal(localDateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(localDateKey(new Date(2026, 11, 31)), '2026-12-31');
});
