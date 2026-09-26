/********************************************************************
 * Leave route id resolution
 ********************************************************************/

const Leave = require('../../backend/src/models/leave');
const {
    isMongoObjectIdString,
    resolveLeaveRouteTarget
} = require('../../backend/src/utils/leaveRecordResolver');
const { getApp, createTestAdmin } = require('../setup');
const request = require('supertest');

describe('leaveRecordResolver', () => {
    test('isMongoObjectIdString rejects UUID-shaped ids', () => {
        expect(isMongoObjectIdString('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    });

    test('resolveLeaveRouteTarget finds Mongo leave by ObjectId', async () => {
        const doc = await Leave.create({
            staffId: 'staff-1',
            staffUsername: 'u1',
            staffName: 'User One',
            leaveType: 'casual',
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-01'),
            status: 'pending'
        });

        const target = await resolveLeaveRouteTarget(String(doc._id));
        expect(target.error).toBeUndefined();
        expect(target.mongoId).toBe(String(doc._id));
        expect(target.leave.status).toBe('pending');
    });
});

describe('Leave approve/reject API ids', () => {
    const app = getApp();

    async function adminToken() {
        const { username, password } = await createTestAdmin();
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    test('approve returns 404 for unknown leave id', async () => {
        const token = await adminToken();
        const fakeId = '507f1f77bcf86cd799439011';
        const res = await request(app)
            .patch(`/api/admin/hrm/leaves/${fakeId}/approve`)
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
    });
});
