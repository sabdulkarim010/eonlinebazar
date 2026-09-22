'use strict';

const mongoose = require('mongoose');
const Admin = require('../models/admin');
const Employee = require('../models/employee');
const { ROLES } = require('../config/permissions');

/**
 * Legacy Mongo _id strings for employees linked to the Super Admin account.
 * Used to block delete and exclude from operational HRM pickers/lists.
 */
async function getSuperAdminLinkedEmployeeLegacyIds() {
    const superAdmin = await Admin.findOne({ role: ROLES.SUPER_ADMIN })
        .sort({ createdAt: 1 })
        .select('employeeRef _id')
        .lean();

    if (!superAdmin) return [];

    const ids = new Set();
    if (superAdmin.employeeRef) ids.add(String(superAdmin.employeeRef));

    if (superAdmin._id) {
        const linked = await Employee.find({ linkedAdminId: String(superAdmin._id) })
            .select('_id')
            .lean();
        linked.forEach((row) => ids.add(String(row._id)));
    }

    return [...ids];
}

async function isSuperAdminLinkedEmployee(employeeLegacyId) {
    const id = String(employeeLegacyId || '').trim();
    if (!id) return false;

    const linked = await Admin.findOne({
        role: ROLES.SUPER_ADMIN,
        employeeRef: id
    }).select('_id').lean();

    if (linked) return true;

    const ids = await getSuperAdminLinkedEmployeeLegacyIds();
    return ids.includes(id);
}

function buildMongoExcludeSuperAdminClause(excludeIds = []) {
    const objectIds = excludeIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    if (!objectIds.length) return null;
    return { _id: { $nin: objectIds } };
}

module.exports = {
    getSuperAdminLinkedEmployeeLegacyIds,
    isSuperAdminLinkedEmployee,
    buildMongoExcludeSuperAdminClause
};
