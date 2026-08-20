/********************************************************************
 * Project: EonlineBazar — Staff Management
 * File: staffRoutes.js
 * Location: routes/staffRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Super Admin staff management API, mounted at /api/admin/staff.
 * Two gates apply to every route: `manage_staff` permission AND the
 * superadmin role, so staff can never manage other staff even if the
 * permission is granted to them by mistake.
 ********************************************************************/

const express = require('express');
const router = express.Router();

const staffController = require('../controllers/staffController');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkPermission, requireSuperAdmin } = require('../middlewares/rbac');

router.use(verifyAdmin, checkPermission('manage_staff'), requireSuperAdmin);

// GET /api/admin/staff — list every staff account with status & permissions
router.get('/', staffController.listStaff);

// POST /api/admin/staff — create a staff account with a permission set
router.post('/', staffController.createStaff);

// PUT /api/admin/staff/:id — update name, email, permissions, 2FA requirement
router.put('/:id', staffController.updateStaff);

// PATCH /api/admin/staff/:id/status — Active ⇄ Blocked (instant suspension)
router.patch('/:id/status', staffController.updateStaffStatus);

// POST /api/admin/staff/:id/reset-password — set or generate a new password
router.post('/:id/reset-password', staffController.resetStaffPassword);

// DELETE /api/admin/staff/:id — permanently remove the account and its access
router.delete('/:id', staffController.deleteStaff);

module.exports = router;
