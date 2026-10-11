'use strict';

// Pure, dependency-free helpers for the bill-based Reviews & Analytics module
// (Phase 3). CommonJS with no React Native imports so the functions can be
// unit-tested with Node's built-in test runner (see billAnalyticsUtils.test.js).
//
// Data source (read-only):
//   Bill DTOs from GET /api/billing/bills ->
//     { createdAt, status, totalAmount, amountPaid, balanceDue, origin,
//       audience, ... }  (origin/audience already defaulted server-side:
//       legacy bills -> SESSION / CUSTOMER).
//
// Reporting rules baked in here (owner-approved):
//   - Bills are the financial source of truth. Source-order revenue is never
//     added to bill revenue.
//   - A bill counts as generated the moment it is created: OPEN and SETTLED
//     bills are recognized revenue. VOIDING/VOID bills are excluded from
//     revenue and reported separately as voided.
//   - AOV = recognized bill revenue / recognized bill count. It is NEVER bill
//     revenue divided by a raw order count.
//   - All bucketing uses the bill's createdAt reported in IST calendar days
//     (UTC+05:30, no DST): 1 Day = the current IST day, 7/30 Days = that day
//     plus the preceding 6/29 calendar days. Zero-sales days are kept.
//   - Amounts collected vs balance due are reported separately (partial
//     payments), not merged into revenue.

const { toNumber } = require('./dashboardMetrics');

const BILL_RANGE_OPTIONS = [
  { key: '1d', label: 'Today', days: 1 },
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
];

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const RECOGNIZED_STATUSES = { OPEN: true, SETTLED: true };
const VOIDED_STATUSES = { VOIDING: true, VOID: true };
const AUDIENCES = ['CUSTOMER', 'STAFF'];
const ORIGINS = ['SESSION', 'POS'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toBaseDate(value) {
  return parseDate(value) || new Date();
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function rangeDays(rangeKey) {
  const found = BILL_RANGE_OPTIONS.find(function (option) {
    return option.key === rangeKey;
  });
  return found ? found.days : 30;
}

// 'YYYY-MM-DD' of the IST calendar day containing `value`.
function istDateKey(value) {
  const date = toBaseDate(value);
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return (
    shifted.getUTCFullYear() +
    '-' +
    pad2(shifted.getUTCMonth() + 1) +
    '-' +
    pad2(shifted.getUTCDate())
  );
}

// UTC instant of 00:00:00.000 IST for the IST day containing `value`.
function istDayStartMs(value) {
  const parts = istDateKey(value).split('-');
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) - IST_OFFSET_MS;
}

// UTC instant of 23:59:59.999 IST for the IST day containing `value`.
function istDayEndMs(value) {
  return istDayStartMs(value) + DAY_MS - 1;
}

// IST window for the range: N calendar days ending with today (IST).
function rangeStartMs(rangeKey, now) {
  return istDayStartMs(now) - (rangeDays(rangeKey) - 1) * DAY_MS;
}

function rangeEndMs(rangeKey, now) {
  return istDayEndMs(now);
}

function normalizeStatus(bill) {
  return String((bill && bill.status) || '').trim().toUpperCase();
}

function isRecognizedBill(bill) {
  return RECOGNIZED_STATUSES[normalizeStatus(bill)] === true;
}

function isVoidedBill(bill) {
  return VOIDED_STATUSES[normalizeStatus(bill)] === true;
}

// Legacy bills carry no audience/origin, so any non-STAFF value counts as
// CUSTOMER (mirrors the server's orderAudience rule).
function billAudience(bill) {
  return bill && String(bill.audience).trim().toUpperCase() === 'STAFF' ? 'STAFF' : 'CUSTOMER';
}

// Legacy bills carry no origin, so any non-POS value counts as SESSION.
function billOrigin(bill) {
  return bill && String(bill.origin).trim().toUpperCase() === 'POS' ? 'POS' : 'SESSION';
}

// Bills whose createdAt falls inside the IST range (inclusive both ends).
// Bills with a missing/invalid createdAt are excluded (cannot be dated).
function filterBillsByRange(bills, rangeKey, now) {
  const list = Array.isArray(bills) ? bills : [];
  const start = rangeStartMs(rangeKey, now);
  const end = rangeEndMs(rangeKey, now);
  return list.filter(function (bill) {
    const date = parseDate(bill && bill.createdAt);
    return date !== null && date.getTime() >= start && date.getTime() <= end;
  });
}

// One bucket per IST calendar day in the range, oldest first. Buckets reflect
// recognized bills only (OPEN + SETTLED), consistent with revenue. Days with no
// sales stay in the list as zero buckets.
function buildDailyBillSales(bills, rangeKey, now) {
  const list = Array.isArray(bills) ? bills : [];
  const days = rangeDays(rangeKey);
  const start = rangeStartMs(rangeKey, now);
  const byKey = {};
  const buckets = [];

  for (let i = 0; i < days; i++) {
    const dayMs = start + i * DAY_MS;
    const key = istDateKey(new Date(dayMs));
    const parts = key.split('-');
    const bucket = {
      key: key,
      label: MONTHS_SHORT[Number(parts[1]) - 1] + ' ' + Number(parts[2]),
      revenue: 0,
      orders: 0,
    };
    byKey[key] = bucket;
    buckets.push(bucket);
  }

  for (let i = 0; i < list.length; i++) {
    const bill = list[i];
    if (!isRecognizedBill(bill)) {
      continue;
    }
    const date = parseDate(bill && bill.createdAt);
    if (date === null) {
      continue;
    }
    const bucket = byKey[istDateKey(date)];
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += toNumber(bill.totalAmount);
    }
  }

  return buckets;
}

