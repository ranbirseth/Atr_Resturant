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
} = require('../controllers/billingController');

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