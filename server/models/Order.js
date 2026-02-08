const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
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
    status: { type: String, enum: ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'ChangeRequested', 'Updated'], default: 'Pending' },
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
