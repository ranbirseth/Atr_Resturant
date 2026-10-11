'use strict';

// Focused unit tests for the pure Inventory analytics helpers.
// Run with: node --test src/utils/inventoryAnalyticsUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isCommittedMovement,
  filterCommittedInRange,
  summarizeMovements,
  itemsAddedInRange,
  buildItemActivity,
  buildUsageRanking,
} = require('./inventoryAnalyticsUtils');

// IST = UTC+05:30, fixed. `ist(day, msIntoDay)` is the UTC instant of that
// number of milliseconds into the IST calendar day `day` of Oct 2026.
function ist(day, msIntoDay) {
  return Date.UTC(2026, 9, day) - 330 * 60 * 1000 + msIntoDay;
}
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const FROM_1D = ist(9, 0);
const TO_1D = ist(9, DAY - 1);
const FROM_7D = ist(3, 0);
const TO_7D = ist(9, DAY - 1);
const FROM_30D = Date.UTC(2026, 8, 9, 18, 30, 0); // Sep 9 18:30 UTC = 30 days back

function movement(fields) {
  return {
    ingredientId: fields.id,
    type: fields.type,
    quantityDelta: fields.delta,
    unit: fields.unit,
    movementDate: new Date(fields.at),
    status: fields.status,
  };
}

const MOVEMENTS = [
  movement({ id: 'tomato', type: 'RESTOCK', delta: 10, unit: 'kg', at: ist(9, 10 * HOUR) }),
  movement({ id: 'tomato', type: 'RESTOCK', delta: 5, unit: 'kg', at: ist(9, 11 * HOUR) }),
  movement({ id: 'oil', type: 'OPENING', delta: 8, unit: 'litre', at: ist(9, 9 * HOUR) }),
  movement({ id: 'tomato', type: 'CONSUMPTION', delta: -3, unit: 'kg', at: ist(9, 12 * HOUR) }),
  movement({ id: 'tomato', type: 'CONSUMPTION', delta: -2.5, unit: 'kg', at: ist(9, 13 * HOUR) }),
  movement({ id: 'oil', type: 'CONSUMPTION', delta: -1, unit: 'litre', at: ist(9, 12 * HOUR + 30 * 60 * 1000) }),
  movement({ id: 'tomato', type: 'ADJUSTMENT', delta: 0.5, unit: 'kg', at: ist(9, 14 * HOUR) }),
  // In-flight idempotency reservation: must never count as consumption.
  movement({ id: 'tomato', type: 'CONSUMPTION', delta: -99, unit: 'kg', at: ist(9, 10 * HOUR + 30 * 60 * 1000), status: 'RESERVED' }),
  // Inside the 30-day window, outside the 7-day window.
  movement({ id: 'tomato', type: 'CONSUMPTION', delta: -4, unit: 'kg', at: ist(2, 9 * HOUR) }),
  // Legacy movement with no status field: counts as committed.
  movement({ id: 'oil', type: 'CONSUMPTION', delta: -2, unit: 'litre', at: ist(9, 15 * HOUR) }),
  // Unknown type: counts as a movement but never as a typed bucket.
  movement({ id: 'tomato', type: 'COUNT', delta: 3, unit: 'kg', at: ist(9, 16 * HOUR) }),
  movement({ id: 'spice', type: 'CONSUMPTION', delta: -1, unit: 'kg', at: ist(9, 17 * HOUR) }),
  movement({ id: 'tieAItem', type: 'CONSUMPTION', delta: -1.5, unit: 'kg', at: ist(9, 18 * HOUR) }),
  movement({ id: 'tieBItem', type: 'CONSUMPTION', delta: -1.5, unit: 'kg', at: ist(9, 18 * HOUR + 30 * 60 * 1000) }),
];

function ingredient(fields) {
  return {
    _id: fields.id,
    name: fields.name,
    unit: fields.unit,
    currentQty: fields.current,
    minimumStockLevel: fields.min,
    createdAt: new Date(fields.at),
  };
}

