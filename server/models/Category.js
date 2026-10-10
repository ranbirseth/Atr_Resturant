const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    isVisible: {
        type: Boolean,
        default: true
    },
    // New dual-audience visibility flags. `isVisible` is preserved as the
    // legacy customer flag; effective customer visibility = isVisible AND
    // customerVisible (see categoryController/report for the precedence).
    customerVisible: {
        type: Boolean,
        default: true
    },
    staffVisible: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
