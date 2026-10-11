'use strict';

// Pure, dependency-free helpers for the Customer/Staff audience selector that
// gates POS and session bill creation.
//
// CommonJS (module.exports) with no React Native imports so the functions can
// be unit-tested with Node's built-in test runner (see audienceBilling.test.js).
//
// The audience is ALWAYS chosen explicitly before a bill is created; nothing
// here defaults a new checkout to CUSTOMER. Client-side prices are a display
// PREVIEW only - the server recomputes every amount authoritatively from the
// database (CUSTOMER = current menu price, STAFF = 60% of the customer price).

const { computeStaffPrice, toFinitePrice } = require('./menuUtils');

const AUDIENCES = ['CUSTOMER', 'STAFF'];

// STRICT parse: returns 'CUSTOMER' | 'STAFF' for a clean selection, else null.
// null means "no valid audience selected yet" - callers must block creation.
function normalizeAudience(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return AUDIENCES.indexOf(upper) === -1 ? null : upper;
}

function audienceLabel(value) {
  const audience = normalizeAudience(value);
  if (audience === 'CUSTOMER') {
    return 'Customer';
  }
  if (audience === 'STAFF') {
    return 'Staff';
  }
  return null;
}

// Preview unit price for the chosen audience. STAFF derives 60% of the customer
// price (mirrors the backend); CUSTOMER (or no selection) uses the customer
// price. Returns null for a malformed price so callers can skip the line.
function audienceUnitPrice(price, audience) {
  const base = toFinitePrice(price);
  if (base === null) {
    return null;
  }
  return normalizeAudience(audience) === 'STAFF' ? computeStaffPrice(base) : base;
}

// Returns a new cart whose line prices are re-expressed for the audience, so
// preview totals (subtotal/payable and per-line totals) update live when the
// selection changes. The source cart keeps customer prices; only the display
// copy is repriced. A null audience leaves the customer prices untouched.
function cartForAudience(cart, audience) {
  const list = Array.isArray(cart) ? cart : [];
  const normalized = normalizeAudience(audience);
  return list.map(function (line) {
    const priced = audienceUnitPrice(line && line.price, normalized);
    return Object.assign({}, line, { price: priced === null ? (line && line.price) : priced });
  });
}

function toLineQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : 0;
}

// POS bill payload for POST /api/billing/pos/bills. Only itemId + quantity are
// sent - the server is authoritative for all prices and totals. Returns null
// when no audience is selected or the cart has no usable line, which keeps the
// Create button disabled rather than silently defaulting to Customer.
function buildPosPayload(audience, cart) {
  const normalized = normalizeAudience(audience);
  if (normalized === null) {
    return null;
  }
  const list = Array.isArray(cart) ? cart : [];
  const items = list
    .map(function (line) {
      const itemId = line && line.itemId != null ? String(line.itemId).trim() : '';
      return { itemId: itemId, quantity: toLineQuantity(line && line.quantity) };
    })
    .filter(function (line) {
      return line.itemId !== '' && line.quantity > 0;
    });
  if (items.length === 0) {
    return null;
  }
  return { audience: normalized, items: items };
}

function canCreatePosBill(cart, audience) {
  return buildPosPayload(audience, cart) !== null;
}

// Session bill payload for POST /api/billing/sessions/:id/bills. The server
// rejects mixed-audience sessions and enforces that the requested audience
// matches the captured orders' audience.
function buildSessionPayload(audience) {
  const normalized = normalizeAudience(audience);
  if (normalized === null) {
    return null;
  }
  return { audience: normalized };
}

// Fresh per-checkout reference. A new checkout always gets a new key (and a
// cleared audience) so a previous selection is never reused by accident. The
// server keeps its idempotency contract: same key + same payload returns the
// original bill; same key + different payload is rejected.
function makeIdempotencyKey(prefix) {
  const tag = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'pos';
  const rand = function () {
    return Math.random().toString(36).slice(2, 10);
  };
  return tag + '-' + Date.now().toString(36) + '-' + rand() + rand();
}

// Starting state for a brand-new checkout: no audience, fresh idempotency key.
function newCheckout() {
  return { audience: null, idempotencyKey: makeIdempotencyKey('pos') };
}

module.exports = {
  AUDIENCES: AUDIENCES,
  normalizeAudience: normalizeAudience,
  audienceLabel: audienceLabel,
  audienceUnitPrice: audienceUnitPrice,
  cartForAudience: cartForAudience,
  buildPosPayload: buildPosPayload,
  canCreatePosBill: canCreatePosBill,
  buildSessionPayload: buildSessionPayload,
  makeIdempotencyKey: makeIdempotencyKey,
  newCheckout: newCheckout,
};
