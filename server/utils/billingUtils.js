'use strict';

// Pure, dependency-free helpers for the Bills + Payments module (Phase 2B).
// Kept free of Mongoose so they can be unit tested with Node's built-in test
// runner (node --test). CommonJS to match the rest of server/utils/.
//
// Money discipline: bills/payments are stored as INTEGER PAISE. The REST API
// accepts and returns RUPEES (amount / 100). Conversion is the only place
// floats are touched, so balances never accumulate float dust.

const BILL_STATUSES = ['OPEN', 'SETTLED', 'VOIDING', 'VOID'];
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
                  items: lines,
              };
          })
        : [];
    return {
        _id: bill._id ? String(bill._id) : null,
        billNumber: bill.billNumber,
        sessionId: bill.sessionId,
        userId: bill.userId ? String(bill.userId) : null,
        status: bill.status,
        paymentStatus: derivePaymentStatus(bill),
        totalAmount: paisaToRupees(bill.totalPaise),
        amountPaid: paisaToRupees(bill.amountPaidPaise),
        balanceDue: paisaToRupees(bill.balanceDuePaise),
        orderCount: orders.length,
        orders: orders,
        payments: payments,
        settledAt: bill.settledAt || null,
        voidReason: bill.voidReason || null,
        voidRequestedAt: bill.voidRequestedAt || null,
        voidedAt: bill.voidedAt || null,
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
    };
}

module.exports = {
    BILL_STATUSES,
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
    toBillDTO,
};