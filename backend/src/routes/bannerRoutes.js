const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bannerController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/rbac');

// Public
router.get('/store/banners', ctrl.getActiveBanners);

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
