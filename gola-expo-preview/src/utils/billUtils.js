'use strict';

// Pure, dependency-free helpers for the Bills + Payments UI (Phase 2B).
// CommonJS (module.exports) with no React Native imports so the functions can
// be unit-tested with Node's built-in test runner (see billUtils.test.js).
//
// Mirrors the server contract in server/utils/billingUtils.js + the DTO shape
// returned by toBillDTO: all monetary fields are RUPEES (the server converts
// paise). paymentStatus is derived server-side but re-derived here defensively
// so the tablet is never dependent on a single source.

const { formatCurrency } = require('./dashboardMetrics');

const BILL_STATUSES = ['OPEN', 'SETTLED', 'VOIDING', 'VOID'];
const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'WALLET', 'OTHER'];
const PAYMENT_STATUSES = ['RECORDED', 'REVERSING', 'REVERSED'];

// Derived payment statuses (server: derivePaymentStatus in billingUtils.js).
const PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  SETTLING: 'SETTLING',
  VOID: 'VOID',
  UNKNOWN: 'UNKNOWN',
};

const BILL_STATUS_LABELS = {
  OPEN: 'Open',
  SETTLED: 'Settled',
  VOIDING: 'Voiding',
  VOID: 'Voided',
};

const BILL_STATUS_STYLES = {
  OPEN: { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
  SETTLED: { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  VOIDING: { bg: '#fef9c3', fg: '#a16207', border: '#fde047' },
  VOID: { bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5' },
};

const DEFAULT_BILL_STYLE = { bg: '#e5e7eb', fg: '#374151', border: '#d1d5db' };

const PAYMENT_STATUS_LABELS = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  SETTLING: 'Settling',
  VOID: 'Voided',
  UNKNOWN: 'Unknown',
};

const PAYMENT_STATUS_STYLES = {
  UNPAID: { bg: '#fef3c7', fg: '#b45309', border: '#fde68a' },
  PARTIALLY_PAID: { bg: '#e0f2fe', fg: '#0369a1', border: '#7dd3fc' },
  PAID: { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
  SETTLING: { bg: '#fef9c3', fg: '#a16207', border: '#fde047' },
  VOID: { bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5' },
  UNKNOWN: { bg: '#e5e7eb', fg: '#374151', border: '#d1d5db' },
};

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  WALLET: 'Wallet',
  OTHER: 'Other',
};

// Friendly one-liners keyed by the server error codes (Bill.CODES). Fall back
// to the raw server message, then to a generic message.
const ERROR_CODES = {
  ORDER_ALREADY_BILLED: 'These orders already belong to an active bill.',
  ALREADY_BILLED: 'These orders are already billed.',
  NO_ELIGIBLE_ORDERS: 'No eligible (non-cancelled) orders left to bill.',
  IN_PROGRESS: 'Another billing or order update is in progress. Please retry.',
  ORDER_STATE_CHANGED: 'An order changed while billing. Please retry.',
  EXCEEDS_BALANCE: 'Payment exceeds the balance due.',
  BILL_SETTLED: 'This bill is already settled.',
  BILL_VOID: 'This bill is voided.',
  BILL_NOT_OPEN: 'This bill is locked by another action.',
  VOID_IN_PROGRESS: 'This bill is already being voided.',
  REVERSAL_IN_PROGRESS: 'A reversal is already in progress for this payment.',
  ALREADY_REVERSED: 'This payment was already reversed.',
  ALREADY_VOID: 'This bill was already voided.',
  DUPLICATE_PAYMENT: 'This payment was already recorded.',
  BILL_NOT_FOUND: 'Bill not found.',
};

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

function normalizeBillStatus(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const normalized = raw.trim().toUpperCase();
  return BILL_STATUSES.indexOf(normalized) === -1 ? '' : normalized;
}

// Mirrors the server's billable set (canonical + legacy casing). PLACED, CHANGED
// and cancelled statuses are never billable.
const BILLABLE_STATUSES = ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

function isBillableStatus(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (BILLABLE_STATUSES.indexOf(value.toUpperCase()) === -1) {
    return false;
  }
  // The raw value must also match one of the known server spellings so unknown
  // variants like "ready" (lowercase) do not count as billable.
  return (
    BILLABLE_STATUSES.indexOf(value) !== -1 ||
    ['Accepted', 'Preparing', 'Ready', 'Completed'].indexOf(value) !== -1
  );
}

function countBillableOrders(orders) {
  const list = Array.isArray(orders) ? orders : [];
  return list.reduce(function (count, order) {
    return count + (order && isBillableStatus(order.status) ? 1 : 0);
  }, 0);
}

function billStatusLabel(status) {
  const canonical = normalizeBillStatus(status);
  if (canonical) {
    return BILL_STATUS_LABELS[canonical];
  }
  return typeof status === 'string' && status.trim() ? status.trim() : 'Unknown';
}

function billStatusStyle(status) {
  const canonical = normalizeBillStatus(status);
  return (canonical && BILL_STATUS_STYLES[canonical]) || DEFAULT_BILL_STYLE;
}

// Defensive re-derivation of the display payment status. Matches the server's
// derivePaymentStatus so the tablet shows the same chip even if paymentStatus
// is missing from a payload.
function derivePaymentStatus(bill) {
  if (!bill) {
    return PAYMENT_STATUS.UNKNOWN;
  }
  const canonical = normalizeBillStatus(bill.status);
  if (canonical === 'VOID') {
    return PAYMENT_STATUS.VOID;
  }
  if (canonical === 'SETTLED' || canonical === 'VOIDING') {
    return canonical === 'SETTLED' ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.SETTLING;
  }
  const paid = toFiniteNumber(bill.amountPaid) || 0;
  const due = toFiniteNumber(bill.balanceDue) || 0;
  if (paid > 0 && due <= 0) {
    return PAYMENT_STATUS.PAID;
  }
  if (paid > 0) {
    return PAYMENT_STATUS.PARTIALLY_PAID;
  }
  return PAYMENT_STATUS.UNPAID;
}

function paymentStatus(status, bill) {
  if (!status) {
    return derivePaymentStatus(bill);
  }
  return PAYMENT_STATUS[String(status).trim().toUpperCase()] || PAYMENT_STATUS.UNKNOWN;
}

function paymentStatusLabel(status, bill) {
  const canonical = paymentStatus(status, bill);
  return PAYMENT_STATUS_LABELS[canonical] || 'Unknown';
}

function paymentStatusStyle(status, bill) {
  const canonical = paymentStatus(status, bill);
  return PAYMENT_STATUS_STYLES[canonical] || PAYMENT_STATUS_STYLES.UNKNOWN;
}

function paymentMethodLabel(method) {
  const raw = typeof method === 'string' ? method.trim() : '';
  if (!raw) {
    return 'Other';
  }
  const key = raw.toUpperCase();
  return PAYMENT_METHOD_LABELS[key] || raw;
}

// Lowest-id / most-relevant bill for a session from a (desc-ordered) list:
// prefers an OPEN bill, then SETTLED, then VOIDING, and only falls back to a
// fully VOID bill when nothing more useful exists.
function pickPrimaryBill(bills) {
  const list = Array.isArray(bills) ? bills : [];
  const open = list.find(function (b) {
    return normalizeBillStatus(b && b.status) === 'OPEN';
  });
  if (open) {
    return open;
  }
  const settled = list.find(function (b) {
    return normalizeBillStatus(b && b.status) === 'SETTLED';
  });
  if (settled) {
    return settled;
  }
  const voiding = list.find(function (b) {
    return normalizeBillStatus(b && b.status) === 'VOIDING';
  });
  if (voiding) {
    return voiding;
  }
  return list.length > 0 ? list[0] : null;
}

function canAcceptPayment(bill) {
  return Boolean(
    bill &&
      normalizeBillStatus(bill.status) === 'OPEN' &&
      (toFiniteNumber(bill.balanceDue) || 0) > 0,
  );
}

function canVoidBill(bill) {
  const canonical = bill && normalizeBillStatus(bill.status);
  return canonical === 'OPEN' || canonical === 'SETTLED';
}

// Reversals are only allowed before settlement (server refuses on SETTLED),
// so surface the action only for RECORDED payments on an OPEN bill.
function canReversePayment(payment, bill) {
  return Boolean(
    payment &&
      normalizeBillStatus(bill && bill.status) === 'OPEN' &&
      payment.status === 'RECORDED',
  );
}

// amount must be a number (2-decimal rupees) strictly above zero and never
// more than the balance due.
function validatePaymentAmount(amount, balanceDue) {
  const value = toFiniteNumber(amount);
  if (value === null || value <= 0) {
    return { ok: false, message: 'Enter a valid amount greater than 0.' };
  }
  const due = toFiniteNumber(balanceDue) || 0;
  if (value > due) {
    return { ok: false, message: 'Amount exceeds the balance due (' + formatCurrency(due) + ').' };
  }
  return { ok: true, amount: Math.round(value * 100) / 100 };
}

function billingErrorMessage(error, fallback) {
  const fallbackMessage = fallback || 'Billing operation failed.';
  if (!error || typeof error !== 'object') {
    return fallbackMessage;
  }
  const data = error.data;
  const code = data && data.error;
  const serverMessage = (data && data.message) || error.message;
  if (code && ERROR_CODES[code]) {
    return ERROR_CODES[code];
  }
  if (typeof serverMessage === 'string' && serverMessage.trim()) {
    return serverMessage.trim();
  }
  return fallbackMessage;
}

module.exports = {
  BILL_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS,
  normalizeBillStatus,
  isBillableStatus,
  countBillableOrders,
  billStatusLabel,
  billStatusStyle,
  derivePaymentStatus,
  paymentStatus,
  paymentStatusLabel,
  paymentStatusStyle,
  paymentMethodLabel,
  pickPrimaryBill,
  canAcceptPayment,
  canVoidBill,
  canReversePayment,
  validatePaymentAmount,
  billingErrorMessage,
  formatCurrency,
};