'use strict';

// Pure, dependency-free helpers for the Bills + Payments module (Phase 2B).
// Kept free of Mongoose so they can be unit tested with Node's built-in test
// runner (node --test). CommonJS to match the rest of server/utils/.
//
// Money discipline: bills/payments are stored as INTEGER PAISE. The REST API
// accepts and returns RUPEES (amount / 100). Conversion is the only place
// floats are touched, so balances never accumulate float dust.

const crypto = require('crypto');
const {
    buildAuthoritativeOrder,
    categoryKey,
} = require('./menuUtils');

const BILL_STATUSES = ['OPEN', 'SETTLED', 'VOIDING', 'VOID'];
// P1.3: revenue-recognized (generated) statuses vs explicitly separated voided
// statuses. The owner decided OPEN bills count as revenue as soon as generated.
const RECOGNIZED_BILL_STATUSES = ['OPEN', 'SETTLED'];
const VOIDED_BILL_STATUSES = ['VOIDING', 'VOID'];
// Asia/Kolkata is a fixed UTC+05:30 offset (no DST), so date-only analytics
// ranges can be resolved without a timezone library.
const IST_UTC_OFFSET_MINUTES = 5 * 60 + 30;
const IST_OFFSET_ISO = '+05:30';
const AUDIENCES = ['CUSTOMER', 'STAFF'];
const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'WALLET', 'OTHER'];
const PAYMENT_STATUSES = ['RECORDED', 'REVERSING', 'REVERSED'];
const LOCK_PURPOSES = ['BILL', 'TRANSITION'];

// Billable order statuses (canonical + legacy casing). PLACED, CHANGED and any
// cancelled status are never billable.
const BILLABLE_STATUS_SET = {
    ACCEPTED: true,
    PREPARING: true,
    READY: true,
    COMPLETED: true,
    Accepted: true,
    Preparing: true,
    Ready: true,
    Completed: true,
};

// How old a BILL lock whose Bill document is missing must be before it is safe
// to treat it as an orphaned (crashed) capture and delete it.
const STALE_BILL_LOCK_MS = 5 * 60 * 1000;

// TRANSITION locks auto-expire (TTL index) after this long so a crashed
// cancel/update can never block a bill permanently.
const TRANSITION_LOCK_TTL_MS = 60 * 1000;

// Canonical status maps (order statuses received from Order.find()).
function canonicalizeStatus(raw) {
    const map = {
        PLACED: 'PLACED',
        PENDING: 'PLACED',
        ACCEPTED: 'ACCEPTED',
        PREPARING: 'PREPARING',
        READY: 'READY',
        CHANGED: 'CHANGED',
        CHANGEREQUESTED: 'CHANGED',
        UPDATED: 'CHANGED',
        CANCELLED: 'CANCELLED',
        COMPLETED: 'COMPLETED',
    };
    if (raw === null || raw === undefined) {
        return '';
    }
    return map[String(raw).trim().toUpperCase()] || '';
}

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

// Rupees (up to 2 decimals) -> integer paise. Returns null for missing,
// non-numeric or negative input.
function rupeesToPaisa(value) {
    const rupees = toFiniteNumber(value);
    if (rupees === null || rupees < 0) {
        return null;
    }
    return Math.round(rupees * 100);
}

// Integer paise -> rupees as a 2-decimal number.
function paisaToRupees(paise) {
    const p = toFiniteNumber(paise);
    if (p === null) {
        return null;
    }
    return Math.round(p) / 100;
}

function isBillableStatus(raw) {
    return Boolean(canonicalizeStatus(raw) && BILLABLE_STATUS_SET[String(raw).trim()]);
}

function isCancelTransition(raw) {
    return canonicalizeStatus(raw) === 'CANCELLED';
}

function isChangeTransition(raw) {
    return canonicalizeStatus(raw) === 'CHANGED';
}

