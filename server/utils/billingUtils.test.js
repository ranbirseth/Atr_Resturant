'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    BILL_STATUSES,
    PAYMENT_METHODS,
    PAYMENT_STATUSES,
    STALE_BILL_LOCK_MS,
    TRANSITION_LOCK_TTL_MS,
    canonicalizeStatus,
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
} = require('./billingUtils');

test('money conversion stays exact in paise', () => {
    assert.equal(rupeesToPaisa(0), 0);
    assert.equal(rupeesToPaisa(1), 100);
    assert.equal(rupeesToPaisa(123.45), 12345);
    assert.equal(rupeesToPaisa('99.99'), 9999);
    assert.equal(rupeesToPaisa('10'), 1000);
    assert.equal(rupeesToPaisa(-1), null);
    assert.equal(rupeesToPaisa('abc'), null);
    assert.equal(rupeesToPaisa(null), null);
    assert.equal(rupeesToPaisa(undefined), null);
    assert.equal(rupeesToPaisa(0.1 + 0.2), 30);
    assert.equal(paisaToRupees(12345), 123.45);
    assert.equal(paisaToRupees(100), 1);
    assert.equal(paisaToRupees(0), 0);
    assert.equal(paisaToRupees(null), null);
});

test('canonicalizeStatus maps legacy and uppercase statuses', () => {
    assert.equal(canonicalizeStatus('Pending'), 'PLACED');
    assert.equal(canonicalizeStatus('PREPARING'), 'PREPARING');
    assert.equal(canonicalizeStatus('Preparing'), 'PREPARING');
    assert.equal(canonicalizeStatus('Ready'), 'READY');
    assert.equal(canonicalizeStatus('ChangeRequested'), 'CHANGED');
    assert.equal(canonicalizeStatus('Cancelled'), 'CANCELLED');
    assert.equal(canonicalizeStatus(''), '');
    assert.equal(canonicalizeStatus(null), '');
});

test('billable statuses match the approved set (D1, incl. legacy casing)', () => {
    for (const good of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'Accepted', 'Preparing', 'Ready', 'Completed']) {
        assert.equal(isBillableStatus(good), true, good + ' should be billable');
    }
    for (const bad of ['PLACED', 'CHANGED', 'CANCELLED', 'Pending', 'Cancelled', 'ChangeRequested', '', null, undefined]) {
        assert.equal(isBillableStatus(bad), false, String(bad) + ' should not be billable');
    }
});

test('cancel/change transitions are recognised for the order guard (D3)', () => {
    assert.equal(isCancelTransition('CANCELLED'), true);
    assert.equal(isCancelTransition('Cancelled'), true);
    assert.equal(isCancelTransition('ACCEPTED'), false);
    assert.equal(isChangeTransition('CHANGED'), true);
    assert.equal(isChangeTransition('ChangeRequested'), true);
    assert.equal(isChangeTransition('COMPLETED'), false);
});

test('computeBillTotals snapshots orders and sums paise authoritatively', () => {
    const orders = [
        {
            _id: 'AA',
            orderId: 'ORD-1',
            status: 'ACCEPTED',
            totalAmount: 100,
            items: [
                { itemId: 'x1', name: 'Paneer', quantity: 2, price: 40, customizations: ['Extra'] },
                { itemId: 'x2', name: 'Rice', quantity: 1, price: 20, customizations: [] },
            ],
        },
        { _id: 'BB', orderId: 'ORD-2', status: 'Ready', totalAmount: 50.5, items: [{ name: 'Tea', quantity: 1, price: 50.5 }] },
        { _id: 'CC', orderId: 'ORD-3', status: 'CANCELLED', totalAmount: 99, items: [] },
    ];
    const totals = computeBillTotals(orders);
    assert.equal(totals.totalPaise, 24950);
    assert.equal(totals.orders.length, 3);
    assert.equal(totals.orders[0].statusAtCapture, 'ACCEPTED');
    assert.equal(totals.orders[0].lines[0].linePaise, 8000);
    assert.equal(totals.orders[2].lines.length, 0);
});

test('validatePaymentInput enforces amount/method/idempotencyKey', () => {
    const good = validatePaymentInput({ amount: '250.75', method: 'UPI', idempotencyKey: 'k-1', reference: ' ref ', note: 'note' });
    assert.deepEqual(good.errors, []);
    assert.equal(good.value.amountPaise, 25075);
    assert.equal(good.value.method, 'UPI');
    assert.equal(good.value.reference, 'ref');

    const noAmount = validatePaymentInput({ amount: 0, method: 'CASH', idempotencyKey: 'k' });
    assert.ok(noAmount.errors.some((e) => e.includes('amount')));

    const noKey = validatePaymentInput({ amount: 10, method: 'CASH' });
    assert.ok(noKey.errors.some((e) => e.includes('idempotencyKey')));

    const badMethod = validatePaymentInput({ amount: 10, method: 'BITCOIN', idempotencyKey: 'k' });
    assert.ok(badMethod.errors.some((e) => e.includes('method')));

    const lowerMethod = validatePaymentInput({ amount: 10, method: 'cash', idempotencyKey: 'k' });
    assert.equal(lowerMethod.value.method, 'CASH');
});

