const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');

// @desc    Get all coupons (including inactive) - For Admin Dashboard
// @route   GET /api/coupons/all
// @access  Admin
const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find({}).sort({ createdAt: -1 });
        res.json(coupons);
    } catch (error) {
        console.error('Get all coupons error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all active coupons - For Client
// @route   GET /api/coupons
// @access  Public
const getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find({ isActive: true }).select('code discountType value minOrderAmount');
        res.json(coupons);
    } catch (error) {
        console.error('Get coupons error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create a new coupon
// @route   POST /api/coupons
// @access  Admin
const createCoupon = async (req, res) => {
    try {
        const { code, discountType, value, minOrderAmount, isActive } = req.body;

        // Validation
        if (!code || !discountType || value === undefined) {
            return res.status(400).json({ message: 'Please provide code, discountType, and value' });
        }

        if (!['PERCENT', 'FLAT'].includes(discountType)) {
            return res.status(400).json({ message: 'discountType must be PERCENT or FLAT' });
        }

        if (value <= 0) {
            return res.status(400).json({ message: 'Value must be greater than 0' });
        }

        // Check for duplicate code
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }

        // Create coupon
        const coupon = new Coupon({
            code: code.toUpperCase(),
            discountType,
            value,
            minOrderAmount: minOrderAmount || 0,
            isActive: isActive !== undefined ? isActive : true
        });

        await coupon.save();
        res.status(201).json(coupon);
    } catch (error) {
        console.error('Create coupon error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update a coupon
// @route   PUT /api/coupons/:id
// @access  Admin
const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, discountType, value, minOrderAmount, isActive } = req.body;

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        // Validation
        if (discountType && !['PERCENT', 'FLAT'].includes(discountType)) {
            return res.status(400).json({ message: 'discountType must be PERCENT or FLAT' });
        }

        if (value !== undefined && value <= 0) {
            return res.status(400).json({ message: 'Value must be greater than 0' });
        }

        // Check for duplicate code if code is being changed
        if (code && code.toUpperCase() !== coupon.code) {
            const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
            if (existingCoupon) {
                return res.status(400).json({ message: 'Coupon code already exists' });
            }
            coupon.code = code.toUpperCase();
        }

        // Update fields
        if (discountType) coupon.discountType = discountType;
        if (value !== undefined) coupon.value = value;
        if (minOrderAmount !== undefined) coupon.minOrderAmount = minOrderAmount;
        if (isActive !== undefined) coupon.isActive = isActive;

        await coupon.save();
        res.json(coupon);
    } catch (error) {
        console.error('Update coupon error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete a coupon
// @route   DELETE /api/coupons/:id
// @access  Admin
const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        await Coupon.findByIdAndDelete(id);
        res.json({ message: 'Coupon deleted successfully' });
    } catch (error) {
        console.error('Delete coupon error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Validate a coupon
// @route   POST /api/coupons/validate
// @access  Public
const validateCoupon = async (req, res) => {
    const { code, cartTotal } = req.body;

    try {
        const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

        if (!coupon) {
            return res.status(404).json({ message: 'Invalid or expired coupon code' });
        }

        if (cartTotal < coupon.minOrderAmount) {
            return res.status(400).json({
                message: `Minimum order amount of ₹${coupon.minOrderAmount} required for this coupon`
            });
        }

        let discountAmount = 0;
        if (coupon.discountType === 'PERCENT') {
            discountAmount = (cartTotal * coupon.value) / 100;
        } else if (coupon.discountType === 'FLAT') {
            discountAmount = coupon.value;
        }

        // Ensure discount doesn't exceed cart total
        if (discountAmount > cartTotal) {
            discountAmount = cartTotal;
        }

        res.json({
            success: true,
            code: coupon.code,
            discountType: coupon.discountType,
            value: coupon.value,
            discountAmount,
            message: 'Coupon applied successfully!'
        });

    } catch (error) {
        console.error('Validate coupon error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Seed initial coupons (For Demo)
// @route   POST /api/coupons/seed
const seedCoupons = async (req, res) => {
    try {
        await Coupon.deleteMany({});
        const coupons = [
            { code: 'WELCOME10', discountType: 'PERCENT', value: 10, minOrderAmount: 200 },
            { code: 'SAVE50', discountType: 'FLAT', value: 50, minOrderAmount: 300 },
            { code: 'ZINK20', discountType: 'PERCENT', value: 20, minOrderAmount: 500 }
        ];
        await Coupon.insertMany(coupons);
        res.json({ message: 'Coupons seeded' });
    } catch (error) {
        console.error('Seed coupons error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Routes
router.get('/all', getAllCoupons);           // Admin: Get all coupons
router.get('/', getCoupons);                 // Public: Get active coupons
router.post('/', createCoupon);              // Admin: Create coupon
router.put('/:id', updateCoupon);            // Admin: Update coupon
router.delete('/:id', deleteCoupon);         // Admin: Delete coupon
router.post('/validate', validateCoupon);    // Public: Validate coupon
router.post('/seed', seedCoupons);           // Dev: Seed coupons

module.exports = router;

