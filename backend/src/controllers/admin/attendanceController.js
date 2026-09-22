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
const AttendanceLock = require('../../models/attendanceLock');
const Shift = require('../../models/shift');
const Admin = require('../../models/admin');
const Employee = require('../../models/employee');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');
const { dualWrite } = require('../../services/dualWriteService');
const { routedRead } = require('../../services/readRouter');
const shiftRepo = require('../../repositories/shiftRepository');
const attendanceRepo = require('../../repositories/attendanceRepository');
const attendanceLockRepo = require('../../repositories/attendanceLockRepository');

async function dualWriteShiftDoc(mongoDoc) {
    try {
        await shiftRepo.upsertShiftInPG(mongoDoc);
    } catch (pgErr) {
        console.error('[DUAL-WRITE-SHIFT-FAIL] controller:', pgErr);
    }
}

async function dualWriteDemotedShifts(excludeId) {
    try {
        const others = await Shift.find({ _id: { $ne: excludeId } }).lean();
        for (const row of others) {
            // eslint-disable-next-line no-await-in-loop
            await shiftRepo.upsertShiftInPG(row);
        }
    } catch (pgErr) {
        console.error('[DUAL-WRITE-SHIFT-FAIL] demote:', pgErr);
    }
}

function mirrorAttendanceDoc(saved) {
  return require('../../utils/hrmDualWriteHelpers').mirrorAttendanceDoc(saved);
}
const { isHrOrSuperAdmin } = require('../../middlewares/rbac');
const { accountHasPermission } = require('../../config/permissions');
const {
    getAttendanceSettings,
    isCheckInLate
} = require('../../services/attendanceSettingsService');
const { findAdmin, parseStaffSelector, resolveHrmSubject, resolveClockStaff } = require('../../utils/hrmStaffResolver');
const {
    fetchAttendancePage,
    fetchTodayAttendanceStats,
    fetchAttendanceSummary
} = require('../../services/hrmReadService');

const { ATTENDANCE_STATUSES, SHIFT_TYPES } = Attendance;

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function actorName(req) {
    return req.adminAccount?.username || req.admin?.username || 'admin';
}

function actorDisplayName(req) {
    const account = req.adminAccount;
    return account?.displayName || account?.name || actorName(req);
}

function isRequestSuperAdmin(req) {
    if (req.adminAccount?.isSuperAdmin?.()) return true;
    return req.admin?.isSuperAdmin === true || req.admin?.role === 'superadmin';
}

function resolveAdminRole(req) {
    return String(req.adminAccount?.role || req.admin?.role || '').toLowerCase();
}

function canEditPastAttendanceDates(req) {
    if (isRequestSuperAdmin(req)) return true;
    const account = req.adminAccount;
    if (account && accountHasPermission(account, 'mark_attendance_any_date')) return true;
    return resolveAdminRole(req) === 'hr';
}

function getTodayDateKey() {
    return attendanceRepo.formatDateKey(new Date());
}

function isTodayOrFuture(dateStr) {
    const today = getTodayDateKey();
    return String(dateStr || '') >= today;
}

function assertStaffAttendanceDateAllowed(req, dateInput, { isManualEntry = false } = {}) {
    if (isManualEntry || canEditPastAttendanceDates(req)) return null;

    const dateKey = attendanceRepo.formatDateKey(dateInput);
    const todayKey = getTodayDateKey();
    if (dateKey !== todayKey) {
        return {
            status: 403,
            body: {
                success: false,
                message: 'Past dates can only be edited by HR or Super Admin via Manual Entry'
            }
        };
    }
    return null;
}

function combineDateAndTime(dateNormalized, timeStr) {
    return attendanceRepo.combineDateAndTime(dateNormalized, timeStr);
}

