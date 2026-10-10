'use strict';

// Pure, dependency-free helpers for the Users & Coupons module.
// CommonJS (module.exports) with no React Native imports so the functions can
// be unit-tested with Node's built-in test runner (see userCouponUtils.test.js).
//
// Field shapes mirror the existing backend responses exactly:
//   User   -> { id, name, email, phone, joined, status, orders }
//   Coupon -> { _id, code, discountType, value, minOrderAmount, isActive, createdAt, updatedAt }

const { formatCurrency } = require('./dashboardMetrics');
const { getErrorMessage } = require('./menuUtils');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Case-insensitive search over the fields the backend actually returns.
function filterUsers(users, query) {
  const list = Array.isArray(users) ? users : [];
  const q = normalizeText(query).toLowerCase();
  if (!q) {
    return list.slice();
  }
  return list.filter(function (user) {
    if (!user || typeof user !== 'object') {
      return false;
    }
    const name = normalizeText(user.name).toLowerCase();
    const email = normalizeText(user.email).toLowerCase();
    const phone = normalizeText(user.phone).toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });
}

// Two-letter avatar label; falls back to "NA" for unnamed records.
function userInitials(name) {
  const text = normalizeText(name);
  if (!text) {
    return 'NA';
  }
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatDiscount(coupon) {
  if (!coupon || typeof coupon !== 'object') {
    return '\u2014';
  }
  const amount = Number(coupon.value);
  if (!Number.isFinite(amount)) {
    return '\u2014';
  }
  if (coupon.discountType === 'PERCENT') {
    return amount + '% OFF';
  }
  if (coupon.discountType === 'FLAT') {
    return formatCurrency(amount) + ' OFF';
  }
  return '\u2014';
}

function formatMinOrder(coupon) {
  const amount = coupon ? Number(coupon.minOrderAmount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'No minimum';
  }
  return formatCurrency(amount);
}

function formatDate(value) {
  if (!value) {
    return 'N/A';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleDateString();
}

function toPositiveNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function toNonNegativeNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

// Mirrors the server-side createCoupon rules: code + discountType + value>0
// required, discountType is PERCENT|FLAT, minOrderAmount is optional (>= 0).
function validateCouponForm(form) {
  const values = form || {};
  const errors = {};

  if (!normalizeText(values.code)) {
    errors.code = 'Coupon code is required';
  }

  if (values.discountType !== 'PERCENT' && values.discountType !== 'FLAT') {
    errors.discountType = 'Select a discount type';
  }

  if (toPositiveNumber(values.value) === null) {
    errors.value = 'Value must be greater than 0';
  }

  const minRaw = values.minOrderAmount;
  if (minRaw !== undefined && minRaw !== null && String(minRaw).trim() !== '') {
    if (toNonNegativeNumber(minRaw) === null) {
      errors.minOrderAmount = 'Minimum order must be 0 or more';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors: errors };
}

// Produces the exact body the backend createCoupon expects.
function buildCouponPayload(form) {
  const values = form || {};
  const minRaw = values.minOrderAmount;
  const hasMin = minRaw !== undefined && minRaw !== null && String(minRaw).trim() !== '';
  return {
    code: normalizeText(values.code).toUpperCase(),
    discountType: values.discountType,
    value: Number(values.value),
    minOrderAmount: hasMin ? Number(minRaw) : 0,
    isActive: values.isActive !== false,
  };
}

module.exports = {
  filterUsers: filterUsers,
  userInitials: userInitials,
  formatDiscount: formatDiscount,
  formatMinOrder: formatMinOrder,
  formatDate: formatDate,
  toPositiveNumber: toPositiveNumber,
  toNonNegativeNumber: toNonNegativeNumber,
  validateCouponForm: validateCouponForm,
  buildCouponPayload: buildCouponPayload,
  getErrorMessage: getErrorMessage,
};
