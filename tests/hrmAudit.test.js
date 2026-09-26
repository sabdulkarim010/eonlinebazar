/********************************************************************
 * HRM granular audit + dashboard aggregation helpers
 ********************************************************************/

const SecurityLog = require('../backend/src/models/securityLog');
const {
    HRM_ACTION_TYPES,
    buildHrmDetailsPayload,
    shapeHrmAuditLogRow
} = require('../backend/src/services/hrmAuditService');
const {
    aggregatePayrollMonthMongo,
    fetchHrmDashboardMetricsMongo
} = require('../backend/src/services/hrmDashboardMetricsService');
const Payroll = require('../backend/src/models/payroll');
const { getApp, createTestAdmin } = require('./setup');
const request = require('supertest');

describe('HRM audit and dashboard metrics', () => {
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

    test('buildHrmDetailsPayload embeds filterable metadata', () => {
        const raw = buildHrmDetailsPayload({
            summary: 'Salary change',
            actorId: 'admin1',
            actorName: 'alice',
            targetStaffId: 'staff99',
            hrmActionType: HRM_ACTION_TYPES.SALARY_MODIFIED,
            previousValue: { baseSalary: 1000 },
            newValue: { baseSalary: 1200 }
        });
        const parsed = JSON.parse(raw);
        expect(parsed.hrmActionType).toBe('salary_modified');
        expect(parsed.targetStaffId).toBe('staff99');
        expect(parsed.previousValue.baseSalary).toBe(1000);
    });

    test('shapeHrmAuditLogRow exposes structured fields from Mongo document', async () => {
        const doc = await SecurityLog.create({
            action: 'Employee Salary Updated',
            actor: 'bob',
            actorType: 'admin',
            ipAddress: '127.0.0.1',
            details: buildHrmDetailsPayload({
                summary: 'test',
                actorId: 'a1',
                actorName: 'bob',
                targetStaffId: 's1',
                hrmActionType: HRM_ACTION_TYPES.SALARY_MODIFIED,
                previousValue: { baseSalary: 1 },
                newValue: { baseSalary: 2 }
            }),
            resourceType: 'employee',
            resourceId: 'emp1',
            actorId: 'a1',
            targetStaffId: 's1',
            hrmActionType: HRM_ACTION_TYPES.SALARY_MODIFIED,
            previousValue: { baseSalary: 1 },
            newValue: { baseSalary: 2 }
        });

        const shaped = shapeHrmAuditLogRow(doc.toObject());
        expect(shaped.actionType).toBe(HRM_ACTION_TYPES.SALARY_MODIFIED);
        expect(shaped.targetStaffId).toBe('s1');
        expect(shaped.previousValue.baseSalary).toBe(1);
        expect(shaped.newValue.baseSalary).toBe(2);
    });

    test('GET /staff-audit/hrm filters by actionType', async () => {
        const token = await adminToken();

        await SecurityLog.create({
            action: 'Payroll Approved',
            actor: 'auditor',
            actorType: 'admin',
            ipAddress: '10.0.0.1',
            details: buildHrmDetailsPayload({
                summary: 'approve',
                hrmActionType: HRM_ACTION_TYPES.PAYROLL_RELEASE,
                targetStaffId: 'staff-filter-1',
                previousValue: { status: 'draft' },
                newValue: { status: 'approved' }
            }),
            resourceType: 'payroll',
            resourceId: 'pay1',
            hrmActionType: HRM_ACTION_TYPES.PAYROLL_RELEASE,
            targetStaffId: 'staff-filter-1',
            previousValue: { status: 'draft' },
            newValue: { status: 'approved' }
        });

        const res = await request(app)
            .get('/api/admin/staff-audit/hrm')
            .query({ actionType: HRM_ACTION_TYPES.PAYROLL_RELEASE, limit: 50 })
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some((row) => row.actionType === HRM_ACTION_TYPES.PAYROLL_RELEASE)).toBe(true);
    });

    test('aggregatePayrollMonthMongo returns paid/pending counts and estimated cost', async () => {
        const month = 3;
        const year = 2099;
        await Payroll.create([
            { staffId: 's1', staffUsername: 'u1', month, year, status: 'paid', earnedSalary: 500 },
            { staffId: 's2', staffUsername: 'u2', month, year, status: 'draft', earnedSalary: 800 },
            { staffId: 's3', staffUsername: 'u3', month, year, status: 'approved', earnedSalary: 200 }
        ]);

        const rollup = await aggregatePayrollMonthMongo(month, year);
        expect(rollup.paidCount).toBeGreaterThanOrEqual(1);
        expect(rollup.pendingCount).toBeGreaterThanOrEqual(2);
        expect(rollup.estimatedPayrollCost).toBeGreaterThanOrEqual(1000);
    });

    test('fetchHrmDashboardMetricsMongo returns bundled KPI object', async () => {
        const now = new Date();
        const metrics = await fetchHrmDashboardMetricsMongo({
            currentMonth: now.getMonth() + 1,
            currentYear: now.getFullYear()
        });
        expect(metrics).toMatchObject({
            employeeCount: expect.any(Number),
            pendingLeaveCount: expect.any(Number),
            presentToday: expect.any(Number),
            payrollPaidThisMonth: expect.any(Number),
            payrollPendingThisMonth: expect.any(Number),
            estimatedPayrollCostThisMonth: expect.any(Number)
        });
    });
});
