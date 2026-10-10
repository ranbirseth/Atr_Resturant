'use strict';

// Focused unit tests for the pure order helpers.
// Run with: node --test src/utils/orderUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeStatus,
  statusLabel,
  statusStyle,
  computeSessionStatus,
  computeSessionTotals,
  buildSession,
  upsertSession,
  applyFilters,
  getOrderActions,
  canCancelOrder,
  formatTime,
  formatDate,
} = require('./orderUtils');

test('normalizeStatus maps legacy and canonical values, tolerating bad input', () => {
  assert.equal(normalizeStatus('  completed '), 'COMPLETED');
  assert.equal(normalizeStatus('Pending'), 'PLACED');
  assert.equal(normalizeStatus('Accepted'), 'ACCEPTED');
  assert.equal(normalizeStatus('Preparing'), 'PREPARING');
  assert.equal(normalizeStatus('Ready'), 'READY');
  assert.equal(normalizeStatus('Cancelled'), 'CANCELLED');
  assert.equal(normalizeStatus('ChangeRequested'), 'CHANGED');
  assert.equal(normalizeStatus('Updated'), 'CHANGED');
  assert.equal(normalizeStatus('PLACED'), 'PLACED');
  assert.equal(normalizeStatus('ACCEPTED'), 'ACCEPTED');
  assert.equal(normalizeStatus('CHANGED'), 'CHANGED');
  assert.equal(normalizeStatus('CANCELLED'), 'CANCELLED');
  assert.equal(normalizeStatus('COMPLETED'), 'COMPLETED');
  assert.equal(normalizeStatus(null), '');
  assert.equal(normalizeStatus(undefined), '');
  assert.equal(normalizeStatus(42), '');
});

test('statusLabel falls back safely for unknown values', () => {
  assert.equal(statusLabel('Pending'), 'Placed');
  assert.equal(statusLabel('Accepted'), 'Accepted');
  assert.equal(statusLabel('Preparing'), 'Preparing');
  assert.equal(statusLabel('Ready'), 'Ready');
  assert.equal(statusLabel('Completed'), 'Completed');
  assert.equal(statusLabel('Cancelled'), 'Cancelled');
  assert.equal(statusLabel('CHANGED'), 'Changed');
  assert.equal(statusLabel(null), 'Unknown');
});

test('statusStyle returns a style object and a fallback for unknown', () => {
  assert.equal(statusStyle('PLACED').fg, '#1d4ed8');
  assert.equal(statusStyle('Pending').bg, statusStyle('PLACED').bg);
  assert.equal(statusStyle('nonsense').fg, '#374151');
});

test('computeSessionStatus picks the highest-priority active status', () => {
  assert.equal(computeSessionStatus([{ status: 'CANCELLED' }, { status: 'ACCEPTED' }]), 'ACCEPTED');
  assert.equal(computeSessionStatus([{ status: 'PLACED' }, { status: 'ACCEPTED' }]), 'PLACED');
  assert.equal(computeSessionStatus([{ status: 'Preparing' }, { status: 'Ready' }]), 'PREPARING');
  assert.equal(computeSessionStatus([{ status: 'CANCELLED' }, { status: 'COMPLETED' }]), 'CANCELLED');
});

test('computeSessionStatus normalizes legacy statuses', () => {
  assert.equal(computeSessionStatus([{ status: 'Pending' }]), 'PLACED');
  assert.equal(computeSessionStatus([{ status: 'Accepted' }]), 'ACCEPTED');
  assert.equal(computeSessionStatus([{ status: 'Preparing' }]), 'PREPARING');
  assert.equal(computeSessionStatus([{ status: 'Ready' }]), 'READY');
  assert.equal(computeSessionStatus([{ status: 'Completed' }]), 'COMPLETED');
  assert.equal(computeSessionStatus([{ status: 'Cancelled' }]), 'CANCELLED');
});

test('computeSessionStatus handles empty and missing input safely', () => {
  assert.equal(computeSessionStatus([]), 'COMPLETED');
  assert.equal(computeSessionStatus(null), 'COMPLETED');
});