// Builds the immutable snapshot + totals for a bill from its order docs.
// `orders` items: { _id, orderId, status, totalAmount, items:[{itemId,name,quantity,price,customizations}] }.
function computeBillTotals(orders) {
    const list = Array.isArray(orders) ? orders : [];
    let totalPaise = 0;
    const lines = list.map(function (order) {
        const orderAmountPaise = rupeesToPaisa(order && order.totalAmount);
        const safePaise = orderAmountPaise === null ? 0 : orderAmountPaise;
        totalPaise += safePaise;
        const itemLines = Array.isArray(order && order.items)
            ? order.items.map(function (item) {
                  const pricePaise = rupeesToPaisa(item && item.price);
                  const safePrice = pricePaise === null ? 0 : pricePaise;
                  const quantity = toFiniteNumber(item && item.quantity) || 0;
                  return {
                      itemId: item && item.itemId ? String(item.itemId) : null,
                      name: (item && item.name) || '',
                      quantity: quantity,
                      pricePaise: safePrice,
                      linePaise: Math.round(safePrice * quantity),
                      customizations: Array.isArray(item && item.customizations) ? item.customizations : [],
                  };
              })
            : [];
        return {
            orderId: order && order._id ? String(order._id) : null,
            orderNo: (order && order.orderId) || '',
            statusAtCapture: (order && order.status) || '',
            totalPaise: safePaise,
            lines: itemLines,
        };
    });
    return { totalPaise: totalPaise, orders: lines };
}

// Validate + whitelist a payment payload. `amount` arrives in RUPEES.
function validatePaymentInput(body) {
    const src = body || {};
    const errors = [];
    const value = {};

    const amountPaise = rupeesToPaisa(src.amount);
    if (amountPaise === null || amountPaise <= 0) {
        errors.push('amount must be a number greater than 0');
    } else {
        value.amountPaise = amountPaise;
    }

    const method = typeof src.method === 'string' ? src.method.trim().toUpperCase() : '';
    if (!PAYMENT_METHODS.includes(method)) {
        errors.push('method must be one of: ' + PAYMENT_METHODS.join(', '));
    } else {
        value.method = method;
    }

    const idempotencyKey =
        src.idempotencyKey !== undefined && src.idempotencyKey !== null && String(src.idempotencyKey).trim() !== ''
            ? String(src.idempotencyKey).trim()
            : '';
    if (!idempotencyKey) {
        errors.push('idempotencyKey is required to record a payment exactly once');
    } else {
        value.idempotencyKey = idempotencyKey;
    }

    if (src.reference !== undefined && src.reference !== null) {
        value.reference = String(src.reference).trim();
    }
    if (src.note !== undefined && src.note !== null) {
        value.note = String(src.note).trim();
    }

    return { errors, value };
}

function validateVoidInput(body) {
    const src = body || {};
    const value = {};
    if (src.reason !== undefined && src.reason !== null) {
        value.reason = String(src.reason).trim();
    } else {
        value.reason = null;
    }
    return { errors: [], value };
}

// Sum of paise that still count toward amountPaid: every payment EXCEPT
// reversed ones (an in-flight REVERSING payment has not had its $inc undone
// yet, so it still counts until it flips to REVERSED atomically).
function sumNonReversedPaise(payments) {
    const list = Array.isArray(payments) ? payments : [];
    let total = 0;
    for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].status !== 'REVERSED') {
            total += toFiniteNumber(list[i].amountPaise) || 0;
        }
    }
    return total;
}

// Derived payment status for display (D5: never stored on the Order model).
function derivePaymentStatus(bill) {
    if (!bill) {
        return 'UNKNOWN';
    }
    if (bill.status === 'VOID') {
        return 'VOID';
    }
    if (bill.status === 'SETTLED' || bill.status === 'VOIDING') {
        return bill.status === 'SETTLED' ? 'PAID' : 'SETTLING';
    }
    const paid = toFiniteNumber(bill.amountPaidPaise) || 0;
    const due = toFiniteNumber(bill.balanceDuePaise) || 0;
    if (paid > 0 && due <= 0) {
        return 'PAID';
    }
    if (paid > 0) {
        return 'PARTIALLY_PAID';
    }
    return 'UNPAID';
}