async function getLockStatusMerged(dateInput) {
    return routedRead(
        'attendance',
        async () => {
            const dateKey = attendanceRepo.formatDateKey(dateInput);
            const row = await AttendanceLock.findOne({ date: dateKey }).lean();
            if (!row) return null;
            return {
                isLocked: true,
                date: row.date,
                lockedAt: row.lockedAt,
                lockedBy: row.lockedBy,
                lockedByName: row.lockedByName
            };
        },
        () => attendanceLockRepo.getLockStatus(dateInput)
    );
}

async function assertDateWritable(req, res, dateInput, { overrideLock = false } = {}) {
    const lockInfo = await getLockStatusMerged(dateInput);
    if (lockInfo?.isLocked && !(overrideLock && isRequestSuperAdmin(req))) {
        res.status(423).json({ success: false, message: 'Date is locked' });
        return false;
    }
    return true;
}

async function getDailySheetMongo(dateInput, department = '', page = 1, limit = 10) {
    const date = Attendance.normalizeDate(dateInput);
    const dateKey = attendanceRepo.formatDateKey(date);
    const query = { status: 'active' };
    const dept = String(department || '').trim();
    if (dept && dept.toLowerCase() !== 'all') query.department = dept;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const total = await Employee.countDocuments(query);
    const employees = await Employee.find(query)
        .sort({ fullName: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean();
    const staffIds = employees.map((e) => String(e._id));
    const rows = staffIds.length
        ? await Attendance.find({ date, staffId: { $in: staffIds } }).lean()
        : [];
    const byStaff = new Map(rows.map((r) => [String(r.staffId), r]));

    return {
        date: dateKey,
        employees: employees.map((emp) => {
            const row = byStaff.get(String(emp._id));
            return {
                employeeId: String(emp._id),
                empId: emp.employeeId,
                name: emp.fullName,
                photo: emp.photo || '',
                designation: emp.designation || emp.role || '',
                department: emp.department || '',
                attendance: row
                    ? {
                        status: row.status,
                        checkIn: row.clockIn,
                        checkOut: row.clockOut,
                        note: row.notes || ''
                    }
                    : null
            };
        }),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit))
    };
}

async function listManualEntriesMongo(limit = 30) {
    const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const rows = await Attendance.find({ isManualEntry: true })
        .sort({ modifiedAt: -1 })
        .limit(take)
        .lean();

    const employeeIds = [...new Set(rows.filter((r) => r.staffType === 'employee').map((r) => r.staffId))];
    const employees = employeeIds.length
        ? await Employee.find({ _id: { $in: employeeIds } }).select('fullName employeeId').lean()
        : [];
    const empMap = new Map(employees.map((e) => [String(e._id), e]));

    return rows.map((row) => {
        const emp = empMap.get(String(row.staffId));
        const d = Attendance.normalizeDate(row.date);
        return {
            date: attendanceRepo.formatDateKey(d),
            employeeName: emp?.fullName || row.staffUsername || '—',
            empId: emp?.employeeId || '',
            status: row.status,
            checkIn: row.clockIn,
            checkOut: row.clockOut,
            note: row.notes || '',
            modifiedBy: row.modifiedBy || row.markedBy || '—',
            modifiedAt: row.modifiedAt || row.updatedAt
        };
    });
}

/** Resolve clock-in/out subject (Admin or Employee). */
async function resolveClockSubject(body, req) {
    if (body?.staffId || body?.staffUsername) {
        return resolveClockStaff(body);
    }
    if (req.adminAccount) {
        return resolveHrmSubject({
            staffId: String(req.adminAccount._id),
            staffType: 'admin'
        });
    }
    return null;
}

