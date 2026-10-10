'use strict';

// Pure, dependency-free dashboard calculations.
//
// This module intentionally uses CommonJS (`module.exports`) with no React Native
// imports so the functions can be unit-tested with Node's built-in test runner
// (see dashboardMetrics.test.js). Babel/Metro interop lets screens import these
// as normal named imports.

const PENDING_STATUSES = ['PENDING', 'PLACED'];
const COMPLETED_STATUSES = ['COMPLETED'];
const CANCELLED_STATUSES = ['CANCELLED'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

// Total Orders: every order returned by the endpoint.
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

// Last seven local calendar days, oldest first, including today.
// Returns [{ key, label, dayOfMonth, count }].
function buildSevenDayTrend(orders, now) {
  const list = Array.isArray(orders) ? orders : [];
  const base =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  const counts = {};
  const buckets = [];

  for (let i = 6; i >= 0; i--) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const key = localDateKey(day);
    counts[key] = 0;
    buckets.push({
      key: key,
      label: WEEKDAYS[day.getDay()],
      dayOfMonth: day.getDate(),
      count: 0,
    });
  }

  for (let j = 0; j < list.length; j++) {
    const order = list[j];
    if (order == null || typeof order !== 'object' || !order.createdAt) {
      continue;
    }
    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) {
      continue;
    }
    const createdKey = localDateKey(created);
    if (Object.prototype.hasOwnProperty.call(counts, createdKey)) {
      counts[createdKey] += 1;
    }
  }

  for (let b = 0; b < buckets.length; b++) {
    buckets[b].count = counts[buckets[b].key];
  }

  return buckets;
}

function normalizeItemName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  return name.trim().replace(/\s+/g, ' ');
}

// Top items by quantity sold, ties broken by revenue then name.
// Returns [{ name, quantitySold, revenue }].
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
        map[key] = { name: display, quantitySold: 0, revenue: 0 };
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
  normalizeStatus: normalizeStatus,
  toNumber: toNumber,
  isPendingOrder: isPendingOrder,
  isCompletedOrder: isCompletedOrder,
  isCancelledOrder: isCancelledOrder,
  computeStats: computeStats,
  buildSevenDayTrend: buildSevenDayTrend,
  computePopularItems: computePopularItems,
  formatNumber: formatNumber,
  formatCurrency: formatCurrency,
  localDateKey: localDateKey,
};
