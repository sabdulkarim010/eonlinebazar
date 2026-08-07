const rateLimit = require('express-rate-limit');

const chatStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'অনেক বেশি রিকোয়েস্ট। কিছুক্ষণ পরে চেষ্টা করুন।',
  },
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'অনেক বেশি মেসেজ। একটু পরে আবার চেষ্টা করুন।',
  },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'অনেকবার ব্যর্থ চেষ্টা। ১৫ মিনিট পরে আবার চেষ্টা করুন।',
  },
});

module.exports = {
  chatStartLimiter,
  messageLimiter,
  adminLoginLimiter,
};
