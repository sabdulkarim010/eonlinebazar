/********************************************************************
 * Project: EonlineBazar
 * File: categoryRoutes.js
 * Location: routes/categoryRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Public category tree/navbar/homepage/slug routes and
 * admin CRUD, banner upload, and reorder endpoints.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/categoryController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Public
router.get('/', ctrl.getCategories);
router.get('/tree', ctrl.getCategoryTree);
router.get('/navbar', ctrl.getNavbarCategories);
router.get('/homepage', ctrl.getHomepageCategories);

// Admin (registered before /:slug so "admin" is not captured as a slug)
router.get('/admin/all', verifyAdmin, ctrl.adminGetCategories);
router.get('/admin/:id', verifyAdmin, ctrl.getCategoryById);
router.post('/admin', verifyAdmin,
  ctrl.uploadCategoryImage, ctrl.adminCreateCategory);
router.patch('/admin/reorder', verifyAdmin, ctrl.adminReorder);
router.patch('/admin/:id', verifyAdmin,
  ctrl.uploadCategoryImage, ctrl.adminUpdateCategory);
router.put('/admin/:id', verifyAdmin,
  ctrl.uploadCategoryImage, ctrl.adminUpdateCategory);
router.patch('/admin/:id/banner', verifyAdmin,
  ctrl.uploadBannerImage, ctrl.adminUploadBanner);
router.delete('/admin/:id', verifyAdmin, ctrl.adminDeleteCategory);

// Public slug (must be last among GET routes)
router.get('/:slug', ctrl.getCategoryBySlug);

module.exports = router;
