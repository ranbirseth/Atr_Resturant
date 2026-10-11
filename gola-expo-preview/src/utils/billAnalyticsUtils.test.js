'use strict';

// Focused unit tests for the bill-based Reviews & Analytics helpers.
// Run with: node --test src/utils/billAnalyticsUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BILL_RANGE_OPTIONS,
  rangeDays,
  istDateKey,
  istDayStartMs,
  istDayEndMs,
  rangeStartMs,
  rangeEndMs,
  normalizeStatus,
  isRecognizedBill,
  isVoidedBill,
  billAudience,
  billOrigin,
  filterBillsByRange,
  buildDailyBillSales,
  computeBillAnalytics,
} = require('./billAnalyticsUtils');

// IST = UTC+05:30, fixed. `ist(day, msIntoDay)` is the UTC instant of that
// number of milliseconds into the IST calendar day `day` of Oct 2026.
function ist(day, msIntoDay) {
  return Date.UTC(2026, 9, day) - 330 * 60 * 1000 + msIntoDay;
}
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// Fixed "now": 9 Oct 2026, 20:00 IST.
const NOW = new Date(ist(9, 20 * HOUR));

function bill(fields) {
  const paid = fields.paid !== undefined ? fields.paid : 0;
  return {
    _id: fields.id,
    createdAt: fields.at,
    status: fields.status || 'OPEN',
    totalAmount: fields.total,
    amountPaid: paid,
    balanceDue: fields.due !== undefined ? fields.due : fields.total - paid,
    origin: fields.origin,
    audience: fields.audience,
  };
}

const BILLS = [
  bill({ id: 'todayOpen', at: new Date(ist(9, 10 * HOUR)), status: 'OPEN', origin: 'SESSION', audience: 'CUSTOMER', total: 100, paid: 40 }),
  bill({ id: 'todayPosPaid', at: new Date(ist(9, 11 * HOUR)), status: 'SETTLED', origin: 'POS', audience: 'CUSTOMER', total: 200, paid: 200 }),
  bill({ id: 'todayStaff', at: new Date(ist(9, 12 * HOUR)), status: 'SETTLED', origin: 'SESSION', audience: 'STAFF', total: 300, paid: 300 }),
  bill({ id: 'voidedToday', at: new Date(ist(9, 13 * HOUR)), status: 'VOID', origin: 'SESSION', audience: 'CUSTOMER', total: 500 }),
  bill({ id: 'voidingToday', at: new Date(ist(9, 14 * HOUR)), status: 'VOIDING', origin: 'POS', audience: 'STAFF', total: 600 }),
  bill({ id: 'yesterday', at: new Date(ist(8, 23 * HOUR)), status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 50, paid: 50 }),
  // Legacy: no origin/audience -> SESSION / CUSTOMER.
  bill({ id: 'legacy', at: new Date(ist(9, 15 * HOUR)), status: 'OPEN', total: 70 }),
  // In the 30-day window but outside 7-day.
  bill({ id: 'oct2', at: new Date(ist(2, 9 * HOUR)), status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 10, paid: 10 }),
  // Exactly on the 30-day start boundary (Sep 9 18:30 UTC = Oct 9 00:00 IST
  // minus 29 days => Sep 9 18:30 UTC inclusive).
  bill({ id: 'sepBoundaryIn', at: new Date(Date.UTC(2026, 8, 9, 18, 30, 0)), status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 12, paid: 12 }),
  bill({ id: 'sepBoundaryOut', at: new Date(Date.UTC(2026, 8, 9, 18, 29, 59, 999)), status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 13, paid: 13 }),
  bill({ id: 'sepOld', at: new Date(Date.UTC(2026, 8, 8, 10, 0, 0)), status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 999, paid: 999 }),
  // Undatable -> never bucketed.
  bill({ id: 'badDate', at: 'not-a-date', status: 'SETTLED', origin: 'SESSION', audience: 'CUSTOMER', total: 500 }),
];

const IDS = function (list) {
  return list.map(function (entry) {
    return entry._id;
  });
};

test('BILL_RANGE_OPTIONS exposes Today / 7 Days / 30 Days', () => {
  assert.deepEqual(
    BILL_RANGE_OPTIONS.map((r) => ({ key: r.key, label: r.label, days: r.days })),
    [
      { key: '1d', label: 'Today', days: 1 },
      { key: '7d', label: '7 Days', days: 7 },
      { key: '30d', label: '30 Days', days: 30 },
    ],
  );
  assert.equal(rangeDays('1d'), 1);
  assert.equal(rangeDays('7d'), 7);
  assert.equal(rangeDays('30d'), 30);
  assert.equal(rangeDays('nope'), 30);
});

