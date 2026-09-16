/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: payrollController.js
 * Location: controllers/admin/payrollController.js
 * Author: Abdul Karim Sheikh
 * Description: Monthly salary runs driven by the attendance register.
 * Generation reads the staff member's base salary off their Admin
 * account, so no separate salary-config collection exists. A run stays
 * editable while it is a draft and freezes once it is approved or paid.
 ********************************************************************/

const mongoose = require('mongoose');
const Attendance = require('../../models/attendance');
const Payroll = require('../../models/payroll');
const Admin = require('../../models/admin');
const Employee = require('../../models/employee');
const { generatePaySlipPdf } = require('../../utils/paySlipPdf');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');
const { dualWrite } = require('../../services/dualWriteService');

function getPayrollRepository() {
    return require('../../repositories/payrollRepository');
}

function mirrorPayrollDoc(saved) {
    return require('../../utils/hrmDualWriteHelpers').mirrorPayrollDoc(saved);
}

const { adminDualWrite, mirrorAdminUpdate } = require('../../utils/adminDualWriteHelpers');
const { findAdmin, parseStaffSelector, resolveHrmSubject } = require('../../utils/hrmStaffResolver');
const { fetchPayrollsPage, decoratePayrollDesignations } = require('../../services/hrmReadService');

/** Bangladesh weekend — Friday (Date#getDay() === 5) is not a working day. */
const WEEKEND_DAY = 5;

/** Nominal shift length used to price an overtime hour from a monthly salary. */
const STANDARD_SHIFT_HOURS = 8;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
}

async function findStaff(identifier) {
    return findAdmin(identifier);
}

/** Calendar working days in a month, excluding the weekly day off. */
function countWorkingDays(year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
        if (new Date(year, month - 1, day).getDay() !== WEEKEND_DAY) count += 1;
    }

    return count;
}

/**
 * Roll a month of attendance rows into payroll counters. A half-day counts
 * as half a present day, and hours logged beyond the rostered shift become
 * overtime.
 */
