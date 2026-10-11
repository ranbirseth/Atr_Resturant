'use strict';

// Unit tests for the pure dashboard metric functions.
// Run with: node --test src/utils/dashboardMetrics.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeStatus,
  toNumber,
  computeStats,
  istDateKey,
  istDayBounds,
  filterOrdersForIstDay,
  computeTodayStats,
  buildTodayTrend,
  computePopularItems,
  computeTodayPopularItems,
  hasLowRemainingStock,
  filterLowStockAlerts,
  formatNumber,
  formatCurrency,
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

test('istDateKey uses the IST wall-clock day, not UTC (18:30Z => next IST day)', () => {
  // 2026-10-10T18:30:00.000Z == 2026-10-11T00:00:00.000+05:30
  assert.equal(istDateKey(new Date('2026-10-10T18:30:00.000Z')), '2026-10-11');
  // 2026-10-10T18:29:59.000Z == 2026-10-10T23:59:59.000+05:30
  assert.equal(istDateKey(new Date('2026-10-10T18:29:59.000Z')), '2026-10-10');
  // Mid-day IST and mid-day UTC obviously map to the same IST calendar day.
  assert.equal(istDateKey(new Date('2026-10-11T03:30:00.000Z')), '2026-10-11');
  assert.equal(istDateKey(new Date('2026-10-11T09:00:00.000Z')), '2026-10-11');
});

test('istDayBounds resolves the exact IST day boundary instants', () => {
  const now = new Date('2026-10-11T03:30:00.000Z'); // 09:00 IST on 2026-10-11
  const bounds = istDayBounds(now);
  assert.equal(bounds.start.toISOString(), '2026-10-10T18:30:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-10-11T18:30:00.000Z');
});

test('istDayBounds around the boundary instant (18:29:59.999Z belongs to yesterday)', () => {
  // 2026-10-10T18:29:59.999Z == 23:59:59.999 IST on 2026-10-10 -> still "yesterday".
  const now = new Date('2026-10-10T18:29:59.999Z');
  const bounds = istDayBounds(now);
  assert.equal(bounds.start.toISOString(), '2026-10-09T18:30:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-10-10T18:30:00.000Z');
});

test('filterOrdersForIstDay includes/excludes the exact boundary instants', () => {
  const now = new Date('2026-10-11T03:30:00.000Z'); // IST today = 2026-10-11
  const orders = [
    { createdAt: '2026-10-10T18:30:00.000Z' }, // start boundary      -> include
    { createdAt: '2026-10-11T18:29:59.999Z' }, // just before end      -> include
    { createdAt: '2026-10-10T18:29:59.999Z' }, // previous IST day     -> exclude
    { createdAt: '2026-10-11T18:30:00.000Z' }, // next IST day (end)   -> exclude
  ];
  const today = filterOrdersForIstDay(orders, now);
  assert.equal(today.length, 2);
  assert.equal(today[0].createdAt, '2026-10-10T18:30:00.000Z');
  assert.equal(today[1].createdAt, '2026-10-11T18:29:59.999Z');
});

test('filterOrdersForIstDay ignores absent or invalid createdAt', () => {
  const now = new Date('2026-10-11T03:30:00.000Z');
  const list = filterOrdersForIstDay(
    [{ createdAt: '2026-10-10T19:00:00.000Z' }, {}, { createdAt: 'not-a-date' }, null],
    now,
  );
  assert.equal(list.length, 1);
});

test('computeTodayStats reports only the IST day, revenue excluding cancelled', () => {
  const now = new Date('2026-10-11T03:30:00.000Z'); // IST today = 2026-10-11
  const orders = [
    { createdAt: '2026-10-10T19:00:00.000Z', status: 'COMPLETED', totalAmount: 250 }, // 00:30 IST -> today
    { createdAt: '2026-10-10T18:40:00.000Z', status: 'PLACED', totalAmount: 100 }, // 00:10 IST -> today
    { createdAt: '2026-10-10T18:29:00.000Z', status: 'COMPLETED', totalAmount: 999 }, // 23:59 IST yesterday -> excluded
    { createdAt: '2026-10-11T17:00:00.000Z', status: 'CANCELLED', totalAmount: 500 }, // 22:30 IST today, cancelled
  ];
  const stats = computeTodayStats(orders, now);
  assert.equal(stats.totalOrders, 3); // cancelled still counts as an order placed today
  assert.equal(stats.pendingOrders, 1);
  assert.equal(stats.completedOrders, 1);
  assert.equal(stats.totalRevenue, 350); // 250 + 100; cancelled 500 excluded
});

test('computeTodayStats handles empty and missing input safely', () => {
  const now = new Date('2026-10-11T03:30:00.000Z');
  assert.deepEqual(computeTodayStats([], now), {
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
  });
  assert.deepEqual(computeTodayStats(null, now), {
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
  });
});

test('buildTodayTrend returns 24 hourly buckets, grouping by IST hour', () => {
  const now = new Date('2026-10-11T03:30:00.000Z'); // 09:00 IST on 2026-10-11
  const orders = [
    { createdAt: '2026-10-10T18:40:00.000Z', status: 'PLACED', totalAmount: 100 }, // 00:10 IST -> hour 0
    { createdAt: '2026-10-10T19:00:00.000Z', status: 'COMPLETED', totalAmount: 250 }, // 00:30 IST -> hour 0
    { createdAt: '2026-10-11T17:00:00.000Z', status: 'CANCELLED', totalAmount: 500 }, // 22:30 IST -> hour 22
    { createdAt: '2026-10-10T18:29:00.000Z', status: 'COMPLETED', totalAmount: 999 }, // yesterday -> excluded
  ];
  const trend = buildTodayTrend(orders, now);
  assert.equal(trend.length, 24);
  assert.equal(trend[0].key, '2026-10-11:00');
  assert.equal(trend[0].hour, 0);
  assert.equal(trend[0].count, 2); // both orders placed before 01:00 IST
  assert.equal(trend[0].revenue, 350); // 100 + 250, no cancellation in this hour
  assert.equal(trend[22].count, 1);
  assert.equal(trend[22].revenue, 0); // cancelled order contributes no revenue
  assert.equal(trend[23].count, 0);
  assert.equal(trend[23].revenue, 0);
});

