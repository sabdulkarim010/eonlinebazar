const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const contactController = require('../controllers/contactController');

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many messages sent. Please try again later.' }
});

router.post('/', contactLimiter, contactController.submitContactMessage);

module.exports = router;