function summarizeAttendance(records) {
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let holidays = 0;
    let overtimeHours = 0;

    records.forEach((row) => {
        if (row.status === 'present' || row.status === 'late') presentDays += 1;
        else if (row.status === 'half-day') presentDays += 0.5;
        else if (row.status === 'absent') absentDays += 1;
        else if (row.status === 'holiday') holidays += 1;

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
        overtimeHours: Math.round(overtimeHours * 100) / 100
    };
}

/**
 * POST /api/admin/hrm/payroll/generate
 * Build (or rebuild) a draft run for one staff member and month. Approved
 * and paid runs are never overwritten — the caller must be explicit about
 * reverting them first.
 */
exports.generatePayroll = async (req, res) => {
    try {
        const body = req.body || {};
        const now = new Date();

        const subject = await resolveHrmSubject(body);
        if (!subject) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const month = Math.min(Math.max(parseInt(body.month, 10) || now.getMonth() + 1, 1), 12);
        const year = parseInt(body.year, 10) || now.getFullYear();

        const existing = await Payroll.findOne({ staffId: subject.staffId, month, year });
        if (existing && existing.status !== 'draft') {
            return res.status(409).json({
                success: false,
                message: `Payroll for this month is already ${existing.status} and cannot be regenerated.`
            });
        }

        const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const end = new Date(year, month, 0, 0, 0, 0, 0);

        const records = await Attendance.find({
            staffId: subject.staffId,
            date: { $gte: start, $lte: end }
        }).lean();

        const summary = summarizeAttendance(records);
        const calendarWorkingDays = countWorkingDays(year, month);

        // Explicit override wins; otherwise a marked holiday is not a day the
        // staff member was expected to work.
        const workingDays = body.workingDays !== undefined
            ? Math.max(0, parseInt(body.workingDays, 10) || 0)
            : Math.max(0, calendarWorkingDays - summary.holidays);

        const baseSalary = body.baseSalary !== undefined
            ? Math.max(0, Number(body.baseSalary) || 0)
            : subject.baseSalary;

        const hourlyRate = workingDays > 0
            ? baseSalary / (workingDays * STANDARD_SHIFT_HOURS)
            : 0;
        const overtimeRate = body.overtimeRate !== undefined
            ? Math.max(0, Number(body.overtimeRate) || 0)
            : Math.round(hourlyRate * 100) / 100;

        const record = existing || new Payroll({ staffId: subject.staffId, month, year });

        record.staffType = subject.staffType;
        record.staffUsername = subject.staffUsername;
        record.staffName = subject.staffName;
        record.baseSalary = baseSalary;
        record.bonus = Math.max(0, Number(body.bonus) || 0);
        record.overtime = body.overtime !== undefined
            ? Math.max(0, Number(body.overtime) || 0)
            : summary.overtimeHours;
        record.overtimeRate = overtimeRate;
        record.deductions = Math.max(0, Number(body.deductions) || 0);
        record.workingDays = workingDays;
        record.presentDays = summary.presentDays;
        record.absentDays = summary.absentDays;
        record.lateDays = summary.lateDays;
        record.status = 'draft';
        record.paymentMethod = String(body.paymentMethod || record.paymentMethod || '').trim();
        record.notes = String(body.notes || '').trim();
        record.createdBy = actorName(req);

        await dualWrite(
            () => record.save(),
            async (saved) => { await mirrorPayrollDoc(saved); },
            {
                model: 'Payroll',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Payroll Generated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${subject.staffUsername} — ${month}/${year}, net ${record.totalSalary}`,
            resourceType: 'payroll',
            resourceId: String(record._id)
        });

        res.status(200).json({
            success: true,
            message: 'Payroll generated.',
            data: record,
            attendanceRecords: records.length
        });
    } catch (error) {
        console.error('generatePayroll Error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate payroll.' });
    }
};

/**
 * GET /api/admin/hrm/payroll
 * Paginated salary ledger. Filters: ?month= &year= &status= &staff=.
 * Also returns the total payable for the filtered set.
 */
exports.getAllPayrolls = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const { records, total, rollup } = await fetchPayrollsPage({ query: req.query, skip, limit });
        const decorated = await decoratePayrollDesignations(records);

        res.status(200).json({
            success: true,
            data: decorated,
            summary: {
                totalAmount: Math.round((rollup.totalAmount || 0) * 100) / 100,
                paidCount: rollup.paidCount || 0,
                pendingCount: rollup.pendingCount || 0
            },
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        });
    } catch (error) {
        console.error('getAllPayrolls Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load payroll.' });
    }
};

/** PATCH /api/admin/hrm/payroll/:id/approve */
exports.approvePayroll = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid payroll id.' });
        }

        const record = await Payroll.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: 'Payroll record not found.' });
        }
        if (record.status !== 'draft') {
            return res.status(409).json({
                success: false,
                message: `Only draft payroll can be approved — this run is already ${record.status}.`
            });
        }

        record.status = 'approved';
        if (req.body?.notes) record.notes = String(req.body.notes).trim();
        await dualWrite(
            () => record.save(),
            async (saved) => {
                const repo = getPayrollRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (pgRow) await repo.approve(pgRow.id);
            },
            {
                model: 'Payroll',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Payroll Approved',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${record.staffUsername} — ${record.month}/${record.year}`,
            resourceType: 'payroll',
            resourceId: String(record._id)
        });

        res.status(200).json({ success: true, message: 'Payroll approved.', data: record });
    } catch (error) {
        console.error('approvePayroll Error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve payroll.' });
    }
};