test('computeSessionTotals sums all orders including cancelled', () => {
  const totals = computeSessionTotals([
    { totalAmount: 100, items: [{}, {}] },
    { totalAmount: 50, grossTotal: 60, discountAmount: 10 },
    { totalAmount: 999, status: 'CANCELLED' },
  ]);
  assert.equal(totals.totalAmount, 1149);
  assert.equal(totals.grossTotal, 1159);
  assert.equal(totals.discountAmount, 10);
  assert.equal(totals.itemCount, 2);
  assert.equal(totals.orderCount, 3);
});

test('computeSessionTotals tolerates bad numbers without NaN', () => {
  const totals = computeSessionTotals([{ totalAmount: 'oops' }, { totalAmount: null }, {}]);
  assert.equal(totals.totalAmount, 0);
  assert.ok(!Number.isNaN(totals.totalAmount));
});

test('buildSession produces a consistent shape and oldest-first orders', () => {
  const session = buildSession('sess-1', [
    {
      _id: 'o2',
      status: 'ACCEPTED',
      totalAmount: 50,
      orderType: 'Dine-in',
      tableNumber: '5',
      userId: { name: 'Asha', mobile: '999' },
      createdAt: '2026-10-09T10:05:00.000Z',
    },
    {
      _id: 'o1',
      status: 'PLACED',
      totalAmount: 100,
      orderType: 'Takeaway',
      userId: { name: 'Asha', mobile: '999' },
      createdAt: '2026-10-09T10:00:00.000Z',
      items: [{ name: 'A', quantity: 1 }],
    },
  ]);

  assert.equal(session.sessionId, 'sess-1');
  assert.equal(session.userId.name, 'Asha');
  assert.equal(session.orderCount, 2);
  assert.equal(session.totalAmount, 150);
  assert.equal(session.status, 'PLACED');
  assert.equal(session.orderType, 'Dine-in');
  assert.equal(session.tableNumber, '5');
  assert.equal(session.orders[0]._id, 'o1');
  assert.equal(session.orders[1]._id, 'o2');
  assert.ok(session.createdAt instanceof Date);
});

test('buildSession flags delivery and handles a missing user', () => {
  const session = buildSession('sess-2', [
    {
      _id: 'o1',
      status: 'PLACED',
      totalAmount: 10,
      isDelivery: true,
      deliveryAddress: '12 Main St',
      createdAt: '2026-10-09T10:00:00.000Z',
    },
  ]);
  assert.equal(session.userId, null);
  assert.equal(session.isDelivery, true);
  assert.equal(session.deliveryAddress, '12 Main St');
});

test('buildSession tolerates malformed dates without crashing', () => {
  const session = buildSession('sess-3', [{ _id: 'o1', status: 'PLACED', createdAt: 'not-a-date' }]);
  assert.equal(session.createdAt, null);
});

test('upsertSession replaces by id and keeps newest first', () => {
  const a = { sessionId: 'a', createdAt: new Date('2026-10-08T10:00:00Z') };
  const b = { sessionId: 'b', createdAt: new Date('2026-10-09T10:00:00Z') };
  let list = upsertSession([], a);
  list = upsertSession(list, b);
  assert.deepEqual(
    list.map(function (item) {
      return item.sessionId;
    }),
    ['b', 'a'],
  );

  const aNewer = { sessionId: 'a', createdAt: new Date('2026-10-10T10:00:00Z') };
  list = upsertSession(list, aNewer);
  assert.equal(list.length, 2);
  assert.equal(list[0].sessionId, 'a');
  assert.equal(list[0], aNewer);
});

test('applyFilters filters by canonical status including legacy input', () => {
  const sessions = [
    { sessionId: 'a', status: 'PLACED', orders: [] },
    { sessionId: 'b', status: 'COMPLETED', orders: [] },
    { sessionId: 'c', status: 'ACCEPTED', orders: [] },
  ];
  assert.equal(applyFilters(sessions, { status: 'All' }).length, 3);
  assert.equal(applyFilters(sessions, { status: 'PLACED' }).length, 1);
  assert.equal(applyFilters(sessions, { status: 'Pending' }).length, 1);
  assert.equal(applyFilters(sessions, { status: 'Completed' }).length, 1);
});

