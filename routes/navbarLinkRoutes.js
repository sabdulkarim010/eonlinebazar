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

const canManageCatalog = checkPermission('manage_catalog');

// Storefront — published links only
router.get('/', getPublicNavbarLinks);

// Admin Catalog Management → Navbar Menu Links
router.get('/admin', verifyAdmin, canManageCatalog, getAdminNavbarLinks);
router.post('/admin', verifyAdmin, canManageCatalog, createNavbarLink);
router.patch('/admin/reorder', verifyAdmin, canManageCatalog, reorderNavbarLinks);
router.put('/admin/:id', verifyAdmin, canManageCatalog, updateNavbarLink);
router.patch('/admin/:id', verifyAdmin, canManageCatalog, updateNavbarLink);
router.delete('/admin/:id', verifyAdmin, canManageCatalog, deleteNavbarLink);

module.exports = router;
