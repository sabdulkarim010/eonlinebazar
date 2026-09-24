/********************************************************************
 * Project: EonlineBazar — HRM Attendance
 * File: attendanceDate.js
 * Description: Platform-timezone calendar dates for attendance rows.
 *   All "today" boundaries and YYYY-MM-DD keys use the store platform
 *   timezone (default Asia/Dhaka) so client pickers, Mongo, and PG agree.
 ********************************************************************/

'use strict';

const { platformLocalToUtc } = require('./applicationTime');
const { DEFAULT_SETTINGS } = require('../services/storeSettingsService');

const DEFAULT_PLATFORM_TZ = DEFAULT_SETTINGS.timezone || 'Asia/Dhaka';

function getPlatformTimezone() {
    return process.env.ATTENDANCE_PLATFORM_TZ || DEFAULT_PLATFORM_TZ;
}

/** Calendar date key (YYYY-MM-DD) in the platform timezone. */
function getPlatformDateKey(date = new Date(), timeZone = getPlatformTimezone()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

/**
 * Canonical attendance day — midnight wall-clock in platform TZ as a UTC Date.
 * Empty input means "today" in platform TZ.
 */
function normalizeAttendanceDate(input, timeZone = getPlatformTimezone()) {
    if (input === null || input === undefined || input === '') {
        const dateKey = getPlatformDateKey(new Date(), timeZone);
        return platformLocalToUtc(dateKey, '00:00', timeZone);
    }

    const raw = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return platformLocalToUtc(raw, '00:00', timeZone);
    }

    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return null;

    const dateKey = getPlatformDateKey(d, timeZone);
    return platformLocalToUtc(dateKey, '00:00', timeZone);
}

/** Format any attendance date input as YYYY-MM-DD in platform TZ. */
function formatAttendanceDateKey(input, timeZone = getPlatformTimezone()) {
    if (input === null || input === undefined || input === '') return null;

    const raw = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return null;

    return getPlatformDateKey(d, timeZone);
}

/** Add calendar days to a YYYY-MM-DD key (UTC date math). */
function addDaysToDateKey(dateKey, days = 1) {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + Number(days)));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Platform-day window [start, end) as UTC Date objects for DB range queries.
 * end is exclusive midnight of the next platform calendar day.
 */
function getPlatformDayBounds(input, timeZone = getPlatformTimezone()) {
    const startKey = input
        ? formatAttendanceDateKey(input, timeZone)
        : getPlatformDateKey(new Date(), timeZone);
    if (!startKey) {
        const fallback = normalizeAttendanceDate(new Date(), timeZone);
        return { start: fallback, end: fallback, startKey: getPlatformDateKey(new Date(), timeZone) };
    }
    const start = normalizeAttendanceDate(startKey, timeZone);
    const end = normalizeAttendanceDate(addDaysToDateKey(startKey, 1), timeZone);
    return { start, end, startKey };
}

/** Inclusive list of YYYY-MM-DD keys from start through end in platform TZ. */
function iteratePlatformDateKeys(startInput, endInput, timeZone = getPlatformTimezone()) {
    const startKey = formatAttendanceDateKey(startInput, timeZone);
    const endKey = formatAttendanceDateKey(endInput, timeZone);
    if (!startKey || !endKey || startKey > endKey) return [];

    const keys = [];
    let [y, m, d] = startKey.split('-').map(Number);
    let currentKey = startKey;

    while (currentKey <= endKey) {
        keys.push(currentKey);
        const nextUtc = new Date(Date.UTC(y, m - 1, d + 1));
        y = nextUtc.getUTCFullYear();
        m = nextUtc.getUTCMonth() + 1;
        d = nextUtc.getUTCDate();
        currentKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    return keys;
}

module.exports = {
    getPlatformTimezone,
    getPlatformDateKey,
    normalizeAttendanceDate,
    formatAttendanceDateKey,
    addDaysToDateKey,
    getPlatformDayBounds,
    iteratePlatformDateKeys
};
