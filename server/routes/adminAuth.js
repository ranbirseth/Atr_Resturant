const express = require('express');
const router = express.Router();

// POST /api/admin/verify-code - Verify admin secret code
router.post('/verify-code', (req, res) => {
    try {
        const { code } = req.body;

        // Validate input
        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Secret code is required'
            });
        }

        // Get admin secret code from environment
        const adminSecretCode = process.env.ADMIN_SECRET_CODE;

        if (!adminSecretCode) {
            console.error('ADMIN_SECRET_CODE not set in environment variables');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error'
            });
        }

        // Verify code
        if (code === adminSecretCode) {
            return res.status(200).json({
                success: true,
                message: 'Authentication successful'
            });
        } else {
            return res.status(401).json({
                success: false,
                message: 'Invalid secret code'
            });
        }
    } catch (error) {
        console.error('Admin auth error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during authentication'
        });
    }
});

module.exports = router;
