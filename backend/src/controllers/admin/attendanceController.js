/********************************************************************
 * Project: EonlineBazar — HRM Module
 * File: attendanceController.js
 * Location: controllers/admin/attendanceController.js
 * Author: Abdul Karim Sheikh
 * Description: Attendance marking, staff self clock-in/out, monthly
 * summaries, and the shift roster. Late detection compares the clock-in
 * against the shift start plus its grace period, so arriving inside the
 * grace window is on time by policy rather than by rounding.
 ********************************************************************/

const mongoose = require('mongoose');
const Attendance = require('../../models/attendance');
const Shift = require('../../models/shift');
const Admin = require('../../models/admin');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

const { ATTENDANCE_STATUSES, SHIFT_TYPES } = Attendance;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
}

/** Resolve a staff member by Admin _id or username. */
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
 * Working window for a staff member on a given day. Falls back to the
 * default shift, then to 09:00–18:00 so attendance still works before any
 * shift has been configured.
 */
async function resolveShiftFor(username) {
    const assigned = await Shift.findOne({ assignedStaff: username }).lean();
    const shift = assigned || await Shift.findOne({ isDefault: true }).lean();

    return {
        name: shift?.name || 'Default',
        startTime: shift?.startTime || '09:00',
        endTime: shift?.endTime || '18:00',
        gracePeriodMinutes: Number.isFinite(shift?.gracePeriodMinutes) ? shift.gracePeriodMinutes : 15
    };
}

/**
 * Minutes past the allowed arrival time, or 0 when on time. Returns 0 when
 * the shift start cannot be parsed rather than flagging a false positive.
 */
function calculateLateness(clockInAt, shiftStart, graceMinutes) {
    const startMinutes = Attendance.parseShiftMinutes(shiftStart);
    if (startMinutes === null) return 0;

    const arrival = new Date(clockInAt);
    const arrivalMinutes = arrival.getHours() * 60 + arrival.getMinutes();
    const allowed = startMinutes + (Number(graceMinutes) || 0);

    return arrivalMinutes > allowed ? arrivalMinutes - allowed : 0;
}

/**
 * GET /api/admin/hrm/attendance
 * Paginated register. Filters: ?from= &to= (or ?date=), ?staff= (username or
 * id), ?status=, plus ?todayStats=true for the section KPI row.
 */
exports.getAttendanceList = async (req, res) => {
    try {
        const filter = {};

        const staff = String(req.query.staff || '').trim();
        if (staff) {
            const account = await findStaff(staff);
            // An unknown staff filter must return nothing, not everything.
            filter.staffId = account ? String(account._id) : '__no_match__';
        }

        const status = String(req.query.status || '').trim().toLowerCase();
        if (ATTENDANCE_STATUSES.includes(status)) {
            filter.status = status;
        }

        const single = Attendance.normalizeDate(req.query.date);
        if (req.query.date && single) {
            filter.date = single;
        } else {
            const from = Attendance.normalizeDate(req.query.from);
            const to = Attendance.normalizeDate(req.query.to);
            if (from || to) {
                filter.date = {};
                if (from) filter.date.$gte = from;
                if (to) filter.date.$lte = to;
            }
        }

        const { page, limit, skip } = parsePagination(req.query);

        const [records, total] = await Promise.all([
            Attendance.find(filter).sort({ date: -1, staffUsername: 1 }).skip(skip).limit(limit).lean(),
            Attendance.countDocuments(filter)
        ]);

        const payload = {
            success: true,
            data: records,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        };

        if (String(req.query.todayStats || '').toLowerCase() === 'true') {
            payload.todayStats = await buildTodayStats();
        }

        res.status(200).json(payload);
    } catch (error) {
        console.error('getAttendanceList Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load attendance.' });
    }
};

/** Present / absent / late counts for today plus the configured shift count. */
async function buildTodayStats() {
    const today = Attendance.normalizeDate(new Date());

    const [present, absent, late, activeShifts] = await Promise.all([
        Attendance.countDocuments({ date: today, status: { $in: ['present', 'half-day'] } }),
        Attendance.countDocuments({ date: today, status: 'absent' }),
        Attendance.countDocuments({ date: today, isLate: true }),
        Shift.countDocuments({})
    ]);

    return { present, absent, late, activeShifts };
}

exports.buildTodayStats = buildTodayStats;

/**
 * POST /api/admin/hrm/attendance/mark
 * Admin marks a staff member for a date. Re-marking the same day updates
 * the existing row instead of creating a duplicate.
 */
