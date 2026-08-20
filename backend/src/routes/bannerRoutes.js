const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bannerController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Public
router.get('/store/banners', ctrl.getActiveBanners);

// Admin
router.get('/admin/banners', verifyAdmin, ctrl.getAllBanners);
router.post('/admin/banners', verifyAdmin,
  ctrl.uploadMiddleware, ctrl.createBanner);
router.patch('/admin/banners/reorder', verifyAdmin, ctrl.reorderBanners);
router.put('/admin/banners/settings', verifyAdmin, ctrl.updateSettings);
router.patch('/admin/banners/:id', verifyAdmin,
  ctrl.uploadMiddleware, ctrl.updateBanner);
router.delete('/admin/banners/:id', verifyAdmin, ctrl.deleteBanner);

module.exports = router;
