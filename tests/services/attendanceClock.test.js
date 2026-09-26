/**
 * Platform-timezone attendance clock helpers (Asia/Dhaka default).
 */
const {
    calculateLateMinutes,
    formatPlatformWallClockTime,
    deriveClockInLateStatus
} = require('../../backend/src/services/attendanceSettingsService');
const { platformLocalToUtc } = require('../../backend/src/utils/applicationTime');

const TZ = 'Asia/Dhaka';

describe('attendance clock — platform timezone', () => {
    test('calculateLateMinutes uses Dhaka wall clock, not UTC', () => {
        // 09:30 in Dhaka on 2026-06-15 = 03:30 UTC same calendar UTC day
        const clockIn = platformLocalToUtc('2026-06-15', '09:30', TZ);
        const late = calculateLateMinutes(clockIn, '09:00', 15, TZ);
        expect(late).toBe(15);
    });

    test('within grace period is not late', () => {
        const clockIn = platformLocalToUtc('2026-06-15', '09:10', TZ);
        expect(calculateLateMinutes(clockIn, '09:00', 15, TZ)).toBe(0);
        const status = deriveClockInLateStatus(clockIn, '09:00', 15, TZ);
        expect(status.isLate).toBe(false);
        expect(status.status).toBe('present');
    });

    test('formatPlatformWallClockTime matches HH:MM in Dhaka', () => {
        const instant = platformLocalToUtc('2026-06-15', '23:45', TZ);
        expect(formatPlatformWallClockTime(instant, TZ)).toBe('23:45');
    });
});