// Invariant checker used by the API tests after every mutation/retry/recovery:
//   amountPaid === sum(non-reversed paise); balanceDue === total - amountPaid;
//   a VOID bill is fully zeroed with no RECORDED/REVERSING payments.
function assertPaymentConsistency(bill) {
    const issues = [];
    if (!bill) {
        return { ok: false, issues: ['no bill'] };
    }
    const sumPaid = sumNonReversedPaise(bill.payments);
    const amountPaid = toFiniteNumber(bill.amountPaidPaise) || 0;
    const total = toFiniteNumber(bill.totalPaise) || 0;

    if (amountPaid !== sumPaid) {
        issues.push(`amountPaidPaise (${amountPaid}) !== sum non-reversed (${sumPaid})`);
    }
    if (bill.status === 'VOID') {
        if (toFiniteNumber(bill.amountPaidPaise) !== 0) issues.push('VOID bill has amountPaidPaise != 0');
        if (toFiniteNumber(bill.balanceDuePaise) !== 0) issues.push('VOID bill has balanceDuePaise != 0');
        if (Array.isArray(bill.payments)) {
            const pending = bill.payments.filter(function (p) {
                return p && (p.status === 'RECORDED' || p.status === 'REVERSING');
            });
            if (pending.length > 0) issues.push('VOID bill still has RECORDED/REVERSING payments');
        }
    } else {
        const due = toFiniteNumber(bill.balanceDuePaise) || 0;
        if (due !== total - amountPaid) {
            issues.push(`balanceDuePaise (${due}) !== total (${total}) - amountPaid (${amountPaid})`);
        }
    }
    return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// P1.3 helpers: independent pricing, coupon preservation, idempotency hashing
// and IST analytics-range resolution.
// ---------------------------------------------------------------------------

// STRICT audience parse for requests that must choose one. Returns null when the
// value is missing/blank/not CUSTOMER|STAFF (callers map null -> 400).
function parseAudience(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const normalized = String(value).trim().toUpperCase();
    return AUDIENCES.includes(normalized) ? normalized : null;
}

// Canonical audience for a stored order (missing/legacy -> CUSTOMER).
function orderAudience(value) {
    const parsed = parseAudience(value);
    return parsed || 'CUSTOMER';
}

// Detect a session whose orders span both audiences (rule C: reject mixed).
function detectMixedAudience(orders) {
    const list = Array.isArray(orders) ? orders : [];
    let audience = null;
    for (let i = 0; i < list.length; i++) {
        const current = orderAudience(list[i] && list[i].audience);
        if (audience === null) {
            audience = current;
        } else if (audience !== current) {
            return { mixed: true, audience: null };
        }
    }
    return { mixed: false, audience: audience || 'CUSTOMER' };
}

// Independently price requested items from scratch at the CURRENT menu prices
// for the chosen audience. Wraps the shared authoritative builder and converts
// the rupee subtotal to integer paise. Never trusts client prices.
function priceLinesForAudience(options) {
    const result = buildAuthoritativeOrder({
        audience: options && options.audience,
        requestedItems: options && options.requestedItems,
        dbItems: options && options.dbItems,
        hiddenCategories: options && options.hiddenCategories,
    });
    if (!result.ok) {
        return {
            ok: false,
            status: result.status || 400,
            message: result.message || 'Invalid order items',
            errors: result.errors || [],
            audience: result.audience,
            lines: [],
            subtotalPaise: 0,
        };
    }
    const lines = result.lines.map(function (line) {
        const pricePaise = rupeesToPaisa(line.price);
        const safePrice = pricePaise === null ? 0 : pricePaise;
        const quantity = toFiniteNumber(line.quantity) || 0;
        return {
            itemId: line.itemId ? String(line.itemId) : null,
            name: line.name || '',
            quantity: quantity,
            pricePaise: safePrice,
            linePaise: Math.round(safePrice * quantity),
            customizations: Array.isArray(line.customizations) ? line.customizations : [],
        };
    });
    const subtotalPaise = lines.reduce(function (sum, line) {
        return sum + line.linePaise;
    }, 0);
    return { ok: true, status: 200, lines, subtotalPaise, audience: result.audience };
}

// Apply a preserved coupon discount to a freshly-priced subtotal. The discount
// is clamped so the payable total is never negative and the discount never
// exceeds the subtotal. Returns integer paise.
function applyPreservedDiscount(subtotalPaise, preservedDiscountPaise) {
    const subtotal = Math.max(0, Math.round(toFiniteNumber(subtotalPaise) || 0));
    const requested = Math.max(0, Math.round(toFiniteNumber(preservedDiscountPaise) || 0));
    const discountPaise = Math.min(subtotal, requested);
    return { subtotalPaise: subtotal, discountPaise: discountPaise, totalPaise: subtotal - discountPaise };
}

// Deterministic JSON so identical payloads always hash identically regardless
// of key insertion order.
function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value === undefined ? null : value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    return '{' + keys
        .map(function (key) {
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
        })
        .join(',') + '}';
}

