/********************************************************************
 * Enterprise summary — platform TZ day bounds + attendance counts.
 ********************************************************************/

const Attendance = require('../backend/src/models/attendance');
const {
    getPlatformDayBounds,
    normalizeAttendanceDate
} = require('../backend/src/utils/attendanceDate');
const { getApp, createTestAdmin } = require('./setup');
const request = require('supertest');

describe('Enterprise summary', () => {
    const app = getApp();

    async function adminToken() {
        const { username, password } = await createTestAdmin();
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    test('getPlatformDayBounds returns a half-open UTC window for today', () => {
        const { start, end, startKey } = getPlatformDayBounds('2026-09-24');
        expect(startKey).toBe('2026-09-24');
        expect(start).toBeInstanceOf(Date);
        expect(end).toBeInstanceOf(Date);
        expect(end.getTime()).toBeGreaterThan(start.getTime());
        expect(normalizeAttendanceDate(startKey).getTime()).toBe(start.getTime());
    });

    test('counts present and absent attendance for the platform day', async () => {
        const token = await adminToken();
        const { start, end } = getPlatformDayBounds(new Date());

        const { admin: presentStaff } = await createTestAdmin({
            role: 'staff',
            permissions: ['manage_staff'],
            name: 'Summary Present'
        });
        const { admin: absentStaff } = await createTestAdmin({
            role: 'staff',
            permissions: ['manage_staff'],
            name: 'Summary Absent'
        });

        await Attendance.create({
            staffId: String(presentStaff._id),
            staffUsername: presentStaff.username,
            date: start,
            status: 'present',
            markedBy: 'admin'
        });
        await Attendance.create({
            staffId: String(absentStaff._id),
            staffUsername: absentStaff.username,
            date: start,
            status: 'absent',
            markedBy: 'admin'
        });

        const inWindow = await Attendance.countDocuments({
            date: { $gte: start, $lt: end },
            status: { $in: ['present', 'half-day'] }
        });
        const absentInWindow = await Attendance.countDocuments({
            date: { $gte: start, $lt: end },
            status: 'absent'
        });

        expect(inWindow).toBeGreaterThanOrEqual(1);
        expect(absentInWindow).toBeGreaterThanOrEqual(1);

        const res = await request(app)
            .get('/api/admin/enterprise-summary')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.data.hrm.presentToday).toBeGreaterThanOrEqual(1);
        expect(res.body.data.hrm.absentToday).toBeGreaterThanOrEqual(1);
    });
});