/** Resolve a login Admin by _id or username (legacy helper). */
async function findStaff(identifier) {
    return findAdmin(identifier);
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
        const { page, limit, skip } = parsePagination(req.query);

        const { records, total } = await fetchAttendancePage({ query: req.query, skip, limit });

        const payload = {
            success: true,
            data: records,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        };

        if (String(req.query.todayStats || '').toLowerCase() === 'true') {
            payload.todayStats = await fetchTodayAttendanceStats();
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

async function persistAttendanceMark(req, body) {
    const payload = body.employeeId
        ? { ...body, staffType: 'employee', staffId: body.employeeId }
        : body;

    const subject = await resolveHrmSubject(payload);
    if (!subject) {
        const err = new Error('Staff member not found.');
        err.code = 'NOT_FOUND';
        throw err;
    }

    const date = Attendance.normalizeDate(body.date);
    if (!date) {
        const err = new Error('A valid date is required.');
        err.code = 'BAD_DATE';
        throw err;
    }

    const pastDateBlock = assertStaffAttendanceDateAllowed(req, date, {
        isManualEntry: Boolean(body.isManualEntry)
    });
    if (pastDateBlock) {
        const err = new Error(pastDateBlock.body.message);
        err.code = 'PAST_DATE_FORBIDDEN';
        err.httpStatus = pastDateBlock.status;
        throw err;
    }

    const lockInfo = await getLockStatusMerged(date);
    if (lockInfo?.isLocked && !(Boolean(body.overrideLock) && isRequestSuperAdmin(req))) {
        const err = new Error('Date is locked');
        err.code = 'LOCKED';
        throw err;
    }

    const status = String(body.status || '').trim().toLowerCase();
    if (!ATTENDANCE_STATUSES.includes(status)) {
        const err = new Error(`Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`);
        err.code = 'BAD_STATUS';
        throw err;
    }

    const shiftWindow = await resolveShiftFor(subject.shiftKey);
    const shiftType = SHIFT_TYPES.includes(String(body.shift || '').toLowerCase())
        ? String(body.shift).toLowerCase()
        : 'morning';

    const attendanceSettings = await getAttendanceSettings();

    const record = await Attendance.findOne({ staffId: subject.staffId, date })
        || new Attendance({ staffId: subject.staffId, date });

    record.staffType = subject.staffType;
    record.staffUsername = subject.staffUsername;
    record.status = status;
    record.shift = shiftType;
    record.shiftStart = String(body.shiftStart || shiftWindow.startTime || attendanceSettings.officeStart).trim();
    record.shiftEnd = String(body.shiftEnd || shiftWindow.endTime || attendanceSettings.officeEnd).trim();
    record.notes = String(body.note || body.notes || '').trim();
    record.markedBy = actorName(req);
    record.modifiedBy = actorDisplayName(req);
    record.modifiedAt = new Date();
    if (body.isManualEntry !== undefined) record.isManualEntry = Boolean(body.isManualEntry);

    const dateKey = attendanceRepo.formatDateKey(date);
    let checkInTimeStr = body.checkIn;
    let checkOutTimeStr = body.checkOut;

    if (status === 'present') {
        if ((checkInTimeStr === undefined || checkInTimeStr === '') && !record.clockIn) {
            checkInTimeStr = attendanceSettings.officeStart;
        }
        if ((checkOutTimeStr === undefined || checkOutTimeStr === '') && !record.clockOut) {
            checkOutTimeStr = attendanceSettings.officeEnd;
        }
    }

    if (checkInTimeStr !== undefined) {
        record.clockIn = checkInTimeStr
            ? combineDateAndTime(dateKey, checkInTimeStr) || combineDateAndTime(date, checkInTimeStr)
            : null;
    }
    if (checkOutTimeStr !== undefined) {
        record.clockOut = checkOutTimeStr
            ? combineDateAndTime(dateKey, checkOutTimeStr) || combineDateAndTime(date, checkOutTimeStr)
            : null;
    }

    let resolvedCheckIn = checkInTimeStr;
    if (!resolvedCheckIn && record.clockIn) {
        const d = new Date(record.clockIn);
        if (!Number.isNaN(d.getTime())) {
            resolvedCheckIn = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
    }

    if ((status === 'present' || status === 'late') && resolvedCheckIn && isCheckInLate(resolvedCheckIn, attendanceSettings)) {
        record.status = 'late';
        record.isLate = true;
        const startMin = Attendance.parseShiftMinutes(attendanceSettings.officeStart);
        const checkMin = Attendance.parseShiftMinutes(resolvedCheckIn);
        const computedLate = (startMin !== null && checkMin !== null)
            ? Math.max(0, checkMin - startMin - attendanceSettings.gracePeriodMinutes)
            : 0;
        record.lateMinutes = Number(body.lateMinutes) || computedLate;
    } else if (status === 'late') {
        record.isLate = true;
        if (!record.lateMinutes) record.lateMinutes = Number(body.lateMinutes) || 0;
    } else if (status !== 'present') {
        record.isLate = false;
        record.lateMinutes = 0;
    } else {
        record.isLate = false;
        record.lateMinutes = 0;
    }

    await dualWrite(
        () => record.save(),
        async (saved) => { await mirrorAttendanceDoc(saved); },
        {
            model: 'Attendance',
            operation: 'create',
            mongoId: (saved) => String(saved._id)
        }
    );

    await logSecurityEvent({
        action: body.isManualEntry ? 'Attendance Manual Entry' : 'Attendance Marked',
        actor: actorName(req),
        actorType: 'admin',
        ipAddress: getClientIp(req),
        details: `${subject.staffUsername} — ${status} on ${date.toISOString().slice(0, 10)}`,
        resourceType: 'attendance',
        resourceId: String(record._id)
    });

    return record;
}

/**
 * POST /api/admin/hrm/attendance/mark
 * Admin marks a staff member for a date. Re-marking the same day updates
 * the existing row instead of creating a duplicate.
 */
exports.markAttendance = async (req, res) => {
    try {
        const record = await persistAttendanceMark(req, req.body || {});
        res.status(200).json({ success: true, message: 'Attendance saved.', data: record });
    } catch (error) {
        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.code === 'BAD_DATE' || error.code === 'BAD_STATUS') {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error.code === 'LOCKED') {
            return res.status(423).json({ success: false, message: error.message });
        }
        if (error.code === 'PAST_DATE_FORBIDDEN') {
            return res.status(error.httpStatus || 403).json({ success: false, message: error.message });
        }
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
        const subject = await resolveClockSubject(body, req);

        if (!subject) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const date = Attendance.normalizeDate(body.date);
        const pastDateBlock = assertStaffAttendanceDateAllowed(req, date);
        if (pastDateBlock) {
            return res.status(pastDateBlock.status).json(pastDateBlock.body);
        }

        const lockInfo = await getLockStatusMerged(date);
        if (lockInfo?.isLocked) {
            return res.status(423).json({ success: false, message: 'Date is locked' });
        }

        const now = new Date();

        let record = await Attendance.findOne({ staffId: subject.staffId, date });
        if (record?.clockIn) {
            return res.status(409).json({
                success: false,
                message: 'Already clocked in for today.',
                data: record
            });
        }

        if (!record) {
            record = new Attendance({
                staffId: subject.staffId,
                staffType: subject.staffType,
                date
            });
        }

        const shiftWindow = await resolveShiftFor(subject.shiftKey || subject.staffUsername);
        const lateMinutes = calculateLateness(now, shiftWindow.startTime, shiftWindow.gracePeriodMinutes);

        record.staffUsername = subject.staffUsername;
        record.staffType = subject.staffType;
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

        await dualWrite(
            () => record.save(),
            async (saved) => { await mirrorAttendanceDoc(saved); },
            {
                model: 'Attendance',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );

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
        const subject = await resolveClockSubject(body, req);

        if (!subject) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const date = Attendance.normalizeDate(body.date);
        const pastDateBlock = assertStaffAttendanceDateAllowed(req, date);
        if (pastDateBlock) {
            return res.status(pastDateBlock.status).json(pastDateBlock.body);
        }

        const lockInfo = await getLockStatusMerged(date);
        if (lockInfo?.isLocked) {
            return res.status(423).json({ success: false, message: 'Date is locked' });
        }

        const record = await Attendance.findOne({ staffId: subject.staffId, date });

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

        await dualWrite(
            () => record.save(),
            async (saved) => { await mirrorAttendanceDoc(saved); },
            {
                model: 'Attendance',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

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

        const data = await fetchAttendanceSummary({
            month,
            year,
            staff: req.query.staff
        });

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

/**
 * GET /api/admin/hrm/attendance/daily-sheet?date=&dept=
 */
exports.getDailySheet = async (req, res) => {
    try {
        const dateInput = req.query.date || new Date();
        const department = req.query.dept || req.query.department || '';
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

        const sheet = await routedRead(
            'attendance',
            () => getDailySheetMongo(dateInput, department, page, limit),
            () => attendanceRepo.getDailySheet(dateInput, department, page, limit)
        );

        const lockInfo = await getLockStatusMerged(dateInput);

        res.status(200).json({
            success: true,
            data: {
                ...sheet,
                isLocked: Boolean(lockInfo?.isLocked),
                lockInfo: lockInfo || null
            },
            total: sheet.total,
            page: sheet.page,
            totalPages: sheet.totalPages
        });
    } catch (error) {
        console.error('getDailySheet Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load daily sheet.' });
    }
};

/**
 * POST /api/admin/hrm/attendance/bulk-mark
 */
exports.bulkMarkAttendance = async (req, res) => {
    try {
        const { date, employeeIds, status } = req.body || {};
        const normalizedDate = Attendance.normalizeDate(date);
        if (!normalizedDate) {
            return res.status(400).json({ success: false, message: 'A valid date is required.' });
        }

        const writable = await assertDateWritable(req, res, normalizedDate);
        if (!writable) return;

        const pastDateBlock = assertStaffAttendanceDateAllowed(req, normalizedDate);
        if (pastDateBlock) {
            return res.status(pastDateBlock.status).json(pastDateBlock.body);
        }

        const ids = Array.isArray(employeeIds) ? employeeIds.map(String).filter(Boolean) : [];
        if (!ids.length) {
            return res.status(400).json({ success: false, message: 'employeeIds array is required.' });
        }

        const normalizedStatus = String(status || '').trim().toLowerCase();
        if (!ATTENDANCE_STATUSES.includes(normalizedStatus)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`
            });
        }

        let success = 0;
        let failed = 0;

        for (const employeeId of ids) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await persistAttendanceMark(req, {
                    employeeId,
                    date,
                    status: normalizedStatus,
                    isManualEntry: false
                });
                success += 1;
            } catch (err) {
                if (err.code === 'LOCKED') {
                    return res.status(423).json({ success: false, message: err.message });
                }
                if (err.code === 'PAST_DATE_FORBIDDEN') {
                    return res.status(err.httpStatus || 403).json({ success: false, message: err.message });
                }
                failed += 1;
            }
        }

        res.status(200).json({
            success: true,
            message: `Marked ${success} employee(s).`,
            data: { success, failed }
        });
    } catch (error) {
        console.error('bulkMarkAttendance Error:', error);
        res.status(500).json({ success: false, message: 'Failed to bulk mark attendance.' });
    }
};

/**
 * PUT /api/admin/hrm/attendance/update
 * Body: { employeeId, date, checkIn, checkOut, note }
 */
exports.updateAttendanceDetails = async (req, res) => {
    try {
        const body = req.body || {};
        const subject = await resolveHrmSubject({
            employeeId: body.employeeId,
            staffType: 'employee',
            staffId: body.employeeId
        });
        if (!subject) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const date = Attendance.normalizeDate(body.date);
        if (!date) {
            return res.status(400).json({ success: false, message: 'A valid date is required.' });
        }

        const pastDateBlock = assertStaffAttendanceDateAllowed(req, date);
        if (pastDateBlock) {
            return res.status(pastDateBlock.status).json(pastDateBlock.body);
        }

        const lockInfo = await getLockStatusMerged(date);
        if (lockInfo?.isLocked && !isRequestSuperAdmin(req)) {
            return res.status(423).json({ success: false, message: 'Date is locked' });
        }

        const record = await Attendance.findOne({ staffId: subject.staffId, date });
        if (!record) {
            return res.status(404).json({ success: false, message: 'Attendance record not found.' });
        }

        if (body.checkIn !== undefined) {
            record.clockIn = body.checkIn
                ? combineDateAndTime(date, body.checkIn) || new Date(body.checkIn)
                : null;
        }
        if (body.checkOut !== undefined) {
            record.clockOut = body.checkOut
                ? combineDateAndTime(date, body.checkOut) || new Date(body.checkOut)
                : null;
        }
        if (body.note !== undefined || body.notes !== undefined) {
            record.notes = String(body.note || body.notes || '').trim();
        }

        record.modifiedBy = actorDisplayName(req);
        record.modifiedAt = new Date();

        await dualWrite(
            () => record.save(),
            async (saved) => { await mirrorAttendanceDoc(saved); },
            {
                model: 'Attendance',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await logSecurityEvent({
            action: 'Attendance Updated',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${subject.staffUsername} — times/notes on ${date.toISOString().slice(0, 10)}`,
            resourceType: 'attendance',
            resourceId: String(record._id)
        });

        res.status(200).json({ success: true, message: 'Attendance updated.', data: record });
    } catch (error) {
        console.error('updateAttendanceDetails Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update attendance.' });
    }
};

/**
 * DELETE /api/admin/hrm/attendance/remove
 * Body: { employeeId, date }
 */
exports.removeAttendanceRecord = async (req, res) => {
    try {
        if (!isHrOrSuperAdmin(req.adminAccount)) {
            return res.status(403).json({
                success: false,
                message: 'Removing attendance requires HR or Super Admin access.'
            });
        }

        const body = req.body || {};
        const subject = await resolveHrmSubject({
            employeeId: body.employeeId,
            staffType: 'employee',
            staffId: body.employeeId
        });
        if (!subject) {
            return res.status(404).json({ success: false, message: 'Staff member not found.' });
        }

        const date = Attendance.normalizeDate(body.date);
        if (!date) {
            return res.status(400).json({ success: false, message: 'A valid date is required.' });
        }

        const lockInfo = await getLockStatusMerged(date);
        if (lockInfo?.isLocked && !isRequestSuperAdmin(req)) {
            return res.status(423).json({ success: false, message: 'Date is locked' });
        }

        const record = await Attendance.findOne({ staffId: subject.staffId, date });
        if (!record) {
            return res.status(404).json({ success: false, message: 'Attendance record not found.' });
        }

        const mongoId = String(record._id);

        await dualWrite(
            () => Attendance.deleteOne({ _id: record._id }),
            async () => {
                try {
                    await attendanceRepo.deleteByStaffAndDate(subject.staffId, date);
                } catch (err) {
                    if (err.code !== 'NOT_FOUND') throw err;
                }
            },
            {
                model: 'Attendance',
                operation: 'delete',
                mongoId
            }
        );

        await logSecurityEvent({
            action: 'Attendance Removed',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${subject.staffUsername} — ${date.toISOString().slice(0, 10)}`,
            resourceType: 'attendance',
            resourceId: mongoId
        });

        res.status(200).json({ success: true, message: 'Attendance record removed.' });
    } catch (error) {
        console.error('removeAttendanceRecord Error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove attendance.' });
    }
};

/**
 * POST /api/admin/hrm/attendance/manual-entry
 */
exports.manualEntry = async (req, res) => {
    req.body = {
        ...req.body,
        isManualEntry: true,
        notes: req.body?.note || req.body?.notes || ''
    };
    return exports.markAttendance(req, res);
};

/**
 * GET /api/admin/hrm/attendance/manual-entries?limit=30
 */
exports.getManualEntries = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 30;
        const data = await routedRead(
            'attendance',
            () => listManualEntriesMongo(limit),
            () => attendanceRepo.listManualEntries(limit)
        );
        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('getManualEntries Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load manual entries.' });
    }
};

/**
 * GET /api/admin/hrm/attendance/lock-status?date=
 */
exports.getLockStatus = async (req, res) => {
    try {
        const lockInfo = await getLockStatusMerged(req.query.date || new Date());
        res.status(200).json({
            success: true,
            data: {
                isLocked: Boolean(lockInfo?.isLocked),
                lockInfo: lockInfo || null
            }
        });
    } catch (error) {
        console.error('getLockStatus Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load lock status.' });
    }
};

/**
 * POST /api/admin/hrm/attendance/lock
 */
exports.lockAttendanceDate = async (req, res) => {
    try {
        if (!isRequestSuperAdmin(req)) {
            return res.status(403).json({ success: false, message: 'Only Super Admin can lock dates.' });
        }

        const dateInput = req.body?.date;
        const dateKey = attendanceRepo.formatDateKey(dateInput);
        if (!dateKey) {
            return res.status(400).json({ success: false, message: 'A valid date is required.' });
        }
        if (attendanceLockRepo.isFutureDateKey(dateKey)) {
            return res.status(400).json({ success: false, message: 'Future dates cannot be locked.' });
        }

        const adminId = String(req.adminAccount?._id || req.admin?.id || '');
        const adminName = actorDisplayName(req);

        const lock = await dualWrite(
            () => AttendanceLock.findOneAndUpdate(
                { date: dateKey },
                {
                    date: dateKey,
                    lockedAt: new Date(),
                    lockedBy: adminId,
                    lockedByName: adminName
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ),
            async (saved) => { await attendanceLockRepo.upsertFromMongo(saved); },
            { model: 'AttendanceLock', operation: 'create', mongoId: (saved) => String(saved._id) }
        );

        await logSecurityEvent({
            action: 'Attendance Date Locked',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: dateKey,
            resourceType: 'attendance_lock',
            resourceId: String(lock._id)
        });

        res.status(200).json({
            success: true,
            message: 'Attendance date locked.',
            data: {
                isLocked: true,
                lockInfo: {
                    date: lock.date,
                    lockedAt: lock.lockedAt,
                    lockedBy: lock.lockedBy,
                    lockedByName: lock.lockedByName
                }
            }
        });
    } catch (error) {
        console.error('lockAttendanceDate Error:', error);
        res.status(500).json({ success: false, message: 'Failed to lock attendance date.' });
    }
};

/**
 * DELETE /api/admin/hrm/attendance/lock
 */
exports.unlockAttendanceDate = async (req, res) => {
    try {
        if (!isRequestSuperAdmin(req)) {
            return res.status(403).json({ success: false, message: 'Only Super Admin can unlock dates.' });
        }

        const dateKey = attendanceRepo.formatDateKey(req.body?.date);
        if (!dateKey) {
            return res.status(400).json({ success: false, message: 'A valid date is required.' });
        }

        const existing = await AttendanceLock.findOne({ date: dateKey });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Date is not locked.' });
        }

        await dualWrite(
            () => AttendanceLock.deleteOne({ _id: existing._id }),
            async () => {
                try {
                    await attendanceLockRepo.unlockDate(dateKey);
                } catch (err) {
                    if (err.code !== 'NOT_LOCKED') throw err;
                }
            },
            { model: 'AttendanceLock', operation: 'delete', mongoId: String(existing._id) }
        );

        await logSecurityEvent({
            action: 'Attendance Date Unlocked',
            actor: actorName(req),
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: dateKey,
            resourceType: 'attendance_lock',
            resourceId: String(existing._id)
        });

        res.status(200).json({ success: true, message: 'Attendance date unlocked.' });
    } catch (error) {
        console.error('unlockAttendanceDate Error:', error);
        res.status(500).json({ success: false, message: 'Failed to unlock attendance date.' });
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
            await dualWriteDemotedShifts(shift._id);
        }

        await dualWriteShiftDoc(shift);

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
            await dualWriteDemotedShifts(shift._id);
        }

        await dualWriteShiftDoc(shift);

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

        try {
            await shiftRepo.deleteShiftInPG(shift._id);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-SHIFT-FAIL] delete:', pgErr);
        }

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
