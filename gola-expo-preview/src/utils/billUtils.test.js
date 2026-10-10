'use strict';

// Focused unit tests for the Bills + Payments UI helpers.
// Run with: node --test src/utils/billUtils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
  PAYMENT_STATUS,
} = require('./billUtils');

const OPEN = {
  _id: 'b1',
  billNumber: 'BILL-20261010-001',
  sessionId: 's1',
  status: 'OPEN',
  totalAmount: 250,
  amountPaid: 100,
  balanceDue: 150,
};
const SETTLED = { ...OPEN, _id: 'b2', status: 'SETTLED', amountPaid: 250, balanceDue: 0 };
const VOIDING = { ...OPEN, _id: 'b3', status: 'VOIDING' };
const VOID = { ...VOIDING, _id: 'b4', status: 'VOID', amountPaid: 0, balanceDue: 0 };

test('normalizeBillStatus maps only the four valid statuses, tolerating casing', () => {
  assert.equal(normalizeBillStatus('OPEN'), 'OPEN');
  assert.equal(normalizeBillStatus('  settled '), 'SETTLED');
  assert.equal(normalizeBillStatus('Voiding'), 'VOIDING');
  assert.equal(normalizeBillStatus('void'), 'VOID');
  assert.equal(normalizeBillStatus('PAID'), '');
  assert.equal(normalizeBillStatus(null), '');
  assert.equal(normalizeBillStatus(undefined), '');
  assert.equal(normalizeBillStatus(''), '');
});

test('isBillableStatus matches the server billable set exactly', () => {
  assert.equal(isBillableStatus('ACCEPTED'), true);
  assert.equal(isBillableStatus('PREPARING'), true);
  assert.equal(isBillableStatus('READY'), true);
  assert.equal(isBillableStatus('COMPLETED'), true);
  assert.equal(isBillableStatus('Accepted'), true);
  assert.equal(isBillableStatus('Preparing'), true);
  assert.equal(isBillableStatus('Ready'), true);
  assert.equal(isBillableStatus('Completed'), true);
  assert.equal(isBillableStatus('PLACED'), false);
  assert.equal(isBillableStatus('CHANGED'), false);
  assert.equal(isBillableStatus('CANCELLED'), false);
  assert.equal(isBillableStatus('ready'), false);
  assert.equal(isBillableStatus(''), false);
  assert.equal(isBillableStatus(null), false);
});

test('countBillableOrders counts only billable orders, ignoring junk', () => {
  const orders = [
    { status: 'ACCEPTED' },
    { status: 'Ready' },
    { status: 'PLACED' },
    { status: 'CANCELLED' },
    { status: null },
    null,
  ];
  assert.equal(countBillableOrders(orders), 2);
  assert.equal(countBillableOrders([]), 0);
  assert.equal(countBillableOrders(null), 0);
});

test('billStatusLabel returns friendly labels with an Unknown fallback', () => {
  assert.equal(billStatusLabel('OPEN'), 'Open');
  assert.equal(billStatusLabel('SETTLED'), 'Settled');
  assert.equal(billStatusLabel('VOIDING'), 'Voiding');
  assert.equal(billStatusLabel('VOID'), 'Voided');
  assert.equal(billStatusLabel('draft'), 'draft');
  assert.equal(billStatusLabel(''), 'Unknown');
  assert.equal(billStatusLabel(null), 'Unknown');
});

test('billStatusStyle returns a palette per status and a default otherwise', () => {
  assert.equal(billStatusStyle('OPEN').fg, '#15803d');
  assert.equal(billStatusStyle('VOID').fg, '#b91c1c');
  assert.equal(billStatusStyle('SETTLED').fg, '#1d4ed8');
  assert.deepEqual(
    billStatusStyle('nope'),
    { bg: '#e5e7eb', fg: '#374151', border: '#d1d5db' },
  );
});

test('derivePaymentStatus matches the server rules (unpaid/partial/paid/void/settling)', () => {
  assert.equal(derivePaymentStatus(null), PAYMENT_STATUS.UNKNOWN);
  assert.equal(derivePaymentStatus({}), PAYMENT_STATUS.UNPAID);
  assert.equal(derivePaymentStatus(OPEN), PAYMENT_STATUS.PARTIALLY_PAID);
  assert.equal(
    derivePaymentStatus({ ...OPEN, amountPaid: 250, balanceDue: 0 }),
    PAYMENT_STATUS.PAID,
  );
  assert.equal(derivePaymentStatus({ ...OPEN, amountPaid: 0, balanceDue: 250 }), PAYMENT_STATUS.UNPAID);
  assert.equal(derivePaymentStatus(SETTLED), PAYMENT_STATUS.PAID);
  assert.equal(derivePaymentStatus(VOIDING), PAYMENT_STATUS.SETTLING);
  assert.equal(derivePaymentStatus(VOID), PAYMENT_STATUS.VOID);
});

test('paymentStatus prefers an explicit value and derives from the bill otherwise', () => {
  assert.equal(paymentStatus('PAID'), PAYMENT_STATUS.PAID);
  assert.equal(paymentStatus('paid'), PAYMENT_STATUS.PAID);
  assert.equal(paymentStatus('bogus'), PAYMENT_STATUS.UNKNOWN);
  assert.equal(paymentStatus(null, OPEN), PAYMENT_STATUS.PARTIALLY_PAID);
  assert.equal(paymentStatus(undefined, SETTLED), PAYMENT_STATUS.PAID);
  assert.equal(paymentStatus(null, VOID), PAYMENT_STATUS.VOID);
});

