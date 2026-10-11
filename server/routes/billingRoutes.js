'use strict';

// Billing routes (Phase 2B). Dedicated /api/billing router per decision D7.
// All endpoints remain unauthenticated by explicit owner decision (consistent
// with the existing order routes).

const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/billingController');

// POS and analytics
router.post('/pos/bills', createPosBill);
router.get('/analytics', getBillAnalytics);
router.get('/bills', getBillList);

// Session-scoped bill operations
router.post('/sessions/:sessionId/bills', generateBill);
router.get('/sessions/:sessionId/bills', getSessionBills);

// Single-bill operations
router.get('/bills/:id', getBill);
router.post('/bills/:id/payments', recordPayment);
router.post('/bills/:id/void', voidBill);
router.post('/bills/:id/resume', resumeBill);
router.post('/bills/:id/payments/:paymentId/reverse', reversePayment);

module.exports = router;