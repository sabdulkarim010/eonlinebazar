const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const contactController = require('../controllers/contactController');
const { skipRateLimit } = require('../middlewares/rateLimiter');

const contactLimiter = rateLimit({
    validate: { trustProxy: false },
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    message: { success: false, message: 'Too many messages sent. Please try again later.' }
});

router.post('/', contactLimiter, contactController.submitContactMessage);

module.exports = router;