test('IST day keying is exact across the 05:30 offset', () => {
  // 23:59:59.999 IST is still Oct 9; 00:00:00.000 IST is Oct 10.
  assert.equal(istDateKey(new Date(ist(9, DAY - 1))), '2026-10-09');
  assert.equal(istDateKey(new Date(ist(10, 0))), '2026-10-10');
  // A raw UTC instant that is already the next IST day (19:00 UTC = 00:30 IST).
  assert.equal(istDateKey(new Date(Date.UTC(2026, 9, 8, 19, 0, 0))), '2026-10-09');
  // Invalid falls back to "now".
  assert.equal(istDateKey(null), istDateKey(new Date()));
});

test('range boundaries are exact IST instants', () => {
  assert.equal(istDayStartMs(NOW), ist(9, 0));
  assert.equal(istDayEndMs(NOW), ist(9, DAY - 1));
  assert.equal(rangeStartMs('1d', NOW), ist(9, 0));
  assert.equal(rangeEndMs('1d', NOW), ist(9, DAY - 1));
  assert.equal(rangeStartMs('7d', NOW), ist(3, 0));
  assert.equal(rangeEndMs('7d', NOW), ist(9, DAY - 1));
  assert.equal(rangeStartMs('30d', NOW), Date.UTC(2026, 8, 9, 18, 30, 0));
});

test('status classification: OPEN+SETTLED recognized, VOIDING/VOID voided', () => {
  assert.equal(isRecognizedBill({ status: 'OPEN' }), true);
  assert.equal(isRecognizedBill({ status: 'SETTLED' }), true);
  assert.equal(isRecognizedBill({ status: 'open' }), true);
  assert.equal(isRecognizedBill({ status: 'VOIDING' }), false);
  assert.equal(isRecognizedBill({ status: 'VOID' }), false);
  assert.equal(isRecognizedBill({}), false);

  assert.equal(isVoidedBill({ status: 'VOIDING' }), true);
  assert.equal(isVoidedBill({ status: 'VOID' }), true);
  assert.equal(isVoidedBill({ status: 'SETTLED' }), false);
  assert.equal(normalizeStatus({ status: 'void' }), 'VOID');
});

test('legacy bills default to CUSTOMER / SESSION', () => {
  assert.equal(billAudience({ origin: 'SESSION' }), 'CUSTOMER');
  assert.equal(billAudience({ audience: 'STAFF' }), 'STAFF');
  assert.equal(billAudience({ audience: 'staff' }), 'STAFF');
  assert.equal(billAudience({ audience: 'GUEST' }), 'CUSTOMER');
  assert.equal(billOrigin({ origin: 'POS' }), 'POS');
  assert.equal(billOrigin({ origin: 'SESSION' }), 'SESSION');
  assert.equal(billOrigin({}), 'SESSION');
});

test('filterBillsByRange keeps IST-day membership and drops undatable bills', () => {
  const oneDay = IDS(filterBillsByRange(BILLS, '1d', NOW)).sort();
  assert.deepEqual(oneDay, ['legacy', 'todayOpen', 'todayPosPaid', 'todayStaff', 'voidedToday', 'voidingToday'].sort());

  const sevenDay = IDS(filterBillsByRange(BILLS, '7d', NOW)).sort();
  assert.deepEqual(sevenDay, ['legacy', 'todayOpen', 'todayPosPaid', 'todayStaff', 'voidedToday', 'voidingToday', 'yesterday'].sort());

  const thirtyDay = IDS(filterBillsByRange(BILLS, '30d', NOW)).sort();
  assert.deepEqual(thirtyDay, [
    'legacy', 'oct2', 'sepBoundaryIn', 'todayOpen', 'todayPosPaid', 'todayStaff', 'voidedToday', 'voidingToday', 'yesterday',
  ].sort());
});

test('daily buckets include every IST day including zero-sales days', () => {
  const week = buildDailyBillSales(BILLS, '7d', NOW);
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((d) => d.key), [
    '2026-10-03',
    '2026-10-04',
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
  ]);
  // Zero-sales days stay present with $0.
  assert.equal(week[0].revenue, 0);
  assert.equal(week[0].orders, 0);
  assert.equal(week[4].revenue, 0);
  // Oct 8 (yesterday) and Oct 9 recognized sales.
  assert.equal(week[5].key, '2026-10-08');
  assert.equal(week[5].revenue, 50);
  assert.equal(week[5].orders, 1);
  assert.equal(week[6].key, '2026-10-09');
  assert.equal(week[6].revenue, 670);
  assert.equal(week[6].orders, 4);

  const today = buildDailyBillSales(BILLS, '1d', NOW);
  assert.equal(today.length, 1);
  assert.equal(today[0].revenue, 670);
  assert.equal(today[0].orders, 4);
});

