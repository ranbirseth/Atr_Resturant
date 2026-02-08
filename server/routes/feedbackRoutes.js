const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const Order = require('../models/Order');

// @desc    Submit Feedback
// @route   POST /api/feedback
// @access  Public
const submitFeedback = async (req, res) => {
    const { orderId, userId, rating, message, tags } = req.body;

    try {
        // Check if feedback already exists
        const existingFeedback = await Feedback.findOne({ orderId });
        if (existingFeedback) {
            return res.status(400).json({ message: 'Feedback already submitted for this order' });
        }

        const feedback = await Feedback.create({
            orderId,
            userId,
            rating,
            message,
            tags
        });

        // Update Order feedback status
        await Order.findByIdAndUpdate(orderId, { feedbackStatus: 'Submitted' });

        res.status(201).json(feedback);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all feedback
// @route   GET /api/feedback
// @access  Private/Admin
const getFeedbacks = async (req, res) => {
    try {
        const feedbacks = await Feedback.find()
            .populate('orderId', 'tableNumber orderType items status')
            .populate('userId', 'name mobile')
            .sort({ createdAt: -1 });
        res.json(feedbacks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

router.post('/', submitFeedback);
router.get('/', getFeedbacks);

module.exports = router;
