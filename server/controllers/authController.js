const User = require('../models/User');

// @desc    Login/Register User
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { name, mobile } = req.body;

    if (!name || !mobile) {
        return res.status(400).json({ message: 'Please provide name and mobile number' });
    }

    try {
        let user = await User.findOne({ mobile });

        if (!user) {
            user = await User.create({ name, mobile });
        } else {
            // Update name if changed (optional)
            user.name = name;
            await user.save();
        }

        res.status(200).json({
            _id: user._id,
            name: user.name,
            mobile: user.mobile
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Check if user exists
// @route   POST /api/auth/check
// @access  Public
const checkUser = async (req, res) => {
    const { mobile } = req.body;
    try {
        const user = await User.findOne({ mobile });
        if (user) {
            res.json({ exists: true });
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const Order = require('../models/Order');

// @desc    Get all users
// @route   GET /api/auth/all
// @access  Public (should be Admin, but strict auth is not implemented yet)
const getAllUsers = async (req, res) => {
    try {
        const usersWithStats = await User.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: 'orders',
                    localField: '_id',
                    foreignField: 'userId',
                    as: 'userOrders'
                }
            },
            {
                $project: {
                    id: '$_id',
                    name: 1,
                    email: { $ifNull: ['$email', 'N/A'] },
                    phone: '$mobile',
                    joined: '$createdAt',
                    status: { $literal: 'Active' },
                    orders: { $size: '$userOrders' }
                }
            }
        ]);

        res.json(usersWithStats);
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { loginUser, checkUser, getAllUsers };