// sha256 over a namespaced canonical payload. Persisted so a reused key with a
// different payload can be distinguished from a safe retry (rule E).
function computeRequestHash(kind, payload) {
    const canonical = stableStringify({ kind: kind, payload: payload });
    return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Canonical POS item list for hashing/validation: string itemIds, integer
// quantities, sorted customizations. Order of items is preserved.
function canonicalizePosItems(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map(function (item) {
        return {
            itemId: item && item.itemId !== undefined && item.itemId !== null ? String(item.itemId).trim() : '',
            quantity: toFiniteNumber(item && item.quantity),
            customizations: Array.isArray(item && item.customizations)
                ? item.customizations
                      .filter(function (value) {
                          return typeof value === 'string' && value.trim() !== '';
                      })
                      .map(function (value) {
                          return value.trim();
                      })
                : [],
        };
    });
}

// Canonical session order-id list for hashing. Accepts an array of ids.
function canonicalizeSessionOrderIds(orderIds) {
    const list = Array.isArray(orderIds) ? orderIds : [];
    return list.map(function (id) {
        return id !== undefined && id !== null ? String(id) : '';
    });
}

// Parse a single analytics boundary. Date-only values are resolved in IST
// (Asia/Kolkata, fixed UTC+05:30): `from` = 00:00:00.000 IST, `to` =
// 23:59:59.999 IST (inclusive end-of-day). Full timestamps are honored; a
// timestamp without an explicit offset is interpreted as IST.
function parseIstBoundary(value, isEnd) {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const parts = raw.split('-').map(Number);
        const utcMidnight = Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
        const check = new Date(utcMidnight);
        if (
            check.getUTCFullYear() !== parts[0] ||
            check.getUTCMonth() !== parts[1] - 1 ||
            check.getUTCDate() !== parts[2]
        ) {
            return null;
        }
        const base = utcMidnight - IST_UTC_OFFSET_MINUTES * 60 * 1000;
        return new Date(isEnd ? base + 24 * 60 * 60 * 1000 - 1 : base);
    }
    const hasOffset = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const parsed = new Date(hasOffset ? raw : raw + IST_OFFSET_ISO);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
}

// Resolve the optional analytics window into concrete UTC Date boundaries.
function resolveAnalyticsRange(query) {
    const src = query || {};
    const errors = [];
    const hasFrom = src.from !== undefined && src.from !== null && String(src.from).trim() !== '';
    const hasTo = src.to !== undefined && src.to !== null && String(src.to).trim() !== '';
    const from = hasFrom ? parseIstBoundary(src.from, false) : null;
    const to = hasTo ? parseIstBoundary(src.to, true) : null;
    if (hasFrom && from === null) {
        errors.push('from must be a valid date (YYYY-MM-DD) or ISO timestamp');
    }
    if (hasTo && to === null) {
        errors.push('to must be a valid date (YYYY-MM-DD) or ISO timestamp');
    }
    if (from && to && from.getTime() > to.getTime()) {
        errors.push('from must be on or before to');
    }
    return { errors: errors, from: from, to: to };
}

