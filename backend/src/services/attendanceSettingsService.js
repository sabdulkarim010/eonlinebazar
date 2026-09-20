/********************************************************************
 * Attendance settings — office hours, grace period, weekend rules.
 * Stored on Settings.attendanceSettings (Mongo + PG dual-write).
 ********************************************************************/

const Settings = require('../models/Settings');
const { dualWrite } = require('./dualWriteService');

const DEFAULT_ATTENDANCE_SETTINGS = Object.freeze({
    officeStart: '09:00',
    officeEnd: '18:00',
    gracePeriodMinutes: 15,
    halfDayCutoff: '13:00',
    autoMarkAbsentAfter: '20:00',
    weekendSaturday: true,
    weekendSunday: true
});

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
        weekendSunday: src.weekendSunday !== false && src.weekendSunday !== 'false' && src.weekendSunday !== 0
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

async function getAttendanceSettings() {
    const settings = await Settings.getOrCreate();
    return normalizeAttendanceSettings(settings.attendanceSettings || DEFAULT_ATTENDANCE_SETTINGS);
}

async function saveAttendanceSettings(payload) {
    const normalized = normalizeAttendanceSettings(payload);
    const settings = await Settings.getOrCreate();
    settings.attendanceSettings = normalized;
    await dualWriteSettingsUpsert(settings);
    return normalized;
}

/** True when check-in time (HH:MM) is after office start + grace. */
function isCheckInLate(checkInTime, attendanceSettings) {
    const settings = normalizeAttendanceSettings(attendanceSettings);
    const checkInMinutes = parseTimeToMinutes(checkInTime);
    const startMinutes = parseTimeToMinutes(settings.officeStart);
    if (checkInMinutes === null || startMinutes === null) return false;
    return checkInMinutes > startMinutes + settings.gracePeriodMinutes;
}

function isWeekendDay(dateInput, attendanceSettings) {
    const settings = normalizeAttendanceSettings(attendanceSettings);
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) return false;
    const day = date.getDay();
    if (day === 6 && settings.weekendSaturday) return true;
    if (day === 0 && settings.weekendSunday) return true;
    return false;
}

module.exports = {
    DEFAULT_ATTENDANCE_SETTINGS,
    normalizeAttendanceSettings,
    getAttendanceSettings,
    saveAttendanceSettings,
    isCheckInLate,
    isWeekendDay,
    parseTimeToMinutes
};
