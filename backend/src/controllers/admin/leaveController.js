/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: leaveController.js
 * Location: controllers/admin/leaveController.js
 * Author: Abdul Karim Sheikh
 * Description: Leave applications, approval workflow, per-type balances,
 * and a calendar feed. Approving a leave writes 'holiday' attendance rows
 * across the span so payroll never counts approved leave as absence.
 ********************************************************************/

const mongoose = require('mongoose');
const Leave = require('../../models/leave');
const Attendance = require('../../models/attendance');
const { iteratePlatformDateKeys, normalizeAttendanceDate } = require('../../utils/attendanceDate');
const Admin = require('../../models/admin');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');
const { dualWrite } = require('../../services/dualWriteService');

function getLeaveRepository() {
    return require('../../repositories/leaveRepository');
}

function mirrorAttendanceDoc(saved) {
    return require('../../utils/hrmDualWriteHelpers').mirrorAttendanceDoc(saved);
}

function mirrorLeaveApply(saved) {
    return require('../../utils/hrmDualWriteHelpers').mirrorLeaveApply(saved);
}
const { notifyAdminsWithPermission } = require('../../services/notificationService');
const {
    fetchLeavesPage,
    fetchLeaveBalance,
    fetchLeaveCalendar
} = require('../../services/hrmReadService');

const { LEAVE_TYPES, LEAVE_STATUSES, LEAVE_ALLOWANCES } = Leave;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
}

function sanitizeLeaveString(str, maxLen = 1000) {
    return typeof str === 'string' ? str.trim().slice(0, maxLen) : str;
}

async function findStaff(identifier) {
    const value = String(identifier || '').trim();
    if (!value) return null;

    if (mongoose.Types.ObjectId.isValid(value)) {
        const byId = await Admin.findById(value);
        if (byId) return byId;
    }

    return Admin.findOne({ username: value });
}

/**
 * Mark every day of an approved leave as 'holiday' so the payroll
 * pro-rating treats it as time off rather than an unexplained absence.
 */
async function stampLeaveOnAttendance(leave) {
    const dateKeys = iteratePlatformDateKeys(leave.startDate, leave.endDate);
    if (!dateKeys.length) return 0;

    let stamped = 0;

    for (const dateKey of dateKeys) {
        const date = normalizeAttendanceDate(dateKey);
        // eslint-disable-next-line no-await-in-loop
        const existing = await Attendance.findOne({ staffId: leave.staffId, date });
        const record = existing || new Attendance({ staffId: leave.staffId, date });

        record.staffUsername = leave.staffUsername;
        record.status = 'holiday';
        record.isLate = false;
        record.lateMinutes = 0;
        record.notes = `${leave.leaveType} leave`;
        record.markedBy = leave.approvedBy || 'system';

        // eslint-disable-next-line no-await-in-loop
        await dualWrite(
            () => record.save(),
            async (saved) => { await mirrorAttendanceDoc(saved); },
            {
                model: 'Attendance',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );
        stamped += 1;
    }

    return stamped;
}

/**
 * POST /api/admin/hrm/leaves/apply
 * Staff applies for leave; an admin may apply on behalf of a staff member
 * by passing staffId/staffUsername.
 */
/** POST /api/admin/hrm/leaves/apply-own — submit leave for the logged-in staff member only. */
exports.applyOwnLeave = async (req, res) => {
    try {
        const { resolveSelfServiceStaffSubject } = require('../../utils/hrmStaffResolver');
        const subject = await resolveSelfServiceStaffSubject(req.adminAccount);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: 'No employee profile linked to your admin account.'
            });
        }

        const body = req.body || {};
        if (body.reason) body.reason = sanitizeLeaveString(body.reason);
        const leaveType = String(body.leaveType || '').trim().toLowerCase();
        if (!LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({
                success: false,
                message: `Leave type must be one of: ${LEAVE_TYPES.join(', ')}.`
            });
        }

        const startDate = new Date(body.startDate);
        const endDate = new Date(body.endDate);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Start and end dates are required.' });
        }
        if (endDate < startDate) {
            return res.status(400).json({ success: false, message: 'End date cannot be before the start date.' });
        }

        const leave = await dualWrite(
            () => Leave.create({
                staffId: subject.staffId,
                staffUsername: subject.staffUsername,
                staffName: subject.staffName || subject.staffUsername,
                leaveType,
                startDate,
                endDate,
                reason: sanitizeLeaveString(body.reason || ''),
                attachmentUrl: sanitizeLeaveString(body.attachmentUrl || '', 2048)
            }),
            async (saved) => { await mirrorLeaveApply(saved); },
            {
                model: 'Leave',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Own Leave Applied',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${subject.staffUsername} — ${leaveType}, ${leave.totalDays} day(s)`,
            resourceType: 'leave',
            resourceId: String(leave._id)
        });

        notifyAdminsWithPermission(
            'manage_staff',
            'leave',
            'Leave application submitted',
            `${subject.staffUsername} applied for ${leaveType} leave (${leave.totalDays} day(s))`,
            'view-hrm-leaves'
        ).catch((err) => {
            console.warn('[Leave] In-app notification failed:', err.message);
        });

        res.status(201).json({ success: true, message: 'Leave application submitted.', data: leave });
    } catch (error) {
        console.error('applyOwnLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit leave application.' });
    }
};

