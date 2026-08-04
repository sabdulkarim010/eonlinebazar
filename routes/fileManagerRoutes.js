/********************************************************************
 * Project: EonlineBazar
 * File: fileManagerRoutes.js
 * Location: routes/fileManagerRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Super Admin file manager API, mounted at /api/admin/files.
 * Every route requires a valid admin JWT and a live superadmin role
 * (`superAdminAuth` = verifyAdmin + requireSuperAdmin).
 ********************************************************************/

const express = require('express');
const router = express.Router();

const fileManagerController = require('../controllers/fileManagerController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { requireSuperAdmin } = require('../middlewares/rbac');

/** Super-admin-only gate used by all file manager endpoints. */
const superAdminAuth = [verifyAdmin, requireSuperAdmin];

router.use(...superAdminAuth);

// GET /api/admin/files — recursive tree (or ?search=filename flat filter)
router.get('/', fileManagerController.listFiles);

// GET /api/admin/files/read?path=...
router.get('/read', fileManagerController.readFileContent);

// POST /api/admin/files/save — { path, content }
router.post('/save', fileManagerController.saveFileContent);

// POST /api/admin/files/create — { path, type: 'file'|'folder', content? }
router.post('/create', fileManagerController.createEntry);

// DELETE /api/admin/files/delete — { path, adminPassword }
router.delete('/delete', fileManagerController.deleteEntry);

module.exports = router;
