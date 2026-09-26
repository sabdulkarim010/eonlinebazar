'use strict';

const Attendance = require('../models/attendance');
const Payroll = require('../models/payroll');
const Leave = require('../models/leave');

/**
 * Remove HRM rows tied to an employee legacy Mongo staffId (staffType employee).
 * @param {string} staffLegacyId - Employee._id string
 * @param {{ draftsOnlyPayroll?: boolean, includeLeave?: boolean }} options
 */
async function cascadeMongoEmployeeHrm(staffLegacyId, options = {}) {
    const filter = { staffId: String(staffLegacyId), staffType: 'employee' };

    const attendanceResult = await Attendance.deleteMany(filter);

    const payrollFilter = { ...filter };
    if (options.draftsOnlyPayroll) {
        payrollFilter.status = 'draft';
    }
    const payrollResult = await Payroll.deleteMany(payrollFilter);

    let leaveDeleted = 0;
    if (options.includeLeave) {
        const leaveResult = await Leave.deleteMany(filter);
        leaveDeleted = leaveResult.deletedCount || 0;
    }

    return {
        attendanceDeleted: attendanceResult.deletedCount || 0,
        payrollDeleted: payrollResult.deletedCount || 0,
        leaveDeleted
    };
}

async function cascadePostgresEmployeeHrm(staffLegacyId, options = {}) {
    const attendanceRepository = require('../repositories/attendanceRepository');
    const payrollRepository = require('../repositories/payrollRepository');

    const attendanceDeleted = await attendanceRepository.deleteAllForStaff(
        staffLegacyId,
        'employee'
    );
    const payrollDeleted = await payrollRepository.deleteAllForStaff(staffLegacyId, {
        draftsOnly: Boolean(options.draftsOnlyPayroll)
    });

    let leaveDeleted = 0;
    if (options.includeLeave) {
        const leaveRepository = require('../repositories/leaveRepository');
        leaveDeleted = await leaveRepository.deleteAllForStaff(staffLegacyId, 'employee');
    }

    return { attendanceDeleted, payrollDeleted, leaveDeleted };
}

async function cascadeEmployeeHrmCleanup(staffLegacyId, options = {}) {
    const mongo = await cascadeMongoEmployeeHrm(staffLegacyId, options);
    let pg = { attendanceDeleted: 0, payrollDeleted: 0, leaveDeleted: 0 };
    try {
        pg = await cascadePostgresEmployeeHrm(staffLegacyId, options);
    } catch (err) {
        console.warn('[HRMS-CASCADE-PG]', err.message);
    }
    return { mongo, pg };
}

module.exports = {
    cascadeMongoEmployeeHrm,
    cascadePostgresEmployeeHrm,
    cascadeEmployeeHrmCleanup
};
