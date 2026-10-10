const mongoose = require('mongoose');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Category = require('../models/Category');
const Coupon = require('../models/Coupon');
const SessionManager = require('../utils/SessionManager');
const { generateOrderId } = require('../utils/orderIdGenerator');
const {
    buildAuthoritativeOrder,
    normalizeAudience,
    categoryKey,
    toFiniteNumber,
} = require('../utils/menuUtils');
const { computeCouponDiscount } = require('../utils/couponUtils');


// @desc    Create new order
// @route   POST /api/orders
// @access  Public (User ID required)
const createOrder = async (req, res) => {
    const { userId, items, orderType, tableNumber, deliveryAddress, isDelivery } = req.body;
    const audience = normalizeAudience(req.body.audience);

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'No order items' });
    }

    // Validate ids up front so an invalid ObjectId cannot blow up the DB query.
    const hasInvalidId = items.some(
        (line) => !line || !line.itemId || !mongoose.Types.ObjectId.isValid(String(line.itemId))
    );
    if (hasInvalidId) {
        return res.status(400).json({ message: 'One or more order items have an invalid itemId' });
    }

    try {
        const itemIds = items.map((line) => String(line.itemId));
        const dbItems = await Item.find({ _id: { $in: itemIds } });

        // Staff orders honor staffVisible categories. Customer orders keep the
        // existing checkout behavior (no category-visibility rejection).
        let hiddenCategories = new Set();
        if (audience === 'STAFF') {
            const categories = await Category.find({}, 'name staffVisible');
            hiddenCategories = new Set(
                categories
                    .filter((category) => category.staffVisible === false)
                    .map((category) => categoryKey(category.name))
            );
        }

        // Server-authoritative line items + subtotal. Client-supplied price,
        // totalAmount, grossTotal and discountAmount are intentionally ignored.
        const built = buildAuthoritativeOrder({
            requestedItems: items,
            dbItems,
            audience,
            hiddenCategories,
        });

        if (!built.ok) {
            return res.status(built.status || 400).json({ message: built.message, errors: built.errors });
        }

        // Recalculate the coupon against the server-computed subtotal.
        let discountAmount = 0;
        let couponCode;
        if (req.body.couponCode) {
            const code = String(req.body.couponCode).trim().toUpperCase();
            const coupon = await Coupon.findOne({ code, isActive: true });
            if (!coupon) {
                return res.status(400).json({ message: 'Invalid or expired coupon code' });
            }
            const couponResult = computeCouponDiscount(coupon, built.subtotal);
            if (!couponResult.ok) {
                if (couponResult.reason === 'BELOW_MINIMUM') {
                    return res.status(400).json({
                        message: `Minimum order amount of ₹${couponResult.minOrderAmount} required for this coupon`
                    });
                }
                return res.status(400).json({ message: 'Invalid or expired coupon code' });
            }
            discountAmount = couponResult.discountAmount;
            couponCode = coupon.code;
        }

        const grossTotal = built.subtotal;
        const totalAmount = grossTotal - discountAmount > 0 ? grossTotal - discountAmount : 0;

        // Generate unique order ID
        const orderId = await generateOrderId();

        // Generate session ID for this order
        const sessionId = SessionManager.getCurrentSessionId(userId);

        // Longest preparation time across the ordered items (uses the real
        // `estimatedPreparationTime` field; the previous code read a
        // non-existent `item.preparationTime` and always fell back to 15).
        let maxPrepTime = 15; // default
        const prepTimes = dbItems
            .map((item) => toFiniteNumber(item.estimatedPreparationTime))
            .filter((value) => value !== null && value > 0);
        if (prepTimes.length > 0) {
            maxPrepTime = Math.max(...prepTimes);
        }

        const order = new Order({
            orderId,
            userId,
            sessionId,
            items: built.lines,
            totalAmount,
            grossTotal,
            couponCode,
            discountAmount,
            orderType,
            tableNumber,
            audience,
            status: 'PLACED', // New status system
            deliveryAddress,
            isDelivery: isDelivery || false,
            completionConfig: {
                countDownSeconds: maxPrepTime * 60
            }
        });

        const createdOrder = await order.save();

        console.log('✅ Order created:', {
            orderId: createdOrder.orderId,
            sessionId: createdOrder.sessionId,
            audience: createdOrder.audience,
            status: createdOrder.status
        });

        // Emit real-time notification to admin/kitchen with grouped session data
        if (req.io) {
            // Fetch all orders in this session for grouped display
            const sessionOrders = await Order.find({ sessionId })
                .populate('userId', 'name mobile')
                .sort({ createdAt: 1 });

            // Emit session update for Orders page
            req.io.emit('sessionOrderUpdate', {
                sessionId,
                orders: sessionOrders
            });

            // Emit SPECIFIC new order event for global notification
            req.io.emit('newOrder', {
                orderId: createdOrder._id,
                sessionId: sessionId,
                tableNumber: tableNumber,
                orderType: orderType,
                isDelivery: isDelivery,
                deliveryAddress: deliveryAddress,
                totalAmount: totalAmount,
                itemsCount: built.lines.length,
                customerName: userId?.name || 'Guest'
            });
        }

        res.status(201).json(createdOrder);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Public
const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('userId', 'name mobile');

        if (order) {
            res.json(order);
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Order Status (Individual order, not entire session)
// @route   PUT /api/orders/:id/status
const updateOrderStatus = async (req, res) => {
    const { status, feedbackStatus } = req.body;
    try {
        // Get the order to validate and update
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        console.log('🔄 Updating order status:', {
            orderId: order.orderId,
            orderDbId: req.params.id,
            oldStatus: order.status,
            newStatus: status,
            sessionId: order.sessionId
        });

        // Status transition validation
        if (status) {
            const isValidTransition = validateStatusTransition(order.status, status);
            if (!isValidTransition) {
                return res.status(400).json({
                    message: `Invalid status transition from ${order.status} to ${status}`,
                    currentStatus: order.status,
                    requestedStatus: status
                });
            }
        }

        // Update ONLY this specific order
        const updates = {};
        if (status) updates.status = status;
        if (feedbackStatus) updates.feedbackStatus = feedbackStatus;

        await Order.updateOne(
            { _id: req.params.id },
            { $set: updates }
        );

        // Fetch all orders in the session for UI update
        const sessionOrders = await Order.find({ sessionId: order.sessionId })
            .populate('userId', 'name mobile')
            .sort({ createdAt: 1 });

        console.log('✅ Order updated:', {
            orderId: order.orderId,
            newStatus: status,
            sessionOrderCount: sessionOrders.length
        });

        // Emit socket event to notify admins of status change
        if (req.io) {
            req.io.emit('sessionOrderUpdate', {
                sessionId: order.sessionId,
                orders: sessionOrders
            });
        }

        res.json(sessionOrders);
    } catch (error) {
        console.error('❌ Error updating order status:', error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * Validate status transitions according to order lifecycle rules
 * @param {string} currentStatus - Current order status
 * @param {string} newStatus - Requested new status
 * @returns {boolean} - Whether transition is valid
 */
function validateStatusTransition(currentStatus, newStatus) {
    const normalize = (s) => (s || '').toUpperCase();

    // Map all legacy and variant statuses to a canonical uppercase format
    const statusMap = {
        'PENDING': 'PLACED',
        'ACCEPTED': 'ACCEPTED',
        'CHANGEREQUESTED': 'CHANGED',
        'UPDATED': 'CHANGED',
        'CANCELLED': 'CANCELLED',
        'COMPLETED': 'COMPLETED',
        'PREPARING': 'PREPARING',
        'READY': 'READY'
    };

    const cur = normalize(currentStatus);
    const nxt = normalize(newStatus);

    const current = statusMap[cur] || cur;
    const next = statusMap[nxt] || nxt;

    // Define valid transitions using canonical formats
    const validTransitions = {
        'PLACED': ['ACCEPTED', 'CANCELLED'],
        'ACCEPTED': ['COMPLETED', 'CANCELLED', 'PREPARING', 'READY'],
        'CHANGED': ['ACCEPTED', 'CANCELLED'],
        'CANCELLED': [],
        'COMPLETED': [],
        'PREPARING': ['READY', 'COMPLETED', 'CANCELLED'],
        'READY': ['COMPLETED', 'CANCELLED']
    };

    const allowedTransitions = validTransitions[current] || [];
    return allowedTransitions.includes(next);
}

// @desc    Get all orders
// @route   GET /api/orders
// @access  Admin
const getOrders = async (req, res) => {
    try {
        const orders = await Order.find({}).populate('userId', 'name mobile').sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get grouped orders by session
// @route   GET /api/orders/grouped
// @access  Admin
const getGroupedOrders = async (req, res) => {
    try {
        const orders = await Order.find({})
            .populate('userId', 'name mobile')
            .sort({ createdAt: -1 });

        // Group orders by sessionId
        const grouped = {};
        orders.forEach(order => {
            const sessionId = order.sessionId;
            if (!grouped[sessionId]) {
                grouped[sessionId] = {
                    sessionId,
                    userId: order.userId,
                    orders: [],
                    totalAmount: 0,
                    grossTotal: 0,
                    discountAmount: 0,
                    status: 'Pending', // Placeholder - will be calculated below
                    orderType: order.orderType,
                    tableNumber: order.tableNumber,
                    createdAt: order.createdAt,
                    updatedAt: order.updatedAt
                };
            }

            grouped[sessionId].orders.push(order);
            grouped[sessionId].totalAmount += order.totalAmount;
            grouped[sessionId].grossTotal += (order.grossTotal || order.totalAmount);
            grouped[sessionId].discountAmount += (order.discountAmount || 0);

            // Prioritize Dine-in info for the session display
            if (order.orderType === 'Dine-in') {
                grouped[sessionId].orderType = 'Dine-in';
                if (order.tableNumber) {
                    grouped[sessionId].tableNumber = order.tableNumber;
                }
            }
            // Capture Delivery Info
            if (order.isDelivery) {
                console.log('🚚 Found delivery order:', {
                    sessionId,
                    isDelivery: order.isDelivery,
                    deliveryAddress: order.deliveryAddress
                });
                grouped[sessionId].isDelivery = true;
                grouped[sessionId].deliveryAddress = order.deliveryAddress;
            }

            // Update timestamps to reflect earliest order
            if (new Date(order.createdAt) < new Date(grouped[sessionId].createdAt)) {
                grouped[sessionId].createdAt = order.createdAt;
            }
            if (new Date(order.updatedAt) > new Date(grouped[sessionId].updatedAt)) {
                grouped[sessionId].updatedAt = order.updatedAt;
            }
        });

        // Calculate final status for each grouped session (after all orders are added)
        // Updated priority for new status system
        const statusPriority = {
            // New statuses
            'CHANGED': 6,
            'PLACED': 5,
            'ACCEPTED': 4,
            'CANCELLED': 3,
            'COMPLETED': 1,
            // Legacy statuses (for backward compatibility)
            'ChangeRequested': 6,
            'Updated': 6,
            'Pending': 5,
            'Accepted': 4,
            'Preparing': 3.5,
            'Ready': 2,
            'Cancelled': 3
        };

        Object.keys(grouped).forEach(sessionId => {
            // First, check if there are any non-cancelled/non-completed orders
            const activeOrders = grouped[sessionId].orders.filter(o =>
                o.status !== 'CANCELLED' && o.status !== 'Cancelled' &&
                o.status !== 'COMPLETED' && o.status !== 'Completed'
            );
            const ordersToConsider = activeOrders.length > 0 ? activeOrders : grouped[sessionId].orders;

            let worstStatus = 'COMPLETED';
            ordersToConsider.forEach(order => {
                const orderPriority = statusPriority[order.status] || 0;
                const worstPriority = statusPriority[worstStatus] || 0;
                if (orderPriority > worstPriority) {
                    worstStatus = order.status;
                }
            });
            grouped[sessionId].status = worstStatus;
        });

        // Convert to array and sort by date (most recent first)
        const result = Object.values(grouped).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        console.log('📊 Sending grouped orders to admin:', result.map(r => ({
            sessionId: r.sessionId.slice(-8),
            isDelivery: r.isDelivery,
            deliveryAddress: r.deliveryAddress
        })));

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Analytics Data
// @route   GET /api/orders/analytics
// @access  Admin
const getAnalytics = async (req, res) => {
    try {
        const { range } = req.query; // '1d', '7d', '30d' (default)
        const today = new Date();
        let startDate = new Date();

        // Calculate start date based on range
        switch (range) {
            case '1d':
                startDate.setHours(0, 0, 0, 0); // Start of today
                break;
            case '7d':
                startDate.setDate(today.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                break;
            case '30d':
            default:
                startDate.setDate(today.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                break;
        }

        // 1. Overview Stats Aggegration
        const stats = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" },
                    totalOrders: { $count: {} },
                    avgOrderValue: { $avg: "$totalAmount" }
                }
            }
        ]);

        // Customer Retention (Mock logic for now as user retention needs elaborate tracking)
        // Calculating approximate repeat customers based on unique userIds vs total orders
        // Note: Retention might be better calculated over all time, but for specific range we can stick to all time or adapt.
        // For simplicity and to show accurate "retention in this period" requires complex logic.
        // Keeping retention as "all time" metric for now, or we can filter orders in range.
        // Let's keep it based on orders within range for consistency if possible, but retention is usually a cohort metric.
        // For now, let's keep retention global or semi-global to avoid 0% on small ranges.
        // Actually, let's filter distinct users in the range vs total orders in the range. 
        const distinctUsersInRange = await Order.distinct('userId', { createdAt: { $gte: startDate } });
        const totalOrdsInRange = stats[0]?.totalOrders || 0;

        let retentionRate = 0;
        if (totalOrdsInRange > 0) {
            retentionRate = ((totalOrdsInRange - distinctUsersInRange.length) / totalOrdsInRange * 100).toFixed(1);
        }

        // 2. Revenue Graph 
        const revenueTrend = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$totalAmount" },
                    orders: { $count: {} }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 3. Top Selling Items
        const topItems = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.name",
                    value: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
                }
            },
            { $sort: { value: -1 } },
            { $limit: 5 }
        ]);

        // 4. Peak Order Times (Hourly)
        const peakTimes = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $project: {
                    hour: { $hour: "$createdAt" }
                }
            },
            {
                $group: {
                    _id: "$hour",
                    orders: { $count: {} }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            stats: {
                totalRevenue: stats[0]?.totalRevenue || 0,
                totalOrders: stats[0]?.totalOrders || 0,
                avgOrderValue: Math.round(stats[0]?.avgOrderValue || 0),
                retentionRate: retentionRate
            },
            revenueTrend: revenueTrend.map(t => ({
                date: t._id,
                month: new Date(t._id).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
                revenue: t.revenue,
                orders: t.orders
            })),
            topItems: topItems.map(i => ({
                name: i._id,
                value: i.value,
                revenue: i.totalRevenue
            })),
            peakTimes: peakTimes.map(t => ({
                time: `${t._id}:00`,
                hour: t._id,
                orders: t.orders
            }))
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Confirm KOT Print Success
// @route   PUT /api/orders/print-success
// @access  Admin
const confirmPrintStatus = async (req, res) => {
    const { orderIds, printedItems, printId } = req.body; // Expecting array of orderIds if session based, or single orderId

    try {
        if (!orderIds || orderIds.length === 0) {
            return res.status(400).json({ message: 'No order IDs provided' });
        }

        console.log('🖨️ Confirming KOT Print:', {
            count: orderIds.length,
            printId
        });

        // Update all specified orders
        const updateResult = await Order.updateMany(
            { _id: { $in: orderIds } },
            {
                $set: { kotPrinted: true },
                $push: {
                    kotHistory: {
                        printedAt: new Date(),
                        printedItems: printedItems || [], // Can be specific items if needed
                        printId: printId || `P-${Date.now()}`,
                        printerType: 'BOTH'
                    }
                }
            }
        );

        // Fetch one order to get sessionId for socket update
        const sampleOrder = await Order.findById(orderIds[0]);

        if (sampleOrder && req.io) {
            const sessionOrders = await Order.find({ sessionId: sampleOrder.sessionId })
                .populate('userId', 'name mobile')
                .sort({ createdAt: 1 });

            req.io.emit('sessionOrderUpdate', {
                sessionId: sampleOrder.sessionId,
                orders: sessionOrders
            });
        }

        res.json({ message: 'Print status updated', updatedCount: updateResult.modifiedCount });

    } catch (error) {
        console.error('❌ Error confirming print:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update Order Items (Modify existing order)
// @route   PUT /api/orders/:id/update
// @access  Admin/User
const updateOrder = async (req, res) => {
    const { items, totalAmount, grossTotal, discountAmount, couponCode } = req.body;

    try {
        const order = await Order.findById(req.params.id).populate('userId', 'name mobile');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Cannot modify cancelled or completed orders
        if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
            return res.status(400).json({
                message: `Cannot modify ${order.status.toLowerCase()} order`,
                orderId: order.orderId,
                currentStatus: order.status
            });
        }

        console.log('📝 Modifying order:', {
            orderId: order.orderId,
            currentStatus: order.status,
            oldItemCount: order.items.length,
            newItemCount: items?.length
        });

        // Save current order state to snapshot before modifying
        order.previousOrderSnapshot = {
            items: order.items,
            totalAmount: order.totalAmount,
            grossTotal: order.grossTotal,
            discountAmount: order.discountAmount,
            couponCode: order.couponCode,
            modifiedAt: new Date(),
            previousStatus: order.status
        };

        // Update order fields
        if (items) order.items = items;
        if (totalAmount !== undefined) order.totalAmount = totalAmount;
        if (grossTotal !== undefined) order.grossTotal = grossTotal;
        if (discountAmount !== undefined) order.discountAmount = discountAmount;
        if (couponCode !== undefined) order.couponCode = couponCode;

        // Set status to CHANGED (requires re-acceptance)
        order.status = 'CHANGED';

        await order.save();

        console.log('✅ Order modified:', {
            orderId: order.orderId,
            newStatus: order.status,
            hasSnapshot: !!order.previousOrderSnapshot
        });

        // Fetch all orders in session for UI update
        const sessionOrders = await Order.find({ sessionId: order.sessionId })
            .populate('userId', 'name mobile')
            .sort({ createdAt: 1 });

        // Emit socket event
        if (req.io) {
            req.io.emit('sessionOrderUpdate', {
                sessionId: order.sessionId,
                orders: sessionOrders
            });
        }

        res.json(order);
    } catch (error) {
        console.error('❌ Error updating order:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createOrder, getOrderById, updateOrderStatus, updateOrder, getOrders, getGroupedOrders, getAnalytics, confirmPrintStatus };
