'use strict';

// Pure, dependency-free dashboard calculations.
//
// This module intentionally uses CommonJS (`module.exports`) with no React Native
// imports so the functions can be unit-tested with Node's built-in test runner
// (see dashboardMetrics.test.js). Babel/Metro interop lets screens import these
// as normal named imports.
//
// "Today" is defined in India Standard Time (Asia/Kolkata, a fixed UTC+05:30
// offset with no DST). The backend stores order timestamps in UTC; we shift by
// the constant IST offset instead of the device's own timezone so tablet
// results match the restaurant's business day regardless of device location.

const PENDING_STATUSES = ['PENDING', 'PLACED'];
const COMPLETED_STATUSES = ['COMPLETED'];
const CANCELLED_STATUSES = ['CANCELLED'];

// Asia/Kolkata is UTC+05:30 (no DST), so no timezone library is needed.
const IST_UTC_OFFSET_MINUTES = 5 * 60 + 30;
const IST_OFFSET_MS = IST_UTC_OFFSET_MINUTES * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Low-stock alert rule from the owner requirement: only when an ACTIVE item has
// 30% or less of its current cycle's stock remaining (i.e. >= 70% consumed).
// The backend /inventory/alerts flag uses the same 70%-consumed boundary
// (USAGE_ALERT_THRESHOLD server-side); the dashboard re-checks the exact
// remaining-percent rule below so only 30%-or-less items are surfaced.
const LOW_STOCK_MAX_REMAINING_PERCENT = 30;

function normalizeStatus(status) {
  if (typeof status !== 'string') {
    return '';
  }
  return status.trim().toUpperCase();
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function isPendingOrder(order) {
  return (
    order != null &&
    PENDING_STATUSES.indexOf(normalizeStatus(order.status)) !== -1
  );
}

function isCompletedOrder(order) {
  return (
    order != null &&
    COMPLETED_STATUSES.indexOf(normalizeStatus(order.status)) !== -1
  );
}

function isCancelledOrder(order) {
  return (
    order != null &&
    CANCELLED_STATUSES.indexOf(normalizeStatus(order.status)) !== -1
  );
}

// Both normalizations accept legacy 'Pending'/'Completed'/'Cancelled' via
// normalizeStatus, so legacy orders are counted with the new status system.

// Calendar-day key of a timestamp expressed in IST wall clock (YYYY-MM-DD).
function istDateKey(date) {
  const d =
    date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return (
    shifted.getUTCFullYear() +
    '-' +
    pad2(shifted.getUTCMonth() + 1) +
    '-' +
    pad2(shifted.getUTCDate())
  );
}

// Start (inclusive) and end (exclusive) UTC instants of the current IST day.
// Example: 2026-10-10T18:30:00.000Z == 2026-10-11T00:00:00.000+05:30, so the
// boundary instant exactly at 18:30Z belongs to the 10-11 IST day.
function istDayBounds(now) {
  const base =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const shifted = new Date(base.getTime() + IST_OFFSET_MS);
  const utcMidnightOfIstDay = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const start = new Date(utcMidnightOfIstDay - IST_OFFSET_MS);
  const end = new Date(start.getTime() + MS_PER_DAY);
  return {start: start, end: end};
}

// Orders whose createdAt falls inside the current IST day (inclusive start,
// exclusive end). Invalid/missing createdAt orders are never selected.
function filterOrdersForIstDay(orders, now) {
  const list = Array.isArray(orders) ? orders : [];
  const bounds = istDayBounds(now);
  const start = bounds.start.getTime();
  const end = bounds.end.getTime();
  return list.filter(function (order) {
    if (order == null || typeof order !== 'object' || !order.createdAt) {
      return false;
    }
    const time = new Date(order.createdAt).getTime();
    if (Number.isNaN(time)) {
      return false;
    }
    return time >= start && time < end;
  });
}

// Non-cancelled orders only. Used for revenue and sold-item ranking where a
// cancelled order must never be counted.
function filterNonCancelledOrders(orders) {
  const list = Array.isArray(orders) ? orders : [];
  return list.filter(function (order) {
    return !isCancelledOrder(order);
  });
}

// Total Orders: every order of the provided list (the dashboard feeds it
// only today's IST orders; a cancelled order is still "an order placed today"
// and is therefore counted in the total, but never in revenue).
// Pending Orders: PENDING + PLACED (cancelled is never pending).
// Completed Orders: COMPLETED (+ legacy "Completed" after normalization).
// Total Revenue: sum of totalAmount for non-cancelled orders only.
function computeStats(orders) {
  const list = Array.isArray(orders) ? orders : [];
  let pendingOrders = 0;
  let completedOrders = 0;
  let totalRevenue = 0;

  for (let i = 0; i < list.length; i++) {
    const order = list[i];
    if (order == null || typeof order !== 'object') {
      continue;
    }
    if (isPendingOrder(order)) {
      pendingOrders += 1;
    }
    if (isCompletedOrder(order)) {
      completedOrders += 1;
    }
    if (!isCancelledOrder(order)) {
      totalRevenue += toNumber(order.totalAmount);
    }
  }

  return {
    totalOrders: list.length,
    pendingOrders: pendingOrders,
    completedOrders: completedOrders,
    totalRevenue: totalRevenue,
  };
}

// Today's call on the generic stats above: restricts to the IST day first.
function computeTodayStats(orders, now) {
  return computeStats(filterOrdersForIstDay(orders, now));
}

// Hourly order + revenue profile for the current IST day.
// Returns 24 buckets (one per IST hour, oldest first); only hours with orders
// ever carry a non-zero value. Count includes every order placed in the hour;
// revenue sums non-cancelled orders only (same definition as Total Revenue).
function buildTodayTrend(orders, now) {
  const today = filterOrdersForIstDay(orders, now);
  const dayKey = istDateKey(now);
  const buckets = [];
  for (let hour = 0; hour < 24; hour++) {
    buckets.push({
      key: dayKey + ':' + pad2(hour),
      label: pad2(hour) + ':00',
      hour: hour,
      dayKey: dayKey,
      count: 0,
      revenue: 0,
    });
  }
  for (let i = 0; i < today.length; i++) {
    const order = today[i];
    if (order == null || typeof order !== 'object' || !order.createdAt) {
      continue;
    }
    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) {
      continue;
    }
    const shifted = new Date(created.getTime() + IST_OFFSET_MS);
    const hour = shifted.getUTCHours();
    if (hour < 0 || hour > 23 || typeof buckets[hour] !== 'object') {
      continue;
    }
    buckets[hour].count += 1;
    if (!isCancelledOrder(order)) {
      buckets[hour].revenue += toNumber(order.totalAmount);
    }
  }
  return buckets;
}

