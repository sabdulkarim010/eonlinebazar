/********************************************************************
 * Project: EonlineBazar
 * File: applicationTime.js
 * Location: utils/applicationTime.js
 * Description: Centralized application clock — the same UTC instant
 * rendered in the admin dashboard header (platform timezone display).
 * All coupon expiry sweeps and order validations MUST use these helpers
 * so customer device timezones cannot influence discount eligibility.
 ********************************************************************/

const { getStoreSettings, DEFAULT_SETTINGS } = require('./storeSettingsService');

/**
 * Authoritative application "now" — Node.js system clock (UTC epoch ms).
 * This is the same instant shown in the admin panel live clock, formatted
 * via the configured platform timezone (e.g. Asia/Dhaka).
 */
function getApplicationNow() {
    return new Date();
}

/** Epoch milliseconds for the authoritative application clock. */
function getApplicationNowMs() {
    return Date.now();
}

/** Platform IANA timezone from admin store settings (admin header clock zone). */
async function getApplicationTimezone() {
    const settings = await getStoreSettings();
    return settings.timezone || DEFAULT_SETTINGS.timezone;
}

/**
 * Unified time context for coupon expiry, availability checks, and orders.
 * Returns one `now` instance so all comparisons in a request share the same clock tick.
 */
async function getApplicationTimeContext() {
    const now = getApplicationNow();
    const timezone = await getApplicationTimezone();
    return {
        now,
        nowMs: now.getTime(),
        timezone,
        iso: now.toISOString()
    };
}

/** True when expiryDate is at or before the authoritative application time. */
function isExpiryReached(expiryDate, now = getApplicationNow()) {
    if (!expiryDate) return false;
    const expiryMs = new Date(expiryDate).getTime();
    if (!Number.isFinite(expiryMs)) return true;
    return expiryMs <= now.getTime();
}

function getTimeZoneOffsetMs(timeZone, date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    const asUtc = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second)
    );
    return asUtc - date.getTime();
}

/**
 * Convert wall-clock date/time in a platform IANA timezone to a UTC Date.
 * Used when admins schedule coupon expiry in the same zone as the dashboard clock.
 */
function platformLocalToUtc(dateStr, timeStr, timeZone) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const timeParts = String(timeStr || '00:00').split(':').map(Number);
    const hour = timeParts[0] ?? 0;
    const minute = timeParts[1] ?? 0;
    const second = timeParts[2] ?? 0;

    let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    let offsetMs = getTimeZoneOffsetMs(timeZone, new Date(utcMs));
    utcMs -= offsetMs;

    const offsetMs2 = getTimeZoneOffsetMs(timeZone, new Date(utcMs));
    if (offsetMs2 !== offsetMs) {
        utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs2;
    }

    return new Date(utcMs);
}

module.exports = {
    getApplicationNow,
    getApplicationNowMs,
    getApplicationTimezone,
    getApplicationTimeContext,
    isExpiryReached,
    platformLocalToUtc,
    getTimeZoneOffsetMs
};
