'use strict';

// Pure, dependency-free helpers for the Orders module.
// CommonJS (module.exports) with no React Native imports so the functions can be
// unit-tested with Node's built-in test runner (see orderUtils.test.js).

const { toNumber, formatNumber, formatCurrency } = require('./dashboardMetrics');

// Canonical (uppercase) statuses used for display + session aggregation.
const STATUS = {
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  CHANGED: 'CHANGED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
};

// Every known raw status (legacy + canonical) -> canonical uppercase status.
const RAW_TO_CANONICAL = {
  PLACED: STATUS.PLACED,
  PENDING: STATUS.PLACED,
  ACCEPTED: STATUS.ACCEPTED,
  PREPARING: STATUS.PREPARING,
  READY: STATUS.READY,
  CHANGED: STATUS.CHANGED,
  CHANGEREQUESTED: STATUS.CHANGED,
  UPDATED: STATUS.CHANGED,
  CANCELLED: STATUS.CANCELLED,
  COMPLETED: STATUS.COMPLETED,
};

// Session priority mirrors server/controllers/orderController.js getGroupedOrders.
const STATUS_PRIORITY = {
  CHANGED: 6,
  PLACED: 5,
  ACCEPTED: 4,
  PREPARING: 3.5,
  CANCELLED: 3,
  READY: 2,
  COMPLETED: 1,
};

