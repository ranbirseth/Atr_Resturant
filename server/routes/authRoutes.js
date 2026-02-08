const express = require('express');
const router = express.Router();
const { loginUser, checkUser, getAllUsers } = require('../controllers/authController');
router.post('/login', loginUser);
router.post('/check', checkUser);
router.get('/all', getAllUsers);

module.exports = router;
