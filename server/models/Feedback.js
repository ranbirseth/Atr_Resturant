const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    orderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Order', 
        required: true, 
        unique: true 
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    rating: { 
        type: Number, 
        required: true, 
        min: 1, 
        max: 5 
    },
    message: { 
        type: String, 
        trim: true 
    },
    tags: [String], // e.g. "Food", "Service", "Ambience"
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