test('paymentStatusLabel / paymentStatusStyle are null-safe', () => {
  assert.equal(paymentStatusLabel('PAID'), 'Paid');
  assert.equal(paymentStatusLabel(null, OPEN), 'Partially Paid');
  assert.equal(paymentStatusLabel(null, null), 'Unknown');
  assert.equal(paymentStatusStyle('PAID').fg, '#15803d');
  assert.equal(paymentStatusStyle(null, VOID).fg, '#b91c1c');
});

test('paymentMethodLabel maps methods and falls back to the raw value', () => {
  assert.equal(paymentMethodLabel('CASH'), 'Cash');
  assert.equal(paymentMethodLabel('upi'), 'UPI');
  assert.equal(paymentMethodLabel('CARD'), 'Card');
  assert.equal(paymentMethodLabel('WALLET'), 'Wallet');
  assert.equal(paymentMethodLabel('OTHER'), 'Other');
  assert.equal(paymentMethodLabel('Cheque'), 'Cheque');
  assert.equal(paymentMethodLabel(null), 'Other');
  assert.equal(paymentMethodLabel(''), 'Other');
});

test('pickPrimaryBill prefers OPEN, then SETTLED, then VOIDING, then falls back', () => {
  assert.equal(pickPrimaryBill(null), null);
  assert.equal(pickPrimaryBill([]), null);
  assert.equal(pickPrimaryBill([VOID, SETTLED, OPEN]), OPEN);
  assert.equal(pickPrimaryBill([VOID, SETTLED, VOIDING]), SETTLED);
  assert.equal(pickPrimaryBill([VOID, VOIDING]), VOIDING);
  assert.equal(pickPrimaryBill([VOID]), VOID);
});

test('canAcceptPayment only on OPEN bills with a positive balance due', () => {
  assert.equal(canAcceptPayment(OPEN), true);
  assert.equal(canAcceptPayment({ ...OPEN, balanceDue: 0 }), false);
  assert.equal(canAcceptPayment(SETTLED), false);
  assert.equal(canAcceptPayment(VOID), false);
  assert.equal(canAcceptPayment(null), false);
});

test('canVoidBill on OPEN and SETTLED only', () => {
  assert.equal(canVoidBill(OPEN), true);
  assert.equal(canVoidBill(SETTLED), true);
  assert.equal(canVoidBill(VOIDING), false);
  assert.equal(canVoidBill(VOID), false);
  assert.equal(canVoidBill(null), false);
});

test('canReversePayment only on RECORDED payments of an OPEN bill', () => {
  assert.equal(
    canReversePayment({ status: 'RECORDED' }, OPEN),
    true,
  );
  assert.equal(
    canReversePayment({ status: 'REVERSING' }, OPEN),
    false,
  );
  assert.equal(
    canReversePayment({ status: 'RECORDED' }, SETTLED),
    false,
  );
  assert.equal(canReversePayment({ status: 'RECORDED' }, null), false);
  assert.equal(canReversePayment(null, OPEN), false);
});

test('validatePaymentAmount rejects non-positive and over-balance amounts', () => {
  assert.equal(validatePaymentAmount(150, 250).ok, true);
  assert.equal(validatePaymentAmount(150, 250).amount, 150);
  assert.equal(validatePaymentAmount(150.555, 250).amount, 150.56);
  assert.equal(validatePaymentAmount(0, 250).ok, false);
  assert.equal(validatePaymentAmount(-5, 250).ok, false);
  assert.equal(validatePaymentAmount('abc', 250).ok, false);
  assert.equal(validatePaymentAmount(null, 250).ok, false);
  assert.equal(validatePaymentAmount(300, 250).ok, false);
  assert.equal(validatePaymentAmount(250, 0).ok, false);
});

test('billingErrorMessage maps known server codes to friendly text', () => {
  const code = function (error) {
    return billingErrorMessage({ status: 409, data: { error: error } });
  };
  assert.equal(code('EXCEEDS_BALANCE'), 'Payment exceeds the balance due.');
  assert.equal(code('BILL_SETTLED'), 'This bill is already settled.');
  assert.equal(code('ORDER_ALREADY_BILLED'), 'These orders already belong to an active bill.');
  assert.equal(code('ALREADY_BILLED'), 'These orders are already billed.');
  assert.equal(code('IN_PROGRESS'), 'Another billing or order update is in progress. Please retry.');
  assert.equal(code('VOID_IN_PROGRESS'), 'This bill is already being voided.');
});

test('billingErrorMessage falls back to the server message, then the fallback', () => {
  const http = new Error('HTTP 500');
  http.status = 500;
  http.data = { message: 'Something exploded' };
  assert.equal(billingErrorMessage(http), 'Something exploded');

  assert.equal(billingErrorMessage(null), 'Billing operation failed.');
  assert.equal(billingErrorMessage(undefined, 'Custom fallback'), 'Custom fallback');
  assert.equal(billingErrorMessage({}), 'Billing operation failed.');
  assert.equal(billingErrorMessage({ data: { message: '  ' } }), 'Billing operation failed.');
});