test('buildTodayTrend handles empty orders and bad dates', () => {
  const now = new Date('2026-10-11T03:30:00.000Z');
  const trend = buildTodayTrend([{ createdAt: null }, { createdAt: 'bad' }], now);
  assert.equal(trend.length, 24);
  const total = trend.reduce(function (sum, b) {
    return sum + b.count;
  }, 0);
  assert.equal(total, 0);
});

test('popular items aggregates by normalized name, sorted by quantity', () => {
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

test('computeTodayPopularItems keeps only today + non-cancelled and ranks by quantity', () => {
  const now = new Date('2026-10-11T03:30:00.000Z'); // IST today = 2026-10-11
  const orders = [
    {
      createdAt: '2026-10-10T19:00:00.000Z', // today 00:30 IST
      status: 'COMPLETED',
      items: [
        { name: 'Butter Chicken', price: 300, quantity: 2 },
        { name: 'Naan', price: 40, quantity: 3 },
      ],
    },
    {
      createdAt: '2026-10-10T18:50:00.000Z', // today 00:20 IST
      status: 'PLACED',
      items: [{ name: 'Naan', price: 40, quantity: 2 }],
    },
    {
      createdAt: '2026-10-11T17:00:00.000Z', // today 22:30 IST, CANCELLED
      status: 'CANCELLED',
      items: [{ name: 'Naan', price: 40, quantity: 100 }],
    },
    {
      createdAt: '2026-10-10T18:29:00.000Z', // yesterday IST -> ignored
      status: 'COMPLETED',
      items: [{ name: 'Yesterday Special', price: 1, quantity: 999 }],
    },
  ];
  const popular = computeTodayPopularItems(orders, now, 5);
  assert.equal(popular.length, 2);
  assert.equal(popular[0].name, 'Naan');
  assert.equal(popular[0].quantitySold, 5); // 3 + 2; the 100 from the cancelled order is excluded
  assert.equal(popular[1].name, 'Butter Chicken');
  assert.equal(popular[1].quantitySold, 2);
});

test('computeTodayPopularItems returns empty for empty/non-array input', () => {
  const now = new Date('2026-10-11T03:30:00.000Z');
  assert.deepEqual(computeTodayPopularItems([], now, 5), []);
  assert.deepEqual(computeTodayPopularItems(null, now, 5), []);
});

test('low-stock threshold: above 30 excluded, exactly 30 and below included', () => {
  assert.equal(
    hasLowRemainingStock({ name: 'A', isActive: true, remainingPercent: 31 }),
    false,
  );
  assert.equal(
    hasLowRemainingStock({ name: 'B', isActive: true, remainingPercent: 30 }),
    true,
  );
  assert.equal(
    hasLowRemainingStock({ name: 'C', isActive: true, remainingPercent: 29.5 }),
    true,
  );
  assert.equal(
    hasLowRemainingStock({ name: 'C2', isActive: true, remainingPercent: 0 }),
    true,
  );
});

test('low-stock threshold: inactive and items without a baseline never alert', () => {
  assert.equal(
    hasLowRemainingStock({ name: 'D', isActive: false, remainingPercent: 20 }),
    false,
  );
  assert.equal(
    hasLowRemainingStock({ name: 'E', isActive: true, remainingPercent: null }),
    false,
  );
  assert.equal(hasLowRemainingStock({ name: 'F', isActive: true }), false);
  assert.equal(hasLowRemainingStock(null), false);
});

test('low-stock threshold: active default (missing isActive) and numeric strings', () => {
  // Legacy/raw rows may lack isActive; treat them as active (model default true).
  assert.equal(hasLowRemainingStock({ name: 'G', remainingPercent: 20 }), true);
  // The API returns numbers; a numeric string is not accepted.
  assert.equal(hasLowRemainingStock({ name: 'H', isActive: true, remainingPercent: '30' }), false);
});

test('low-stock threshold honours an explicit max remaining percent', () => {
  assert.equal(
    hasLowRemainingStock({ name: 'I', isActive: true, remainingPercent: 35 }, 40),
    true,
  );
  assert.equal(
    hasLowRemainingStock({ name: 'J', isActive: true, remainingPercent: 35 }, 30),
    false,
  );
});

test('filterLowStockAlerts keeps only active 30%-or-less rows and tolerates bad input', () => {
  const rows = [
    { name: 'A', isActive: true, remainingPercent: 40 },
    { name: 'B', isActive: true, remainingPercent: 30 },
    { name: 'C', isActive: true, remainingPercent: 12 },
    { name: 'D', isActive: false, remainingPercent: 10 },
    { name: 'E', isActive: true, remainingPercent: null },
    null,
  ];
  const alerts = filterLowStockAlerts(rows);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].name, 'B');
  assert.equal(alerts[1].name, 'C');
  assert.deepEqual(filterLowStockAlerts(null), []);
  assert.deepEqual(filterLowStockAlerts('nope'), []);
});

test('formatCurrency/formatNumber do not emit NaN', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber('bad'), '0');
  assert.equal(formatNumber(26743.1), '26,743');
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatCurrency(undefined), '\u20B90');
  assert.equal(formatCurrency(2500), '\u20B92,500');
});