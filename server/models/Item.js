const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
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
    }
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