test('computeBillAnalytics 1d: revenue/count/AOV with OPEN counted, VOID excluded', () => {
  const result = computeBillAnalytics(BILLS, '1d', NOW);
  assert.equal(result.totalBills, 6);
  assert.equal(result.recognizedBills, 4);
  assert.equal(result.totalRevenue, 670);
  assert.equal(result.amountPaid, 540);
  assert.equal(result.balanceDue, 130);
  assert.equal(result.voidedBills, 2);
  assert.equal(result.voidedTotal, 1100);
  assert.equal(result.avgOrderValue, 167.5);
  assert.equal(result.from.getTime(), ist(9, 0));
  assert.equal(result.to.getTime(), ist(9, DAY - 1));
});

test('computeBillAnalytics 7d includes yesterday, still excludes voids from revenue', () => {
  const result = computeBillAnalytics(BILLS, '7d', NOW);
  assert.equal(result.totalBills, 7);
  assert.equal(result.recognizedBills, 5);
  assert.equal(result.totalRevenue, 720);
  assert.equal(result.voidedBills, 2);
  assert.equal(result.voidedTotal, 1100);
  assert.equal(result.avgOrderValue, 144);
  const oct8 = result.dailySales.find((d) => d.key === '2026-10-08');
  assert.equal(oct8.revenue, 50);
});

test('computeBillAnalytics 30d keeps the IST boundary bills and drops those just outside', () => {
  const result = computeBillAnalytics(BILLS, '30d', NOW);
  assert.equal(result.totalBills, 9);
  assert.equal(result.recognizedBills, 7);
  assert.equal(result.totalRevenue, 742);
  assert.equal(result.voidedBills, 2);
  assert.equal(result.dailySales.length, 30);
});

test('CUSTOMER/STAFF and SESSION/POS breakdowns report counts and amounts separately', () => {
  const result = computeBillAnalytics(BILLS, '1d', NOW);

  const customer = result.byAudience.find((x) => x.audience === 'CUSTOMER');
  assert.deepEqual(
    { bills: customer.bills, recognized: customer.recognized, voided: customer.voided, revenue: customer.revenue },
    { bills: 4, recognized: 3, voided: 1, revenue: 370 },
  );
  const staff = result.byAudience.find((x) => x.audience === 'STAFF');
  assert.deepEqual(
    { bills: staff.bills, recognized: staff.recognized, voided: staff.voided, revenue: staff.revenue },
    { bills: 2, recognized: 1, voided: 1, revenue: 300 },
  );

  const session = result.byOrigin.find((x) => x.origin === 'SESSION');
  assert.deepEqual(
    { bills: session.bills, recognized: session.recognized, revenue: session.revenue },
    { bills: 4, recognized: 3, revenue: 470 },
  );
  const pos = result.byOrigin.find((x) => x.origin === 'POS');
  assert.deepEqual(
    { bills: pos.bills, recognized: pos.recognized, revenue: pos.revenue },
    { bills: 2, recognized: 1, revenue: 200 },
  );

  // The legacy bill is bucketed as CUSTOMER + SESSION, never dropped.
  const seven = computeBillAnalytics(BILLS, '7d', NOW);
  const session7 = seven.byOrigin.find((x) => x.origin === 'SESSION');
  const customer7 = seven.byAudience.find((x) => x.audience === 'CUSTOMER');
  assert.equal(customer7.recognized, 4);
  assert.equal(session7.recognized, 4);
});

test('computeBillAnalytics is empty-safe (no divide by zero, zero buckets kept)', () => {
  const result = computeBillAnalytics([], '30d', NOW);
  assert.equal(result.totalBills, 0);
  assert.equal(result.recognizedBills, 0);
  assert.equal(result.totalRevenue, 0);
  assert.equal(result.avgOrderValue, 0);
  assert.equal(result.dailySales.length, 30);
  assert.equal(result.dailySales[0].revenue, 0);
  result.byAudience.forEach((x) => assert.equal(x.revenue, 0));
  result.byOrigin.forEach((x) => assert.equal(x.revenue, 0));
});