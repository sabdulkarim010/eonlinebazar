/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: leaveController.js
 * Location: controllers/admin/leaveController.js
 * Author: Abdul Karim Sheikh
 * Description: Leave HTTP handlers — critical writes via leaveWorkflowService;
 *   notifications, audit, and attendance stamping run asynchronously.
 ********************************************************************/

const Leave = require('../../models/leave');
const { resolveLeaveRouteTarget } = require('../../utils/leaveRecordResolver');
const {
    fetchLeavesPage,
    fetchLeaveBalance,
    fetchLeaveCalendar
} = require('../../services/hrmReadService');
const {
    LEAVE_TYPES,
    submitLeaveApplication,
    approveLeaveApplication,
    rejectLeaveApplication,
    runPostSubmitSideEffects,
    runPostApproveSideEffects,
    runPostRejectSideEffects
} = require('../../services/leaveWorkflowService');

const { LEAVE_ALLOWANCES } = Leave;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function sanitizeLeaveString(str, maxLen = 1000) {
    return typeof str === 'string' ? str.trim().slice(0, maxLen) : str;
}

async function resolveLeaveActionTarget(req, actionLabel) {
    const routeId = String(req.params.id || '').trim();
    const target = await resolveLeaveRouteTarget(routeId);
    if (target.error) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`[${actionLabel}] Leave lookup failed`, {
                routeId,
                status: target.error.status,
                code: target.error.code
            });
        }
        return { error: target.error };
    }

    if (target.leave.status !== 'pending') {
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`[${actionLabel}] Leave not pending`, {
                routeId,
                mongoId: target.mongoId,
                status: target.leave.status
            });
        }
        return {
            error: {
                status: 400,
                success: false,
                message: `Leave request has already been processed (current status: ${target.leave.status}).`,
                code: 'ALREADY_PROCESSED'
            }
        };
    }

    return target;
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

async function handleLeaveSubmit(req, res, { subject, body, securityAction }) {
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

    let leave;
    try {
        leave = await submitLeaveApplication(subject, {
            leaveType,
            startDate,
            endDate,
            reason: sanitizeLeaveString(body.reason || ''),
            attachmentUrl: sanitizeLeaveString(body.attachmentUrl || '', 2048)
        });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({ success: false, message: error.message });
        }
        throw error;
    }

    await runPostSubmitSideEffects({
        leave,
        req,
        securityAction,
        subjectLabel: subject.staffUsername
    });

    return res.status(201).json({
        success: true,
        message: 'Leave application submitted.',
        data: leave
    });
}

/** POST /api/admin/hrm/leaves/apply-own */
exports.applyOwnLeave = async (req, res) => {
    try {
        const Admin = require('../../models/admin');
        const { ensureSuperAdminBidirectionalEmployeeLink } = require('../../utils/superAdminEmployee');
        if (req.adminAccount?._id) {
            await ensureSuperAdminBidirectionalEmployeeLink(req.adminAccount);
            const refreshed = await Admin.findById(req.adminAccount._id);
            if (refreshed) req.adminAccount = refreshed;
        }

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

        await handleLeaveSubmit(req, res, {
            subject,
            body,
            securityAction: 'Own Leave Applied'
        });
    } catch (error) {
        console.error('applyOwnLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit leave application.' });
    }
};

/** GET /api/admin/hrm/leaves/my-balance */
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

/** POST /api/admin/hrm/leaves/apply */
exports.applyLeave = async (req, res) => {
    try {
        const body = req.body || {};
        if (body.reason) body.reason = sanitizeLeaveString(body.reason);

        const subject = await resolveLeaveApplySubject(body, req);
        if (!subject) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        await handleLeaveSubmit(req, res, {
            subject,
            body,
            securityAction: 'Leave Applied'
        });
    } catch (error) {
        console.error('applyLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit leave application.' });
    }
};

/** GET /api/admin/hrm/leaves */
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
        const resolved = await resolveLeaveActionTarget(req, 'approveLeave');
        if (resolved.error) {
            return res.status(resolved.error.status).json({
                success: false,
                message: resolved.error.message,
                code: resolved.error.code
            });
        }

        const mongoId = resolved.mongoId;
        const approvedBy = req.adminAccount?.username || req.admin?.username || 'admin';
        const note = String(req.body?.note || '').trim();

        let leave;
        try {
            leave = await approveLeaveApplication(mongoId, approvedBy, note);
        } catch (error) {
            if (error.status === 400 || error.code === 'ALREADY_PROCESSED') {
                if (process.env.NODE_ENV !== 'test') {
                    console.warn('[approveLeave] Concurrent update conflict', {
                        routeId: req.params.id,
                        mongoId,
                        message: error.message
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Leave request has already been processed.',
                    code: error.code || 'ALREADY_PROCESSED'
                });
            }
            throw error;
        }

        const sideEffects = await runPostApproveSideEffects({ leave, req });

        res.status(200).json({
            success: true,
            message: 'Leave approved.',
            data: leave,
            attendanceDaysMarked: sideEffects.attendanceDaysMarked,
            attendanceProcessing: sideEffects.attendanceProcessing
        });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({
                success: false,
                message: error.message || 'Leave request cannot be approved.',
                code: error.code || 'LEAVE_ACTION_FAILED'
            });
        }
        console.error('approveLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve leave.' });
    }
};

/** PATCH /api/admin/hrm/leaves/:id/reject */
exports.rejectLeave = async (req, res) => {
    try {
        const resolved = await resolveLeaveActionTarget(req, 'rejectLeave');
        if (resolved.error) {
            return res.status(resolved.error.status).json({
                success: false,
                message: resolved.error.message,
                code: resolved.error.code
            });
        }

        const mongoId = resolved.mongoId;
        const reason = String(req.body?.rejectionReason || req.body?.reason || '').trim();
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'A rejection reason is required.',
                code: 'REJECTION_REASON_REQUIRED'
            });
        }

        const approvedBy = req.adminAccount?.username || req.admin?.username || 'admin';

        let leave;
        try {
            leave = await rejectLeaveApplication(mongoId, approvedBy, reason);
        } catch (error) {
            if (error.status === 400 || error.code === 'ALREADY_PROCESSED') {
                if (process.env.NODE_ENV !== 'test') {
                    console.warn('[rejectLeave] Concurrent update conflict', {
                        routeId: req.params.id,
                        mongoId,
                        message: error.message
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Leave request has already been processed',
                    code: error.code || 'ALREADY_PROCESSED'
                });
            }
            throw error;
        }

        await runPostRejectSideEffects({ leave, req, reason });

        res.status(200).json({ success: true, message: 'Leave rejected.', data: leave });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({
                success: false,
                message: error.message || 'Leave request cannot be rejected.',
                code: error.code || 'LEAVE_ACTION_FAILED'
            });
        }
        console.error('rejectLeave Error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject leave.' });
    }
};

/** GET /api/admin/hrm/leaves/balance */
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

/** GET /api/admin/hrm/leaves/calendar */
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
