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
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');
const { logHrmAuditEvent, HRM_ACTION_TYPES } = require('../../services/hrmAuditService');
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

const {
    LEAVE_TYPES,
    LEAVE_STATUSES,
    LEAVE_ALLOWANCES,
    countLeaveDays
} = Leave;

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

async function resolveLeaveApplySubject(body, req) {
    const { resolveHrmSubject, resolveSelfServiceStaffSubject } = require('../../utils/hrmStaffResolver');
    const { sanitizeStaffPayload } = require('../../utils/hrmPayloadSanitizer');
    const payload = sanitizeStaffPayload(body || {});

    if (payload.staffId || payload.staffUsername || payload.employeeId) {
        const staffType = String(payload.staffType || '').trim().toLowerCase();
        if (staffType === 'employee') {
            return resolveHrmSubject({
                staffType: 'employee',
                staffId: payload.staffId || payload.employeeId,
                employeeId: payload.employeeId || payload.staffId
            });
        }
        if (staffType === 'admin') {
            return resolveHrmSubject({
                staffType: 'admin',
                staffId: payload.staffId,
                staffUsername: payload.staffUsername
            });
        }

        const asAdmin = await resolveHrmSubject({
            staffType: 'admin',
            staffId: payload.staffId,
            staffUsername: payload.staffUsername
        });
        if (asAdmin) return asAdmin;

        return resolveHrmSubject({
            staffType: 'employee',
            staffId: payload.staffId || payload.employeeId,
            employeeId: payload.employeeId || payload.staffId
        });
    }

    return resolveSelfServiceStaffSubject(req.adminAccount);
}

function parseLeaveDates(body) {
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return { error: { status: 400, message: 'Start and end dates are required.' } };
    }
    if (endDate < startDate) {
        return { error: { status: 400, message: 'End date cannot be before the start date.' } };
    }
    return { startDate, endDate };
}

async function assertLeaveApplicationAllowed({ staffId, leaveType, startDate, endDate }) {
    const overlap = await Leave.findOverlappingApplication(staffId, startDate, endDate);
    if (overlap) {
        return {
            status: 400,
            message: 'A leave application already exists within the selected date range'
        };
    }

    const allowed = LEAVE_ALLOWANCES[leaveType] || 0;
    if (leaveType === 'unpaid' || allowed <= 0) {
        return null;
    }

    const requestedDays = countLeaveDays(startDate, endDate);
    const year = startDate.getFullYear();
    const { approvedDays, pendingDays } = await Leave.getCommittedDaysForType(staffId, leaveType, year);

    if (approvedDays + pendingDays + requestedDays > allowed) {
        return {
            status: 400,
            message: 'Insufficient leave balance for the requested leave type'
        };
    }

    return null;
}

async function createLeaveApplication(subject, fields) {
    return dualWrite(
        () => Leave.create({
            staffId: subject.staffId,
            staffType: subject.staffType || 'admin',
            staffUsername: subject.staffUsername,
            staffName: subject.staffName || subject.staffUsername,
            leaveType: fields.leaveType,
            startDate: fields.startDate,
            endDate: fields.endDate,
            reason: fields.reason,
            attachmentUrl: fields.attachmentUrl
        }),
        async (saved) => { await mirrorLeaveApply(saved); },
        {
            model: 'Leave',
            operation: 'create',
            mongoId: (saved) => String(saved._id)
        }
    );
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

        const dates = parseLeaveDates(body);
        if (dates.error) {
            return res.status(dates.error.status).json({ success: false, message: dates.error.message });
        }
        const { startDate, endDate } = dates;

        const blocked = await assertLeaveApplicationAllowed({
            staffId: subject.staffId,
            leaveType,
            startDate,
            endDate
        });
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const leave = await createLeaveApplication(subject, {
            leaveType,
            startDate,
            endDate,
            reason: sanitizeLeaveString(body.reason || ''),
            attachmentUrl: sanitizeLeaveString(body.attachmentUrl || '', 2048)
        });

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

        const subject = await resolveLeaveApplySubject(body, req);
        if (!subject) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const leaveType = String(body.leaveType || '').trim().toLowerCase();
        if (!LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({
                success: false,
                message: `Leave type must be one of: ${LEAVE_TYPES.join(', ')}.`
            });
        }

        const dates = parseLeaveDates(body);
        if (dates.error) {
            return res.status(dates.error.status).json({ success: false, message: dates.error.message });
        }
        const { startDate, endDate } = dates;

        const blocked = await assertLeaveApplicationAllowed({
            staffId: subject.staffId,
            leaveType,
            startDate,
            endDate
        });
        if (blocked) {
            return res.status(blocked.status).json({ success: false, message: blocked.message });
        }

        const leave = await createLeaveApplication(subject, {
            leaveType,
            startDate,
            endDate,
            reason: sanitizeLeaveString(body.reason || ''),
            attachmentUrl: sanitizeLeaveString(body.attachmentUrl || '', 2048)
        });

        await logSecurityEvent({
            action: 'Leave Applied',
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

        const approvedBy = actorName(req);
        const note = String(req.body?.note || '').trim();

        let leave;
        try {
            leave = await dualWrite(
                async () => {
                    const updated = await Leave.findOneAndUpdate(
                        { _id: id, status: 'pending' },
                        {
                            $set: {
                                status: 'approved',
                                approvedBy,
                                approvedAt: new Date(),
                                rejectionReason: ''
                            }
                        },
                        { new: true, runValidators: true }
                    );
                    if (!updated) {
                        const err = new Error('Leave request has already been processed');
                        err.status = 400;
                        throw err;
                    }
                    if (note) {
                        updated.reason = `${updated.reason} — ${note}`.trim();
                        await updated.save();
                    }
                    return updated;
                },
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
        } catch (error) {
            if (error.status === 400 || error.code === 'ALREADY_PROCESSED') {
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Leave request has already been processed'
                });
            }
            throw error;
        }

        const stamped = await stampLeaveOnAttendance(leave);

        await logHrmAuditEvent({
            req,
            action: 'Leave Approved',
            actionType: HRM_ACTION_TYPES.LEAVE_STATUS,
            targetStaffId: leave.staffId,
            resourceType: 'leave',
            resourceId: String(leave._id),
            previousValue: { status: 'pending' },
            newValue: { status: 'approved', leaveType: leave.leaveType },
            summary: `${leave.staffUsername} — ${leave.leaveType}, ${leave.totalDays} day(s)`
        });

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

        const approvedBy = actorName(req);

        let leave;
        try {
            leave = await dualWrite(
                async () => {
                    const updated = await Leave.findOneAndUpdate(
                        { _id: id, status: 'pending' },
                        {
                            $set: {
                                status: 'rejected',
                                rejectionReason: reason,
                                approvedBy,
                                approvedAt: new Date()
                            }
                        },
                        { new: true, runValidators: true }
                    );
                    if (!updated) {
                        const err = new Error('Leave request has already been processed');
                        err.status = 400;
                        throw err;
                    }
                    return updated;
                },
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
        } catch (error) {
            if (error.status === 400 || error.code === 'ALREADY_PROCESSED') {
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Leave request has already been processed'
                });
            }
            throw error;
        }

        await logHrmAuditEvent({
            req,
            action: 'Leave Rejected',
            actionType: HRM_ACTION_TYPES.LEAVE_STATUS,
            targetStaffId: leave.staffId,
            resourceType: 'leave',
            resourceId: String(leave._id),
            previousValue: { status: 'pending' },
            newValue: { status: 'rejected', reason },
            summary: `${leave.staffUsername} — ${leave.leaveType}: ${reason}`
        });

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