/** GET /api/admin/hrm/leaves/my-balance — self-service leave balance for linked employee/admin. */
exports.getMyLeaveBalance = async (req, res) => {
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
        return exports.getLeaveBalance(req, res);
    } catch (error) {
        console.error('getMyLeaveBalance Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load your leave balance.' });
    }
};

exports.applyLeave = async (req, res) => {
    try {
        const body = req.body || {};
        if (body.reason) body.reason = sanitizeLeaveString(body.reason);

        const account = body.staffId || body.staffUsername
            ? await findStaff(body.staffId || body.staffUsername)
            : req.adminAccount;

        if (!account) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const leaveType = String(body.leaveType || '').trim().toLowerCase();
        if (!LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({
                success: false,
                message: `Leave type must be one of: ${LEAVE_TYPES.join(', ')}.`
            });
        }

        const startDate = new Date(body.startDate);
        const endDate = new Date(body.endDate);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Start and end dates are required.' });
        }
        if (endDate < startDate) {
            return res.status(400).json({ success: false, message: 'End date cannot be before the start date.' });
        }

        const leave = await dualWrite(
            () => Leave.create({
                staffId: String(account._id),
                staffUsername: account.username,
                staffName: account.name || account.displayName || account.username,
                leaveType,
                startDate,
                endDate,
                reason: sanitizeLeaveString(body.reason || ''),
                attachmentUrl: sanitizeLeaveString(body.attachmentUrl || '', 2048)
            }),
            async (saved) => { await mirrorLeaveApply(saved); },
            {
                model: 'Leave',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Leave Applied',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${account.username} — ${leaveType}, ${leave.totalDays} day(s)`,
            resourceType: 'leave',
            resourceId: String(leave._id)
        });

        notifyAdminsWithPermission(
            'manage_staff',
            'leave',
            'Leave application submitted',
            `${account.username} applied for ${leaveType} leave (${leave.totalDays} day(s))`,
            'view-hrm-leaves'
        ).catch((err) => {
            console.warn('[Leave] In-app notification failed:', err.message);
        });

        res.status(201).json({ success: true, message: 'Leave application submitted.', data: leave });
    } catch (error) {
        console.error('applyLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit leave application.' });
    }
};

/**
 * GET /api/admin/hrm/leaves
 * Paginated applications. Filters: ?status= &leaveType= &staff= &year=.
 * Always returns the pending count so the tab badge stays accurate.
 */
exports.getAllLeaves = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const { records, total, pendingCount } = await fetchLeavesPage({ query: req.query, skip, limit });

        res.status(200).json({
            success: true,
            data: records,
            pendingCount,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        });
    } catch (error) {
        console.error('getAllLeaves Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load leave applications.' });
    }
};