function normalizeItemName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  return name.trim().replace(/\s+/g, ' ');
}

// Top items by quantity sold, ties broken by revenue then name. Pure
// aggregator over the provided list; cancellation filtering must be applied by
// the caller (see computeTodayPopularItems). Returns [{ name, quantitySold,
// revenue }].
function computePopularItems(orders, limit) {
  const list = Array.isArray(orders) ? orders : [];
  const max = typeof limit === 'number' && limit > 0 ? limit : 5;
  const map = {};

  for (let i = 0; i < list.length; i++) {
    const order = list[i];
    if (order == null || typeof order !== 'object' || !Array.isArray(order.items)) {
      continue;
    }
    for (let j = 0; j < order.items.length; j++) {
      const item = order.items[j];
      if (item == null || typeof item !== 'object') {
        continue;
      }
      const display = normalizeItemName(item.name);
      if (!display) {
        continue;
      }
      const key = display.toUpperCase();
      let quantity = toNumber(item.quantity);
      let price = toNumber(item.price);
      if (quantity < 0) {
        quantity = 0;
      }
      if (price < 0) {
        price = 0;
      }
      if (!map[key]) {
        map[key] = {name: display, quantitySold: 0, revenue: 0};
      }
      map[key].quantitySold += quantity;
      map[key].revenue += price * quantity;
    }
  }

  const result = Object.keys(map).map(function (k) {
    return map[k];
  });

  result.sort(function (a, b) {
    if (b.quantitySold !== a.quantitySold) {
      return b.quantitySold - a.quantitySold;
    }
    if (b.revenue !== a.revenue) {
      return b.revenue - a.revenue;
    }
    return a.name.localeCompare(b.name);
  });

  return result.slice(0, max);
}

// Today's most popular items: only orders placed in the current IST day, and
// only non-cancelled orders (a cancelled order sold nothing). Ranked by the
// actual quantity ordered, ties by revenue then name.
function computeTodayPopularItems(orders, now, limit) {
  const today = filterOrdersForIstDay(orders, now);
  return computePopularItems(filterNonCancelledOrders(today), limit);
}

// Low-stock alert predicate for a single inventory row. TRUE only when the row
// is an ACTIVE item whose remaining-percent is a real, finite number <= the
// threshold (30 by default = "30% or less of its current stock remaining",
// equivalently >= 70% consumed). Rows missing a remaining-percent (no open
// cycle) or explicitly inactive never alert.
function hasLowRemainingStock(row, maxRemainingPercent) {
  if (row == null || typeof row !== 'object') {
    return false;
  }
  if (row.isActive === false) {
    return false;
  }
  const remaining = row.remainingPercent;
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) {
    return false;
  }
  const threshold =
    typeof maxRemainingPercent === 'number' &&
    Number.isFinite(maxRemainingPercent)
      ? maxRemainingPercent
      : LOW_STOCK_MAX_REMAINING_PERCENT;
  return remaining <= threshold;
}

// Reduce a list of inventory rows (e.g. from GET /api/inventory/alerts) to the
// active items with 30% or less remaining. Non-array input yields [].
function filterLowStockAlerts(rows, maxRemainingPercent) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter(function (row) {
    return hasLowRemainingStock(row, maxRemainingPercent);
  });
}

function formatNumber(value) {
  const rounded = Math.round(toNumber(value));
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCurrency(value) {
  return '\u20B9' + formatNumber(value);
}

module.exports = {
  IST_UTC_OFFSET_MINUTES: IST_UTC_OFFSET_MINUTES,
  LOW_STOCK_MAX_REMAINING_PERCENT: LOW_STOCK_MAX_REMAINING_PERCENT,
  normalizeStatus: normalizeStatus,
  toNumber: toNumber,
  isPendingOrder: isPendingOrder,
  isCompletedOrder: isCompletedOrder,
  isCancelledOrder: isCancelledOrder,
  computeStats: computeStats,
  istDateKey: istDateKey,
  istDayBounds: istDayBounds,
  filterOrdersForIstDay: filterOrdersForIstDay,
  filterNonCancelledOrders: filterNonCancelledOrders,
  computeTodayStats: computeTodayStats,
  buildTodayTrend: buildTodayTrend,
  computePopularItems: computePopularItems,
  computeTodayPopularItems: computeTodayPopularItems,
  hasLowRemainingStock: hasLowRemainingStock,
  filterLowStockAlerts: filterLowStockAlerts,
  formatNumber: formatNumber,
  formatCurrency: formatCurrency,
};