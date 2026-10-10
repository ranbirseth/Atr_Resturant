const mongoose = require('mongoose');
const { UNITS, PURCHASE_STATUSES } = require('../utils/inventoryUtils');

// Inventory item master ("Ingredient" internally, shown as "Inventory Item").
// `currentQty` is a materialized balance maintained by atomic $inc on each
// accepted StockMovement; the ledger remains the source of truth.
const ingredientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    // Normalized (lowercase, whitespace-collapsed) name for duplicate detection.
    nameKey: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    // One measurement unit per item; every movement is expressed in this unit.
    unit: {
        type: String,
        required: true,
        enum: UNITS,
    },
    minimumStockLevel: {
        type: Number,
        required: true,
        min: [0, 'minimumStockLevel must be greater than or equal to 0'],
        default: 0,
    },
    expectedDemand: {
        type: Number,
        min: [0, 'expectedDemand must be greater than or equal to 0'],
        default: 0,
    },
    // Last/default purchase price per unit (optional; legacy items have none).
    purchasePrice: {
        type: Number,
        min: [0, 'purchasePrice must be greater than or equal to 0'],
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    // Materialized on-hand balance (in `unit`).
    currentQty: {
        type: Number,
        default: 0,
        min: [0, 'currentQty must be greater than or equal to 0'],
    },
    // Lightweight explicit purchase state (not a supplier/invoice module).
    purchaseStatus: {
        type: String,
        enum: PURCHASE_STATUSES,
        default: 'NONE',
    },
    // Id of the currently open usage cycle (if any).
    latestCycleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StockCycle',
        default: null,
    },
}, { timestamps: true });

module.exports = mongoose.model('Ingredient', ingredientSchema);
