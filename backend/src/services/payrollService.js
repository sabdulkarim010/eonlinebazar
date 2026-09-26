/********************************************************************
 * Project: EonlineBazar — HRM Payroll
 * File: payrollService.js
 * Description: Payroll calendar math (dynamic weekends, joining pro-rate),
 *   attendance rollups, and net pay assembly for monthly runs.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Attendance = require('../models/attendance');
const Admin = require('../models/admin');
const Employee = require('../models/employee');
const { computeTotalSalary } = require('../models/payroll');
const { getAttendanceSettings, normalizeWeekendDays } = require('./attendanceSettingsService');
const { resolveHrmSubject, findEmployeeRecord } = require('../utils/hrmStaffResolver');

/** Nominal shift length used to price an overtime hour from a monthly salary. */
const STANDARD_SHIFT_HOURS = 8;
const GRACE_LATE_ALLOWED = 3;
const LATE_PENALTY_BDT = 50;

/**
 * Count non-weekend days in a calendar month (optionally from a start day).
 * @param {number[]} weekendDays - Date#getDay() values (0=Sun … 6=Sat)
 */
function countWorkingDays(year, month, weekendDays, fromDay = 1) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const offDays = new Set(Array.isArray(weekendDays) ? weekendDays : []);
    const start = Math.max(1, Math.min(Number(fromDay) || 1, daysInMonth + 1));
    let count = 0;

    for (let day = start; day <= daysInMonth; day += 1) {
        const dow = new Date(year, month - 1, day).getDay();
        if (!offDays.has(dow)) count += 1;
    }

    return count;
}

/**
 * Joining-date pro-rate within a payroll month (calendar-day basis).
 */
function getMonthJoiningProration(year, month, joiningDate) {
    const daysInMonth = new Date(year, month, 0).getDate();

    if (!joiningDate) {
        return {
            daysInMonth,
            daysActiveInMonth: daysInMonth,
            proRateFactor: 1,
            periodStartDay: 1
        };
    }

    const joined = new Date(joiningDate);
    if (Number.isNaN(joined.getTime())) {
        return {
            daysInMonth,
            daysActiveInMonth: daysInMonth,
            proRateFactor: 1,
            periodStartDay: 1
        };
    }

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month - 1, daysInMonth, 23, 59, 59, 999);

    if (joined > monthEnd) {
        return {
            daysInMonth,
            daysActiveInMonth: 0,
            proRateFactor: 0,
            periodStartDay: daysInMonth + 1
        };
    }

    if (joined <= monthStart) {
        return {
            daysInMonth,
            daysActiveInMonth: daysInMonth,
            proRateFactor: 1,
            periodStartDay: 1
        };
    }

    const periodStartDay = joined.getDate();
    const daysBeforeJoining = periodStartDay - 1;
    const daysActiveInMonth = daysInMonth - daysBeforeJoining;

    return {
        daysInMonth,
        daysActiveInMonth,
        proRateFactor: daysActiveInMonth / daysInMonth,
        periodStartDay
    };
}

async function resolvePayrollEmployment(subject, options = {}) {
    const baseFromOptions = options.baseSalary !== undefined
        ? Math.max(0, Number(options.baseSalary) || 0)
        : null;

    if (subject.staffType === 'employee') {
        const employee = await findEmployeeRecord(subject.staffId);
        return {
            baseSalary: baseFromOptions != null
                ? baseFromOptions
                : Math.max(0, Number(employee?.baseSalary) || subject.baseSalary || 0),
            joiningDate: employee?.joiningDate || null
        };
    }

    let account = null;
    if (mongoose.Types.ObjectId.isValid(String(subject.staffId))) {
        account = await Admin.findById(subject.staffId)
            .select('baseSalary joiningDate employeeRef')
            .lean();
    }

    let baseSalary = baseFromOptions != null
        ? baseFromOptions
        : Math.max(0, Number(account?.baseSalary) || subject.baseSalary || 0);
    let joiningDate = account?.joiningDate || null;

    if (account?.employeeRef) {
        const linked = await Employee.findById(account.employeeRef)
            .select('baseSalary joiningDate')
            .lean();
        if (linked) {
            if (!joiningDate && linked.joiningDate) joiningDate = linked.joiningDate;
            if (!baseSalary && linked.baseSalary) baseSalary = Number(linked.baseSalary) || 0;
        }
    }

    return { baseSalary, joiningDate };
}

function summarizeAttendance(records) {
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let holidays = 0;
    let unpaidLeaveDays = 0;
    let overtimeHours = 0;

    records.forEach((row) => {
        if (row.status === 'present' || row.status === 'late') presentDays += 1;
        else if (row.status === 'half-day') presentDays += 0.5;
        else if (row.status === 'absent') absentDays += 1;
        else if (row.status === 'holiday') holidays += 1;
        else if (row.status === 'leave') unpaidLeaveDays += 1;

        if (row.isLate) lateDays += 1;

        const start = Attendance.parseShiftMinutes(row.shiftStart);
        const end = Attendance.parseShiftMinutes(row.shiftEnd);
        const shiftHours = start !== null && end !== null && end > start
            ? (end - start) / 60
            : STANDARD_SHIFT_HOURS;

        const worked = Number(row.hoursWorked) || 0;
        if (worked > shiftHours) overtimeHours += worked - shiftHours;
    });

    return {
        presentDays: Math.round(presentDays * 10) / 10,
        absentDays,
        lateDays,
        holidays,
        unpaidLeaveDays,
        overtimeHours: Math.round(overtimeHours * 100) / 100
    };
}

