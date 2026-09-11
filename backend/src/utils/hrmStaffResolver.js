/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: hrmStaffResolver.js
 * Location: utils/hrmStaffResolver.js
 * Description: Resolves login Admin accounts and non-login Employee
 * records into a unified shape for attendance and payroll.
 ********************************************************************/

const mongoose = require('mongoose');
const Admin = require('../models/admin');
const Employee = require('../models/employee');

async function findEmployeeRecord(identifier) {
    const value = String(identifier || '').trim();
    if (!value) return null;

    if (mongoose.Types.ObjectId.isValid(value)) {
        const byId = await Employee.findById(value);
        if (byId) return byId;
    }

    return Employee.findOne({
        $or: [{ employeeId: value }, { phone: value }]
    });
}

async function findAdmin(identifier) {
    const value = String(identifier || '').trim();
    if (!value) return null;

    if (mongoose.Types.ObjectId.isValid(value)) {
        const byId = await Admin.findById(value);
        if (byId) return byId;
    }

    return Admin.findOne({ username: value });
}

/**
 * Parse a combined staff selector value such as "admin:jdoe" or
 * "employee:EMP-001", or a legacy plain admin username.
 */
function parseStaffSelector(raw) {
    const value = String(raw || '').trim();
    if (!value) return { staffType: 'admin' };

    if (value.includes(':')) {
        const [staffType, id] = value.split(':');
        return {
            staffType: staffType === 'employee' ? 'employee' : 'admin',
            staffId: id,
            staffUsername: staffType === 'admin' ? id : undefined,
            employeeId: staffType === 'employee' ? id : undefined
        };
    }

    return { staffType: 'admin', staffUsername: value };
}

/**
 * Resolve HRM subject from a request body or parsed selector.
 * Returns null when the person cannot be found.
 */
async function resolveHrmSubject(input = {}) {
    const staffType = String(input.staffType || 'admin').toLowerCase();

    if (staffType === 'employee') {
        const employee = await findEmployeeRecord(
            input.staffId || input.employeeId || input.staffUsername
        );
        if (!employee) return null;

        return {
            staffType: 'employee',
            staffId: String(employee._id),
            staffUsername: employee.employeeId,
            staffName: employee.fullName,
            shiftKey: employee.employeeId,
            baseSalary: Number(employee.baseSalary) || 0
        };
    }

    const account = await findAdmin(input.staffId || input.staffUsername);
    if (!account) return null;

    return {
        staffType: 'admin',
        staffId: String(account._id),
        staffUsername: account.username,
        staffName: account.name || account.displayName || account.username,
        shiftKey: account.username,
        baseSalary: Number(account.baseSalary) || 0
    };
}

module.exports = {
    findAdmin,
    findEmployeeRecord,
    parseStaffSelector,
    resolveHrmSubject
};
