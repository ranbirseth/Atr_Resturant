const mongoose = require('mongoose');

// A usage cycle starts with a baseline quantity and is closed by the next
// restock (which opens a fresh cycle). This preserves per-cycle usage% even
// though the balance is a single running total.
const stockCycleSchema = new mongoose.Schema({
    ingredientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingredient',
        required: true,
        index: true,
    },
    cycleNumber: {
        type: Number,
        required: true,
    },
    // Total quantity available at the start of the cycle.
    baselineQty: {
        type: Number,
        required: true,
        min: 0,
    },
    restockedQty: {
        type: Number,
        default: 0,
        min: 0,
    },
    carriedOverQty: {
        type: Number,
        default: 0,
        min: 0,
    },
    startedAt: {
        type: Date,
        default: Date.now,
    },
    closedAt: {
        type: Date,
        default: null,
    },
    status: {
        type: String,
        enum: ['OPEN', 'CLOSED'],
        default: 'OPEN',
    },
    // Usage% frozen when the cycle closes.
    finalUsagePercent: {
        type: Number,
        default: null,
    },
}, { timestamps: true });

stockCycleSchema.index({ ingredientId: 1, cycleNumber: 1 }, { unique: true });

module.exports = mongoose.model('StockCycle', stockCycleSchema);