async function calculatePayrollFromAttendance(staffKey, month, year, options = {}) {
    const subject = await resolveHrmSubject({
        staffId: staffKey,
        staffUsername: staffKey,
        staffType: options.staffType,
        employeeId: options.employeeId,
        ...options
    });
    if (!subject) {
        const err = new Error('Staff member not found.');
        err.status = 404;
        throw err;
    }

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 0, 0, 0, 0);

    const records = await Attendance.find({
        staffId: subject.staffId,
        date: { $gte: start, $lte: end }
    }).lean();

    const summary = summarizeAttendance(records);
    const attendanceSettings = await getAttendanceSettings();
    const weekendDays = attendanceSettings.weekendDays || normalizeWeekendDays(attendanceSettings);

    const employment = await resolvePayrollEmployment(subject, options);
    const baseSalary = employment.baseSalary;
    const joining = getMonthJoiningProration(year, month, employment.joiningDate);
    const proRatedBaseSalary = Math.round(baseSalary * joining.proRateFactor * 100) / 100;

    const graceLateAllowed = Number(options.graceLateAllowed) >= 0
        ? Number(options.graceLateAllowed)
        : GRACE_LATE_ALLOWED;

    const calendarWorkingDays = countWorkingDays(
        year,
        month,
        weekendDays,
        joining.periodStartDay
    );

    const workingDays = options.workingDays !== undefined
        ? Math.max(0, parseInt(options.workingDays, 10) || 0)
        : Math.max(0, calendarWorkingDays - summary.holidays);

    const earnedSalary = workingDays > 0
        ? Math.round(proRatedBaseSalary * Math.min(summary.presentDays / workingDays, 1) * 100) / 100
        : (joining.proRateFactor > 0 ? proRatedBaseSalary : 0);

    const dailyRate = workingDays > 0 ? proRatedBaseSalary / workingDays : 0;
    // Informational only — absent time is already reflected in presentDays / earnedSalary.
    const absentDeduction = Math.round(summary.absentDays * dailyRate * 100) / 100;
    const unpaidLeaveDeduction = Math.round(summary.unpaidLeaveDays * dailyRate * 100) / 100;

    const lateOverGrace = Math.max(0, summary.lateDays - graceLateAllowed);
    const lateDeduction = Math.round(lateOverGrace * LATE_PENALTY_BDT * 100) / 100;

    const hourlyRate = workingDays > 0
        ? proRatedBaseSalary / (workingDays * STANDARD_SHIFT_HOURS)
        : 0;
    const overtimeRate = options.overtimeRate !== undefined
        ? Math.max(0, Number(options.overtimeRate) || 0)
        : Math.round(hourlyRate * 100) / 100;
    const overtimeHours = options.overtime !== undefined
        ? Math.max(0, Number(options.overtime) || 0)
        : summary.overtimeHours;
    const bonus = Math.max(0, Number(options.bonus) || 0);
    const manualDeductions = Math.max(0, Number(options.deductions) || 0);
    const attendanceDeductions = Math.round((lateDeduction + unpaidLeaveDeduction) * 100) / 100;
    const totalDeductions = Math.round((attendanceDeductions + manualDeductions) * 100) / 100;

    const totals = computeTotalSalary({
        baseSalary: proRatedBaseSalary,
        earnedSalary,
        workingDays,
        presentDays: summary.presentDays,
        overtime: overtimeHours,
        overtimeRate,
        bonus,
        deductions: totalDeductions
    });

    return {
        staffId: subject.staffId,
        staffType: subject.staffType,
        staffUsername: subject.staffUsername,
        staffName: subject.staffName,
        month,
        year,
        baseSalary,
        proRatedBaseSalary,
        earnedSalary,
        deductions: totalDeductions,
        netSalary: totals.totalSalary,
        breakdown: {
            presentDays: summary.presentDays,
            absentDays: summary.absentDays,
            lateDays: summary.lateDays,
            workingDays,
            calendarWorkingDays,
            holidays: summary.holidays,
            unpaidLeaveDays: summary.unpaidLeaveDays,
            weekendDays,
            graceLateAllowed,
            gracePeriodMinutes: attendanceSettings.gracePeriodMinutes,
            joiningDate: employment.joiningDate,
            daysInMonth: joining.daysInMonth,
            daysActiveInMonth: joining.daysActiveInMonth,
            proRateFactor: joining.proRateFactor,
            absentDeduction,
            unpaidLeaveDeduction,
            lateDeduction,
            attendanceDeductions,
            manualDeductions,
            overtimeHours,
            overtimeRate,
            overtimeAmount: totals.overtimeAmount,
            bonus
        },
        attendanceRecordIds: records.map((row) => String(row._id))
    };
}

module.exports = {
    STANDARD_SHIFT_HOURS,
    GRACE_LATE_ALLOWED,
    LATE_PENALTY_BDT,
    countWorkingDays,
    getMonthJoiningProration,
    resolvePayrollEmployment,
    summarizeAttendance,
    calculatePayrollFromAttendance
};
