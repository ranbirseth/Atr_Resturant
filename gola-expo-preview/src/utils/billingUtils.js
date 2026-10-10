'use strict';

// Pure, dependency-free helpers for the POS Billing module.
// CommonJS (module.exports) with no React Native imports so the functions can
// be unit-tested with Node's built-in test runner (see billingUtils.test.js).
//
// Prices always come from the customer-facing `price` on the menu item fetched
// from GET /api/items?audience=customer. Nothing here invents prices, taxes,
// service charges, or discounts.

const { toFinitePrice } = require('./menuUtils');
const { formatCurrency } = require('./dashboardMetrics');

const MAX_QUANTITY = 99;

function lineId(line) {
  if (!line || typeof line !== 'object' || line.itemId == null) {
    return '';
  }
  return String(line.itemId);
}

// Clamps any quantity-like value to an integer in [1, MAX_QUANTITY]. Anything
// non-numeric, <= 0, or malformed returns 0 (meaning "not a valid quantity").
function toQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const integer = Math.floor(parsed);
  if (integer < 1) {
    return 0;
  }
  if (integer > MAX_QUANTITY) {
    return MAX_QUANTITY;
  }
  return integer;
}

// An item can be sold only if it exists, is available for customers, has an id
// and a usable non-negative customer price. Unavailable/invalid items are
// never added to the cart.
function isItemSellable(item) {
  if (!item || typeof item !== 'object') {
    return false;
  }
  if (item.available === false) {
    return false;
  }
  if (item._id == null || String(item._id).trim() === '') {
    return false;
  }
  return toFinitePrice(item.price) !== null;
}

function lineFromItem(item) {
  return {
    itemId: String(item._id),
    name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Item',
    price: toFinitePrice(item.price),
    category: typeof item.category === 'string' ? item.category : '',
    quantity: 1,
  };
}

// Adds an item (or increments an existing line). Returns a new cart array; the
// input cart is never mutated. Selling an unsellable item is a no-op.
function addItem(cart, item, step) {
  const list = Array.isArray(cart) ? cart.slice() : [];
  if (!isItemSellable(item)) {
    return list;
  }
  const increment = toQuantity(step == null ? 1 : step) || 1;
  const id = String(item._id);
  const index = list.findIndex(function (line) {
    return lineId(line) === id;
  });
  if (index >= 0) {
    const current = toQuantity(list[index].quantity) || 1;
    list[index] = Object.assign({}, list[index], { quantity: toQuantity(current + increment) });
    return list;
  }
  const line = lineFromItem(item);
  line.quantity = increment;
  list.push(line);
  return list;
}

// Sets a line's quantity. A quantity that clamps to 0 removes the line.
function setQuantity(cart, itemId, quantity) {
  const list = Array.isArray(cart) ? cart : [];
  const id = itemId != null ? String(itemId) : '';
  const qty = toQuantity(quantity);
  if (qty === 0) {
    return removeItem(list, id);
  }
  return list.map(function (line) {
    if (lineId(line) !== id) {
      return line;
    }
    return Object.assign({}, line, { quantity: qty });
  });
}

function cartQuantity(cart, itemId) {
  const list = Array.isArray(cart) ? cart : [];
  const id = itemId != null ? String(itemId) : '';
  const found = list.find(function (line) {
    return lineId(line) === id;
  });
  return found ? toQuantity(found.quantity) : 0;
}

function incrementItem(cart, itemId) {
  const current = cartQuantity(cart, itemId);
  if (current <= 0) {
    return Array.isArray(cart) ? cart.slice() : [];
  }
  return setQuantity(cart, itemId, current + 1);
}

// Decrementing a line at quantity 1 removes it (min quantity is 1).
function decrementItem(cart, itemId) {
  const current = cartQuantity(cart, itemId);
  if (current <= 0) {
    return Array.isArray(cart) ? cart.slice() : [];
  }
  if (current === 1) {
    return removeItem(cart, itemId);
  }
  return setQuantity(cart, itemId, current - 1);
}

function removeItem(cart, itemId) {
  const list = Array.isArray(cart) ? cart : [];
  const id = itemId != null ? String(itemId) : '';
  return list.filter(function (line) {
    return lineId(line) !== id;
  });
}

function clearCart() {
  return [];
}

// Line total guards against malformed price/quantity (returns 0, never NaN).
function lineTotal(line) {
  const price = toFinitePrice(line && line.price);
  const qty = toQuantity(line && line.quantity);
  if (price === null || qty <= 0) {
    return 0;
  }
  return price * qty;
}

function cartTotals(cart) {
  const list = Array.isArray(cart) ? cart : [];
  let subtotal = 0;
  let unitCount = 0;
  for (let i = 0; i < list.length; i++) {
    const qty = toQuantity(list[i] && list[i].quantity);
    const price = toFinitePrice(list[i] && list[i].price);
    if (qty > 0 && price !== null) {
      subtotal += price * qty;
      unitCount += qty;
    }
  }
  return {
    lineCount: list.length,
    unitCount: unitCount,
    subtotal: subtotal,
  };
}

// A discount can never be negative or exceed the subtotal.
function sanitizeDiscount(discountAmount, subtotal) {
  const discount = toFinitePrice(discountAmount);
  const base = toFinitePrice(subtotal);
  if (discount === null || discount <= 0 || base === null || base <= 0) {
    return 0;
  }
  return Math.min(discount, base);
}

function computePayable(subtotal, discountAmount) {
  const base = toFinitePrice(subtotal);
  const safeSubtotal = base === null ? 0 : base;
  return Math.max(0, safeSubtotal - sanitizeDiscount(discountAmount, safeSubtotal));
}

// The Generate Bill button is enabled only for a non-empty cart whose every
// line has an id, a valid quantity and a valid price.
function canGenerateBill(cart) {
  const list = Array.isArray(cart) ? cart : [];
  if (list.length === 0) {
    return false;
  }
  return list.every(function (line) {
    return (
      lineId(line) !== '' &&
      toQuantity(line.quantity) > 0 &&
      toFinitePrice(line.price) !== null
    );
  });
}

module.exports = {
  MAX_QUANTITY: MAX_QUANTITY,
  toQuantity: toQuantity,
  isItemSellable: isItemSellable,
  lineFromItem: lineFromItem,
  addItem: addItem,
  setQuantity: setQuantity,
  cartQuantity: cartQuantity,
  incrementItem: incrementItem,
  decrementItem: decrementItem,
  removeItem: removeItem,
  clearCart: clearCart,
  lineTotal: lineTotal,
  cartTotals: cartTotals,
  sanitizeDiscount: sanitizeDiscount,
  computePayable: computePayable,
  canGenerateBill: canGenerateBill,
  formatCurrency: formatCurrency,
};