const INGREDIENTS = [
  ingredient({ id: 'tomato', name: 'Tomato', unit: 'kg', current: 6, min: 8, at: ist(9, 8 * HOUR) }),
  ingredient({ id: 'oil', name: 'Oil', unit: 'litre', current: 3, min: 5, at: ist(1, 8 * HOUR) }),
  ingredient({ id: 'salt', name: 'Salt', unit: 'kg', current: 20, min: 0, at: Date.UTC(2026, 5, 1, 5, 0, 0) }),
  ingredient({ id: 'spice', name: 'Spice', unit: 'kg', current: 5, min: 4, at: ist(5, 8 * HOUR) }),
  ingredient({ id: 'added', name: 'Added', unit: 'g', current: 100, min: 50, at: ist(8, 12 * HOUR) }),
  ingredient({ id: 'tieAItem', name: 'Tie A', unit: 'kg', current: 2, min: 3, at: ist(4, 8 * HOUR) }),
  ingredient({ id: 'tieBItem', name: 'Tie B', unit: 'kg', current: 2, min: 3, at: ist(4, 9 * HOUR) }),
];

test('isCommittedMovement treats legacy as committed and RESERVED as uncommitted', () => {
  assert.equal(isCommittedMovement({ type: 'CONSUMPTION', quantityDelta: -1 }), true);
  assert.equal(isCommittedMovement({ type: 'CONSUMPTION', quantityDelta: -1, status: 'COMMITTED' }), true);
  assert.equal(isCommittedMovement({ type: 'CONSUMPTION', quantityDelta: -1, status: 'RESERVED' }), false);
  assert.equal(isCommittedMovement({ type: 'CONSUMPTION', quantityDelta: -1, status: 'reserved' }), false);
  assert.equal(isCommittedMovement(null), true);
});

test('filterCommittedInRange drops RESERVED, out-of-range and undatable movements', () => {
  const ids = filterCommittedInRange(MOVEMENTS, FROM_7D, TO_7D).map((m) => m.movementDate.getTime());
  assert.equal(ids.length, 12, '12 committed movements in the 7-day window');
  const inRange = filterCommittedInRange(MOVEMENTS, FROM_7D, TO_7D);
  assert.ok(!inRange.some((m) => m.status === 'RESERVED'), 'RESERVED must be excluded');
  assert.ok(!inRange.some((m) => m.ingredientId === 'tomato' && m.quantityDelta === -99), 'reserved -99 must never appear');
  assert.equal(filterCommittedInRange([{ ingredientId: 'x', type: 'CONSUMPTION', quantityDelta: -1, movementDate: 'bad' }], FROM_7D, TO_7D).length, 0);
});

test('summarizeMovements splits restock / opening / consumption / adjustment', () => {
  const summary = summarizeMovements(MOVEMENTS, FROM_7D, TO_7D);
  assert.deepEqual(summary, {
    restockedQty: 15,
    restockEvents: 2,
    openingQty: 8,
    openingEvents: 1,
    consumedQty: 12.5,
    consumptionEvents: 7,
    adjustmentQty: 0.5,
    adjustmentEvents: 1,
    netChange: 11,
    movementCount: 12,
  });

  const today = summarizeMovements(MOVEMENTS, FROM_1D, TO_1D);
  assert.equal(today.consumedQty, 12.5, 'consumption for today (the -4 on Oct 2 is outside)');
  assert.equal(today.consumptionEvents, 7);
  assert.equal(today.movementCount, 12);

  const month = summarizeMovements(MOVEMENTS, FROM_30D, TO_1D);
  assert.equal(month.consumedQty, 16.5, '30-day window adds the Oct 2 -4 consumption');
  assert.equal(month.consumptionEvents, 8);
  assert.equal(month.movementCount, 13);
});

test('summarizeMovements is empty-safe', () => {
  const summary = summarizeMovements([], FROM_7D, TO_7D);
  assert.deepEqual(summary, {
    restockedQty: 0,
    restockEvents: 0,
    openingQty: 0,
    openingEvents: 0,
    consumedQty: 0,
    consumptionEvents: 0,
    adjustmentQty: 0,
    adjustmentEvents: 0,
    netChange: 0,
    movementCount: 0,
  });
});

