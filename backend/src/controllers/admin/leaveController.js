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
const Admin = require('../../models/admin');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');
const { notifyAdminsWithPermission } = require('../../services/notificationService');

const { LEAVE_TYPES, LEAVE_STATUSES, LEAVE_ALLOWANCES } = Leave;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
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
    const cursor = Attendance.normalizeDate(leave.startDate);
    const last = Attendance.normalizeDate(leave.endDate);
    if (!cursor || !last) return 0;

    let stamped = 0;

    for (let day = new Date(cursor); day <= last; day.setDate(day.getDate() + 1)) {
        const date = new Date(day);
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
        await record.save();
        stamped += 1;
    }

    return stamped;
}

/**
 * POST /api/admin/hrm/leaves/apply
 * Staff applies for leave; an admin may apply on behalf of a staff member
 * by passing staffId/staffUsername.
 */
exports.applyLeave = async (req, res) => {
    try {
        const body = req.body || {};

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

        const leave = await Leave.create({
            staffId: String(account._id),
            staffUsername: account.username,
            staffName: account.name || account.displayName || account.username,
            leaveType,
            startDate,
            endDate,
            reason: String(body.reason || '').trim(),
            attachmentUrl: String(body.attachmentUrl || '').trim()
        });

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
        const filter = {};

        const status = String(req.query.status || '').trim().toLowerCase();
        if (LEAVE_STATUSES.includes(status)) filter.status = status;

        const leaveType = String(req.query.leaveType || '').trim().toLowerCase();
        if (LEAVE_TYPES.includes(leaveType)) filter.leaveType = leaveType;

        const staff = String(req.query.staff || '').trim();
        if (staff) {
            const account = await findStaff(staff);
            filter.staffId = account ? String(account._id) : '__no_match__';
        }

        const year = parseInt(req.query.year, 10);
        if (year) {
            filter.startDate = {
                $gte: new Date(year, 0, 1, 0, 0, 0, 0),
                $lte: new Date(year, 11, 31, 23, 59, 59, 999)
            };
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [records, total, pendingCount] = await Promise.all([
            Leave.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Leave.countDocuments(filter),
            Leave.countDocuments({ status: 'pending' })
        ]);

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
        await leave.save();

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
        await leave.save();

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
        const match = {
            startDate: {
                $gte: new Date(year, 0, 1, 0, 0, 0, 0),
                $lte: new Date(year, 11, 31, 23, 59, 59, 999)
            }
        };

        const staff = String(req.query.staff || '').trim();
        if (staff) {
            const account = await findStaff(staff);
            match.staffId = account ? String(account._id) : '__no_match__';
        }

        const rows = await Leave.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { staffId: '$staffId', staffUsername: '$staffUsername', leaveType: '$leaveType' },
                    approvedDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$totalDays', 0] }
                    },
                    pendingDays: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$totalDays', 0] }
                    }
                }
            }
        ]);

        const byStaff = new Map();

        rows.forEach((row) => {
            const key = row._id.staffId;
            if (!byStaff.has(key)) {
                byStaff.set(key, {
                    staffId: key,
                    staffUsername: row._id.staffUsername,
                    balances: LEAVE_TYPES.map((type) => ({
                        leaveType: type,
                        allowed: LEAVE_ALLOWANCES[type] || 0,
                        used: 0,
                        pending: 0,
                        remaining: LEAVE_ALLOWANCES[type] || 0
                    }))
                });
            }

            const entry = byStaff.get(key).balances.find((b) => b.leaveType === row._id.leaveType);
            if (entry) {
                entry.used = row.approvedDays || 0;
                entry.pending = row.pendingDays || 0;
                entry.remaining = Math.max(0, entry.allowed - entry.used);
            }
        });

        res.status(200).json({
            success: true,
            data: [...byStaff.values()].sort((a, b) => a.staffUsername.localeCompare(b.staffUsername)),
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

        const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

        const statuses = String(req.query.status || '').trim().toLowerCase() === 'approved'
            ? ['approved']
            : ['approved', 'pending'];

        // Any leave that overlaps the month, including spans that start or end outside it.
        const leaves = await Leave.find({
            status: { $in: statuses },
            startDate: { $lte: monthEnd },
            endDate: { $gte: monthStart }
        }).lean();

        const days = {};

        leaves.forEach((leave) => {
            const cursor = Attendance.normalizeDate(leave.startDate);
            const last = Attendance.normalizeDate(leave.endDate);
            if (!cursor || !last) return;

            for (let day = new Date(cursor); day <= last; day.setDate(day.getDate() + 1)) {
                if (day < monthStart || day > monthEnd) continue;

                const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                if (!days[key]) days[key] = [];
                days[key].push({
                    leaveId: String(leave._id),
                    staffUsername: leave.staffUsername,
                    staffName: leave.staffName || leave.staffUsername,
                    leaveType: leave.leaveType,
                    status: leave.status
                });
            }
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
