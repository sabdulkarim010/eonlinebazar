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
const Admin = require('../../models/admin');
const Payroll = require('../../models/payroll');
const { generatePaySlipPdf } = require('../../utils/paySlipPdf');
const { logHrmAuditEvent, HRM_ACTION_TYPES } = require('../../services/hrmAuditService');
const { dualWrite } = require('../../services/dualWriteService');

function getPayrollRepository() {
    return require('../../repositories/payrollRepository');
}

function mirrorPayrollDoc(saved) {
    return require('../../utils/hrmDualWriteHelpers').mirrorPayrollDoc(saved);
}

const { accountHasPermission } = require('../../config/permissions');
const { isHrOrSuperAdmin } = require('../../middlewares/rbac');
const { adminDualWrite, mirrorAdminUpdate } = require('../../utils/adminDualWriteHelpers');
const { findAdmin, resolveHrmSubject } = require('../../utils/hrmStaffResolver');
const { fetchPayrollsPage, decoratePayrollDesignations } = require('../../services/hrmReadService');
const {
    countWorkingDays,
    summarizeAttendance,
    calculatePayrollFromAttendance
} = require('../../services/payrollService');
const { runBulkPayrollGeneration } = require('../../services/hrmAsyncJobService');
const {
    enqueueJob,
    getJobStatus,
    resolveJobDownloadPath
} = require('../../queues/importExportQueue');
const path = require('path');

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
}

function actorCanAccessAnyPayslip(req) {
    const account = req.adminAccount;
    if (!account) return false;
    if (typeof account.isSuperAdmin === 'function' && account.isSuperAdmin()) return true;
    if (isHrOrSuperAdmin(account)) return true;
    return accountHasPermission(account, 'manage_staff');
}

async function assertPayslipAccessAllowed(req, record) {
    if (actorCanAccessAnyPayslip(req)) return null;

    const account = req.adminAccount;
    if (!account) {
        return { status: 401, message: 'Admin session could not be verified.' };
    }

    const payrollStaffId = String(record.staffId || '');

    if (payrollStaffId === String(account._id)) return null;

    const { resolveSelfServiceStaffSubject } = require('../../utils/hrmStaffResolver');
    const subject = await resolveSelfServiceStaffSubject(account);
    if (subject && payrollStaffId === String(subject.staffId)) return null;

    return {
        status: 403,
        message: 'You can only download your own pay slip.'
    };
}

async function findStaff(identifier) {
    return findAdmin(identifier);
}

/**
 * GET /api/admin/hrm/payroll/calculate — preview payroll from attendance (not saved).
 */
exports.previewPayrollFromAttendance = async (req, res) => {
    try {
        const now = new Date();
        const employeeId = String(req.query.employeeId || req.query.staffId || '').trim();
        const month = Math.min(Math.max(parseInt(req.query.month, 10) || now.getMonth() + 1, 1), 12);
        const year = parseInt(req.query.year, 10) || now.getFullYear();

        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'employeeId is required.' });
        }

        const preview = await calculatePayrollFromAttendance(employeeId, month, year, req.query);
        return res.status(200).json({ success: true, data: preview });
    } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error('calculatePayrollFromAttendance Error:', error);
        return res.status(status).json({
            success: false,
            message: error.message || 'Failed to calculate payroll.'
        });
    }
};

/**
 * POST /api/admin/hrm/payroll/generate
 * Build (or rebuild) a draft run for one staff member and month. Approved
 * and paid runs are never overwritten — the caller must be explicit about
 * reverting them first.
 */
function wantsAsyncJob(req) {
    return String(req.query.async || req.body?.async || '').toLowerCase() === 'true';
}

/**
 * POST /api/admin/hrm/payroll/generate-bulk
 * Body: { month, year, staffIds?: [], allActive?: true }. Query ?async=true queues BullMQ/inline job.
 */
exports.generatePayrollBulk = async (req, res) => {
    try {
        const body = req.body || {};
        const now = new Date();
        const payload = {
            month: Math.min(Math.max(parseInt(body.month, 10) || now.getMonth() + 1, 1), 12),
            year: parseInt(body.year, 10) || now.getFullYear(),
            staffIds: Array.isArray(body.staffIds) ? body.staffIds : undefined,
            allActive: body.allActive !== false,
            createdBy: actorName(req)
        };

        if (wantsAsyncJob(req)) {
            const job = await enqueueJob('HRM_BULK_PAYROLL_GENERATE', payload, req.adminId || null);
            return res.status(202).json({
                success: true,
                message: 'Bulk payroll generation queued.',
                data: {
                    jobId: String(job._id),
                    status: job.status,
                    progress: job.progress
                }
            });
        }

        const result = await runBulkPayrollGeneration(payload);
        await logHrmAuditEvent({
            req,
            action: 'Payroll Batch Generated',
            actionType: HRM_ACTION_TYPES.PAYROLL_BATCH,
            resourceType: 'payroll',
            previousValue: null,
            newValue: {
                month: payload.month,
                year: payload.year,
                generated: result?.generated ?? result?.successCount ?? null,
                skipped: result?.skipped ?? result?.errorCount ?? null
            },
            summary: `Bulk payroll ${payload.month}/${payload.year}`
        });
        return res.status(200).json({
            success: true,
            message: 'Bulk payroll generation finished.',
            data: result
        });
    } catch (error) {
        console.error('generatePayrollBulk Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to run bulk payroll generation.' });
    }
};