/** PATCH /api/admin/hrm/payroll/:id/paid */
exports.markPaid = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid payroll id.' });
        }

        const record = await Payroll.findById(id);
        if (!record) {
            return res.status(404).json({ success: false, message: 'Payroll record not found.' });
        }
        if (record.status === 'paid') {
            return res.status(409).json({ success: false, message: 'This payroll is already marked paid.' });
        }
        if (record.status !== 'approved') {
            return res.status(409).json({
                success: false,
                message: 'Approve the payroll before marking it paid.'
            });
        }

        record.status = 'paid';
        record.paidAt = new Date();
        if (req.body?.paymentMethod) record.paymentMethod = String(req.body.paymentMethod).trim();
        await dualWrite(
            () => record.save(),
            async (saved) => {
                const repo = getPayrollRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (pgRow) await repo.markPaid(pgRow.id, saved.paymentMethod);
            },
            {
                model: 'Payroll',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Payroll Paid',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${record.staffUsername} — ${record.month}/${record.year}, ${record.totalSalary}`,
            resourceType: 'payroll',
            resourceId: String(record._id)
        });

        res.status(200).json({ success: true, message: 'Payroll marked paid.', data: record });
    } catch (error) {
        console.error('markPaid Error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark payroll paid.' });
    }
};

/**
 * GET /api/admin/hrm/payroll/:id/payslip
 * Streams a PDF pay slip and stamps paySlipGenerated on the record.
 */
exports.generatePaySlip = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid payroll id.' });
        }

        const record = await Payroll.findById(id).lean();
        if (!record) {
            return res.status(404).json({ success: false, message: 'Payroll record not found.' });
        }

        const pdf = await generatePaySlipPdf(record);
        const fileName = `payslip-${record.staffUsername || 'staff'}-${record.month}-${record.year}.pdf`;

        await Payroll.updateOne({ _id: record._id }, { $set: { paySlipGenerated: true } });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', pdf.length);
        res.status(200).end(pdf);
    } catch (error) {
        console.error('generatePaySlip Error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate pay slip.' });
    }
};

/**
 * POST /api/admin/hrm/payroll/salary-config
 * Writes the employment record (base salary, department, joining date,
 * employee id) onto the staff member's Admin account.
 */
exports.updateSalaryConfig = async (req, res) => {
    try {
        const body = req.body || {};

        const account = await findStaff(body.staffId || body.staffUsername);
        if (!account) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const updates = {};

        if (body.baseSalary !== undefined) {
            const salary = Number(body.baseSalary);
            if (!Number.isFinite(salary) || salary < 0) {
                return res.status(400).json({ success: false, message: 'Base salary must be a positive number.' });
            }
            updates.baseSalary = salary;
        }
        if (body.department !== undefined) updates.department = String(body.department).trim();
        if (body.employeeId !== undefined) updates.employeeId = String(body.employeeId).trim();
        if (body.joiningDate !== undefined) {
            const joined = new Date(body.joiningDate);
            if (Number.isNaN(joined.getTime())) {
                return res.status(400).json({ success: false, message: 'Joining date is invalid.' });
            }
            updates.joiningDate = joined;
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({ success: false, message: 'No changes supplied.' });
        }

        // findByIdAndUpdate keeps the password untouched, so the hashing hook
        // on save() is never a concern here.
        const updated = await adminDualWrite(
            () => Admin.findByIdAndUpdate(
                account._id,
                { $set: updates },
                { returnDocument: 'after', runValidators: true }
            ),
            (saved) => mirrorAdminUpdate(saved, { operation: 'updateSalaryConfig' }),
            {
                operation: 'updateSalaryConfig',
                mongoId: String(account._id)
            }
        );

        await logSecurityEvent({
            action: 'Salary Config Updated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${account.username} — ${Object.keys(updates).join(', ')}`,
            resourceType: 'payroll',
            resourceId: String(account._id)
        });

        res.status(200).json({
            success: true,
            message: 'Salary configuration saved.',
            data: {
                staffId: String(updated._id),
                username: updated.username,
                name: updated.name || updated.displayName || updated.username,
                baseSalary: Number(updated.baseSalary) || 0,
                department: updated.department || '',
                employeeId: updated.employeeId || '',
                joiningDate: updated.joiningDate || null
            }
        });
    } catch (error) {
        console.error('updateSalaryConfig Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save salary configuration.' });
    }
};

exports.countWorkingDays = countWorkingDays;
exports.summarizeAttendance = summarizeAttendance;
