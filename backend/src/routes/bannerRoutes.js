const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/bannerController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/rbac');
const { skipRateLimit } = require('../middlewares/rateLimiter');

const bannerEventLimiter = rateLimit({
  validate: { trustProxy: false },
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { success: false, message: 'Too many banner events. Please try again shortly.' }
});

// Public
router.get('/store/banners', ctrl.getActiveBanners);
router.post('/banners/:id/impression', bannerEventLimiter, ctrl.trackBannerImpression);
router.post('/banners/:id/click', bannerEventLimiter, ctrl.trackBannerClick);

// Admin
router.get('/admin/banners', verifyAdmin, checkPermission('manage_marketing', 'manage_banners'), ctrl.getAllBanners);
router.post('/admin/banners', verifyAdmin, checkPermission('manage_marketing', 'manage_banners'),
  ctrl.uploadMiddleware, ctrl.createBanner);
router.patch('/admin/banners/reorder', verifyAdmin, checkPermission('manage_marketing', 'manage_banners'), ctrl.reorderBanners);
router.put('/admin/banners/settings', verifyAdmin, checkPermission('manage_marketing', 'manage_banners'), ctrl.updateSettings);
router.patch('/admin/banners/:id', verifyAdmin, checkPermission('manage_marketing', 'manage_banners'),
  ctrl.uploadMiddleware, ctrl.updateBanner);
router.delete('/admin/banners/:id', verifyAdmin, checkPermission('manage_marketing', 'manage_banners'), ctrl.deleteBanner);

module.exports = router;