/** PATCH /api/admin/hrm/leaves/:id/approve */
exports.approveLeave = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid leave id.' });
        }

        const leave = await Leave.findById(id);
        if (!leave) {
            return res.status(404).json({ success: false, message: 'Leave application not found.' });
        }
        if (leave.status !== 'pending') {
            return res.status(409).json({
                success: false,
                message: `This application was already ${leave.status}.`
            });
        }

        leave.status = 'approved';
        leave.approvedBy = actorName(req);
        leave.approvedAt = new Date();
        leave.rejectionReason = '';
        if (req.body?.note) leave.reason = `${leave.reason} — ${String(req.body.note).trim()}`.trim();
        await dualWrite(
            () => leave.save(),
            async (saved) => {
                const repo = getLeaveRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (pgRow) await repo.approve(pgRow.id, saved.approvedBy);
            },
            {
                model: 'Leave',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        const stamped = await stampLeaveOnAttendance(leave);

        await logSecurityEvent({
            action: 'Leave Approved',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${leave.staffUsername} — ${leave.leaveType}, ${leave.totalDays} day(s)`,
            resourceType: 'leave',
            resourceId: String(leave._id)
        });

        res.status(200).json({
            success: true,
            message: 'Leave approved.',
            data: leave,
            attendanceDaysMarked: stamped
        });
    } catch (error) {
        console.error('approveLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve leave.' });
    }
};

/** PATCH /api/admin/hrm/leaves/:id/reject */
exports.rejectLeave = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid leave id.' });
        }

        const reason = String(req.body?.rejectionReason || req.body?.reason || '').trim();
        if (!reason) {
            return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
        }

        const leave = await Leave.findById(id);
        if (!leave) {
            return res.status(404).json({ success: false, message: 'Leave application not found.' });
        }
        if (leave.status !== 'pending') {
            return res.status(409).json({
                success: false,
                message: `This application was already ${leave.status}.`
            });
        }

        leave.status = 'rejected';
        leave.rejectionReason = reason;
        leave.approvedBy = actorName(req);
        leave.approvedAt = new Date();
        await dualWrite(
            () => leave.save(),
            async (saved) => {
                const repo = getLeaveRepository();
                const pgRow = await repo.findByLegacyId(String(saved._id));
                if (pgRow) await repo.reject(pgRow.id, saved.approvedBy, saved.rejectionReason);
            },
            {
                model: 'Leave',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Leave Rejected',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${leave.staffUsername} — ${leave.leaveType}: ${reason}`,
            resourceType: 'leave',
            resourceId: String(leave._id)
        });

        res.status(200).json({ success: true, message: 'Leave rejected.', data: leave });
    } catch (error) {
        console.error('rejectLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject leave.' });
    }
};

/**
 * GET /api/admin/hrm/leaves/balance?year=&staff=
 * Days used against the annual allowance per leave type. Only approved
 * leave counts against a balance — pending applications are reported
 * separately so an approver can see what is in flight.
 */
exports.getLeaveBalance = async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const data = await fetchLeaveBalance({ year, staff: req.query.staff });

        res.status(200).json({
            success: true,
            data,
            allowances: LEAVE_ALLOWANCES,
            year
        });
    } catch (error) {
        console.error('getLeaveBalance Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load leave balances.' });
    }
};

/**
 * GET /api/admin/hrm/leaves/calendar?month=&year=
 * Approved (and pending) leaves expanded into a per-date map for the
 * month-grid calendar view.
 */
exports.getLeaveCalendar = async (req, res) => {
    try {
        const now = new Date();
        const month = Math.min(Math.max(parseInt(req.query.month, 10) || now.getMonth() + 1, 1), 12);
        const year = parseInt(req.query.year, 10) || now.getFullYear();

        const days = await fetchLeaveCalendar({
            month,
            year,
            statusQuery: req.query.status
        });

        res.status(200).json({
            success: true,
            data: days,
            period: { month, year, daysInMonth: new Date(year, month, 0).getDate() }
        });
    } catch (error) {
        console.error('getLeaveCalendar Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load leave calendar.' });
    }
};
