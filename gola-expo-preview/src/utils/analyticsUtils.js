'use strict';

// Pure, dependency-free helpers for the Reviews & Analytics module.
// CommonJS (module.exports) with no React Native imports so the functions can
// be unit-tested with Node's built-in test runner (see analyticsUtils.test.js).
//
// Data sources (existing backend, read-only):
//   Order   -> { totalAmount (net, after discount), grossTotal (subtotal),
//                discountAmount, status, createdAt, ... }
//   Feedback -> { rating (1-5), message, tags[], userId: {name, mobile}|null,
//                orderId: {orderType, tableNumber}|null, createdAt }

const { toNumber, formatCurrency, formatNumber } = require('./dashboardMetrics');

const RANGE_OPTIONS = [
  { key: '1d', label: 'Today', days: 1 },
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
];

const CANCELLED = 'CANCELLED';

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toBaseDate(value) {
  const parsed = parseDate(value);
  return parsed || new Date();
}

function rangeDays(rangeKey) {
  const found = RANGE_OPTIONS.find(function (option) {
    return option.key === rangeKey;
  });
  return found ? found.days : 30;
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function localDateKey(date) {
  return (
    date.getFullYear() +
    '-' +
    pad2(date.getMonth() + 1) +
    '-' +
    pad2(date.getDate())
  );
}

function dayLabel(date) {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function isCancelledOrder(order) {
  if (!order || typeof order !== 'object' || typeof order.status !== 'string') {
    return false;
  }
  return order.status.trim().toUpperCase() === CANCELLED;
}

// Local midnight, (days - 1) days before the "now" day. Today = 1 day.
function rangeStart(rangeKey, now) {
  const base = toBaseDate(now);
  const days = rangeDays(rangeKey);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - (days - 1));
}

// Orders whose createdAt falls inside the selected range. Orders with a
// missing/invalid createdAt are excluded (they cannot be placed reliably).
function filterOrdersByRange(orders, rangeKey, now) {
  const list = Array.isArray(orders) ? orders : [];
  const startTime = rangeStart(rangeKey, now).getTime();
  return list.filter(function (order) {
    const date = parseDate(order && order.createdAt);
    return date !== null && date.getTime() >= startTime;
  });
}

// One bucket per calendar day, oldest first, including days with no orders.
function buildDailySales(orders, rangeKey, now) {
  const list = Array.isArray(orders) ? orders : [];
  const base = toBaseDate(now);
  const days = rangeDays(rangeKey);
  const buckets = [];
  const byKey = {};

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const key = localDateKey(day);
    const bucket = {
      key: key,
      label: dayLabel(day),
      orders: 0,
      revenue: 0,
    };
    byKey[key] = bucket;
    buckets.push(bucket);
  }

  for (let i = 0; i < list.length; i++) {
    const order = list[i];
    const date = parseDate(order && order.createdAt);
    if (date === null) {
      continue;
    }
    const bucket = byKey[localDateKey(date)];
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue += toNumber(order.totalAmount);
    }
  }

  return buckets;
}

// Analytics summary over the eligible-order set.
// Eligible orders = orders within range whose status is NOT CANCELLED.
//   totalRevenue = sum(totalAmount)  (net sales, after discounts)
//   grossSales   = sum(grossTotal)   (subtotal before discounts)
//   totalDiscount= sum(discountAmount)
//   avgOrderValue= totalRevenue / eligible order count (0 when none)
function computeAnalytics(orders, rangeKey, now) {
  const inRange = filterOrdersByRange(orders, rangeKey, now);
  const eligible = inRange.filter(function (order) {
    return !isCancelledOrder(order);
  });

  let totalRevenue = 0;
  let grossSales = 0;
  let totalDiscount = 0;

  for (let i = 0; i < eligible.length; i++) {
    const order = eligible[i];
    const gross =
      order && order.grossTotal != null ? order.grossTotal : order && order.totalAmount;
    totalRevenue += toNumber(order && order.totalAmount);
    grossSales += toNumber(gross);
    totalDiscount += toNumber(order && order.discountAmount);
  }

  const orderCount = eligible.length;
  const cancelledCount = inRange.length - orderCount;
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  return {
    totalRevenue: totalRevenue,
    grossSales: grossSales,
    totalDiscount: totalDiscount,
    orderCount: orderCount,
    cancelledCount: cancelledCount,
    totalInRange: inRange.length,
    avgOrderValue: avgOrderValue,
    dailySales: buildDailySales(eligible, rangeKey, now),
  };
}

function isValidRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 1 && rating <= 5;
}

// Average is computed only from ratings that are finite and within the schema's
// 1-5 range; everything else is ignored, not coerced.
function computeRatingStats(feedbacks) {
  const list = Array.isArray(feedbacks) ? feedbacks : [];
  const valid = list.filter(function (feedback) {
    return feedback && isValidRating(feedback.rating);
  });

  let sum = 0;
  for (let i = 0; i < valid.length; i++) {
    sum += Number(valid[i].rating);
  }
  const count = valid.length;
  const average = count > 0 ? sum / count : 0;

  const distribution = [5, 4, 3, 2, 1].map(function (stars) {
    return {
      stars: stars,
      count: valid.filter(function (feedback) {
        return Math.round(Number(feedback.rating)) === stars;
      }).length,
    };
  });

  return {
    average: average,
    count: count,
    total: list.length,
    distribution: distribution,
  };
}

function formatRating(value, count) {
  if (!(count > 0) || !Number.isFinite(Number(value))) {
    return '\u2014';
  }
  return Number(value).toFixed(1);
}

function reviewAuthor(feedback) {
  const user = feedback && feedback.userId;
  const name = user && typeof user.name === 'string' ? user.name.trim() : '';
  return name || 'Guest Customer';
}

function reviewMessage(feedback) {
  const message = feedback && feedback.message;
  return typeof message === 'string' ? message.trim() : '';
}

function reviewTags(feedback) {
  const tags = feedback && feedback.tags;
  return Array.isArray(tags)
    ? tags.filter(function (tag) {
        return typeof tag === 'string' && tag.trim() !== '';
      })
    : [];
}

function reviewOrderLabel(feedback) {
  const order = feedback && feedback.orderId;
  if (!order || typeof order !== 'object') {
    return '';
  }
  const parts = [];
  if (typeof order.orderType === 'string' && order.orderType.trim()) {
    parts.push(order.orderType.trim());
  }
  if (order.tableNumber != null && String(order.tableNumber).trim()) {
    parts.push('Table ' + String(order.tableNumber).trim());
  }
  return parts.join(' \u2022 ');
}

module.exports = {
  RANGE_OPTIONS: RANGE_OPTIONS,
  rangeDays: rangeDays,
  localDateKey: localDateKey,
  isCancelledOrder: isCancelledOrder,
  rangeStart: rangeStart,
  filterOrdersByRange: filterOrdersByRange,
  buildDailySales: buildDailySales,
  computeAnalytics: computeAnalytics,
  computeRatingStats: computeRatingStats,
  formatRating: formatRating,
  reviewAuthor: reviewAuthor,
  reviewMessage: reviewMessage,
  reviewTags: reviewTags,
  reviewOrderLabel: reviewOrderLabel,
  formatCurrency: formatCurrency,
  formatNumber: formatNumber,
};