/** GET /api/admin/hrm/jobs/:jobId — HRM async job status (payroll batch / exports). */
exports.getHrmJobStatus = async (req, res) => {
    try {
        const job = await getJobStatus(req.params.jobId);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found.' });
        }
        return res.json({
            success: true,
            data: {
                jobId: String(job._id),
                type: job.type,
                status: job.status,
                progress: job.progress,
                result: job.result,
                resultUrl: job.resultUrl || null,
                errorMessage: job.errorMessage || '',
                createdAt: job.createdAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt
            }
        });
    } catch (error) {
        console.error('getHrmJobStatus Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load job status.' });
    }
};

/** GET /api/admin/hrm/jobs/:jobId/download */
exports.downloadHrmJobResult = async (req, res) => {
    try {
        const filePath = await resolveJobDownloadPath(req.params.jobId);
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'Export file not ready.' });
        }
        const filename = path.basename(filePath);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.sendFile(path.resolve(filePath));
    } catch (error) {
        console.error('downloadHrmJobResult Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to download export.' });
    }
};

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

        const preview = await calculatePayrollFromAttendance(subject.staffId, month, year, body);
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

        await logHrmAuditEvent({
            req,
            action: 'Payroll Generated',
            actionType: HRM_ACTION_TYPES.PAYROLL_RELEASE,
            targetStaffId: subject.staffId,
            resourceType: 'payroll',
            resourceId: String(record._id),
            previousValue: null,
            newValue: { status: 'draft', month, year, totalSalary: record.totalSalary },
            summary: `${subject.staffUsername} — ${month}/${year}, net ${record.totalSalary}`
        });

        res.status(200).json({
            success: true,
            message: 'Payroll generated.',
            data: record,
            breakdown: preview.breakdown,
            attendanceRecords: preview.attendanceRecordIds.length
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
/** GET /api/admin/hrm/payroll/my-payslips — self-service payslip list for linked employee/admin. */
exports.getMyPayslips = async (req, res) => {
    try {
        const { resolveSelfServiceStaffSubject, staffSelectorFromSubject } = require('../../utils/hrmStaffResolver');
        const subject = await resolveSelfServiceStaffSubject(req.adminAccount);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: 'No employee profile linked to your admin account.'
            });
        }

        req.query = { ...req.query, staff: staffSelectorFromSubject(subject) };
        return exports.getAllPayrolls(req, res);
    } catch (error) {
        console.error('getMyPayslips Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load your payslips.' });
    }
};

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

        const previousStatus = record.status;
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

        await logHrmAuditEvent({
            req,
            action: 'Payroll Approved',
            actionType: HRM_ACTION_TYPES.PAYROLL_RELEASE,
            targetStaffId: record.staffId,
            resourceType: 'payroll',
            resourceId: String(record._id),
            previousValue: { status: previousStatus },
            newValue: { status: 'approved' },
            summary: `${record.staffUsername} — ${record.month}/${record.year}`
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

        const previousStatus = record.status;
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

        await logHrmAuditEvent({
            req,
            action: 'Payroll Paid',
            actionType: HRM_ACTION_TYPES.PAYROLL_RELEASE,
            targetStaffId: record.staffId,
            resourceType: 'payroll',
            resourceId: String(record._id),
            previousValue: { status: previousStatus },
            newValue: { status: 'paid', totalSalary: record.totalSalary },
            summary: `${record.staffUsername} — ${record.month}/${record.year}, ${record.totalSalary}`
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

        const accessDenied = await assertPayslipAccessAllowed(req, record);
        if (accessDenied) {
            return res.status(accessDenied.status).json({
                success: false,
                message: accessDenied.message
            });
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

        const previousValue = {};
        if (updates.baseSalary !== undefined) {
            previousValue.baseSalary = Number(account.baseSalary) || 0;
        }
        if (updates.department !== undefined) previousValue.department = account.department || '';
        if (updates.employeeId !== undefined) previousValue.employeeId = account.employeeId || '';
        if (updates.joiningDate !== undefined) {
            previousValue.joiningDate = account.joiningDate ? account.joiningDate.toISOString() : null;
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

        const newValue = { ...updates };
        if (newValue.joiningDate instanceof Date) {
            newValue.joiningDate = newValue.joiningDate.toISOString();
        }
        await logHrmAuditEvent({
            req,
            action: 'Salary Config Updated',
            actionType: HRM_ACTION_TYPES.SALARY_MODIFIED,
            targetStaffId: String(account._id),
            resourceType: 'payroll',
            resourceId: String(account._id),
            previousValue,
            newValue,
            summary: `${account.username} — ${Object.keys(updates).join(', ')}`
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
exports.calculatePayrollFromAttendance = calculatePayrollFromAttendance;
