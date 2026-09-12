/********************************************************************
 * Project: EonlineBazar — HRM Bootstrap
 * File: superAdminHrmSync.js
 * Description: One-time sync — ensures the superadmin Admin account
 * has a linked Employee record for HRM attendance/payroll parity.
 ********************************************************************/

const Admin = require('../models/admin');
const Employee = require('../models/employee');
const { ROLES } = require('../config/permissions');

/**
 * After superadmin exists, create a minimal Employee row if none is linked.
 * Safe to run on every boot — exits early when already synced.
 */
async function syncSuperAdminEmployee() {
    const superAdmin = await Admin.findOne({ role: ROLES.SUPER_ADMIN }).sort({ createdAt: 1 });
    if (!superAdmin) return { synced: false, reason: 'no_superadmin' };

    const adminId = String(superAdmin._id);
    let employee = await Employee.findOne({ linkedAdminId: adminId });

    if (employee) {
        if (!superAdmin.employeeRef) {
            superAdmin.employeeRef = String(employee._id);
            await superAdmin.save();
        }
        return { synced: false, reason: 'already_linked', employeeId: employee.employeeId };
    }

    const generatedId = await Employee.generateEmployeeId();
    const phone = String(superAdmin.phone || '').trim() || '00000000000';

    employee = new Employee({
        employeeId: generatedId,
        fullName: superAdmin.name || superAdmin.displayName || 'Super Admin',
        phone,
        email: superAdmin.email || '',
        designation: 'Super Admin',
        role: 'Super Admin',
        department: 'Administration',
        status: 'active',
        linkedAdminId: adminId
    });
    await employee.save();

    superAdmin.employeeRef = String(employee._id);
    await superAdmin.save();

    return { synced: true, employeeId: employee.employeeId, adminId };
}

module.exports = { syncSuperAdminEmployee };
