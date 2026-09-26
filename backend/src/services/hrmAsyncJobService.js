'use strict';

const fs = require('fs').promises;
const path = require('path');
const Employee = require('../models/employee');
const Payroll = require('../models/payroll');
const {
    fetchEmployeesForExport,
    fetchPayrollsForExport
} = require('./hrmReadService');
const { calculatePayrollFromAttendance } = require('./payrollService');
const { resolveHrmSubject } = require('../utils/hrmStaffResolver');
const { dualWrite } = require('./dualWriteService');

function mirrorPayrollDoc(saved) {
    return require('../utils/hrmDualWriteHelpers').mirrorPayrollDoc(saved);
}

function csvCell(value) {
    const raw = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
    return raw;
}

function csvRow(cells) {
    return cells.map(csvCell).join(',');
}

function formatCsvDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

async function writeExportCsv(filename, rows) {
    const exportDir = path.join(__dirname, '..', '..', 'uploads', 'exports');
    await fs.mkdir(exportDir, { recursive: true });
    const absolutePath = path.join(exportDir, filename);
    await fs.writeFile(absolutePath, `\uFEFF${rows.join('\r\n')}`, 'utf8');
    return absolutePath;
}

async function buildEmployeeExportCsv(query = {}) {
    const employees = await fetchEmployeesForExport(query, 10000);
    const rows = [
        csvRow(['Employee ID', 'Full Name', 'Phone', 'Email', 'Department', 'Designation', 'Type', 'Status', 'Join Date', 'Base Salary'])
    ];
    employees.forEach((employee) => {
        rows.push(csvRow([
            employee.employeeId || String(employee._id),
            employee.fullName || '',
            employee.phone || '',
            employee.email || '',
            employee.department || '',
            employee.designation || '',
            employee.employeeType || '',
            employee.status || '',
            formatCsvDate(employee.joiningDate),
            employee.baseSalary ?? ''
        ]));
    });
    return { rows, rowCount: employees.length };
}

async function buildPayrollExportCsv(query = {}) {
    const records = await fetchPayrollsForExport(query, 10000);
    const rows = [
        csvRow([
            'Staff', 'Month', 'Year', 'Base Salary', 'Earned Salary', 'Bonus',
            'Overtime Hours', 'Deductions', 'Net Pay', 'Status', 'Working Days', 'Present Days'
        ])
    ];
    records.forEach((row) => {
        rows.push(csvRow([
            row.staffName || row.staffUsername || row.staffId || '',
            row.month ?? '',
            row.year ?? '',
            row.baseSalary ?? '',
            row.earnedSalary ?? '',
            row.bonus ?? '',
            row.overtime ?? '',
            row.deductions ?? '',
            row.totalSalary ?? '',
            row.status || '',
            row.workingDays ?? '',
            row.presentDays ?? ''
        ]));
    });
    return { rows, rowCount: records.length };
}

async function runBulkPayrollGeneration(payload = {}) {
    const month = Math.min(Math.max(parseInt(payload.month, 10) || new Date().getMonth() + 1, 1), 12);
    const year = parseInt(payload.year, 10) || new Date().getFullYear();
    const createdBy = String(payload.createdBy || 'system').trim();

    let staffKeys = Array.isArray(payload.staffIds) ? payload.staffIds.map(String).filter(Boolean) : [];
    if (!staffKeys.length && payload.allActive !== false) {
        const employees = await Employee.find({
            status: 'active',
            isDeleted: { $ne: true }
        }).select('_id employeeId').lean();
        staffKeys = employees.map((e) => String(e._id));
    }

    const errors = [];
    let successCount = 0;

    for (const staffKey of staffKeys) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const subject = await resolveHrmSubject({ staffId: staffKey, staffType: 'employee', employeeId: staffKey });
            if (!subject) {
                errors.push({ staffId: staffKey, message: 'Staff not found.' });
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const existing = await Payroll.findOne({ staffId: subject.staffId, month, year });
            if (existing && existing.status !== 'draft') {
                errors.push({ staffId: subject.staffId, message: `Payroll already ${existing.status}.` });
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const preview = await calculatePayrollFromAttendance(subject.staffId, month, year, payload);
            const record = existing || new Payroll({ staffId: subject.staffId, month, year });

            record.staffType = subject.staffType;
            record.staffUsername = subject.staffUsername;
            record.staffName = subject.staffName;
            record.baseSalary = preview.baseSalary;
            record.bonus = preview.breakdown.bonus;
            record.overtime = preview.breakdown.overtimeHours;
            record.overtimeRate = preview.breakdown.overtimeRate;
            record.deductions = preview.deductions;
            record.earnedSalary = preview.earnedSalary;
            record.attendanceDeductions = preview.breakdown.attendanceDeductions;
            record.workingDays = preview.breakdown.workingDays;
            record.presentDays = preview.breakdown.presentDays;
            record.absentDays = preview.breakdown.absentDays;
            record.lateDays = preview.breakdown.lateDays;
            record.attendanceRecordIds = preview.attendanceRecordIds;
            record.status = 'draft';
            record.createdBy = createdBy;

            // eslint-disable-next-line no-await-in-loop
            await dualWrite(
                () => record.save(),
                async (saved) => { await mirrorPayrollDoc(saved); },
                { model: 'Payroll', operation: 'create', mongoId: (saved) => String(saved._id) }
            );
            successCount += 1;
        } catch (err) {
            errors.push({ staffId: staffKey, message: err.message || 'Generation failed.' });
        }
    }

    return {
        month,
        year,
        totalProcessed: staffKeys.length,
        successCount,
        errorCount: errors.length,
        errors: errors.slice(0, 200)
    };
}

module.exports = {
    buildEmployeeExportCsv,
    buildPayrollExportCsv,
    writeExportCsv,
    runBulkPayrollGeneration
};
