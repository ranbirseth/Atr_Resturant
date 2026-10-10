const mongoose = require('mongoose');
const { MOVEMENT_TYPES, UNITS } = require('../utils/inventoryUtils');

// Append-only, immutable stock ledger. There is intentionally NO update or
// delete endpoint for movements; corrections are new ADJUSTMENT entries.
// All fields are immutable:true so a loaded document cannot be silently edited.
const stockMovementSchema = new mongoose.Schema({
    ingredientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingredient',
        required: true,
        index: true,
    },
    type: {
        type: String,
        required: true,
        enum: MOVEMENT_TYPES,
    },
    // Signed change applied to the balance, in the ingredient's unit.
    quantityDelta: {
        type: Number,
        required: true,
    },
    // Unit snapshot at the moment the movement was recorded.
    unit: {
        type: String,
        enum: UNITS,
    },
    movementDate: {
        type: Date,
        default: Date.now,
        index: true,
    },
    note: {
        type: String,
        default: '',
    },
    // Per-unit purchase price for OPENING/RESTOCK (optional; legacy movements
    // and non-purchase types have none).
    unitCost: {
        type: Number,
        min: [0, 'unitCost must be greater than or equal to 0'],
        default: null,
    },
    // Lifecycle: a movement is created RESERVED (for idempotency) and committed
    // to COMMITTED once its balance + cycle writes succeed. Legacy documents do
    // not carry the field and are treated as COMMITTED.
    status: {
        type: String,
        enum: ['RESERVED', 'COMMITTED'],
        default: 'COMMITTED',
        index: true,
    },
    cycleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StockCycle',
        default: null,
    },
    // Optional unique key so duplicate submissions/replays are applied once.
    idempotencyKey: {
        type: String,
        trim: true,
        default: undefined,
    },
    createdBy: {
        type: String,
        default: 'admin',
    },
}, { timestamps: true });

stockMovementSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
stockMovementSchema.index({ ingredientId: 1, movementDate: -1 });

// Enforce immutability on document saves (defence-in-depth; routes are the
// primary boundary).
stockMovementSchema.pre('save', function (next) {
    if (!this.isNew) {
        return next(new Error('StockMovement is append-only and cannot be modified'));
    }
    next();
});

module.exports = mongoose.model('StockMovement', stockMovementSchema);
