const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bannerController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/rbac');

// Public
router.get('/store/banners', ctrl.getActiveBanners);

// Admin
router.get('/admin/banners', verifyAdmin, ctrl.getAllBanners);
router.post('/admin/banners', verifyAdmin, checkPermission('manage_catalog'),
  ctrl.uploadMiddleware, ctrl.createBanner);
router.patch('/admin/banners/reorder', verifyAdmin, checkPermission('manage_catalog'), ctrl.reorderBanners);
router.put('/admin/banners/settings', verifyAdmin, checkPermission('manage_catalog'), ctrl.updateSettings);
router.patch('/admin/banners/:id', verifyAdmin, checkPermission('manage_catalog'),
  ctrl.uploadMiddleware, ctrl.updateBanner);
router.delete('/admin/banners/:id', verifyAdmin, checkPermission('manage_catalog'), ctrl.deleteBanner);

module.exports = router;
