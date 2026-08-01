const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const newsletterController = require('../controllers/newsletterController');
const { skipRateLimit } = require('../middleware/rateLimiter');

const subscribeLimiter = rateLimit({
    validate: { trustProxy: false },
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    message: { success: false, message: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' }
});

router.post('/subscribe', subscribeLimiter, newsletterController.subscribe);
router.get('/unsubscribe', newsletterController.unsubscribe);

module.exports = router;