const STATUS_LABELS = {
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  CHANGED: 'Changed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

const STATUS_STYLES = {
  PLACED: { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  ACCEPTED: { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
  PREPARING: { bg: '#e0f2fe', fg: '#0369a1', border: '#7dd3fc' },
  READY: { bg: '#e0e7ff', fg: '#4338ca', border: '#a5b4fc' },
  CHANGED: { bg: '#fef9c3', fg: '#a16207', border: '#fde047' },
  CANCELLED: { bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5' },
  COMPLETED: { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
};

const DEFAULT_STATUS_STYLE = { bg: '#e5e7eb', fg: '#374151', border: '#d1d5db' };

const FILTER_OPTIONS = [
  'All',
  STATUS.PLACED,
  STATUS.ACCEPTED,
  STATUS.PREPARING,
  STATUS.READY,
  STATUS.CHANGED,
  STATUS.CANCELLED,
  STATUS.COMPLETED,
];

function normalizeStatus(status) {
  if (typeof status !== 'string') {
    return '';
  }
  return RAW_TO_CANONICAL[status.trim().toUpperCase()] || '';
}

function statusLabel(status) {
  const canonical = normalizeStatus(status);
  if (canonical) {
    return STATUS_LABELS[canonical];
  }
  return typeof status === 'string' && status.trim() ? status.trim() : 'Unknown';
}

function statusStyle(status) {
  const canonical = normalizeStatus(status);
  return (canonical && STATUS_STYLES[canonical]) || DEFAULT_STATUS_STYLE;
}

// Session status = highest-priority status among active (non-cancelled,
// non-completed) orders; falls back to all orders when none are active.
function computeSessionStatus(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const active = list.filter(function (order) {
    const canonical = normalizeStatus(order && order.status);
    return canonical !== STATUS.CANCELLED && canonical !== STATUS.COMPLETED;
  });
  const considered = active.length > 0 ? active : list;

  let worst = STATUS.COMPLETED;
  let worstPriority = STATUS_PRIORITY[STATUS.COMPLETED];

  for (let i = 0; i < considered.length; i++) {
    const canonical = normalizeStatus(considered[i] && considered[i].status);
    const priority = STATUS_PRIORITY[canonical] || 0;
    if (priority > worstPriority) {
      worst = canonical;
      worstPriority = priority;
    }
  }

  return worst;
}

// Totals across ALL orders in a session (including cancelled), so cards and the
// details modal agree with the server "Session Total".
function computeSessionTotals(orders) {
  const list = Array.isArray(orders) ? orders : [];
  let totalAmount = 0;
  let grossTotal = 0;
  let discountAmount = 0;
  let itemCount = 0;

  for (let i = 0; i < list.length; i++) {
    const order = list[i];
    if (order == null || typeof order !== 'object') {
      continue;
    }
    totalAmount += toNumber(order.totalAmount);
    grossTotal += toNumber(order.grossTotal != null ? order.grossTotal : order.totalAmount);
    discountAmount += toNumber(order.discountAmount);
    if (Array.isArray(order.items)) {
      itemCount += order.items.length;
    }
  }

  return {
    totalAmount: totalAmount,
    grossTotal: grossTotal,
    discountAmount: discountAmount,
    itemCount: itemCount,
    orderCount: list.length,
  };
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) {
    return '\u2014';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) {
    return '\u2014';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) {
    return '\u2014';
  }
  return formatDate(date) + ' \u2022 ' + formatTime(date);
}

function earliestDate(list, field) {
  let result = null;
  for (let i = 0; i < list.length; i++) {
    const date = parseDate(list[i] && list[i][field]);
    if (date && (result === null || date.getTime() < result.getTime())) {
      result = date;
    }
  }
  return result;
}

function latestDate(list, field) {
  let result = null;
  for (let i = 0; i < list.length; i++) {
    const date = parseDate(list[i] && list[i][field]);
    if (date && (result === null || date.getTime() > result.getTime())) {
      result = date;
    }
  }
  return result;
}

function byCreatedAtAscending(a, b) {
  const aTime = parseDate(a && a.createdAt);
  const bTime = parseDate(b && b.createdAt);
  if (aTime && bTime) {
    return aTime.getTime() - bTime.getTime();
  }
  if (aTime) {
    return -1;
  }
  if (bTime) {
    return 1;
  }
  return 0;
}

// Normalizes any set of orders for a session into one consistent shape used by
// the REST load, socket updates, and post-status-update responses.
function buildSession(sessionId, orders) {
  const list = (Array.isArray(orders) ? orders : [])
    .filter(function (order) {
      return order != null && typeof order === 'object';
    })
    .slice()
    .sort(byCreatedAtAscending);

  const userId = list
    .map(function (order) {
      return order.userId;
    })
    .find(function (candidate) {
      return candidate != null && typeof candidate === 'object';
    }) || null;

  const dineIn = list.find(function (order) {
    return order.orderType === 'Dine-in';
  });

  const delivery = list.find(function (order) {
    return order.isDelivery;
  });

  const deliveryAddressOrder = list.find(function (order) {
    return order.deliveryAddress;
  });

  const totals = computeSessionTotals(list);

  return {
    sessionId: sessionId,
    userId: userId,
    orders: list,
    status: computeSessionStatus(list),
    totalAmount: totals.totalAmount,
    grossTotal: totals.grossTotal,
    discountAmount: totals.discountAmount,
    itemCount: totals.itemCount,
    orderCount: totals.orderCount,
    orderType: dineIn ? 'Dine-in' : (list[0] && list[0].orderType) || '',
    tableNumber: (dineIn && dineIn.tableNumber) || (list[0] && list[0].tableNumber) || '',
    isDelivery: Boolean(delivery),
    deliveryAddress: (deliveryAddressOrder && deliveryAddressOrder.deliveryAddress) || '',
    createdAt: earliestDate(list, 'createdAt'),
    updatedAt: latestDate(list, 'updatedAt') || earliestDate(list, 'createdAt'),
  };
}

function upsertSession(sessions, session) {
  const list = Array.isArray(sessions) ? sessions.slice() : [];
  if (!session || !session.sessionId) {
    return list;
  }
  const index = list.findIndex(function (item) {
    return item && item.sessionId === session.sessionId;
  });
  if (index >= 0) {
    list[index] = session;
  } else {
    list.push(session);
  }
  return list.sort(function (a, b) {
    const aTime = parseDate(a && a.createdAt);
    const bTime = parseDate(b && b.createdAt);
    if (aTime && bTime) {
      return bTime.getTime() - aTime.getTime();
    }
    if (aTime) {
      return -1;
    }
    if (bTime) {
      return 1;
    }
    return 0;
  });
}

function matchesStatusFilter(session, statusFilter) {
  if (!statusFilter || statusFilter === 'All') {
    return true;
  }
  return normalizeStatus(session && session.status) === normalizeStatus(statusFilter);
}

function matchesSearch(session, query) {
  if (query == null || String(query).trim() === '') {
    return true;
  }
  const needle = String(query).trim().toLowerCase();
  const userId = session && session.userId ? session.userId : {};
  const name = typeof userId.name === 'string' ? userId.name.toLowerCase() : '';
  const mobile = userId.mobile != null ? String(userId.mobile) : '';
  const sessionId = session && session.sessionId ? String(session.sessionId).toLowerCase() : '';
  const orderIds = Array.isArray(session && session.orders)
    ? session.orders
        .map(function (order) {
          return order && order.orderId ? String(order.orderId).toLowerCase() : '';
        })
        .join(' ')
    : '';

  return (
    name.indexOf(needle) !== -1 ||
    mobile.indexOf(needle) !== -1 ||
    sessionId.indexOf(needle) !== -1 ||
    orderIds.indexOf(needle) !== -1
  );
}

function applyFilters(sessions, options) {
  const list = Array.isArray(sessions) ? sessions : [];
  const status = options && options.status;
  const query = options && options.query;
  return list.filter(function (session) {
    return matchesStatusFilter(session, status) && matchesSearch(session, query);
  });
}

// Available per-order actions. apiValue strings are the exact raw values the
// backend stores. "Preparing"/"Ready" use the legacy casing on purpose: they are
// the only enum values in server/models/Order.js recognised by the grouped
// status priority. Uppercase PREPARING/READY are not valid enum members.
function getOrderActions(status) {
  const canonical = normalizeStatus(status);
  if (canonical === STATUS.PLACED) {
    return [{ key: 'accept', label: 'Accept Order', apiValue: 'ACCEPTED' }];
  }
  if (canonical === STATUS.CHANGED) {
    return [{ key: 'reaccept', label: 'Re-Accept Order', apiValue: 'ACCEPTED' }];
  }
  if (canonical === STATUS.ACCEPTED) {
    return [{ key: 'prepare', label: 'Start Preparing', apiValue: 'Preparing' }];
  }
  if (canonical === STATUS.PREPARING) {
    return [{ key: 'ready', label: 'Mark as Ready', apiValue: 'Ready' }];
  }
  if (canonical === STATUS.READY) {
    return [{ key: 'complete', label: 'Complete Order', apiValue: 'COMPLETED' }];
  }
  return [];
}

function canCancelOrder(status) {
  const canonical = normalizeStatus(status);
  return (
    canonical === STATUS.PLACED ||
    canonical === STATUS.CHANGED ||
    canonical === STATUS.ACCEPTED ||
    canonical === STATUS.PREPARING ||
    canonical === STATUS.READY
  );
}

module.exports = {
  STATUS: STATUS,
  FILTER_OPTIONS: FILTER_OPTIONS,
  normalizeStatus: normalizeStatus,
  statusLabel: statusLabel,
  statusStyle: statusStyle,
  computeSessionStatus: computeSessionStatus,
  computeSessionTotals: computeSessionTotals,
  buildSession: buildSession,
  upsertSession: upsertSession,
  applyFilters: applyFilters,
  getOrderActions: getOrderActions,
  canCancelOrder: canCancelOrder,
  formatTime: formatTime,
  formatDate: formatDate,
  formatDateTime: formatDateTime,
  formatCurrency: formatCurrency,
  formatNumber: formatNumber,
};
