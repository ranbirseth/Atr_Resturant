'use strict';

// Pure, dependency-free helpers for the Inventory analytics portion of the
// Reviews & Analytics module (Phase 3). CommonJS so it can be unit-tested with
// Node's built-in test runner (see inventoryAnalyticsUtils.test.js).
//
// Data sources (existing read-only endpoints):
//   StockMovement -> { ingredientId, type, quantityDelta, unit, movementDate,
//                      status (RESERVED | COMMITTED; missing = legacy committed) }
//   Ingredient/stock rows -> { _id, name, unit, currentQty, minimumStockLevel,
//                              expectedDemand, createdAt }
//
// Rules baked in:
//   - Only COMMITTED movements count. RESERVED (in-flight idempotency
//     reservations) are never treated as restock or consumption. Legacy
//     movements without a status are committed and count.
//   - ADDITIONS are OPENING + RESTOCK kept separately where the report asks for
//     "restocked items and quantities" specifically.
//   - Consumption is the summed magnitude of CONSUMPTION deltas (the ledger
//     stores them as negative). A current stock quantity is NEVER treated as
//     consumption, and consumption is never inferred from orders.
//   - Purchase suggestions rank only items with completed consumption in the
//     period, by quantity consumed (desc), then name (asc), then ingredient id
//     (asc) so the order is deterministic. A reorder amount is shown only when
//     a minimum stock level is defined and above the current stock; otherwise
//     it is null - supplier, price, lead time and exact order quantities are
//     intentionally not invented.

const { toNumber } = require('./dashboardMetrics');

const RESERVED = 'RESERVED';

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round2(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function normalizeType(movement) {
  return String((movement && movement.type) || '').trim().toUpperCase();
}

// Legacy movements (no status field) are committed by definition; the only
// excluded status is RESERVED (uncommitted idempotency reservations).
function isCommittedMovement(movement) {
  return !movement || String((movement.status || '').trim()).toUpperCase() !== RESERVED;
}

function movementQty(movement) {
  return toNumber(movement && movement.quantityDelta);
}

// Movements whose movementDate is a valid instant inside [fromMs, toMs]
// (inclusive) and whose status is not RESERVED.
function filterCommittedInRange(movements, fromMs, toMs) {
  const list = Array.isArray(movements) ? movements : [];
  return list.filter(function (movement) {
    if (!isCommittedMovement(movement)) {
      return false;
    }
    const date = parseDate(movement && movement.movementDate);
    return date !== null && date.getTime() >= fromMs && date.getTime() <= toMs;
  });
}

// Period totals from the movement ledger, type by type.
function summarizeMovements(movements, fromMs, toMs) {
  const list = filterCommittedInRange(movements, fromMs, toMs);

  let restockedQty = 0;
  let restockEvents = 0;
  let openingQty = 0;
  let openingEvents = 0;
  let consumedQty = 0;
  let consumptionEvents = 0;
  let adjustmentQty = 0;
  let adjustmentEvents = 0;

  for (let i = 0; i < list.length; i++) {
    const type = normalizeType(list[i]);
    const qty = movementQty(list[i]);
    if (type === 'RESTOCK') {
      restockedQty = round2(restockedQty + qty);
      restockEvents += 1;
    } else if (type === 'OPENING') {
      openingQty = round2(openingQty + qty);
      openingEvents += 1;
    } else if (type === 'CONSUMPTION') {
      consumedQty = round2(consumedQty + Math.abs(qty));
      consumptionEvents += 1;
    } else if (type === 'ADJUSTMENT') {
      adjustmentQty = round2(adjustmentQty + qty);
      adjustmentEvents += 1;
    }
  }

  return {
    restockedQty: restockedQty,
    restockEvents: restockEvents,
    openingQty: openingQty,
    openingEvents: openingEvents,
    consumedQty: consumedQty,
    consumptionEvents: consumptionEvents,
    adjustmentQty: adjustmentQty,
    adjustmentEvents: adjustmentEvents,
    // Restocks/adjustments raise stock, consumption lowers it (reserved never
    // entered these buckets, so it cannot affect net change).
    netChange: round2(restockedQty + openingQty + adjustmentQty - consumedQty),
    movementCount: list.length,
  };
}

// Inventory items whose creation timestamp reliably falls inside the period.
// Returns a compact, sorted-oldest-first view.
function itemsAddedInRange(ingredients, fromMs, toMs) {
  const list = Array.isArray(ingredients) ? ingredients : [];
  return list
    .filter(function (ingredient) {
      const date = parseDate(ingredient && ingredient.createdAt);
      return date !== null && date.getTime() >= fromMs && date.getTime() <= toMs;
    })
    .map(function (ingredient) {
      return {
        _id: ingredient && ingredient._id ? String(ingredient._id) : null,
        name: (ingredient && ingredient.name) || '',
        unit: (ingredient && ingredient.unit) || '',
        currentQty: round2(toNumber(ingredient && ingredient.currentQty)),
        createdAt: ingredient && ingredient.createdAt,
      };
    })
    .sort(function (a, b) {
      const at = parseDate(a.createdAt) || new Date(0);
      const bt = parseDate(b.createdAt) || new Date(0);
      return at.getTime() - bt.getTime();
    });
}

function toStock(ingredients) {
  const map = new Map();
  const list = Array.isArray(ingredients) ? ingredients : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row && row._id) {
      map.set(String(row._id), row);
    }
  }
  return map;
}

