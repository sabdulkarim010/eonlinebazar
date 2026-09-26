'use strict';

const Attendance = require('../models/attendance');
const { parseImportFile } = require('./bulkImportService');
const { resolveHrmSubject } = require('../utils/hrmStaffResolver');
const {
    normalizeAttendanceDate,
    formatAttendanceDateKey,
    getPlatformTimezone
} = require('../utils/attendanceDate');
const { platformLocalToUtc } = require('../utils/applicationTime');
const { isMongoDuplicateKeyError } = require('../utils/attendanceDuplicate');
const { getAttendanceSettings, deriveClockInLateStatus } = require('./attendanceSettingsService');

const { ATTENDANCE_STATUSES } = Attendance;
const MAX_IMPORT_ROWS = 5000;

function normalizeRowKeys(row) {
    const out = {};
    if (!row || typeof row !== 'object') return out;
    Object.entries(row).forEach(([key, value]) => {
        const k = String(key || '').trim().toLowerCase().replace(/\s+/g, '');
        out[k] = value;
    });
    return out;
}

function pickRowStaffRef(normalized) {
    const employeeId = normalized.employeeid || normalized.empid || normalized.employee_id;
    const staffId = normalized.staffid || normalized.staff_id;
    return { employeeId, staffId };
}

function parseClockTimeOnDate(dateNormalized, timeStr) {
    if (!timeStr) return null;
    const raw = String(timeStr).trim();
    if (!raw) return null;
    const dateKey = formatAttendanceDateKey(dateNormalized) || formatAttendanceDateKey(new Date(dateNormalized));
    if (!dateKey) return null;
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
    if (!match) return null;
    const hh = String(Number(match[1])).padStart(2, '0');
    const mm = match[2];
    const ss = match[3] ? String(Number(match[3])).padStart(2, '0') : '00';
    return platformLocalToUtc(dateKey, `${hh}:${mm}:${ss}`, getPlatformTimezone());
}