exports.markAttendance = async (req, res) => {
    try {
        const body = req.body || {};

        const account = await findStaff(body.staffId || body.staffUsername);
        if (!account) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const date = Attendance.normalizeDate(body.date);
        if (!date) {
            return res.status(400).json({ success: false, message: 'A valid date is required.' });
        }

        const status = String(body.status || '').trim().toLowerCase();
        if (!ATTENDANCE_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`
            });
        }

        const shiftWindow = await resolveShiftFor(account.username);
        const shiftType = SHIFT_TYPES.includes(String(body.shift || '').toLowerCase())
            ? String(body.shift).toLowerCase()
            : 'morning';

        const record = await Attendance.findOne({ staffId: String(account._id), date })
            || new Attendance({ staffId: String(account._id), date });

        record.staffUsername = account.username;
        record.status = status;
        record.shift = shiftType;
        record.shiftStart = String(body.shiftStart || shiftWindow.startTime).trim();
        record.shiftEnd = String(body.shiftEnd || shiftWindow.endTime).trim();
        record.notes = String(body.notes || '').trim();
        record.markedBy = actorName(req);

        // 'late' marked by hand still needs a late flag the reports can count.
        if (status === 'late') {
            record.isLate = true;
            if (!record.lateMinutes) record.lateMinutes = Number(body.lateMinutes) || 0;
        } else if (status !== 'present') {
            record.isLate = false;
            record.lateMinutes = 0;
        }

        await record.save();

        await logSecurityEvent({
            action: 'Attendance Marked',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${account.username} — ${status} on ${date.toISOString().slice(0, 10)}`,
            resourceType: 'attendance',
            resourceId: String(record._id)
        });

        res.status(200).json({ success: true, message: 'Attendance saved.', data: record });
    } catch (error) {
        console.error('markAttendance Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save attendance.' });
    }
};

/**
 * POST /api/admin/hrm/attendance/clock-in
 * Staff self clock-in for today. Optional { lat, lng } from the mobile app
 * is stored as-is; a second clock-in on the same day is refused.
 */
exports.clockIn = async (req, res) => {
    try {
        const body = req.body || {};
        const account = body.staffId || body.staffUsername
            ? await findStaff(body.staffId || body.staffUsername)
            : req.adminAccount;

        if (!account) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const date = Attendance.normalizeDate(body.date);
        const now = new Date();

        let record = await Attendance.findOne({ staffId: String(account._id), date });
        if (record?.clockIn) {
            return res.status(409).json({
                success: false,
                message: 'Already clocked in for today.',
                data: record
            });
        }

        if (!record) {
            record = new Attendance({ staffId: String(account._id), date });
        }

        const shiftWindow = await resolveShiftFor(account.username);
        const lateMinutes = calculateLateness(now, shiftWindow.startTime, shiftWindow.gracePeriodMinutes);

        record.staffUsername = account.username;
        record.clockIn = now;
        record.shiftStart = shiftWindow.startTime;
        record.shiftEnd = shiftWindow.endTime;
        record.lateMinutes = lateMinutes;
        record.isLate = lateMinutes > 0;
        record.status = lateMinutes > 0 ? 'late' : 'present';
        record.markedBy = 'self';

        const lat = Number(body.lat ?? body.gpsLocation?.lat);
        const lng = Number(body.lng ?? body.gpsLocation?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            record.gpsLocation = { lat, lng };
        }

        await record.save();

        res.status(200).json({
            success: true,
            message: lateMinutes > 0 ? `Clocked in ${lateMinutes} minute(s) late.` : 'Clocked in.',
            data: record
        });
    } catch (error) {
        console.error('clockIn Error:', error);
        res.status(500).json({ success: false, message: 'Failed to clock in.' });
    }
};

/**
 * POST /api/admin/hrm/attendance/clock-out
 * Closes today's row; `hoursWorked` is computed by the model hook. A
 * sub-half-shift day is downgraded to 'half-day'.
 */
