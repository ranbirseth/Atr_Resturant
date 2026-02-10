const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    // Human-readable unique order ID (e.g., ORD-20260210-0001)
    orderId: { type: String, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true, index: true },
    items: [
        {
            itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
            name: String,
            quantity: Number,
            price: Number,
            customizations: [String] // e.g., "Extra cheese", "Extra spicy"
        }
    ],
    totalAmount: { type: Number, required: true }, // This is the Final Payable Amount
    grossTotal: { type: Number }, // Subtotal before discount
    couponCode: { type: String },
    discountAmount: { type: Number, default: 0 },
    orderType: { type: String, enum: ['Dine-in', 'Takeaway'], required: true },
    tableNumber: { type: String }, // Required if Dine-in

    // New simplified status enum for order lifecycle
    status: {
        type: String,
        enum: ['PLACED', 'ACCEPTED', 'CHANGED', 'CANCELLED', 'COMPLETED',
            // Legacy statuses for backward compatibility during migration
            'Pending', 'Accepted', 'Preparing', 'Ready', 'ChangeRequested', 'Updated'],
        default: 'PLACED'
    },

    // Store previous order state when order is modified
    previousOrderSnapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    deliveryAddress: { type: String }, // For Home Delivery
    isDelivery: { type: Boolean, default: false }, // To distinguish Home Delivery from regular Takeaway
    feedbackStatus: {
        type: String,
        enum: ['Pending', 'Requested', 'Submitted', 'Skipped'],
        default: 'Pending'
    },
    completionConfig: {
        countDownSeconds: { type: Number, default: 900 } // 15 mins default
    },
    // KOT Printing Tracking
    kotPrinted: { type: Boolean, default: false },
    kotHistory: [
        {
            printedAt: { type: Date, default: Date.now },
            printedItems: [
                {
                    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
                    name: String,
                    quantity: Number,
                    customizations: [String]
                }
            ],
            printId: String, // Unique identifier for the print job
            printerType: { type: String, enum: ['KITCHEN', 'ADMIN', 'BOTH'], default: 'BOTH' }
        }
    ]
}, { timestamps: true });

// Compound index for efficient session-based queries
orderSchema.index({ sessionId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
