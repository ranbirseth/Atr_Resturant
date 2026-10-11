'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const OrderLock = require('../models/OrderLock');
const Counter = require('../models/Counter');
const Item = require('../models/Item');
const Category = require('../models/Category');
const {
    isBillableStatus,
    computeBillTotals,
    validatePaymentInput,
    validateVoidInput,
    toBillDTO,
    parseAudience,
    detectMixedAudience,
    priceLinesForAudience,
    applyPreservedDiscount,
    computeRequestHash,
    canonicalizePosItems,
    canonicalizeSessionOrderIds,
    buildBillAnalyticsMatch,
    resolveAnalyticsRange,
    rupeesToPaisa,
    BILL_STATUSES,
} = require('../utils/billingUtils');
const { categoryKey } = require('../utils/menuUtils');

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

function respondIdempotent(res, bill, requestKey, hash) {
    const body = toBillDTO(bill);
    body.alreadyProcessed = true;
    if (requestKey) {
        body.requestKey = requestKey;
    }
    if (hash) {
        body.requestHash = hash;
    }
    return res.status(200).json(body);
}

function isDuplicateKeyError(err) {
    return err && err.code === 11000;
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
        const audienceRequest = req.body && req.body.audience;

        // Handle optional audience from request (P1.3). When explicitly provided,
        // all captured orders must match and pricing will be independent.
        let requestedAudience = null;
        if (audienceRequest !== undefined) {
            requestedAudience = parseAudience(audienceRequest);
            if (requestedAudience === null) {
                return res.status(400).json({ error: 'INVALID_AUDIENCE', message: 'audience must be CUSTOMER or STAFF' });
            }
        }

        // Idempotency namespace per decision E: SESSION:<key>.
        let idempotencyKey = null;
        let requestHash = null;
        if (req.body && req.body.idempotencyKey !== undefined && req.body.idempotencyKey !== null) {
            const key = String(req.body.idempotencyKey).trim();
            if (key === '') {
                return res.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY', message: 'idempotencyKey must be non-empty' });
            }
            idempotencyKey = 'SESSION:' + key;
            const payload = {
                sessionId,
                orderIds: requestedIds ? requestedIds.map((id) => String(id)) : null,
                audience: requestedAudience,
            };
            requestHash = computeRequestHash('generateBill', payload);
        }

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

        // Idempotency fast-path: if we've already created a bill with this key,
        // respond with the existing bill (200, alreadyProcessed). Insert-first
        // handles the race later as well.
        if (idempotencyKey) {
            const cached = await Bill.findByIdempotencyKey(idempotencyKey);
            if (cached) {
                const keyOut = String(req.body.idempotencyKey).trim();
                if (cached.requestHash && requestHash && cached.requestHash !== requestHash) {
                    return res.status(409).json({ error: 'IDEMPOTENCY_KEY_REUSED', message: 'idempotencyKey was reused with different payload', requestKey: keyOut });
                }
                return respondIdempotent(res, cached, keyOut, cached.requestHash);
            }
        }

        // Detect mixed audience; if request specifies audience it must match all.
        const mixed = detectMixedAudience(candidates);
        if (mixed.mixed) {
            return res.status(400).json({ error: 'MIXED_AUDIENCE', message: 'Session contains orders of different audiences (CUSTOMER and STAFF); bill one audience at a time' });
        }
        const sessionAudience = mixed.audience || 'CUSTOMER';
        if (requestedAudience && requestedAudience !== sessionAudience) {
            return res.status(400).json({ error: 'AUDIENCE_MISMATCH', message: 'Requested audience does not match the audience of selected orders' });
        }
        const effectiveAudience = requestedAudience || sessionAudience;

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

        // Freeze source order snapshots (original totals/coupons) and compute
        // billed totals independently at CURRENT menu prices. CUSTOMER bills
        // preserve the source-order coupon discount (decision B); STAFF bills
        // carry no coupon. The legacy no-audience path keeps Phase 2B behavior.
        let totals;
        let billOrders = [];
        let billLines = [];
        let subtotalPaise = 0;
        let discountPaise = 0;
        let couponCode = '';
        if (requestedAudience) {
            const itemIds = [];
            stillBillable.forEach(function (order) {
                (order.items || []).forEach(function (line) {
                    if (line && line.itemId) {
                        itemIds.push(String(line.itemId));
                    }
                });
            });
            const dbItems = itemIds.length > 0 ? await Item.find({ _id: { $in: itemIds } }) : [];
            const categories = await Category.find({}, 'name staffVisible customerVisible isVisible');
            const hiddenCategories = new Set();
            if (effectiveAudience === 'STAFF') {
                categories
                    .filter(function (c) { return c.staffVisible === false; })
                    .forEach(function (c) { hiddenCategories.add(categoryKey(c.name)); });
            }

            const pricedOrders = [];
            const allLines = [];
            let runningSubtotal = 0;
            let preservedDiscount = 0;
            let preservedCoupon = '';
            for (let i = 0; i < stillBillable.length; i++) {
                const order = stillBillable[i];
                const requestedItems = (order.items || []).map(function (l) {
                    return { itemId: l.itemId ? String(l.itemId) : '', quantity: l.quantity, customizations: l.customizations };
                });
                const priceRes = priceLinesForAudience({
                    audience: effectiveAudience,
                    requestedItems: requestedItems,
                    dbItems: dbItems,
                    hiddenCategories: hiddenCategories,
                });
                if (!priceRes.ok) {
                    await OrderLock.releaseByBill(billId);
                    return res.status(priceRes.status).json({ error: 'INVALID_ORDER_ITEMS', message: priceRes.message });
                }
                const originalPaise = rupeesToPaisa(order && order.totalAmount) || 0;
                const orderDisc = rupeesToPaisa(order && order.discountAmount) || 0;
                const orderCoupon = (order && order.couponCode) || '';
                const billedTotal = priceRes.subtotalPaise;
                const isCustomer = effectiveAudience === 'CUSTOMER';
                runningSubtotal += billedTotal;
                for (let j = 0; j < priceRes.lines.length; j++) {
                    allLines.push(priceRes.lines[j]);
                }
                if (isCustomer) {
                    preservedDiscount += orderDisc;
                    if (!preservedCoupon && orderCoupon) {
                        preservedCoupon = orderCoupon;
                    }
                }
                pricedOrders.push({
                    orderId: order._id,
                    orderNo: order.orderId,
                    statusAtCapture: order.status,
                    totalPaise: originalPaise,
                    originalTotalPaise: originalPaise,
                    billedTotalPaise: billedTotal,
                    discountPaise: isCustomer ? orderDisc : 0,
                    couponCode: isCustomer ? orderCoupon : '',
                    lines: priceRes.lines,
                });
            }
            subtotalPaise = runningSubtotal;
            billLines = allLines;
            billOrders = pricedOrders;
            totals = applyPreservedDiscount(subtotalPaise, effectiveAudience === 'CUSTOMER' ? preservedDiscount : 0);
            discountPaise = totals.discountPaise;
            couponCode = effectiveAudience === 'CUSTOMER' ? preservedCoupon : '';
        } else {
            const legacy = computeBillTotals(stillBillable);
            billOrders = legacy.orders;
            subtotalPaise = legacy.totalPaise;
            discountPaise = 0;
            couponCode = '';
            totals = applyPreservedDiscount(subtotalPaise, 0);
        }
        const userId = stillBillable[0].userId;

        try {
            const bill = await Bill.createBillRecord({
                billId,
                billNumber,
                sessionId,
                userId,
                orders: billOrders,
                lines: billLines,
                totalPaise: totals.totalPaise,
                subtotalPaise: subtotalPaise,
                discountPaise: discountPaise,
                couponCode: couponCode,
                origin: 'SESSION',
                audience: effectiveAudience,
                idempotencyKey,
                requestHash,
                createdBy: '',
            });
            console.log('🧾 Bill generated:', {
                billNumber: bill.billNumber,
                sessionId,
                orderCount: bill.orders.length,
                totalPaise: bill.totalPaise,
            });
            return res.status(201).json(toBillDTO(bill));
        } catch (err) {
            await OrderLock.releaseByBill(billId);
            if (isDuplicateKeyError(err) && idempotencyKey) {
                const cached = await Bill.findByIdempotencyKey(idempotencyKey);
                if (cached) {
                    const keyOut = String(req.body.idempotencyKey).trim();
                    return respondIdempotent(res, cached, keyOut, cached.requestHash);
                }
                const keyOut = String(req.body.idempotencyKey).trim();
                return res.status(409).json({ error: 'IDEMPOTENCY_KEY_REUSED', message: 'idempotencyKey was reused', requestKey: keyOut });
            }
            throw err;
        }
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

// POST /api/billing/pos/bills
// Direct POS checkout: no fake Order; one bill per checkout. audience required.
const createPosBill = async (req, res) => {
    const body = req.body || {};
    const audience = parseAudience(body.audience);
    if (audience === null) {
        return res.status(400).json({ error: 'AUDIENCE_REQUIRED', message: 'audience must be CUSTOMER or STAFF' });
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
        return res.status(400).json({ error: 'INVALID_BODY', message: 'items must be a non-empty array' });
    }
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const id = item && item.itemId !== undefined && item.itemId !== null ? String(item.itemId).trim() : '';
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'INVALID_BODY', message: 'each itemId must be a valid ObjectId' });
        }
    }
    const idempotencyKey = body.idempotencyKey !== undefined && body.idempotencyKey !== null
        ? String(body.idempotencyKey).trim()
        : '';
    if (!idempotencyKey) {
        return res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'idempotencyKey is required for POS bills' });
    }
    const keyNs = 'POS:' + idempotencyKey;
    try {
        const cached = await Bill.findByIdempotencyKey(keyNs);
        if (cached) {
            const requestHash = computeRequestHash('posBill', {
                audience,
                items: canonicalizePosItems(items),
                createdBy: body.createdBy || '',
            });
            if (cached.requestHash && requestHash && cached.requestHash !== requestHash) {
                return res.status(409).json({ error: 'IDEMPOTENCY_KEY_REUSED', message: 'idempotencyKey was reused with different payload', requestKey: idempotencyKey });
            }
            return respondIdempotent(res, cached, idempotencyKey, cached.requestHash);
        }
        const itemIds = items.map(function (l) { return String(l.itemId); });
        const dbItems = await Item.find({ _id: { $in: itemIds } });
        const categories = await Category.find({}, 'name staffVisible customerVisible isVisible');
        let hiddenCategories = new Set();
        if (audience === 'STAFF') {
            categories
                .filter(function (c) { return c.staffVisible === false; })
                .forEach(function (c) { hiddenCategories.add(categoryKey(c.name)); });
        }
        const priceRes = priceLinesForAudience({
            audience,
            requestedItems: canonicalizePosItems(items),
            dbItems,
            hiddenCategories,
        });
        if (!priceRes.ok) {
            return res.status(priceRes.status).json({ error: 'INVALID_ORDER_ITEMS', message: priceRes.message });
        }
        const totals = applyPreservedDiscount(priceRes.subtotalPaise, 0);
        const billId = new mongoose.Types.ObjectId();
        const billNumber = await Counter.nextBillNumber();
        const requestHash = computeRequestHash('posBill', {
            audience,
            items: canonicalizePosItems(items),
            createdBy: body.createdBy || '',
        });
        try {
            const bill = await Bill.createBillRecord({
                billId,
                billNumber,
                sessionId: null,
                userId: null,
                orders: [],
                lines: priceRes.lines,
                totalPaise: totals.totalPaise,
                subtotalPaise: totals.subtotalPaise,
                discountPaise: totals.discountPaise,
                couponCode: '',
                origin: 'POS',
                audience,
                idempotencyKey: keyNs,
                requestHash,
                createdBy: body.createdBy ? String(body.createdBy).trim() : '',
            });
            return res.status(201).json(toBillDTO(bill));
        } catch (err) {
            if (isDuplicateKeyError(err)) {
                const cached = await Bill.findByIdempotencyKey(keyNs);
                if (cached) {
                    const hash = computeRequestHash('posBill', {
                        audience,
                        items: canonicalizePosItems(items),
                        createdBy: body.createdBy || '',
                    });
                    if (cached.requestHash && hash && cached.requestHash !== hash) {
                        return res.status(409).json({ error: 'IDEMPOTENCY_KEY_REUSED', message: 'idempotencyKey was reused with different payload', requestKey: idempotencyKey });
                    }
                    return respondIdempotent(res, cached, idempotencyKey, cached.requestHash);
                }
                return res.status(409).json({ error: 'IDEMPOTENCY_KEY_REUSED', message: 'idempotencyKey was reused', requestKey: idempotencyKey });
            }
            throw err;
        }
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

// GET /api/billing/analytics
const getBillAnalytics = async (req, res) => {
    const query = req.query || {};
    const { errors, from, to } = resolveAnalyticsRange(query);
    if (errors.length > 0) {
        return res.status(400).json({ error: 'INVALID_RANGE', message: errors.join('; ') });
    }
    let originFilter = null;
    if (query.origin !== undefined && query.origin !== null && String(query.origin).trim() !== '') {
        const o = String(query.origin).trim().toUpperCase();
        if (o !== 'SESSION' && o !== 'POS') {
            return res.status(400).json({ error: 'INVALID_ORIGIN', message: 'origin must be SESSION or POS' });
        }
        originFilter = o;
    }
    let audienceFilter = null;
    if (query.audience !== undefined && query.audience !== null && String(query.audience).trim() !== '') {
        const a = parseAudience(query.audience);
        if (a === null) {
            return res.status(400).json({ error: 'INVALID_AUDIENCE', message: 'audience must be CUSTOMER or STAFF' });
        }
        audienceFilter = a;
    }
    try {
        const match = buildBillAnalyticsMatch({ from, to, origin: originFilter, audience: audienceFilter });
        const pipeline = [
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalBills: { $sum: 1 },
                    recognizedBills: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, 1, 0] } },
                    voidedBills: { $sum: { $cond: [{ $in: ['$status', ['VOIDING', 'VOID']] }, 1, 0] } },
                    recognizedTotalPaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$totalPaise', 0] }, 0] } },
                    amountPaidPaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$amountPaidPaise', 0] }, 0] } },
                    balanceDuePaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$balanceDuePaise', 0] }, 0] } },
                    voidedTotalPaise: { $sum: { $cond: [{ $in: ['$status', ['VOIDING', 'VOID']] }, { $ifNull: ['$totalPaise', 0] }, 0] } },
                },
            },
        ];
        const agg = await Bill.aggregate(pipeline);
        const r = agg[0] || { totalBills: 0, recognizedBills: 0, voidedBills: 0, recognizedTotalPaise: 0, amountPaidPaise: 0, balanceDuePaise: 0, voidedTotalPaise: 0 };
        const byAudience = await Bill.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $ifNull: ['$audience', 'CUSTOMER'] },
                    count: { $sum: 1 },
                    recognized: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, 1, 0] } },
                    totalPaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$totalPaise', 0] }, 0] } },
                    amountPaidPaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$amountPaidPaise', 0] }, 0] } },
                    balanceDuePaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$balanceDuePaise', 0] }, 0] } },
                },
            },
        ]);
        const byOrigin = await Bill.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $ifNull: ['$origin', 'SESSION'] },
                    count: { $sum: 1 },
                    recognized: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, 1, 0] } },
                    totalPaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$totalPaise', 0] }, 0] } },
                    amountPaidPaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$amountPaidPaise', 0] }, 0] } },
                    balanceDuePaise: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'SETTLED']] }, { $ifNull: ['$balanceDuePaise', 0] }, 0] } },
                },
            },
        ]);
        return res.json({
            totals: {
                totalBills: r.totalBills,
                recognizedBills: r.recognizedBills,
                voidedBills: r.voidedBills,
                recognizedTotal: r.recognizedTotalPaise / 100,
                amountPaid: r.amountPaidPaise / 100,
                balanceDue: r.balanceDuePaise / 100,
                voidedTotal: r.voidedTotalPaise / 100,
            },
            byAudience: byAudience.map(function (x) {
                return { audience: x._id, count: x.count, recognized: x.recognized, total: x.totalPaise / 100, amountPaid: x.amountPaidPaise / 100, balanceDue: x.balanceDuePaise / 100 };
            }),
            byOrigin: byOrigin.map(function (x) {
                return { origin: x._id, count: x.count, recognized: x.recognized, total: x.totalPaise / 100, amountPaid: x.amountPaidPaise / 100, balanceDue: x.balanceDuePaise / 100 };
            }),
            range: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// GET /api/billing/bills
// Read-only bill listing for the Reviews & Analytics module (Phase 3). There is
// no bill-CHANGE here: it only reads Bill records and maps them to the PII-free
// DTO, so consumed bills can be bucketed by IST day on the client.
//
// Optional filters (mirror GET /api/billing/analytics so the two stay aligned):
//   from/to    - IST-aware range via resolveAnalyticsRange (date-only = IST day,
//                timestamps = explicit; latest bill first).
//   origin     - SESSION | POS (legacy bills with no origin count as SESSION).
//   audience   - CUSTOMER | STAFF (legacy bills with no audience count as
//                CUSTOMER).
//   status     - single OPEN | SETTLED | VOIDING | VOID.
const getBillList = async (req, res) => {
    const query = req.query || {};
    const { errors, from, to } = resolveAnalyticsRange(query);
    if (errors.length > 0) {
        return res.status(400).json({ error: 'INVALID_RANGE', message: errors.join('; ') });
    }
    let originFilter = null;
    if (query.origin !== undefined && query.origin !== null && String(query.origin).trim() !== '') {
        const o = String(query.origin).trim().toUpperCase();
        if (o !== 'SESSION' && o !== 'POS') {
            return res.status(400).json({ error: 'INVALID_ORIGIN', message: 'origin must be SESSION or POS' });
        }
        originFilter = o;
    }
    let audienceFilter = null;
    if (query.audience !== undefined && query.audience !== null && String(query.audience).trim() !== '') {
        const a = parseAudience(query.audience);
        if (a === null) {
            return res.status(400).json({ error: 'INVALID_AUDIENCE', message: 'audience must be CUSTOMER or STAFF' });
        }
        audienceFilter = a;
    }
    let statusFilter = null;
    if (query.status !== undefined && query.status !== null && String(query.status).trim() !== '') {
        const s = String(query.status).trim().toUpperCase();
        if (!BILL_STATUSES.includes(s)) {
            return res.status(400).json({ error: 'INVALID_STATUS', message: 'status must be one of: ' + BILL_STATUSES.join(', ') });
        }
        statusFilter = s;
    }
    try {
        let match = buildBillAnalyticsMatch({ from, to, origin: originFilter, audience: audienceFilter });
        if (statusFilter) {
            const statusMatch = { status: statusFilter };
            match = Object.keys(match).length === 0 ? statusMatch : { $and: [match, statusMatch] };
        }
        const bills = await Bill.find(match).sort({ createdAt: -1 });
        return res.json(bills.map(toBillDTO));
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
    createPosBill,
    getBillAnalytics,
    getBillList,
};