exports.clockOut = async (req, res) => {
    try {
        const body = req.body || {};
        const account = body.staffId || body.staffUsername
            ? await findStaff(body.staffId || body.staffUsername)
            : req.adminAccount;

        if (!account) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const date = Attendance.normalizeDate(body.date);
        const record = await Attendance.findOne({ staffId: String(account._id), date });

        if (!record || !record.clockIn) {
            return res.status(400).json({ success: false, message: 'No clock-in found for today.' });
        }
        if (record.clockOut) {
            return res.status(409).json({ success: false, message: 'Already clocked out for today.', data: record });
        }

        record.clockOut = new Date();

        const startMinutes = Attendance.parseShiftMinutes(record.shiftStart);
        const endMinutes = Attendance.parseShiftMinutes(record.shiftEnd);
        if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
            const shiftHours = (endMinutes - startMinutes) / 60;
            const workedMs = record.clockOut.getTime() - new Date(record.clockIn).getTime();
            if (workedMs / 3600000 < shiftHours / 2) {
                record.status = 'half-day';
            }
        }

        await record.save();

        res.status(200).json({
            success: true,
            message: `Clocked out — ${record.hoursWorked} hour(s) recorded.`,
            data: record
        });
    } catch (error) {
        console.error('clockOut Error:', error);
        res.status(500).json({ success: false, message: 'Failed to clock out.' });
    }
};

/**
 * GET /api/admin/hrm/attendance/summary?month=&year=&staff=
 * Present/absent/late/hours totals per staff member for one month.
 */
exports.getAttendanceSummary = async (req, res) => {
    try {
        const now = new Date();
        const month = Math.min(Math.max(parseInt(req.query.month, 10) || now.getMonth() + 1, 1), 12);
        const year = parseInt(req.query.year, 10) || now.getFullYear();

        const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const end = new Date(year, month, 0, 0, 0, 0, 0);

        const match = { date: { $gte: start, $lte: end } };

        const staff = String(req.query.staff || '').trim();
        if (staff) {
            const account = await findStaff(staff);
            match.staffId = account ? String(account._id) : '__no_match__';
        }

        const rows = await Attendance.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { staffId: '$staffId', staffUsername: '$staffUsername' },
                    present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
                    absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
                    late: { $sum: { $cond: ['$isLate', 1, 0] } },
                    halfDay: { $sum: { $cond: [{ $eq: ['$status', 'half-day'] }, 1, 0] } },
                    holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } },
                    totalHours: { $sum: '$hoursWorked' },
                    recorded: { $sum: 1 }
                }
            },
            { $sort: { '_id.staffUsername': 1 } }
        ]);

        const data = rows.map((row) => ({
            staffId: row._id.staffId,
            staffUsername: row._id.staffUsername,
            present: row.present,
            absent: row.absent,
            late: row.late,
            halfDay: row.halfDay,
            holiday: row.holiday,
            totalHours: Math.round((row.totalHours || 0) * 100) / 100,
            recorded: row.recorded
        }));

        res.status(200).json({ success: true, data, period: { month, year } });
    } catch (error) {
        console.error('getAttendanceSummary Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load attendance summary.' });
    }
};

/**
 * GET /api/admin/hrm/attendance/late-report?month=&year=
 * Staff ranked by late arrivals in the given month.
 */
exports.getLateReport = async (req, res) => {
    try {
        const now = new Date();
        const month = Math.min(Math.max(parseInt(req.query.month, 10) || now.getMonth() + 1, 1), 12);
        const year = parseInt(req.query.year, 10) || now.getFullYear();

        const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const end = new Date(year, month, 0, 0, 0, 0, 0);

        const rows = await Attendance.aggregate([
            { $match: { date: { $gte: start, $lte: end }, isLate: true } },
            {
                $group: {
                    _id: { staffId: '$staffId', staffUsername: '$staffUsername' },
                    lateCount: { $sum: 1 },
                    totalLateMinutes: { $sum: '$lateMinutes' },
                    lastLateOn: { $max: '$date' }
                }
            },
            { $sort: { lateCount: -1, totalLateMinutes: -1 } },
            { $limit: 50 }
        ]);

        const data = rows.map((row) => ({
            staffId: row._id.staffId,
            staffUsername: row._id.staffUsername,
            lateCount: row.lateCount,
            totalLateMinutes: row.totalLateMinutes || 0,
            averageLateMinutes: Math.round(((row.totalLateMinutes || 0) / row.lateCount) * 10) / 10,
            lastLateOn: row.lastLateOn
        }));

        res.status(200).json({ success: true, data, period: { month, year } });
    } catch (error) {
        console.error('getLateReport Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load late report.' });
    }
};

/* ==================================================================
   SHIFTS
   ================================================================== */

