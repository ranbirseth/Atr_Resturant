'use strict';

// Pure, dependency-free helpers for the Menu & Categories module.
// CommonJS (module.exports) with no React Native imports so the functions can
// be unit-tested with Node's built-in test runner (see menuUtils.test.js).

const { formatCurrency } = require('./dashboardMetrics');

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

function toFinitePrice(value) {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

function isValidPrice(value) {
  return toFinitePrice(value) !== null;
}

// A configured staff price takes precedence; legacy items fall back to price.
function computeStaffPrice(price, staffPrice) {
  return toFinitePrice(staffPrice ?? price);
}

function normalizeCategoryName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  return name.trim().replace(/\s+/g, ' ');
}

function categoryKey(name) {
  return normalizeCategoryName(name).toLowerCase();
}

function formatPrice(value) {
  const parsed = toFinitePrice(value);
  if (parsed === null) {
    return '\u2014';
  }
  return formatCurrency(parsed);
}

// Two-decimal rupee string (e.g. "₹59.40") for exact price display.
function formatPriceExact(value) {
  const parsed = toFinitePrice(value);
  if (parsed === null) {
    return '\u2014';
  }
  return '\u20B9' + parsed.toFixed(2);
}

// A usable item image URL, or null. React Native's Image can only render a
// remote URL or a data URI, so anything else (blank, whitespace, a bare
// filename, an invalid scheme) is treated as "no image" and the caller shows a
// neutral placeholder. Never mutates the item.
function itemImageUrl(item, apiBaseUrl) {
  if (!item || typeof item.image !== 'string') {
    return null;
  }
  const url = item.image.trim();
  if (!url) {
    return null;
  }
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    const baseUrl = String(apiBaseUrl || '')
      .trim()
      .replace(/\/api\/?$/i, '')
      .replace(/\/+$/, '');
    return baseUrl ? baseUrl + url : null;
  }
  return null;
}

// Price shown for a given audience ('CUSTOMER' | 'STAFF').
function audiencePrice(item, audience) {
  if (!item) {
    return null;
  }
  return String(audience || '').trim().toUpperCase() === 'STAFF'
    ? computeStaffPrice(item.price, item.staffPrice)
    : toFinitePrice(item.price);
}

// Search + category + veg filters for the item list.
function filterItems(items, filters) {
  const list = Array.isArray(items) ? items : [];
  const options = filters || {};
  const query = (options.query || '').trim().toLowerCase();
  const category = options.category || 'All';
  const veg = options.veg || 'all';

  return list.filter(function (item) {
    if (!item) {
      return false;
    }
    const name = typeof item.name === 'string' ? item.name.toLowerCase() : '';
    const description = typeof item.description === 'string' ? item.description.toLowerCase() : '';
    const matchesQuery = !query || name.includes(query) || description.includes(query);
    const matchesCategory = category === 'All' || categoryKey(item.category) === categoryKey(category);
    let matchesVeg = true;
    if (veg === 'veg') {
      matchesVeg = item.isVeg !== false;
    } else if (veg === 'nonveg') {
      matchesVeg = item.isVeg === false;
    }
    return matchesQuery && matchesCategory && matchesVeg;
  });
}

function itemCountForCategory(items, categoryName) {
  const key = categoryKey(categoryName);
  if (!key) {
    return 0;
  }
  return (Array.isArray(items) ? items : []).filter(function (item) {
    return item && categoryKey(item.category) === key;
  }).length;
}

function validateItemForm(form) {
  const values = form || {};
  const errors = {};

  if (!String(values.name || '').trim()) {
    errors.name = 'Name is required';
  }
  if (!normalizeCategoryName(values.category)) {
    errors.category = 'Category is required';
  }
  if (toFinitePrice(values.price) === null) {
    errors.price = 'Customer price must be 0 or more';
  }
  if (
    values.staffPrice !== undefined &&
    values.staffPrice !== null &&
    String(values.staffPrice).trim() !== '' &&
    toFinitePrice(values.staffPrice) === null
  ) {
    errors.staffPrice = 'Staff price must be 0 or more';
  }

  const prep = values.estimatedPreparationTime;
  if (prep !== undefined && prep !== null && String(prep).trim() !== '') {
    const parsed = toFiniteNumber(prep);
    if (parsed === null || parsed < 0) {
      errors.estimatedPreparationTime = 'Preparation time must be 0 or more minutes';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors: errors };
}

function validateCategoryForm(form) {
  const values = form || {};
  const errors = {};
  if (!String(values.name || '').trim()) {
    errors.name = 'Category name is required';
  }
  return { valid: Object.keys(errors).length === 0, errors: errors };
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
  toFiniteNumber: toFiniteNumber,
  toFinitePrice: toFinitePrice,
  isValidPrice: isValidPrice,
  computeStaffPrice: computeStaffPrice,
  normalizeCategoryName: normalizeCategoryName,
  categoryKey: categoryKey,
  formatPrice: formatPrice,
  formatPriceExact: formatPriceExact,
  itemImageUrl: itemImageUrl,
  audiencePrice: audiencePrice,
  filterItems: filterItems,
  itemCountForCategory: itemCountForCategory,
  validateItemForm: validateItemForm,
  validateCategoryForm: validateCategoryForm,
  getErrorMessage: getErrorMessage,
};
