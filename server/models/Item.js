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
    // Staff-facing price (dual pricing). Required when creating a NEW item so
    // the staff menu can never be silently priced from `price`. Function-based
    // `required` (only for new documents) keeps legacy records that predate
    // dual pricing readable and lets their unrelated fields be updated.
    staffPrice: {
        type: Number,
        required: function () { return this.isNew; },
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