// Usage-based purchase suggestions: consumption-ranked with a reorder amount
// only when the data supports it. Returns [] when nothing was consumed.
function buildUsageRanking(movements, ingredients, fromMs, toMs) {
  const list = filterCommittedInRange(movements, fromMs, toMs).filter(function (movement) {
    return normalizeType(movement) === 'CONSUMPTION';
  });
  const stock = toStock(ingredients);
  const byId = {};

  for (let i = 0; i < list.length; i++) {
    const id = list[i] && list[i].ingredientId ? String(list[i].ingredientId) : '';
    if (!id) {
      continue;
    }
    const entry = byId[id] || (byId[id] = { ingredientId: id, consumedQty: 0, consumptionEvents: 0 });
    entry.consumedQty = round2(entry.consumedQty + Math.abs(movementQty(list[i])));
    entry.consumptionEvents += 1;
  }

  const rows = Object.keys(byId).map(function (id) {
    const agg = byId[id];
    const ingredient = stock.get(id);
    const name = (ingredient && ingredient.name) || 'Unknown item';
    const unit = (ingredient && ingredient.unit) || '';
    const currentQty = toNumber(ingredient && ingredient.currentQty);
    const minimumStockLevel = toNumber(ingredient && ingredient.minimumStockLevel);

    let reorderQty = null;
    if (
      ingredient &&
      Number.isFinite(minimumStockLevel) &&
      minimumStockLevel > 0 &&
      Number.isFinite(currentQty) &&
      currentQty < minimumStockLevel
    ) {
      reorderQty = round2(minimumStockLevel - currentQty);
    }

    return {
      ingredientId: id,
      name: name,
      unit: unit,
      consumedQty: agg.consumedQty,
      consumptionEvents: agg.consumptionEvents,
      currentQty: Number.isFinite(currentQty) ? currentQty : null,
      minimumStockLevel: Number.isFinite(minimumStockLevel) ? minimumStockLevel : null,
      reorderQty: reorderQty,
    };
  });

  rows.sort(function (a, b) {
    if (a.consumedQty !== b.consumedQty) {
      return b.consumedQty - a.consumedQty;
    }
    const na = String(a.name).toLowerCase();
    const nb = String(b.name).toLowerCase();
    if (na !== nb) {
      return na < nb ? -1 : 1;
    }
    return a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0;
  });

  return rows;
}

// Per-item activity in the period: restocked / opening / consumed / adjusted
// quantities, each kept in the item's own unit (quantities are never summed
// across items with different units). Deterministically ordered by name A-Z,
// then ingredient id, so the table is stable across renders.
function buildItemActivity(movements, ingredients, fromMs, toMs) {
  const list = filterCommittedInRange(movements, fromMs, toMs);
  const stock = toStock(ingredients);
  const byId = {};

  for (let i = 0; i < list.length; i++) {
    const id = list[i] && list[i].ingredientId ? String(list[i].ingredientId) : '';
    if (!id) {
      continue;
    }
    const entry = byId[id] || (byId[id] = { restockedQty: 0, restockEvents: 0, openingQty: 0, consumedQty: 0, consumptionEvents: 0, adjustmentQty: 0 });
    const type = normalizeType(list[i]);
    const qty = movementQty(list[i]);
    if (type === 'RESTOCK') {
      entry.restockedQty = round2(entry.restockedQty + qty);
      entry.restockEvents += 1;
    } else if (type === 'OPENING') {
      entry.openingQty = round2(entry.openingQty + qty);
    } else if (type === 'CONSUMPTION') {
      entry.consumedQty = round2(entry.consumedQty + Math.abs(qty));
      entry.consumptionEvents += 1;
    } else if (type === 'ADJUSTMENT') {
      entry.adjustmentQty = round2(entry.adjustmentQty + qty);
    }
  }

  const rows = Object.keys(byId).map(function (id) {
    const agg = byId[id];
    const ingredient = stock.get(id);
    const name = (ingredient && ingredient.name) || 'Unknown item';
    const unit = (ingredient && ingredient.unit) || '';
    const currentQty = toNumber(ingredient && ingredient.currentQty);
    return {
      ingredientId: id,
      name: name,
      unit: unit,
      currentQty: Number.isFinite(currentQty) ? currentQty : null,
      restockedQty: agg.restockedQty,
      restockEvents: agg.restockEvents,
      openingQty: agg.openingQty,
      consumedQty: agg.consumedQty,
      consumptionEvents: agg.consumptionEvents,
      adjustmentQty: agg.adjustmentQty,
    };
  });

  rows.sort(function (a, b) {
    const na = String(a.name).toLowerCase();
    const nb = String(b.name).toLowerCase();
    if (na !== nb) {
      return na < nb ? -1 : 1;
    }
    return a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0;
  });

  return rows;
}

module.exports = {
  RESERVED: RESERVED,
  isCommittedMovement: isCommittedMovement,
  filterCommittedInRange: filterCommittedInRange,
  summarizeMovements: summarizeMovements,
  itemsAddedInRange: itemsAddedInRange,
  buildItemActivity: buildItemActivity,
  buildUsageRanking: buildUsageRanking,
};