// Build the Mongo match for bill analytics. Legacy bills predate origin/audience
// and are treated as SESSION/CUSTOMER, so a null/absent field matches those
// filters via `$in: [value, null]` (Mongo's null also matches missing).
function buildBillAnalyticsMatch(options) {
    const opts = options || {};
    const conditions = [];
    if (opts.from) {
        conditions.push({ createdAt: { $gte: opts.from } });
    }
    if (opts.to) {
        conditions.push({ createdAt: { $lte: opts.to } });
    }
    if (opts.origin === 'POS') {
        conditions.push({ origin: 'POS' });
    } else if (opts.origin === 'SESSION') {
        conditions.push({ origin: { $in: ['SESSION', null] } });
    }
    if (opts.audience === 'STAFF') {
        conditions.push({ audience: 'STAFF' });
    } else if (opts.audience === 'CUSTOMER') {
        conditions.push({ audience: { $in: ['CUSTOMER', null] } });
    }
    if (conditions.length === 0) {
        return {};
    }
    return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

// PII-free API representation. Billing responses deliberately omit customer
// name/contact/address (owner decision) and convert paise to rupees.
function toBillDTO(bill) {
    if (!bill) {
        return null;
    }
    const payments = Array.isArray(bill.payments)
        ? bill.payments.map(function (p) {
              return {
                  paymentId: p.paymentId,
                  amount: paisaToRupees(p.amountPaise),
                  method: p.method,
                  reference: p.reference || '',
                  note: p.note || '',
                  status: p.status,
                  idempotencyKey: p.idempotencyKey,
                  receivedAt: p.receivedAt,
                  reversalRequestedAt: p.reversalRequestedAt || null,
                  reversedAt: p.reversedAt || null,
              };
          })
        : [];
    const orders = Array.isArray(bill.orders)
        ? bill.orders.map(function (o) {
              const lines = Array.isArray(o.lines)
                  ? o.lines.map(function (line) {
                        return {
                            itemId: line.itemId,
                            name: line.name,
                            quantity: line.quantity,
                            price: paisaToRupees(line.pricePaise),
                            total: paisaToRupees(line.linePaise),
                            customizations: line.customizations || [],
                        };
                    })
                  : [];
              return {
                  orderId: o.orderId,
                  orderNo: o.orderNo,
                  statusAtCapture: o.statusAtCapture,
                  total: paisaToRupees(o.totalPaise),
                  originalTotal: paisaToRupees(o.originalTotalPaise),
                  billedTotal: paisaToRupees(o.billedTotalPaise),
                  discount: paisaToRupees(o.discountPaise),
                  couponCode: o.couponCode || '',
                  items: lines,
              };
          })
        : [];
    const billLines = Array.isArray(bill.lines)
        ? bill.lines.map(function (line) {
              return {
                  itemId: line.itemId,
                  name: line.name,
                  quantity: line.quantity,
                  price: paisaToRupees(line.pricePaise),
                  total: paisaToRupees(line.linePaise),
                  customizations: line.customizations || [],
              };
          })
        : [];
    return {
        _id: bill._id ? String(bill._id) : null,
        billNumber: bill.billNumber,
        sessionId: bill.sessionId,
        userId: bill.userId ? String(bill.userId) : null,
        origin: bill.origin || 'SESSION',
        audience: bill.audience || 'CUSTOMER',
        status: bill.status,
        paymentStatus: derivePaymentStatus(bill),
        subtotal: paisaToRupees(bill.subtotalPaise),
        discount: paisaToRupees(bill.discountPaise),
        couponCode: bill.couponCode || '',
        totalAmount: paisaToRupees(bill.totalPaise),
        amountPaid: paisaToRupees(bill.amountPaidPaise),
        balanceDue: paisaToRupees(bill.balanceDuePaise),
        orderCount: orders.length,
        orders: orders,
        lines: billLines,
        payments: payments,
        createdBy: bill.createdBy || '',
        settledAt: bill.settledAt || null,
        voidReason: bill.voidReason || null,
        voidedBy: bill.voidedBy || '',
        voidRequestedAt: bill.voidRequestedAt || null,
        voidedAt: bill.voidedAt || null,
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
    };
}

module.exports = {
    BILL_STATUSES,
    RECOGNIZED_BILL_STATUSES,
    VOIDED_BILL_STATUSES,
    AUDIENCES,
    PAYMENT_METHODS,
    PAYMENT_STATUSES,
    LOCK_PURPOSES,
    BILLABLE_STATUS_SET,
    STALE_BILL_LOCK_MS,
    TRANSITION_LOCK_TTL_MS,
    canonicalizeStatus,
    toFiniteNumber,
    rupeesToPaisa,
    paisaToRupees,
    isBillableStatus,
    isCancelTransition,
    isChangeTransition,
    computeBillTotals,
    validatePaymentInput,
    validateVoidInput,
    sumNonReversedPaise,
    derivePaymentStatus,
    assertPaymentConsistency,
    parseAudience,
    orderAudience,
    detectMixedAudience,
    priceLinesForAudience,
    applyPreservedDiscount,
    stableStringify,
    computeRequestHash,
    canonicalizePosItems,
    canonicalizeSessionOrderIds,
    parseIstBoundary,
    resolveAnalyticsRange,
    buildBillAnalyticsMatch,
    toBillDTO,
};