test('validateVoidInput passes an optional reason', () => {
    assert.deepEqual(validateVoidInput({}).value, { reason: null });
    assert.deepEqual(validateVoidInput({ reason: '  wrong bill  ' }).value, { reason: 'wrong bill' });
});

test('sumNonReversedPaise matches the amountPaid invariant', () => {
    const payments = [
        { amountPaise: 100, status: 'RECORDED' },
        { amountPaise: 50, status: 'REVERSING' },
        { amountPaise: 30, status: 'REVERSED' },
    ];
    assert.equal(sumNonReversedPaise(payments), 150);
});

test('derivePaymentStatus covers the display states (D5)', () => {
    assert.equal(derivePaymentStatus({ status: 'VOID', amountPaidPaise: 0, balanceDuePaise: 0 }), 'VOID');
    assert.equal(derivePaymentStatus({ status: 'SETTLED', amountPaidPaise: 100, balanceDuePaise: 0 }), 'PAID');
    assert.equal(derivePaymentStatus({ status: 'OPEN', amountPaidPaise: 100, balanceDuePaise: 50 }), 'PARTIALLY_PAID');
    assert.equal(derivePaymentStatus({ status: 'OPEN', amountPaidPaise: 100, balanceDuePaise: 0 }), 'PAID');
    assert.equal(derivePaymentStatus({ status: 'OPEN', amountPaidPaise: 0, balanceDuePaise: 100 }), 'UNPAID');
    assert.equal(derivePaymentStatus({ status: 'VOIDING', amountPaidPaise: 60, balanceDuePaise: 40 }), 'SETTLING');
});

test('assertPaymentConsistency validates the invariants used by the API tests', () => {
    const good = {
        status: 'OPEN',
        totalPaise: 1000,
        amountPaidPaise: 400,
        balanceDuePaise: 600,
        payments: [{ amountPaise: 400, status: 'RECORDED' }],
    };
    assert.deepEqual(assertPaymentConsistency(good), { ok: true, issues: [] });

    const badPaid = {
        status: 'OPEN',
        totalPaise: 1000,
        amountPaidPaise: 999,
        balanceDuePaise: 1,
        payments: [{ amountPaise: 100, status: 'RECORDED' }],
    };
    const result = assertPaymentConsistency(badPaid);
    assert.equal(result.ok, false);
    assert.ok(result.issues.length > 0);

    const voidBill = {
        status: 'VOID',
        totalPaise: 1000,
        amountPaidPaise: 0,
        balanceDuePaise: 0,
        payments: [{ amountPaise: 400, status: 'REVERSED' }],
    };
    assert.deepEqual(assertPaymentConsistency(voidBill), { ok: true, issues: [] });

    const badVoid = Object.assign({}, voidBill, { amountPaidPaise: 5 });
    assert.equal(assertPaymentConsistency(badVoid).ok, false);
});

test('toBillDTO is PII-free and converts to rupees', () => {
    const bill = {
        _id: 'B1',
        billNumber: 'BILL-20261010-0001',
        sessionId: 'user_123_date_20261010',
        userId: 'u1',
        status: 'OPEN',
        totalPaise: 10050,
        amountPaidPaise: 5050,
        balanceDuePaise: 5000,
        settledAt: null,
        voidReason: null,
        voidRequestedAt: null,
        voidedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        orders: [
            {
                orderId: 'o1',
                orderNo: 'ORD-1',
                statusAtCapture: 'ACCEPTED',
                totalPaise: 10050,
                lines: [{ itemId: 'i1', name: 'Paneer', quantity: 1, pricePaise: 10050, linePaise: 10050, customizations: [] }],
            },
        ],
        payments: [
            { paymentId: 'p1', amountPaise: 5050, method: 'CASH', reference: '', note: '', status: 'RECORDED', idempotencyKey: 'k', receivedAt: new Date(), reversalRequestedAt: null, reversedAt: null },
        ],
    };
    const dto = toBillDTO(bill);
    assert.equal(dto.totalAmount, 100.5);
    assert.equal(dto.amountPaid, 50.5);
    assert.equal(dto.balanceDue, 50);
    assert.equal(dto.payments[0].amount, 50.5);
    assert.equal(dto.orders[0].items[0].price, 100.5);
    // PII (issue 1): employee/customer name + mobile + address are absent.
    // (Item "name" on order lines is expected and allowed.)
    const json = JSON.stringify(dto).toLowerCase();
    for (const forbidden of ['mobile', 'address']) {
        assert.equal(json.includes(forbidden), false, 'DTO leaked PII: ' + forbidden);
    }
});

test('lock TTL/STALE constants are sane', () => {
    assert.equal(STALE_BILL_LOCK_MS, 5 * 60 * 1000);
    assert.equal(TRANSITION_LOCK_TTL_MS, 60 * 1000);
    assert.equal(BILL_STATUSES.includes('VOIDING'), true);
    assert.equal(PAYMENT_STATUSES.includes('REVERSING'), true);
    assert.equal(PAYMENT_METHODS.length, 5);
});