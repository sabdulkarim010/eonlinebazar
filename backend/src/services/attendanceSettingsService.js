/********************************************************************
 * Attendance settings — office hours, grace period, weekend rules.
 * Stored on Settings.attendanceSettings (Mongo + PG dual-write).
 ********************************************************************/

const Settings = require('../models/Settings');
const { dualWrite } = require('./dualWriteService');
const { fetchSettingsDocumentSafe } = require('./settingsReadService');
const {
    getPlatformTimezone,
    formatAttendanceDateKey
} = require('../utils/attendanceDate');

const DEFAULT_ATTENDANCE_SETTINGS = Object.freeze({
    officeStart: '09:00',
    officeEnd: '18:00',
    gracePeriodMinutes: 15,
    halfDayCutoff: '13:00',
    autoMarkAbsentAfter: '20:00',
    weekendSaturday: true,
    weekendSunday: true,
    weekendDays: [0, 6]
});

function normalizeWeekendDays(src = {}) {
    if (Array.isArray(src.weekendDays)) {
        return [...new Set(src.weekendDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
    }
    const days = [];
    if (src.weekendSunday !== false && src.weekendSunday !== 'false' && src.weekendSunday !== 0) days.push(0);
    if (src.weekendSaturday !== false && src.weekendSaturday !== 'false' && src.weekendSaturday !== 0) days.push(6);
    return days.length ? days : [...DEFAULT_ATTENDANCE_SETTINGS.weekendDays];
}

function getSettingsRepository() {
    return require('../repositories/settingsRepository');
}

function parseTimeToMinutes(timeStr) {
    const raw = String(timeStr || '').trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
}

function normalizeAttendanceSettings(input = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const officeStart = String(src.officeStart || DEFAULT_ATTENDANCE_SETTINGS.officeStart).trim();
    const officeEnd = String(src.officeEnd || DEFAULT_ATTENDANCE_SETTINGS.officeEnd).trim();
    const halfDayCutoff = String(src.halfDayCutoff || DEFAULT_ATTENDANCE_SETTINGS.halfDayCutoff).trim();
    const autoMarkAbsentAfter = String(src.autoMarkAbsentAfter || DEFAULT_ATTENDANCE_SETTINGS.autoMarkAbsentAfter).trim();

    const grace = Number(src.gracePeriodMinutes);
    const gracePeriodMinutes = Number.isFinite(grace) && grace >= 0
        ? Math.min(Math.round(grace), 180)
        : DEFAULT_ATTENDANCE_SETTINGS.gracePeriodMinutes;

    return {
        officeStart: parseTimeToMinutes(officeStart) !== null ? officeStart : DEFAULT_ATTENDANCE_SETTINGS.officeStart,
        officeEnd: parseTimeToMinutes(officeEnd) !== null ? officeEnd : DEFAULT_ATTENDANCE_SETTINGS.officeEnd,
        gracePeriodMinutes,
        halfDayCutoff: parseTimeToMinutes(halfDayCutoff) !== null ? halfDayCutoff : DEFAULT_ATTENDANCE_SETTINGS.halfDayCutoff,
        autoMarkAbsentAfter: parseTimeToMinutes(autoMarkAbsentAfter) !== null
            ? autoMarkAbsentAfter
            : DEFAULT_ATTENDANCE_SETTINGS.autoMarkAbsentAfter,
        weekendSaturday: src.weekendSaturday !== false && src.weekendSaturday !== 'false' && src.weekendSaturday !== 0,
        weekendSunday: src.weekendSunday !== false && src.weekendSunday !== 'false' && src.weekendSunday !== 0,
        weekendDays: normalizeWeekendDays(src)
    };
}

async function dualWriteSettingsUpsert(settings) {
    await dualWrite(
        () => settings.save(),
        async (saved) => {
            const plain = saved.toObject ? saved.toObject() : saved;
            await getSettingsRepository().upsertFromMongo(plain);
        },
        {
            model: 'Settings',
            operation: 'updateAttendanceSettings',
            mongoId: (saved) => String(saved._id)
        }
    );
}

async function loadAttendanceSettingsSource() {
    const doc = await fetchSettingsDocumentSafe();
    if (doc?.attendanceSettings) {
        return doc.attendanceSettings;
    }
    try {
        const mongo = await Settings.getOrCreate();
        return mongo.attendanceSettings;
    } catch (err) {
        console.warn('[attendanceSettings] Mongo fallback failed:', err.message);
        return null;
    }
}

async function getAttendanceSettings() {
    try {
        const raw = await loadAttendanceSettingsSource();
        return normalizeAttendanceSettings(raw || DEFAULT_ATTENDANCE_SETTINGS);
    } catch (error) {
        console.warn('[attendanceSettings] getAttendanceSettings failed:', error.message);
        return { ...DEFAULT_ATTENDANCE_SETTINGS };
    }
}

async function saveAttendanceSettings(payload) {
    const normalized = normalizeAttendanceSettings(payload);
    const settings = await Settings.getOrCreate();
    settings.attendanceSettings = normalized;
    await dualWriteSettingsUpsert(settings);
    return normalized;
}

/** Wall-clock minutes since midnight in the platform timezone (default Asia/Dhaka). */
function getPlatformWallClockMinutes(instant, timeZone = getPlatformTimezone()) {
    const d = instant instanceof Date ? instant : new Date(instant);
    if (Number.isNaN(d.getTime())) return null;

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(d);

    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }

    const hour = Number(map.hour);
    const minute = Number(map.minute);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
}

/** HH:MM (24h) for an instant in the platform timezone. */
function formatPlatformWallClockTime(instant, timeZone = getPlatformTimezone()) {
    const total = getPlatformWallClockMinutes(instant, timeZone);
    if (total === null) return null;
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Minutes late after shift start + grace. Uses platform TZ wall clock, not server local time.
 */
function calculateLateMinutes(clockInAt, shiftStartTime, graceMinutes, timeZone = getPlatformTimezone()) {
    const startMinutes = parseTimeToMinutes(shiftStartTime);
    if (startMinutes === null) return 0;

    const arrivalMinutes = getPlatformWallClockMinutes(clockInAt, timeZone);
    if (arrivalMinutes === null) return 0;

    const allowed = startMinutes + (Number(graceMinutes) || 0);
    return arrivalMinutes > allowed ? arrivalMinutes - allowed : 0;
}

/** Derive late flag and attendance status from a clock-in instant. */
function deriveClockInLateStatus(clockInAt, shiftStartTime, graceMinutes, timeZone = getPlatformTimezone()) {
    const lateMinutes = calculateLateMinutes(clockInAt, shiftStartTime, graceMinutes, timeZone);
    const isLate = lateMinutes > 0;
    return {
        lateMinutes,
        isLate,
        status: isLate ? 'late' : 'present'
    };
}

/** True when check-in time (HH:MM) is after office start + grace. */
function isCheckInLate(checkInTime, attendanceSettings) {
    const settings = normalizeAttendanceSettings(attendanceSettings);
    const checkInMinutes = parseTimeToMinutes(checkInTime);
    const startMinutes = parseTimeToMinutes(settings.officeStart);
    if (checkInMinutes === null || startMinutes === null) return false;
    return checkInMinutes > startMinutes + settings.gracePeriodMinutes;
}

function weekdayFromDateKey(dateKey) {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isWeekendDay(dateInput, attendanceSettings) {
    const settings = normalizeAttendanceSettings(attendanceSettings);
    const dateKey = formatAttendanceDateKey(dateInput, getPlatformTimezone());
    if (!dateKey) return false;
    const day = weekdayFromDateKey(dateKey);
    if (day === null) return false;
    const weekendDays = settings.weekendDays || normalizeWeekendDays(settings);
    return weekendDays.includes(day);
}

module.exports = {
    DEFAULT_ATTENDANCE_SETTINGS,
    normalizeAttendanceSettings,
    getAttendanceSettings,
    saveAttendanceSettings,
    isCheckInLate,
    isWeekendDay,
    parseTimeToMinutes,
    normalizeWeekendDays,
    getPlatformWallClockMinutes,
    formatPlatformWallClockTime,
    calculateLateMinutes,
    deriveClockInLateStatus,
    weekdayFromDateKey
};
