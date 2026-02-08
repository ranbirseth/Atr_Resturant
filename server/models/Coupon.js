const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: { 
        type: String, 
        required: true, 
        unique: true, 
        uppercase: true,
        trim: true
    },
    discountType: { 
        type: String, 
        enum: ['PERCENT', 'FLAT'], 
        required: true 
    },
    value: { 
        type: Number, 
        required: true 
    },
    minOrderAmount: { 
        type: Number, 
        default: 0 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
