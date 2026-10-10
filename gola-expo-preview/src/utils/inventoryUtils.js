'use strict';

// Pure, dependency-free helpers for the Inventory + Stock module.
// CommonJS (module.exports) with no React Native imports so the functions can
// be unit-tested with Node's built-in test runner (see inventoryUtils.test.js).

const UNITS = ['kg', 'g', 'litre', 'ml', 'pieces', 'packets'];

const PURCHASE_STATUSES = ['NONE', 'NEEDED', 'ORDERED', 'COMPLETED'];

const STOCK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out of Stock' },
  { key: 'need-to-buy', label: 'Need to Buy' },
];

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonNegativeNumber(value) {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

function toPositiveNumber(value) {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

function formatQty(value, unit) {
  const parsed = toFiniteNumber(value);
  const text = parsed === null ? '\u2014' : String(Math.round(parsed * 100) / 100);
  return unit ? `${text} ${unit}` : text;
}

// Rupee price, mirroring the menu convention; em dash for missing/legacy nulls.
function formatPrice(value) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return '\u2014';
  }
  return `\u20B9${Math.round(parsed * 100) / 100}`;
}

function formatPercent(value) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return '\u2014';
  }
  return `${Math.round(parsed * 100) / 100}%`;
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Accepts YYYY-MM-DD (or empty => today's date). Returns a Date or null.
function parseDateInput(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) {
    return new Date();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const parsed = new Date(`${text}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateIngredientForm(form) {
  const values = form || {};
  const errors = {};

  if (!String(values.name || '').trim()) {
    errors.name = 'Name is required';
  }
  if (!UNITS.includes(String(values.unit || '').trim())) {
    errors.unit = 'Select a unit';
  }
  if (toNonNegativeNumber(values.minimumStockLevel) === null) {
    errors.minimumStockLevel = 'Enter 0 or more';
  }
  const demand = values.expectedDemand;
  if (demand !== undefined && demand !== null && String(demand).trim() !== '' && toNonNegativeNumber(demand) === null) {
    errors.expectedDemand = 'Enter 0 or more';
  }
  if (values.openingQty !== undefined && values.openingQty !== null && String(values.openingQty).trim() !== '') {
    if (toNonNegativeNumber(values.openingQty) === null) {
      errors.openingQty = 'Enter 0 or more';
    }
  }
  if (values.purchasePrice !== undefined && values.purchasePrice !== null && String(values.purchasePrice).trim() !== '') {
    if (toNonNegativeNumber(values.purchasePrice) === null) {
      errors.purchasePrice = 'Enter 0 or more';
    }
  }
  if (values.openingUnitCost !== undefined && values.openingUnitCost !== null && String(values.openingUnitCost).trim() !== '') {
    if (toNonNegativeNumber(values.openingUnitCost) === null) {
      errors.openingUnitCost = 'Enter 0 or more';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// Simplified "Add Inventory" form: name, unit, total quantity, total price.
function validateAddItemForm(form) {
  const values = form || {};
  const errors = {};

  if (!String(values.name || '').trim()) {
    errors.name = 'Name is required';
  }
  if (!UNITS.includes(String(values.unit || '').trim())) {
    errors.unit = 'Select a unit';
  }
  if (toPositiveNumber(values.quantity) === null) {
    errors.quantity = 'Enter a quantity greater than 0';
  }
  if (toNonNegativeNumber(values.totalPrice) === null) {
    errors.totalPrice = 'Enter 0 or more';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// mode: 'CONSUMPTION' | 'RESTOCK' | 'ADJUSTMENT'
function validateMovementForm(form, mode) {
  const values = form || {};
  const errors = {};

  if (mode === 'ADJUSTMENT') {
    const delta = toFiniteNumber(values.quantityDelta);
    if (delta === null || delta === 0) {
      errors.quantityDelta = 'Enter a non-zero quantity (use a minus sign to reduce)';
    }
  } else if (toPositiveNumber(values.quantity) === null) {
    errors.quantity = 'Enter a quantity greater than 0';
  }

  if (values.unitCost !== undefined && values.unitCost !== null && String(values.unitCost).trim() !== '') {
    if (toNonNegativeNumber(values.unitCost) === null) {
      errors.unitCost = 'Enter 0 or more';
    }
  }

  if (parseDateInput(values.date) === null) {
    errors.date = 'Use format YYYY-MM-DD';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function computeUsagePercent(baselineQty, currentQty) {
  const baseline = toFiniteNumber(baselineQty);
  const current = toFiniteNumber(currentQty);
  if (baseline === null || baseline <= 0) {
    return null;
  }
  const safeCurrent = current === null ? baseline : current;
  const percent = ((baseline - safeCurrent) / baseline) * 100;
  return Math.round(Math.max(0, Math.min(100, percent)) * 100) / 100;
}

function computeSuggestedQty(minimumStockLevel, expectedDemand, currentQty) {
  const min = toNonNegativeNumber(minimumStockLevel) || 0;
  const demand = toNonNegativeNumber(expectedDemand) || 0;
  const current = toFiniteNumber(currentQty) || 0;
  return Math.round(Math.max(0, min + demand - current) * 100) / 100;
}

// Per-unit cost = total purchase price / quantity. Returns null when quantity is
// missing or not positive. Negative/blank prices fall back to 0.
function computeUnitCost(totalPrice, quantity) {
  const qty = toFiniteNumber(quantity);
  if (qty === null || qty <= 0) {
    return null;
  }
  const price = toNonNegativeNumber(totalPrice);
  const safePrice = price === null ? 0 : price;
  return Math.round((safePrice / qty) * 100000) / 100000;
}

// Quantity used so far in the current cycle = baseline - current (floored at 0).
// Returns null when there is no usable baseline (no cycle yet).
function computeConsumedQuantity(baselineQty, currentQty) {
  const baseline = toFiniteNumber(baselineQty);
  const current = toFiniteNumber(currentQty);
  if (baseline === null || baseline <= 0 || current === null) {
    return null;
  }
  return Math.round(Math.max(0, baseline - current) * 100) / 100;
}

// Client-side stock filter (mirrors the server) for snappy list updates.
function filterStockList(items, options) {
  const list = Array.isArray(items) ? items : [];
  const opts = options || {};
  const filter = opts.filter || 'all';
  const query = String(opts.query || '').trim().toLowerCase();

  return list.filter(function (item) {
    if (!item) return false;
    const name = typeof item.name === 'string' ? item.name.toLowerCase() : '';
    if (query && !name.includes(query)) return false;
    switch (filter) {
      case 'available':
        return item.available === true;
      case 'low':
        return item.lowStock === true;
      case 'out':
        return item.outOfStock === true;
      case 'need-to-buy':
        return item.needToBuy === true;
      default:
        return true;
    }
  });
}

function purchaseStatusLabel(status) {
  switch (status) {
    case 'NEEDED':
      return 'Need to Buy';
    case 'ORDERED':
      return 'Ordered';
    case 'COMPLETED':
      return 'Purchased';
    default:
      return 'None';
  }
}

// Prefer the server's `message` (apiClient attaches parsed body as error.data).
function getErrorMessage(error, fallback) {
  const defaultMessage = fallback || 'Something went wrong';
  if (!error) {
    return defaultMessage;
  }
  if (error.data && typeof error.data === 'object' && typeof error.data.message === 'string') {
    return error.data.message;
  }
  if (typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return defaultMessage;
}

module.exports = {
  UNITS,
  PURCHASE_STATUSES,
  STOCK_FILTERS,
  toFiniteNumber,
  toNonNegativeNumber,
  toPositiveNumber,
  formatQty,
  formatPrice,
  formatPercent,
  todayISO,
  parseDateInput,
  validateAddItemForm,
  validateIngredientForm,
  validateMovementForm,
  computeUsagePercent,
  computeSuggestedQty,
  computeUnitCost,
  computeConsumedQuantity,
  filterStockList,
  purchaseStatusLabel,
  getErrorMessage,
};