// Bill analytics over the range. `now` is the reference instant (usually
// `new Date()`); only the IST calendar day of `now` and the range length matter.
function computeBillAnalytics(bills, rangeKey, now) {
  const inRange = filterBillsByRange(bills, rangeKey, now);

  const byAudience = AUDIENCES.map(function (audience) {
    return { audience: audience, bills: 0, recognized: 0, voided: 0, revenue: 0, amountPaid: 0, balanceDue: 0 };
  });
  const byOrigin = ORIGINS.map(function (origin) {
    return { origin: origin, bills: 0, recognized: 0, voided: 0, revenue: 0, amountPaid: 0, balanceDue: 0 };
  });
  const audienceIndex = { CUSTOMER: byAudience[0], STAFF: byAudience[1] };
  const originIndex = { SESSION: byOrigin[0], POS: byOrigin[1] };

  let recognizedBills = 0;
  let voidedBills = 0;
  let totalRevenue = 0;
  let amountPaid = 0;
  let balanceDue = 0;
  let voidedTotal = 0;

  for (let i = 0; i < inRange.length; i++) {
    const bill = inRange[i];
    const audience = billAudience(bill);
    const origin = billOrigin(bill);
    const aEntry = audienceIndex[audience];
    const oEntry = originIndex[origin];
    aEntry.bills += 1;
    oEntry.bills += 1;

    if (isRecognizedBill(bill)) {
      recognizedBills += 1;
      const revenue = toNumber(bill.totalAmount);
      const paid = toNumber(bill.amountPaid);
      const due = toNumber(bill.balanceDue);
      totalRevenue += revenue;
      amountPaid += paid;
      balanceDue += due;
      aEntry.recognized += 1;
      oEntry.recognized += 1;
      aEntry.revenue += revenue;
      oEntry.revenue += revenue;
      aEntry.amountPaid += paid;
      oEntry.amountPaid += paid;
      aEntry.balanceDue += due;
      oEntry.balanceDue += due;
    } else if (isVoidedBill(bill)) {
      voidedBills += 1;
      voidedTotal += toNumber(bill.totalAmount);
      aEntry.voided += 1;
      oEntry.voided += 1;
    }
  }

  const avgOrderValue = recognizedBills > 0 ? totalRevenue / recognizedBills : 0;

  return {
    rangeKey: rangeKey,
    from: new Date(rangeStartMs(rangeKey, now)),
    to: new Date(rangeEndMs(rangeKey, now)),
    totalBills: inRange.length,
    recognizedBills: recognizedBills,
    voidedBills: voidedBills,
    totalRevenue: totalRevenue,
    amountPaid: amountPaid,
    balanceDue: balanceDue,
    voidedTotal: voidedTotal,
    avgOrderValue: avgOrderValue,
    byAudience: byAudience,
    byOrigin: byOrigin,
    dailySales: buildDailyBillSales(inRange, rangeKey, now),
  };
}

module.exports = {
  BILL_RANGE_OPTIONS: BILL_RANGE_OPTIONS,
  rangeDays: rangeDays,
  istDateKey: istDateKey,
  istDayStartMs: istDayStartMs,
  istDayEndMs: istDayEndMs,
  rangeStartMs: rangeStartMs,
  rangeEndMs: rangeEndMs,
  normalizeStatus: normalizeStatus,
  isRecognizedBill: isRecognizedBill,
  isVoidedBill: isVoidedBill,
  billAudience: billAudience,
  billOrigin: billOrigin,
  filterBillsByRange: filterBillsByRange,
  buildDailyBillSales: buildDailyBillSales,
  computeBillAnalytics: computeBillAnalytics,
};