test('itemsAddedInRange uses createdAt and returns items oldest first', () => {
  const week = itemsAddedInRange(INGREDIENTS, FROM_7D, TO_7D);
  assert.deepEqual(week.map((x) => x.name), ['Tie A', 'Tie B', 'Spice', 'Added', 'Tomato']);
  assert.deepEqual(week[4], {
    _id: 'tomato',
    name: 'Tomato',
    unit: 'kg',
    currentQty: 6,
    createdAt: new Date(ist(9, 8 * HOUR)),
  });

  const today = itemsAddedInRange(INGREDIENTS, FROM_1D, TO_1D);
  assert.deepEqual(today.map((x) => x.name), ['Tomato']);

  const month = itemsAddedInRange(INGREDIENTS, FROM_30D, TO_1D);
  assert.deepEqual(month.map((x) => x.name), ['Oil', 'Tie A', 'Tie B', 'Spice', 'Added', 'Tomato']);
});

test('buildItemActivity reports per-item quantities in the item unit', () => {
  const rows = buildItemActivity(MOVEMENTS, INGREDIENTS, FROM_7D, TO_7D);
  assert.deepEqual(rows.map((x) => x.name), ['Oil', 'Spice', 'Tie A', 'Tie B', 'Tomato']);

  const tomato = rows.find((x) => x.ingredientId === 'tomato');
  assert.equal(tomato.restockedQty, 15, 'reserved -99 and out-of-window -4 are excluded');
  assert.equal(tomato.restockEvents, 2);
  assert.equal(tomato.consumedQty, 5.5);
  assert.equal(tomato.consumptionEvents, 2);
  assert.equal(tomato.adjustmentQty, 0.5);
  assert.equal(tomato.currentQty, 6);

  const oil = rows.find((x) => x.ingredientId === 'oil');
  assert.equal(oil.openingQty, 8);
  assert.equal(oil.consumedQty, 3, 'legacy movement (no status) counts');
  assert.equal(oil.consumptionEvents, 2);

  assert.equal(buildItemActivity([], [], FROM_7D, TO_7D).length, 0);
});

test('buildUsageRanking ranks by consumption, excludes reserved, ties are deterministic', () => {
  const ranking = buildUsageRanking(MOVEMENTS, INGREDIENTS, FROM_7D, TO_7D);

  assert.deepEqual(ranking.map((x) => x.name), ['Tomato', 'Oil', 'Tie A', 'Tie B', 'Spice']);
  assert.equal(ranking.length, 5);

  const tomato = ranking[0];
  assert.equal(tomato.consumedQty, 5.5, 'reserved -99 and the out-of-window -4 must be excluded');
  assert.equal(tomato.consumptionEvents, 2);
  assert.equal(tomato.currentQty, 6);
  assert.equal(tomato.minimumStockLevel, 8);
  assert.equal(tomato.reorderQty, 2, 'min 8 - current 6 = 2');

  const oil = ranking[1];
  assert.equal(oil.consumedQty, 3, 'legacy movement (no status) counts toward oil consumption');
  assert.equal(oil.consumptionEvents, 2);
  assert.equal(oil.reorderQty, 2);

  // Reorder is only offered when the minimum is defined and above current.
  const spice = ranking[4];
  assert.equal(spice.reorderQty, null, 'current >= minimum, so no reorder amount');

  // Tie-break: equal consumption sorts by name ascending.
  assert.equal(ranking[2].consumedQty, ranking[3].consumedQty);
  assert.ok(ranking[2].name < ranking[3].name);
});

test('buildUsageRanking in the 30-day window adds the Oct 2 consumption', () => {
  const ranking = buildUsageRanking(MOVEMENTS, INGREDIENTS, FROM_30D, TO_1D);
  const tomato = ranking[0];
  assert.equal(tomato.name, 'Tomato');
  assert.equal(tomato.consumedQty, 9.5);
  assert.equal(tomato.consumptionEvents, 3);
});

test('buildUsageRanking skips items with no consumption and is empty-safe', () => {
  const noSalt = buildUsageRanking(MOVEMENTS, INGREDIENTS, FROM_7D, TO_7D);
  assert.ok(!noSalt.some((x) => x.ingredientId === 'salt'), 'salt has no consumption, so no suggestion');

  const empty = buildUsageRanking([], [], FROM_7D, TO_7D);
  assert.deepEqual(empty, []);
});