test('applyFilters searches name, mobile, session id and order id', () => {
  const sessions = [
    {
      sessionId: 'user_abc_date_20261009',
      status: 'PLACED',
      userId: { name: 'Asha', mobile: '9876543210' },
      orders: [{ orderId: 'ORD-123' }],
    },
    {
      sessionId: 'user_xyz_date_20261008',
      status: 'ACCEPTED',
      userId: null,
      orders: [],
    },
  ];
  assert.equal(applyFilters(sessions, { query: 'asha' }).length, 1);
  assert.equal(applyFilters(sessions, { query: '987654' }).length, 1);
  assert.equal(applyFilters(sessions, { query: 'user_abc' }).length, 1);
  assert.equal(applyFilters(sessions, { query: 'ORD-123' }).length, 1);
  assert.equal(applyFilters(sessions, { query: 'nomatch' }).length, 0);
  assert.equal(applyFilters(sessions, { query: '  ' }).length, 2);
});

test('applyFilters combines status and search', () => {
  const sessions = [
    { sessionId: 'a', status: 'PLACED', userId: { name: 'Asha' }, orders: [] },
    { sessionId: 'b', status: 'PLACED', userId: { name: 'Ravi' }, orders: [] },
    { sessionId: 'c', status: 'COMPLETED', userId: { name: 'Asha' }, orders: [] },
  ];
  assert.equal(applyFilters(sessions, { status: 'PLACED', query: 'asha' }).length, 1);
  assert.equal(applyFilters(sessions, { status: 'COMPLETED', query: 'ravi' }).length, 0);
});

test('getOrderActions maps statuses to the exact backend apiValue', () => {
  assert.equal(getOrderActions('PLACED')[0].apiValue, 'ACCEPTED');
  assert.equal(getOrderActions('Pending')[0].apiValue, 'ACCEPTED');
  assert.equal(getOrderActions('CHANGED')[0].apiValue, 'ACCEPTED');
  assert.equal(getOrderActions('ChangeRequested')[0].apiValue, 'ACCEPTED');
  assert.equal(getOrderActions('Updated')[0].apiValue, 'ACCEPTED');
  assert.equal(getOrderActions('Accepted')[0].apiValue, 'Preparing');
  assert.equal(getOrderActions('ACCEPTED')[0].apiValue, 'Preparing');
  assert.equal(getOrderActions('Preparing')[0].apiValue, 'Ready');
  assert.equal(getOrderActions('Ready')[0].apiValue, 'COMPLETED');
  assert.deepEqual(getOrderActions('COMPLETED'), []);
  assert.deepEqual(getOrderActions('CANCELLED'), []);
  assert.deepEqual(getOrderActions('Completed'), []);
  assert.deepEqual(getOrderActions('unknown'), []);
});

test('canCancelOrder is true only for eligible non-terminal statuses', () => {
  assert.equal(canCancelOrder('PLACED'), true);
  assert.equal(canCancelOrder('Pending'), true);
  assert.equal(canCancelOrder('ACCEPTED'), true);
  assert.equal(canCancelOrder('Accepted'), true);
  assert.equal(canCancelOrder('CHANGED'), true);
  assert.equal(canCancelOrder('Preparing'), true);
  assert.equal(canCancelOrder('Ready'), true);
  assert.equal(canCancelOrder('COMPLETED'), false);
  assert.equal(canCancelOrder('Completed'), false);
  assert.equal(canCancelOrder('CANCELLED'), false);
});

test('format helpers never throw on malformed values', () => {
  assert.equal(formatTime('not-a-date'), '\u2014');
  assert.equal(formatTime(null), '\u2014');
  assert.equal(formatDate('not-a-date'), '\u2014');
  assert.ok(typeof formatTime('2026-10-09T10:00:00Z') === 'string');
  assert.ok(typeof formatDate('2026-10-09T10:00:00Z') === 'string');
});
