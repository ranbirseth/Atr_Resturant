const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'price must be greater than or equal to 0'],
        validate: {
            validator: (value) => typeof value === 'number' && Number.isFinite(value),
            message: 'price must be a finite number',
        },
    },
    // Legacy staff-facing price. Kept ONLY so documents that predate P1.1
    // remain readable and editable in unrelated fields. It is no longer
    // required, no longer writable via the API, and is never used for pricing:
    // the staff price is now derived as 60% of `price` in menuUtils.js.
    staffPrice: {
        type: Number,
        min: [0, 'staffPrice must be greater than or equal to 0'],
        validate: {
            validator: (value) => value === undefined || value === null ||
                (typeof value === 'number' && Number.isFinite(value)),
            message: 'staffPrice must be a finite number',
        },
    },
    description: {
        type: String,
    },
    image: {
        type: String,
    },
    category: {
        type: String,
        required: true,
    },
    isVeg: {
        type: Boolean,
        default: true,
    },
    estimatedPreparationTime: {
        type: Number, // in minutes
    },
    rating: {
        type: Number,
        default: 0,
    },
    available: {
        type: Boolean,
        default: true,
    },
    // Staff-menu availability (separate from customer `available`).
    availableForStaff: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
