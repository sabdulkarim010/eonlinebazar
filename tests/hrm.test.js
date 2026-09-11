/********************************************************************
 * HRM module integration tests.
 * Covers the attendance register and self clock-in/out, shift CRUD with
 * default protection, the late report, attendance-driven payroll
 * generation through the draft → approved → paid workflow (plus the PDF
 * pay slip), and the leave approval workflow with balances and calendar.
 ********************************************************************/

const request = require('supertest');
const Admin = require('../backend/src/models/admin');
const Attendance = require('../backend/src/models/attendance');
const Shift = require('../backend/src/models/shift');
const Payroll = require('../backend/src/models/payroll');
const Leave = require('../backend/src/models/leave');
const Employee = require('../backend/src/models/employee');
const Designation = require('../backend/src/models/designation');
const { countWorkingDays } = require('../backend/src/controllers/admin/payrollController');
const { getApp, createTestAdmin } = require('./setup');

describe('HRM — Attendance, Payroll, Leave', () => {
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

    /** A second admin account standing in for a payroll-eligible staff member. */
    async function createStaffMember(overrides = {}) {
        const { admin } = await createTestAdmin({
            role: 'staff',
            permissions: ['manage_staff'],
            name: 'Rahim Uddin',
            baseSalary: 30000,
            ...overrides
        });
        return admin;
    }

    /** Attendance rows written straight to the DB so payroll has data to read. */
    async function seedAttendance(staff, year, month, entries) {
        return Promise.all(entries.map(({ day, status, hoursWorked = 8, isLate = false }) => Attendance.create({
            staffId: String(staff._id),
            staffUsername: staff.username,
            date: new Date(year, month - 1, day, 0, 0, 0, 0),
            status,
            hoursWorked,
            isLate,
            lateMinutes: isLate ? 20 : 0,
            shiftStart: '09:00',
            shiftEnd: '18:00',
            markedBy: 'admin'
        })));
    }

    /* ---------------------------------------------------------------- */

    describe('Attendance', () => {
        test('rejects unauthenticated access', async () => {
            const res = await request(app).get('/api/admin/hrm/attendance');
            expect(res.status).toBe(401);
        });

        test('marks attendance and returns it in the register with today stats', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();
            const today = new Date().toISOString().slice(0, 10);

            const marked = await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({ staffUsername: staff.username, date: today, status: 'present', notes: 'On time' });

            expect(marked.status).toBe(200);
            expect(marked.body.data.status).toBe('present');
            expect(marked.body.data.staffUsername).toBe(staff.username);

            const list = await request(app)
                .get('/api/admin/hrm/attendance?todayStats=true')
                .set(auth(token));

            expect(list.status).toBe(200);
            expect(list.body.data).toHaveLength(1);
            expect(list.body.todayStats.present).toBe(1);
        });

        test('re-marking the same day updates the row instead of duplicating it', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();
            const today = new Date().toISOString().slice(0, 10);

            await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({ staffUsername: staff.username, date: today, status: 'present' });

            const second = await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({ staffUsername: staff.username, date: today, status: 'absent' });

            expect(second.status).toBe(200);
            expect(second.body.data.status).toBe('absent');
            expect(await Attendance.countDocuments({ staffId: String(staff._id) })).toBe(1);
        });

        test('rejects an unknown status and an unknown staff member', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();
            const today = new Date().toISOString().slice(0, 10);

            const badStatus = await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({ staffUsername: staff.username, date: today, status: 'vacationing' });
            expect(badStatus.status).toBe(400);

            const badStaff = await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({ staffUsername: 'ghost_user', date: today, status: 'present' });
            expect(badStaff.status).toBe(404);
        });

        test('clock-in then clock-out records hours worked and blocks repeats', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const clockIn = await request(app)
                .post('/api/admin/hrm/attendance/clock-in')
                .set(auth(token))
                .send({ staffUsername: staff.username, lat: 23.81, lng: 90.41 });

            expect(clockIn.status).toBe(200);
            expect(clockIn.body.data.clockIn).toBeTruthy();
            expect(clockIn.body.data.gpsLocation.lat).toBeCloseTo(23.81);
            expect(clockIn.body.data.markedBy).toBe('self');

            const repeat = await request(app)
                .post('/api/admin/hrm/attendance/clock-in')
                .set(auth(token))
                .send({ staffUsername: staff.username });
            expect(repeat.status).toBe(409);

            const clockOut = await request(app)
                .post('/api/admin/hrm/attendance/clock-out')
                .set(auth(token))
                .send({ staffUsername: staff.username });

            expect(clockOut.status).toBe(200);
            expect(clockOut.body.data.clockOut).toBeTruthy();
            expect(typeof clockOut.body.data.hoursWorked).toBe('number');

            const repeatOut = await request(app)
                .post('/api/admin/hrm/attendance/clock-out')
                .set(auth(token))
                .send({ staffUsername: staff.username });
            expect(repeatOut.status).toBe(409);
        });

        test('clock-out without a clock-in is refused', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const res = await request(app)
                .post('/api/admin/hrm/attendance/clock-out')
                .set(auth(token))
                .send({ staffUsername: staff.username });

            expect(res.status).toBe(400);
        });

        test('clock-in past the shift grace period is flagged late', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            // A shift that started at midnight is always already over by the
            // time the test clocks in, so lateness is deterministic.
            await Shift.create({
                name: 'Overnight',
                startTime: '00:00',
                endTime: '23:59',
                gracePeriodMinutes: 0,
                assignedStaff: [staff.username]
            });

            const res = await request(app)
                .post('/api/admin/hrm/attendance/clock-in')
                .set(auth(token))
                .send({ staffUsername: staff.username });

            expect(res.status).toBe(200);
            expect(res.body.data.isLate).toBe(true);
            expect(res.body.data.status).toBe('late');
            expect(res.body.data.lateMinutes).toBeGreaterThan(0);
        });

        test('summary and late report aggregate the month per staff member', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;

            await seedAttendance(staff, year, month, [
                { day: 1, status: 'present' },
                { day: 2, status: 'late', isLate: true },
                { day: 3, status: 'absent', hoursWorked: 0 },
                { day: 4, status: 'half-day', hoursWorked: 3 }
            ]);

            const summary = await request(app)
                .get(`/api/admin/hrm/attendance/summary?month=${month}&year=${year}`)
                .set(auth(token));

            expect(summary.status).toBe(200);
            expect(summary.body.data).toHaveLength(1);
            expect(summary.body.data[0]).toMatchObject({
                staffUsername: staff.username,
                present: 1,
                absent: 1,
                late: 1,
                halfDay: 1
            });

            const lateReport = await request(app)
                .get(`/api/admin/hrm/attendance/late-report?month=${month}&year=${year}`)
                .set(auth(token));

            expect(lateReport.status).toBe(200);
            expect(lateReport.body.data[0]).toMatchObject({
                staffUsername: staff.username,
                lateCount: 1,
                totalLateMinutes: 20
            });
        });

        test('an unknown staff filter returns nothing rather than every record', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();
            const today = new Date().toISOString().slice(0, 10);

            await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({ staffUsername: staff.username, date: today, status: 'present' });

            const res = await request(app)
                .get('/api/admin/hrm/attendance?staff=nobody_here')
                .set(auth(token));

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(0);
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Shifts', () => {
        test('creates, lists, updates, and deletes a shift', async () => {
            const token = await adminToken();

            const created = await request(app)
                .post('/api/admin/hrm/shifts')
                .set(auth(token))
                .send({ name: 'Morning Shift', startTime: '09:00', endTime: '18:00', gracePeriodMinutes: 10 });

            expect(created.status).toBe(201);
            expect(created.body.data.name).toBe('Morning Shift');
            expect(created.body.data.gracePeriodMinutes).toBe(10);

            const list = await request(app).get('/api/admin/hrm/shifts').set(auth(token));
            expect(list.status).toBe(200);
            expect(list.body.data).toHaveLength(1);

            const updated = await request(app)
                .patch(`/api/admin/hrm/shifts/${created.body.data._id}`)
                .set(auth(token))
                .send({ endTime: '17:00', assignedStaff: ['rahim', 'karim'] });

            expect(updated.status).toBe(200);
            expect(updated.body.data.endTime).toBe('17:00');
            expect(updated.body.data.assignedStaff).toEqual(['rahim', 'karim']);

            const removed = await request(app)
                .delete(`/api/admin/hrm/shifts/${created.body.data._id}`)
                .set(auth(token));

            expect(removed.status).toBe(200);
            expect(await Shift.countDocuments({})).toBe(0);
        });

        test('rejects a malformed time and requires a name', async () => {
            const token = await adminToken();

            const badTime = await request(app)
                .post('/api/admin/hrm/shifts')
                .set(auth(token))
                .send({ name: 'Broken', startTime: '25:00' });
            expect(badTime.status).toBe(400);

            const noName = await request(app)
                .post('/api/admin/hrm/shifts')
                .set(auth(token))
                .send({ startTime: '09:00' });
            expect(noName.status).toBe(400);
        });

        test('promoting a default shift demotes the previous one, and the default cannot be deleted', async () => {
            const token = await adminToken();

            const first = await request(app)
                .post('/api/admin/hrm/shifts')
                .set(auth(token))
                .send({ name: 'Morning', startTime: '09:00', endTime: '18:00', isDefault: true });

            const second = await request(app)
                .post('/api/admin/hrm/shifts')
                .set(auth(token))
                .send({ name: 'Evening', startTime: '14:00', endTime: '22:00', isDefault: true });

            expect(second.status).toBe(201);
            expect(await Shift.countDocuments({ isDefault: true })).toBe(1);

            const refreshedFirst = await Shift.findById(first.body.data._id);
            expect(refreshedFirst.isDefault).toBe(false);

            const blocked = await request(app)
                .delete(`/api/admin/hrm/shifts/${second.body.data._id}`)
                .set(auth(token));
            expect(blocked.status).toBe(409);
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Payroll', () => {
        test('generates a run from attendance and pro-rates the base salary', async () => {
            const token = await adminToken();
            const staff = await createStaffMember({ baseSalary: 30000 });
            const year = 2026;
            const month = 6;

            await seedAttendance(staff, year, month, [
                { day: 1, status: 'present', hoursWorked: 10 }, // 1 hour over the 09:00–18:00 window
                { day: 2, status: 'present' },
                { day: 3, status: 'late', isLate: true },
                { day: 4, status: 'absent', hoursWorked: 0 }
            ]);

            const res = await request(app)
                .post('/api/admin/hrm/payroll/generate')
                .set(auth(token))
                .send({ staffUsername: staff.username, month, year, bonus: 1000, deductions: 500 });

            expect(res.status).toBe(200);

            const run = res.body.data;
            expect(run.status).toBe('draft');
            expect(run.baseSalary).toBe(30000);
            expect(run.presentDays).toBe(3);
            expect(run.absentDays).toBe(1);
            expect(run.lateDays).toBe(1);
            expect(run.overtime).toBeCloseTo(1);
            expect(run.workingDays).toBe(countWorkingDays(year, month));

            const earnedBase = 30000 * (run.presentDays / run.workingDays);
            const expectedTotal = earnedBase + run.overtimeAmount + 1000 - 500;
            expect(run.totalSalary).toBeCloseTo(Math.round(expectedTotal * 100) / 100, 1);
        });

        test('regenerating a draft overwrites it, but an approved run is protected', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const first = await request(app)
                .post('/api/admin/hrm/payroll/generate')
                .set(auth(token))
                .send({ staffUsername: staff.username, month: 5, year: 2026, bonus: 500 });
            expect(first.status).toBe(200);

            const second = await request(app)
                .post('/api/admin/hrm/payroll/generate')
                .set(auth(token))
                .send({ staffUsername: staff.username, month: 5, year: 2026, bonus: 900 });

            expect(second.status).toBe(200);
            expect(second.body.data.bonus).toBe(900);
            expect(await Payroll.countDocuments({ staffId: String(staff._id) })).toBe(1);

            await request(app)
                .patch(`/api/admin/hrm/payroll/${second.body.data._id}/approve`)
                .set(auth(token))
                .send({});

            const afterApproval = await request(app)
                .post('/api/admin/hrm/payroll/generate')
                .set(auth(token))
                .send({ staffUsername: staff.username, month: 5, year: 2026 });
            expect(afterApproval.status).toBe(409);
        });

        test('walks draft → approved → paid and refuses paying an unapproved run', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const generated = await request(app)
                .post('/api/admin/hrm/payroll/generate')
                .set(auth(token))
                .send({ staffUsername: staff.username, month: 4, year: 2026 });

            const payrollId = generated.body.data._id;

            const earlyPay = await request(app)
                .patch(`/api/admin/hrm/payroll/${payrollId}/paid`)
                .set(auth(token))
                .send({});
            expect(earlyPay.status).toBe(409);

            const approved = await request(app)
                .patch(`/api/admin/hrm/payroll/${payrollId}/approve`)
                .set(auth(token))
                .send({ notes: 'Verified by owner' });
            expect(approved.status).toBe(200);
            expect(approved.body.data.status).toBe('approved');

            const doubleApprove = await request(app)
                .patch(`/api/admin/hrm/payroll/${payrollId}/approve`)
                .set(auth(token))
                .send({});
            expect(doubleApprove.status).toBe(409);

            const paid = await request(app)
                .patch(`/api/admin/hrm/payroll/${payrollId}/paid`)
                .set(auth(token))
                .send({ paymentMethod: 'bKash' });
            expect(paid.status).toBe(200);
            expect(paid.body.data.status).toBe('paid');
            expect(paid.body.data.paymentMethod).toBe('bKash');
            expect(paid.body.data.paidAt).toBeTruthy();
        });

        test('lists payroll with filters and a payable rollup', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            await request(app)
                .post('/api/admin/hrm/payroll/generate')
                .set(auth(token))
                .send({ staffUsername: staff.username, month: 3, year: 2026, bonus: 2000 });

            const list = await request(app)
                .get('/api/admin/hrm/payroll?month=3&year=2026')
                .set(auth(token));

            expect(list.status).toBe(200);
            expect(list.body.data).toHaveLength(1);
            expect(list.body.summary.pendingCount).toBe(1);
            expect(list.body.summary.paidCount).toBe(0);
            expect(list.body.summary.totalAmount).toBeGreaterThan(0);

            const otherMonth = await request(app)
                .get('/api/admin/hrm/payroll?month=11&year=2026')
                .set(auth(token));
            expect(otherMonth.body.data).toHaveLength(0);
        });

        test('streams a PDF pay slip and stamps the record', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const generated = await request(app)
                .post('/api/admin/hrm/payroll/generate')
                .set(auth(token))
                .send({ staffUsername: staff.username, month: 2, year: 2026 });

            const res = await request(app)
                .get(`/api/admin/hrm/payroll/${generated.body.data._id}/payslip`)
                .set(auth(token))
                .buffer()
                .parse((response, callback) => {
                    const data = [];
                    response.on('data', (chunk) => data.push(chunk));
                    response.on('end', () => callback(null, Buffer.concat(data)));
                });

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('application/pdf');
            expect(res.body.slice(0, 4).toString()).toBe('%PDF');

            const refreshed = await Payroll.findById(generated.body.data._id);
            expect(refreshed.paySlipGenerated).toBe(true);
        });

        test('salary config writes the employment record onto the staff account', async () => {
            const token = await adminToken();
            const staff = await createStaffMember({ baseSalary: 0 });

            const res = await request(app)
                .post('/api/admin/hrm/payroll/salary-config')
                .set(auth(token))
                .send({
                    staffUsername: staff.username,
                    baseSalary: 42000,
                    department: 'Warehouse',
                    employeeId: 'EMP-007',
                    joiningDate: '2026-01-15'
                });

            expect(res.status).toBe(200);
            expect(res.body.data.baseSalary).toBe(42000);

            const refreshed = await Admin.findById(staff._id);
            expect(refreshed.baseSalary).toBe(42000);
            expect(refreshed.department).toBe('Warehouse');
            expect(refreshed.employeeId).toBe('EMP-007');

            // The password must survive a salary write untouched.
            expect(refreshed.isPasswordHashed()).toBe(true);

            const negative = await request(app)
                .post('/api/admin/hrm/payroll/salary-config')
                .set(auth(token))
                .send({ staffUsername: staff.username, baseSalary: -100 });
            expect(negative.status).toBe(400);
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Leave', () => {
        async function applyLeave(token, staff, overrides = {}) {
            const res = await request(app)
                .post('/api/admin/hrm/leaves/apply')
                .set(auth(token))
                .send({
                    staffUsername: staff.username,
                    leaveType: 'casual',
                    startDate: '2026-07-06',
                    endDate: '2026-07-08',
                    reason: 'Family event',
                    ...overrides
                });
            return res;
        }

        test('applies for leave with an inclusive day count', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const res = await applyLeave(token, staff);

            expect(res.status).toBe(201);
            expect(res.body.data.totalDays).toBe(3);
            expect(res.body.data.status).toBe('pending');
            expect(res.body.data.staffName).toBe('Rahim Uddin');
        });

        test('rejects an unknown leave type and a backwards date range', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const badType = await applyLeave(token, staff, { leaveType: 'sabbatical' });
            expect(badType.status).toBe(400);

            const backwards = await applyLeave(token, staff, {
                startDate: '2026-07-10',
                endDate: '2026-07-06'
            });
            expect(backwards.status).toBe(400);
        });

        test('approval stamps holiday attendance across the leave span', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const applied = await applyLeave(token, staff);

            const approved = await request(app)
                .patch(`/api/admin/hrm/leaves/${applied.body.data._id}/approve`)
                .set(auth(token))
                .send({});

            expect(approved.status).toBe(200);
            expect(approved.body.data.status).toBe('approved');
            expect(approved.body.data.approvedAt).toBeTruthy();
            expect(approved.body.attendanceDaysMarked).toBe(3);

            const holidays = await Attendance.countDocuments({
                staffId: String(staff._id),
                status: 'holiday'
            });
            expect(holidays).toBe(3);

            const again = await request(app)
                .patch(`/api/admin/hrm/leaves/${applied.body.data._id}/approve`)
                .set(auth(token))
                .send({});
            expect(again.status).toBe(409);
        });

        test('rejection requires a reason and records it', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const applied = await applyLeave(token, staff);

            const noReason = await request(app)
                .patch(`/api/admin/hrm/leaves/${applied.body.data._id}/reject`)
                .set(auth(token))
                .send({});
            expect(noReason.status).toBe(400);

            const rejected = await request(app)
                .patch(`/api/admin/hrm/leaves/${applied.body.data._id}/reject`)
                .set(auth(token))
                .send({ rejectionReason: 'Peak season' });

            expect(rejected.status).toBe(200);
            expect(rejected.body.data.status).toBe('rejected');
            expect(rejected.body.data.rejectionReason).toBe('Peak season');

            const refreshed = await Leave.findById(applied.body.data._id);
            expect(refreshed.status).toBe('rejected');
        });

        test('lists leaves with a pending count and status filter', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            await applyLeave(token, staff);
            const second = await applyLeave(token, staff, {
                leaveType: 'sick',
                startDate: '2026-08-01',
                endDate: '2026-08-01'
            });

            await request(app)
                .patch(`/api/admin/hrm/leaves/${second.body.data._id}/approve`)
                .set(auth(token))
                .send({});

            const pending = await request(app)
                .get('/api/admin/hrm/leaves?status=pending')
                .set(auth(token));

            expect(pending.status).toBe(200);
            expect(pending.body.data).toHaveLength(1);
            expect(pending.body.pendingCount).toBe(1);

            const sick = await request(app)
                .get('/api/admin/hrm/leaves?leaveType=sick')
                .set(auth(token));
            expect(sick.body.data).toHaveLength(1);
        });

        test('balance counts approved days against the annual allowance', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const applied = await applyLeave(token, staff);
            await request(app)
                .patch(`/api/admin/hrm/leaves/${applied.body.data._id}/approve`)
                .set(auth(token))
                .send({});

            // A pending application must not eat into the remaining balance.
            await applyLeave(token, staff, { startDate: '2026-09-01', endDate: '2026-09-02' });

            const res = await request(app)
                .get('/api/admin/hrm/leaves/balance?year=2026')
                .set(auth(token));

            expect(res.status).toBe(200);
            const casual = res.body.data[0].balances.find((b) => b.leaveType === 'casual');
            expect(casual).toMatchObject({ allowed: 12, used: 3, pending: 2, remaining: 9 });
        });

        test('calendar expands a leave span into per-date entries', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();

            const applied = await applyLeave(token, staff);
            await request(app)
                .patch(`/api/admin/hrm/leaves/${applied.body.data._id}/approve`)
                .set(auth(token))
                .send({});

            const res = await request(app)
                .get('/api/admin/hrm/leaves/calendar?month=7&year=2026')
                .set(auth(token));

            expect(res.status).toBe(200);
            expect(res.body.period).toMatchObject({ month: 7, year: 2026, daysInMonth: 31 });
            expect(Object.keys(res.body.data).sort()).toEqual(['2026-07-06', '2026-07-07', '2026-07-08']);
            expect(res.body.data['2026-07-07'][0]).toMatchObject({
                staffUsername: staff.username,
                leaveType: 'casual',
                status: 'approved'
            });
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Designations', () => {
        test('creates, lists, updates, and deletes a designation', async () => {
            const token = await adminToken();

            const created = await request(app)
                .post('/api/admin/hrm/designations')
                .set(auth(token))
                .send({ name: 'Test Driver', department: 'Operations' });

            expect(created.status).toBe(201);
            expect(created.body.data.name).toBe('Test Driver');

            const list = await request(app)
                .get('/api/admin/hrm/designations')
                .set(auth(token));

            expect(list.status).toBe(200);
            expect(list.body.data.some((d) => d.name === 'Test Driver')).toBe(true);

            const updated = await request(app)
                .patch(`/api/admin/hrm/designations/${created.body.data._id}`)
                .set(auth(token))
                .send({ name: 'Senior Driver', department: 'Logistics' });

            expect(updated.status).toBe(200);
            expect(updated.body.data.name).toBe('Senior Driver');

            const removed = await request(app)
                .delete(`/api/admin/hrm/designations/${created.body.data._id}`)
                .set(auth(token));

            expect(removed.status).toBe(200);
        });

        test('blocks deletion when employees use the designation', async () => {
            const token = await adminToken();

            const desig = await Designation.create({ name: 'Blocked Role', department: 'Ops', createdBy: 'test' });
            await Employee.create({
                fullName: 'Blocked Test',
                phone: '01700000099',
                designation: 'Blocked Role',
                role: 'Blocked Role'
            });

            const res = await request(app)
                .delete(`/api/admin/hrm/designations/${desig._id}`)
                .set(auth(token));

            expect(res.status).toBe(409);
            expect(res.body.employeeCount).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Employees (non-login staff)', () => {
        test('creates employee with auto-generated EMP id and marks attendance', async () => {
            const token = await adminToken();
            const today = new Date().toISOString().slice(0, 10);

            const created = await request(app)
                .post('/api/admin/hrm/employees')
                .set(auth(token))
                .send({
                    fullName: 'Karim Delivery',
                    phone: '01700000001',
                    role: 'Delivery Man',
                    department: 'Operations',
                    baseSalary: 15000
                });

            expect(created.status).toBe(201);
            expect(created.body.data.employeeId).toMatch(/^EMP-\d{3}$/);
            expect(created.body.data.fullName).toBe('Karim Delivery');

            const marked = await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({
                    staffType: 'employee',
                    staffId: created.body.data.employeeId,
                    date: today,
                    status: 'present'
                });

            expect(marked.status).toBe(200);
            expect(marked.body.data.staffType).toBe('employee');
            expect(marked.body.data.staffUsername).toBe(created.body.data.employeeId);

            const stats = await request(app)
                .get('/api/admin/hrm/employees/stats')
                .set(auth(token));

            expect(stats.status).toBe(200);
            expect(stats.body.data.totalActive).toBeGreaterThanOrEqual(1);
        });

        test('soft-deletes employee by setting status to terminated', async () => {
            const token = await adminToken();

            const created = await request(app)
                .post('/api/admin/hrm/employees')
                .set(auth(token))
                .send({
                    fullName: 'Temp Labour',
                    phone: '01700000002',
                    role: 'Labour'
                });

            const deleted = await request(app)
                .delete(`/api/admin/hrm/employees/${created.body.data._id}`)
                .set(auth(token));

            expect(deleted.status).toBe(200);
            expect(deleted.body.data.status).toBe('terminated');

            const fetched = await Employee.findById(created.body.data._id);
            expect(fetched.status).toBe('terminated');
        });

        test('returns full profile with attendance, payroll, and leave snapshot', async () => {
            const token = await adminToken();

            const created = await request(app)
                .post('/api/admin/hrm/employees')
                .set(auth(token))
                .send({
                    fullName: 'Profile Test',
                    phone: '01700000003',
                    designation: 'Warehouse Staff',
                    department: 'Operations',
                    baseSalary: 18000,
                    employeeType: 'permanent',
                    salaryType: 'monthly'
                });

            expect(created.status).toBe(201);

            const profile = await request(app)
                .get(`/api/admin/hrm/employees/${created.body.data._id}/profile`)
                .set(auth(token));

            expect(profile.status).toBe(200);
            expect(profile.body.data.employee.fullName).toBe('Profile Test');
            expect(profile.body.data.employee.designation).toBe('Warehouse Staff');
            expect(profile.body.data.attendanceSummary).toBeDefined();
            expect(Array.isArray(profile.body.data.payrollHistory)).toBe(true);
            expect(Array.isArray(profile.body.data.leaveBalance)).toBe(true);
        });

        test('uploads employee photo via multipart endpoint', async () => {
            const token = await adminToken();

            const created = await request(app)
                .post('/api/admin/hrm/employees')
                .set(auth(token))
                .send({
                    fullName: 'Photo Test',
                    phone: '01700000004',
                    designation: 'Cleaner'
                });

            const res = await request(app)
                .post(`/api/admin/hrm/employees/${created.body.data._id}/photo`)
                .set(auth(token))
                .attach('photo', Buffer.from('fake-image'), 'photo.jpg');

            expect(res.status).toBe(200);
            expect(res.body.data.photo).toContain('cloudinary');
        });
    });

    /* ---------------------------------------------------------------- */

    describe('Enterprise summary', () => {
        test('reports HRM attendance, leave, and payroll stats', async () => {
            const token = await adminToken();
            const staff = await createStaffMember();
            const today = new Date().toISOString().slice(0, 10);

            await request(app)
                .post('/api/admin/hrm/attendance/mark')
                .set(auth(token))
                .send({ staffUsername: staff.username, date: today, status: 'present' });

            await request(app)
                .post('/api/admin/hrm/leaves/apply')
                .set(auth(token))
                .send({
                    staffUsername: staff.username,
                    leaveType: 'annual',
                    startDate: '2026-12-01',
                    endDate: '2026-12-02'
                });

            const res = await request(app)
                .get('/api/admin/enterprise-summary')
                .set(auth(token));

            expect(res.status).toBe(200);
            expect(res.body.data.hrm).toMatchObject({
                presentToday: 1,
                absentToday: 0,
                pendingLeaveCount: 1
            });
            expect(typeof res.body.data.hrm.employeeCount).toBe('number');
        });
    });
});