function pickShiftFields(body) {
    const fields = {};

    if (body.name !== undefined) fields.name = String(body.name).trim();
    if (body.startTime !== undefined) fields.startTime = String(body.startTime).trim();
    if (body.endTime !== undefined) fields.endTime = String(body.endTime).trim();
    if (body.gracePeriodMinutes !== undefined) {
        fields.gracePeriodMinutes = Math.max(0, parseInt(body.gracePeriodMinutes, 10) || 0);
    }
    if (body.assignedStaff !== undefined) {
        const raw = Array.isArray(body.assignedStaff)
            ? body.assignedStaff
            : String(body.assignedStaff || '').split(',');
        fields.assignedStaff = [...new Set(raw.map((s) => String(s || '').trim()).filter(Boolean))];
    }
    if (body.isDefault !== undefined) fields.isDefault = Boolean(body.isDefault);

    return fields;
}

/** Reject "25:00" / "9:5" before they reach late detection and silently disable it. */
function invalidTimeField(fields) {
    for (const key of ['startTime', 'endTime']) {
        if (fields[key] !== undefined && Attendance.parseShiftMinutes(fields[key]) === null) {
            return key;
        }
    }
    return null;
}

/** GET /api/admin/hrm/shifts */
exports.getShifts = async (req, res) => {
    try {
        const shifts = await Shift.find({}).sort({ isDefault: -1, startTime: 1 }).lean();
        res.status(200).json({ success: true, data: shifts });
    } catch (error) {
        console.error('getShifts Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load shifts.' });
    }
};

/** POST /api/admin/hrm/shifts */
exports.createShift = async (req, res) => {
    try {
        const fields = pickShiftFields(req.body || {});

        if (!fields.name) {
            return res.status(400).json({ success: false, message: 'Shift name is required.' });
        }

        const badField = invalidTimeField(fields);
        if (badField) {
            return res.status(400).json({ success: false, message: `${badField} must use 24-hour HH:MM format.` });
        }

        fields.createdBy = actorName(req);
        const shift = await Shift.create(fields);

        // Exactly one default shift — promoting this one demotes the rest.
        if (shift.isDefault) {
            await Shift.updateMany({ _id: { $ne: shift._id } }, { $set: { isDefault: false } });
        }

        await logSecurityEvent({
            action: 'Shift Created',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${shift.name} (${shift.startTime}–${shift.endTime})`,
            resourceType: 'shift',
            resourceId: String(shift._id)
        });

        res.status(201).json({ success: true, message: 'Shift created.', data: shift });
    } catch (error) {
        console.error('createShift Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create shift.' });
    }
};

/** PATCH /api/admin/hrm/shifts/:id */
exports.updateShift = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid shift id.' });
        }

        const fields = pickShiftFields(req.body || {});

        if (fields.name !== undefined && !fields.name) {
            return res.status(400).json({ success: false, message: 'Shift name cannot be empty.' });
        }
        if (!Object.keys(fields).length) {
            return res.status(400).json({ success: false, message: 'No changes supplied.' });
        }

        const badField = invalidTimeField(fields);
        if (badField) {
            return res.status(400).json({ success: false, message: `${badField} must use 24-hour HH:MM format.` });
        }

        const shift = await Shift.findByIdAndUpdate(id, { $set: fields }, { new: true, runValidators: true });
        if (!shift) {
            return res.status(404).json({ success: false, message: 'Shift not found.' });
        }

        if (fields.isDefault) {
            await Shift.updateMany({ _id: { $ne: shift._id } }, { $set: { isDefault: false } });
        }

        await logSecurityEvent({
            action: 'Shift Updated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: shift.name,
            resourceType: 'shift',
            resourceId: String(shift._id)
        });

        res.status(200).json({ success: true, message: 'Shift updated.', data: shift });
    } catch (error) {
        console.error('updateShift Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update shift.' });
    }
};

/** DELETE /api/admin/hrm/shifts/:id — the default shift is protected. */
exports.deleteShift = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid shift id.' });
        }

        const shift = await Shift.findById(id);
        if (!shift) {
            return res.status(404).json({ success: false, message: 'Shift not found.' });
        }

        if (shift.isDefault) {
            return res.status(409).json({
                success: false,
                message: 'Cannot delete the default shift. Promote another shift to default first.'
            });
        }

        await Shift.findByIdAndDelete(id);

        await logSecurityEvent({
            action: 'Shift Deleted',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: shift.name,
            resourceType: 'shift',
            resourceId: String(shift._id)
        });

        res.status(200).json({ success: true, message: 'Shift deleted.' });
    } catch (error) {
        console.error('deleteShift Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete shift.' });
    }
};
