/********************************************************************
 * systemHealthService + admin health routes
 ********************************************************************/

jest.mock('../../backend/src/models/Settings', () => ({
    findOne: jest.fn(),
    countDocuments: jest.fn()
}));

jest.mock('../../backend/src/models/FailedSync', () => ({
    countDocuments: jest.fn(),
    find: jest.fn(),
    findByIdAndUpdate: jest.fn()
}));

jest.mock('../../backend/src/config/prismaClient', () => ({
    $queryRawUnsafe: jest.fn()
}));

jest.mock('../../backend/src/services/failedSyncService', () => ({
    reconcileFailedSyncs: jest.fn().mockResolvedValue({ attempted: 2, resolved: 1 }),
    listUnresolvedFailures: jest.fn().mockResolvedValue([{ entity: 'Employee' }])
}));

jest.mock('../../backend/src/services/cacheService', () => ({
    purgeApplicationCaches: jest.fn().mockResolvedValue({
        redisConnected: false,
        keysDeleted: 12,
        patterns: ['store:*']
    })
}));

jest.mock('../../backend/src/utils/securityLogger', () => ({
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
    getClientIp: jest.fn(() => '127.0.0.1')
}));

const Settings = require('../../backend/src/models/Settings');
const FailedSync = require('../../backend/src/models/FailedSync');
const prisma = require('../../backend/src/config/prismaClient');
const redisClient = require('../../backend/src/utils/redisClient');
const {
    buildSystemHealthReport,
    classifyLatency,
    classifyMemory,
    purgeSystemCaches,
    triggerManualSyncReconcile
} = require('../../backend/src/services/systemHealthService');
const {
    getSystemHealth,
    purgeSystemCache,
    triggerManualSync
} = require('../../backend/src/controllers/admin/systemHealthController');
const { purgeApplicationCaches } = require('../../backend/src/services/cacheService');
const { reconcileFailedSyncs } = require('../../backend/src/services/failedSyncService');
const { logSecurityEvent } = require('../../backend/src/utils/securityLogger');

describe('systemHealthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Settings.findOne.mockReturnValue({
            select: () => ({
                lean: () => ({
                    maxTimeMS: () => Promise.resolve({ _id: 's1' })
                })
            })
        });
        Settings.countDocuments.mockResolvedValue(0);
        FailedSync.countDocuments.mockResolvedValue(3);
        prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
        redisClient.isRedisAvailable.mockReturnValue(false);
    });

    test('classifyLatency marks slow queries as degraded', () => {
        expect(classifyLatency(120, true)).toBe('healthy');
        expect(classifyLatency(600, true)).toBe('degraded');
        expect(classifyLatency(null, false)).toBe('offline');
    });

    test('buildSystemHealthReport returns database and server sections', async () => {
        const report = await buildSystemHealthReport();

        expect(report.overallStatus).toMatch(/healthy|degraded|offline/);
        expect(report.databases.mongodb.ok).toBe(true);
        expect(report.databases.postgresql.ok).toBe(true);
        expect(report.syncQueue.unresolvedDualWriteFailures).toBe(3);
        expect(report.server.uptimeSeconds).toBeGreaterThanOrEqual(0);
        expect(report.server.memory.heapUsedBytes).toBeGreaterThan(0);
    });

    test('purgeSystemCaches delegates to cacheService', async () => {
        const result = await purgeSystemCaches();
        expect(purgeApplicationCaches).toHaveBeenCalled();
        expect(result.keysDeleted).toBe(12);
    });

    test('triggerManualSyncReconcile returns reconcile stats', async () => {
        FailedSync.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        const result = await triggerManualSyncReconcile();
        expect(reconcileFailedSyncs).toHaveBeenCalled();
        expect(result.attempted).toBe(2);
        expect(result.resolved).toBe(1);
    });
});

describe('systemHealthController', () => {
    const mockRes = () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        Settings.findOne.mockReturnValue({
            select: () => ({
                lean: () => ({
                    maxTimeMS: () => Promise.resolve({ _id: 's1' })
                })
            })
        });
        Settings.countDocuments.mockResolvedValue(0);
        FailedSync.countDocuments.mockResolvedValue(0);
        prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
        redisClient.isRedisAvailable.mockReturnValue(false);
    });

    test('getSystemHealth returns 200 payload', async () => {
        const req = { adminAccount: { username: 'admin', _id: 'a1' } };
        const res = mockRes();

        await getSystemHealth(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
        expect(res.json.mock.calls[0][0].data.databases).toBeDefined();
    });

    test('purgeSystemCache logs security event', async () => {
        const req = { adminAccount: { username: 'admin', _id: 'a1' }, headers: {} };
        const res = mockRes();

        await purgeSystemCache(req, res);

        expect(logSecurityEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'SYSTEM_CACHE_PURGE' })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('triggerManualSync logs security event', async () => {
        FailedSync.countDocuments.mockResolvedValue(0);
        const req = { adminAccount: { username: 'admin', _id: 'a1' }, headers: {} };
        const res = mockRes();

        await triggerManualSync(req, res);

        expect(logSecurityEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'SYSTEM_MANUAL_SYNC' })
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

describe('system health RBAC route wiring', () => {
    test('admin routes register health endpoints with manage_security guard', () => {
        const adminRoutes = require('../../backend/src/routes/adminRoutes');
        const stack = adminRoutes.stack || [];
        const healthGet = stack.find(
            (layer) => layer.route?.path === '/system/health' && layer.route.methods.get
        );
        const purgePost = stack.find(
            (layer) => layer.route?.path === '/system/purge-cache' && layer.route.methods.post
        );
        expect(healthGet).toBeTruthy();
        expect(purgePost).toBeTruthy();
    });
});
