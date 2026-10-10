'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const OrderLock = require('../models/OrderLock');
const Counter = require('../models/Counter');
const {
    isBillableStatus,
    computeBillTotals,
    validatePaymentInput,
    validateVoidInput,
    toBillDTO,
} = require('../utils/billingUtils');

const CODES = Bill.CODES;

function sendError(res, result, fallbackMessage) {
    const status = result && result.httpStatus ? result.httpStatus : 409;
    const message = (result && result.message) || fallbackMessage;
    const body = { error: (result && result.code) || 'CONFLICT', message };
    if (result && result.bill) {
        body.bill = toBillDTO(result.bill);
    }
    return res.status(status).json(body);
}

function missingBody(res, message) {
    return res.status(400).json({ error: 'INVALID_BODY', message });
}

// POST /api/billing/sessions/:sessionId/bills
// Captures every currently-billable order in the session that is not already
// covered by a non-void bill, into a fresh immutable bill (D1/D2/D3).
const generateBill = async (req, res) => {
    const sessionId = (req.params.sessionId || '').trim();
    if (!sessionId) {
        return res.status(400).json({ error: 'SESSION_REQUIRED', message: 'sessionId is required' });
    }
    const requestedIds = Array.isArray(req.body && req.body.orderIds) ? req.body.orderIds : null;

    try {
        const orders = await Order.find({ sessionId }).sort({ createdAt: 1 });
        if (orders.length === 0) {
            return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'No orders found for this session' });
        }

        let candidates = orders.filter(function (o) {
            return isBillableStatus(o.status);
        });

        if (requestedIds && requestedIds.length > 0) {
            const wanted = new Set(requestedIds.map(function (id) {
                return String(id);
            }));
            candidates = candidates.filter(function (o) {
                return wanted.has(String(o._id));
            });
        }

        if (candidates.length === 0) {
            const existing = await Bill.getSessionBills(sessionId);
            return res.status(409).json({
                error: CODES.NO_ELIGIBLE_ORDERS,
                message: 'No eligible (non-cancelled) orders left to bill in this session',
                bills: existing.map(toBillDTO),
            });
        }

        // Skip orders already covered by an existing non-void bill (D2).
        const candidateIds = candidates.map(function (o) {
            return String(o._id);
        });
        const alreadyCovered = await Bill.find({
            sessionId,
            status: { $in: ['OPEN', 'SETTLED', 'VOIDING'] },
            'orders.orderId': { $in: candidateIds },
        });
        const coveredSet = new Set();
        alreadyCovered.forEach(function (bill) {
            (bill.orders || []).forEach(function (entry) {
                coveredSet.add(String(entry.orderId));
            });
        });
        candidates = candidates.filter(function (o) {
            return !coveredSet.has(String(o._id));
        });

        if (candidates.length === 0) {
            return res.status(409).json({
                error: CODES.ALREADY_BILLED,
                message: 'All eligible orders in this session already belong to an active bill',
                bills: (await Bill.getSessionBills(sessionId)).map(toBillDTO),
            });
        }

        // Pre-generate the bill id so BILL locks can reference it from birth
        // (issue 4: a lock always points at its bill - no null/backfill window).
        const billId = new mongoose.Types.ObjectId();
        const billNumber = await Counter.nextBillNumber();
        const requestId = randomUUID();

        const acquiredOrderIds = [];
        for (let i = 0; i < candidates.length; i++) {
            const order = candidates[i];
            const result = await OrderLock.acquireBillLock({
                orderId: order._id,
                requestId,
                billId,
                billNumber,
            });
            if (result.ok) {
                acquiredOrderIds.push(String(order._id));
                continue;
            }
            // A conflict on one order aborts the whole capture so the new bill
            // never silently omits an eligible order (delta bills are explicit).
            if (result.code === CODES.IN_PROGRESS) {
                await OrderLock.releaseByBill(billId);
                return res.status(409).json({
                    error: CODES.IN_PROGRESS,
                    message: 'Another billing/order update is in progress on this session; retry',
                });
            }
            // COVERED (already billed race) - skip that order.
        }

        if (acquiredOrderIds.length === 0) {
            await OrderLock.releaseByBill(billId);
            return res.status(409).json({
                error: CODES.ALREADY_BILLED,
                message: 'All eligible orders are already billed',
                bills: (await Bill.getSessionBills(sessionId)).map(toBillDTO),
            });
        }

        // Re-read with BILL locks held: transitions are blocked now, so the
        // captured statuses/totals are stable.
        const freshOrders = await Order.find({ _id: { $in: acquiredOrderIds } }).sort({ createdAt: 1 });
        const stillBillable = freshOrders.filter(function (o) {
            return isBillableStatus(o.status);
        });
        if (stillBillable.length !== acquiredOrderIds.length) {
            await OrderLock.releaseByBill(billId);
            return res.status(409).json({
                error: CODES.ORDER_STATE_CHANGED,
                message: 'An order status changed during capture; retry',
            });
        }

        const totals = computeBillTotals(stillBillable);
        const userId = stillBillable[0].userId;

        const bill = await Bill.createBillRecord({
            billId,
            billNumber,
            sessionId,
            userId,
            orders: totals.orders,
            totalPaise: totals.totalPaise,
        });

        console.log('🧾 Bill generated:', {
            billNumber: bill.billNumber,
            sessionId,
            orderCount: bill.orders.length,
            totalPaise: bill.totalPaise,
        });

        return res.status(201).json(toBillDTO(bill));
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// GET /api/billing/sessions/:sessionId/bills
const getSessionBills = async (req, res) => {
    const sessionId = (req.params.sessionId || '').trim();
    if (!sessionId) {
        return res.status(400).json({ error: 'SESSION_REQUIRED', message: 'sessionId is required' });
    }
    try {
        const bills = await Bill.getSessionBills(sessionId);
        return res.json(bills.map(toBillDTO));
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// GET /api/billing/bills/:id
const getBill = async (req, res) => {
    try {
        const bill = await Bill.getById(req.params.id);
        if (!bill) {
            return res.status(404).json({ error: CODES.NOT_FOUND, message: 'Bill not found' });
        }
        return res.json(toBillDTO(bill));
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// POST /api/billing/bills/:id/payments
const recordPayment = async (req, res) => {
    const { errors, value } = validatePaymentInput(req.body);
    if (errors.length > 0) {
        return missingBody(res, errors.join('; '));
    }
    try {
        const result = await Bill.recordPayment(req.params.id, value, new Date());
        if (result.ok) {
            if (result.alreadyProcessed || result.code === 'DUPLICATE_PAYMENT') {
                const body = { alreadyProcessed: true, message: 'Payment already recorded' };
                if (result.payment) {
                    body.payment = {
                        paymentId: result.payment.paymentId,
                        amount: result.payment.amountPaise / 100,
                        method: result.payment.method,
                        status: result.payment.status,
                    };
                }
                body.bill = toBillDTO(result.bill);
                return res.json(body);
            }
            return res.status(201).json(toBillDTO(result.bill));
        }
        return sendError(res, result, 'Payment could not be recorded');
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// POST /api/billing/bills/:id/payments/:paymentId/reverse
const reversePayment = async (req, res) => {
    const { paymentId } = req.params;
    const reversalKey = (req.body && req.body.reversalKey) || randomUUID();
    try {
        const result = await Bill.reversePayment(req.params.id, paymentId, reversalKey, new Date());
        if (result.ok) {
            const body = toBillDTO(result.bill);
            if (result.alreadyReversed || result.code === 'ALREADY_REVERSED') {
                body.alreadyReversed = true;
            }
            return res.json(body);
        }
        return sendError(res, result, 'Payment could not be reversed');
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// POST /api/billing/bills/:id/void
const voidBill = async (req, res) => {
    const { errors, value } = validateVoidInput(req.body);
    if (errors.length > 0) {
        return missingBody(res, errors.join('; '));
    }
    try {
        const result = await Bill.voidBill(req.params.id, value.reason, new Date());
        if (result.ok) {
            // V3 committed -> release the bill's ORDER LOCKS. Released AFTER
            // the bill is VOID so cancel/update stay blocked while VOIDING.
            if (result.code !== 'ALREADY_VOID') {
                await OrderLock.releaseByBill(req.params.id);
            }
            return res.json(toBillDTO(result.bill));
        }
        return sendError(res, result, 'Bill could not be voided');
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// POST /api/billing/bills/:id/resume  (crash recovery / reconciliation)
const resumeBill = async (req, res) => {
    try {
        const result = await Bill.resumeBill(req.params.id, new Date());
        if (result.ok) {
            if (result.bill && result.bill.status === 'VOID') {
                await OrderLock.releaseByBill(req.params.id);
            }
            return res.json(toBillDTO(result.bill));
        }
        return sendError(res, result, 'Bill could not be resumed');
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    generateBill,
    getSessionBills,
    getBill,
    recordPayment,
    reversePayment,
    voidBill,
    resumeBill,
};