async function upsertAttendanceRow(subject, date, fields, { markedBy = 'bulk-import' } = {}) {
    const attendanceSettings = await getAttendanceSettings();
    const update = {
        staffType: subject.staffType,
        staffUsername: subject.staffUsername,
        status: fields.status,
        shiftStart: fields.shiftStart || attendanceSettings.officeStart,
        shiftEnd: fields.shiftEnd || attendanceSettings.officeEnd,
        clockIn: fields.clockIn,
        clockOut: fields.clockOut,
        isLate: fields.isLate,
        lateMinutes: fields.lateMinutes,
        notes: fields.notes || '',
        markedBy,
        modifiedBy: markedBy,
        modifiedAt: new Date(),
        isManualEntry: true
    };

    let record = await Attendance.findOneAndUpdate(
        { staffId: subject.staffId, date },
        {
            $set: update,
            $setOnInsert: { staffId: subject.staffId, date }
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    if (record.clockIn && record.clockOut) {
        record.hoursWorked = Attendance.computeHoursWorked(record.clockIn, record.clockOut);
        await record.save();
    }

    return record;
}

async function processSingleImportRow(rawRow, rowIndex, options = {}) {
    const normalized = normalizeRowKeys(rawRow);
    const { employeeId, staffId } = pickRowStaffRef(normalized);

    if (!employeeId && !staffId) {
        return {
            ok: false,
            error: { row: rowIndex, staffId: '', message: 'Missing staffId or employeeId.' }
        };
    }

    const staffTypeHint = String(normalized.stafftype || 'employee').toLowerCase();
    const employeeKey = employeeId || (staffTypeHint === 'employee' ? staffId : null);
    let subject = null;

    if (employeeKey) {
        subject = await resolveHrmSubject({
            staffType: 'employee',
            employeeId: employeeKey,
            staffId: employeeKey
        });
    }
    if (!subject && staffId) {
        subject = await resolveHrmSubject({
            staffType: 'employee',
            staffId
        });
    }
    if (!subject) {
        subject = await resolveHrmSubject({
            staffId,
            staffUsername: normalized.staffusername || normalized.username
        });
    }

    if (!subject) {
        return {
            ok: false,
            error: {
                row: rowIndex,
                staffId: String(staffId || employeeId || ''),
                message: 'Staff member not found.'
            }
        };
    }

    const dateRaw = normalized.date || normalized.attendancedate;
    const date = normalizeAttendanceDate(dateRaw);
    if (!date) {
        return {
            ok: false,
            error: {
                row: rowIndex,
                staffId: subject.staffId,
                message: 'Invalid or missing date (use YYYY-MM-DD in platform calendar).'
            }
        };
    }

    let status = String(normalized.status || 'present').trim().toLowerCase();
    if (!ATTENDANCE_STATUSES.includes(status)) {
        return {
            ok: false,
            error: {
                row: rowIndex,
                staffId: subject.staffId,
                message: `Invalid status "${normalized.status}".`
            }
        };
    }

    const clockIn = parseClockTimeOnDate(date, normalized.clockin || normalized.checkin);
    const clockOut = parseClockTimeOnDate(date, normalized.clockout || normalized.checkout);

    const attendanceSettings = await getAttendanceSettings();

    let isLate = false;
    let lateMinutes = 0;
    if (clockIn && (status === 'present' || status === 'late')) {
        const grace = Number(normalized.graceperiodminutes);
        const late = deriveClockInLateStatus(
            clockIn,
            normalized.shiftstart || attendanceSettings.officeStart,
            Number.isFinite(grace) ? grace : attendanceSettings.gracePeriodMinutes
        );
        isLate = late.isLate;
        lateMinutes = late.lateMinutes;
        if (isLate) status = 'late';
    }

    try {
        const record = await upsertAttendanceRow(subject, date, {
            status,
            clockIn,
            clockOut,
            isLate,
            lateMinutes,
            notes: String(normalized.notes || normalized.note || '').trim()
        }, { markedBy: options.markedBy || 'bulk-import' });

        if (options.mirrorFn) {
            await options.mirrorFn(record);
        }

        return { ok: true, record };
    } catch (err) {
        if (isMongoDuplicateKeyError(err)) {
            const existing = await Attendance.findOne({ staffId: subject.staffId, date });
            if (existing) {
                try {
                    Object.assign(existing, {
                        staffType: subject.staffType,
                        staffUsername: subject.staffUsername,
                        status,
                        clockIn,
                        clockOut,
                        isLate,
                        lateMinutes,
                        isManualEntry: true,
                        markedBy: options.markedBy || 'bulk-import'
                    });
                    if (existing.clockIn && existing.clockOut) {
                        existing.hoursWorked = Attendance.computeHoursWorked(existing.clockIn, existing.clockOut);
                    }
                    await existing.save();
                    if (options.mirrorFn) await options.mirrorFn(existing);
                    return { ok: true, record: existing };
                } catch (retryErr) {
                    return {
                        ok: false,
                        error: {
                            row: rowIndex,
                            staffId: subject.staffId,
                            message: retryErr.message || 'Duplicate attendance row.'
                        }
                    };
                }
            }
        }
        return {
            ok: false,
            error: {
                row: rowIndex,
                staffId: subject.staffId,
                message: err.message || 'Failed to save attendance row.'
            }
        };
    }
}

/**
 * @param {Array<object>} rows
 * @param {{ markedBy?: string, mirrorFn?: Function }} options
 */
async function processBulkAttendanceImport(rows, options = {}) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length > MAX_IMPORT_ROWS) {
        const err = new Error(`Import exceeds maximum of ${MAX_IMPORT_ROWS} rows.`);
        err.code = 'TOO_MANY_ROWS';
        throw err;
    }

    const errors = [];
    let successCount = 0;

    for (let i = 0; i < list.length; i += 1) {
        const rowNumber = i + 2;
        // eslint-disable-next-line no-await-in-loop
        const result = await processSingleImportRow(list[i], rowNumber, options);
        if (result.ok) successCount += 1;
        else if (result.error) errors.push(result.error);
    }

    return {
        totalProcessed: list.length,
        successCount,
        errorCount: errors.length,
        errors: errors.slice(0, 200)
    };
}

async function parseAttendanceImportFile(filePath, mimetype) {
    const rows = await parseImportFile(filePath, mimetype);
    return rows;
}

module.exports = {
    MAX_IMPORT_ROWS,
    normalizeRowKeys,
    processBulkAttendanceImport,
    processSingleImportRow,
    parseAttendanceImportFile
};
