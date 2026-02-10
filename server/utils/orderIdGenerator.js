const Order = require('../models/Order');

/**
 * Generate unique sequential order ID
 * Format: ORD-YYYYMMDD-XXXX
 * Example: ORD-20260210-0001
 */
async function generateOrderId() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    // Find the highest order number for today
    const todayStart = new Date(year, today.getMonth(), today.getDate(), 0, 0, 0);
    const todayEnd = new Date(year, today.getMonth(), today.getDate(), 23, 59, 59);

    const todayOrders = await Order.find({
        createdAt: { $gte: todayStart, $lte: todayEnd },
        orderId: { $exists: true, $ne: null }
    }).sort({ orderId: -1 }).limit(1);

    let nextNumber = 1;

    if (todayOrders.length > 0) {
        const lastOrderId = todayOrders[0].orderId;
        // Extract the number part (last 4 digits)
        const lastNumber = parseInt(lastOrderId.split('-')[2]);
        nextNumber = lastNumber + 1;
    }

    // Format: ORD-YYYYMMDD-XXXX
    const orderNumber = String(nextNumber).padStart(4, '0');
    return `ORD-${datePrefix}-${orderNumber}`;
}

/**
 * Validate order ID format
 */
function isValidOrderId(orderId) {
    const pattern = /^ORD-\d{8}-\d{4}$/;
    return pattern.test(orderId);
}

module.exports = {
    generateOrderId,
    isValidOrderId
};
