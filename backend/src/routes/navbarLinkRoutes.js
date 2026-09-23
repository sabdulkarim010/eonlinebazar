/********************************************************************
 * Project: EonlineBazar
 * File: navbarLinkRoutes.js
 * Location: routes/navbarLinkRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Top-bar NavbarLink API. Public GET for storefront;
 * admin CRUD under /admin (manage_catalog permission).
 ********************************************************************/

const express = require('express');
const router = express.Router();
const {
    getPublicNavbarLinks,
    getAdminNavbarLinks,
    createNavbarLink,
    updateNavbarLink,
    deleteNavbarLink,
    reorderNavbarLinks
} = require('../controllers/navbarLinkController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/rbac');

const canManageNavbar = checkPermission('manage_marketing', 'manage_navbar');

// Storefront — published links only
router.get('/', getPublicNavbarLinks);

// Admin Catalog Management → Navbar Menu Links
router.get('/admin', verifyAdmin, canManageNavbar, getAdminNavbarLinks);
router.post('/admin', verifyAdmin, canManageNavbar, createNavbarLink);
router.patch('/admin/reorder', verifyAdmin, canManageNavbar, reorderNavbarLinks);
router.put('/admin/:id', verifyAdmin, canManageNavbar, updateNavbarLink);
router.patch('/admin/:id', verifyAdmin, canManageNavbar, updateNavbarLink);
router.delete('/admin/:id', verifyAdmin, canManageNavbar, deleteNavbarLink);

module.exports = router;
