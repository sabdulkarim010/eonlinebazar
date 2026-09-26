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
const {
    sanitizeStaffPayload,
    parseStaffSelector
} = require('./staffHelpers');

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
 * Resolve clock-in/out target: honour explicit staffType, else try Admin then Employee.
 */
async function resolveClockStaff(body = {}) {
    const staffType = String(body.staffType || '').trim().toLowerCase();
    if (staffType === 'employee' || staffType === 'admin') {
        return resolveHrmSubject(body);
    }

    const identifier = body.staffId || body.staffUsername;
    if (!identifier) return null;

    const asAdmin = await resolveHrmSubject({ ...body, staffType: 'admin' });
    if (asAdmin) return asAdmin;

    return resolveHrmSubject({ ...body, staffType: 'employee' });
}

async function resolveHrmSubject(input = {}) {
    const normalized = sanitizeStaffPayload(input);
    const staffType = String(normalized.staffType || 'admin').toLowerCase();

    if (staffType === 'employee') {
        const employee = await findEmployeeRecord(
            normalized.staffId || normalized.employeeId || normalized.staffUsername
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

    const account = await findAdmin(normalized.staffId || normalized.staffUsername);
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

/**
 * Resolve the Employee row linked to a login Admin (employeeRef or linkedAdminId).
 */
async function resolveLinkedEmployeeFromAdmin(account) {
    if (!account) return null;

    const adminId = account._id ? String(account._id) : '';

    if (adminId) {
        const byLink = await Employee.findOne({ linkedAdminId: adminId });
        if (byLink) return byLink;
    }

    if (account.employeeRef) {
        const byRef = await findEmployeeRecord(account.employeeRef);
        if (byRef) {
            const linked = byRef.linkedAdminId ? String(byRef.linkedAdminId) : '';
            if (!linked || linked === adminId) return byRef;
        }
    }

    return null;
}

/**
 * Self-service HRM subject for the logged-in admin (prefers linked Employee).
 */
async function resolveSelfServiceStaffSubject(account) {
    const employee = await resolveLinkedEmployeeFromAdmin(account);
    if (employee) {
        return resolveHrmSubject({
            staffType: 'employee',
            staffId: String(employee._id)
        });
    }

    if (!account?._id) return null;
    return resolveHrmSubject({
        staffType: 'admin',
        staffId: String(account._id),
        staffUsername: account.username
    });
}

function staffSelectorFromSubject(subject) {
    if (!subject) return '';
    if (subject.staffType === 'employee') {
        return `employee:${subject.staffId}`;
    }
    return subject.staffUsername || subject.staffId;
}

module.exports = {
    findAdmin,
    findEmployeeRecord,
    parseStaffSelector,
    resolveHrmSubject,
    resolveClockStaff,
    resolveLinkedEmployeeFromAdmin,
    resolveSelfServiceStaffSubject,
    staffSelectorFromSubject
};
