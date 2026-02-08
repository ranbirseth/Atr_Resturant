const express = require('express');
const router = express.Router();
const { createOrder, getOrderById, updateOrderStatus, getOrders, getGroupedOrders, getAnalytics, confirmPrintStatus } = require('../controllers/orderController');

router.get('/analytics', getAnalytics);
router.post('/', createOrder);
router.get('/grouped', getGroupedOrders);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.put('/:id/status', updateOrderStatus);
router.put('/print-success', confirmPrintStatus);

module.exports = router;
