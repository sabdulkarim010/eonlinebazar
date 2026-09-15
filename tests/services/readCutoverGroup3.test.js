/********************************************************************
 * Stage 4 Step 3 — Security/Audit read parity (mocked Postgres repositories)
 ********************************************************************/

jest.mock('../../backend/src/repositories/securityLogRepository', () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  distinctActors: jest.fn(),
  countStaffAuditGroups: jest.fn(),
  findStaffAuditGroups: jest.fn()
}));

jest.mock('../../backend/src/repositories/loginAttemptRepository', () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  aggregateTopFailedIps: jest.fn()
}));

jest.mock('../../backend/src/repositories/blacklistedIpRepository', () => ({
  findAll: jest.fn(),
  findActiveByIp: jest.fn()
}));

jest.mock('../../backend/src/repositories/stockAlertRepository', () => ({
  findPaginated: jest.fn(),
  countAll: jest.fn()
}));

const securityLogRepo = require('../../backend/src/repositories/securityLogRepository');
const loginAttemptRepo = require('../../backend/src/repositories/loginAttemptRepository');
const blacklistedIpRepo = require('../../backend/src/repositories/blacklistedIpRepository');
const stockAlertRepo = require('../../backend/src/repositories/stockAlertRepository');
const {
  securityLogToMongoShape,
  loginAttemptToMongoShape,
  blacklistedIpToMongoShape,
  stockAlertToMongoShape
} = require('../../backend/src/services/readShapeHelpers');
const {
  fetchActiveBanByIp,
  fetchStaffAuditGroups
} = require('../../backend/src/services/securityAuditReadService');

const LEGACY = '507f1f77bcf86cd799439011';

describe('read cutover group 3 — Security/Audit shape parity (mocked)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('blacklistedIp permanent ban preserves null expiresAt', () => {
    const shape = blacklistedIpToMongoShape({
      id: 'pg-1',
      legacyId: LEGACY,
      ip: '203.0.113.50',
      reason: 'Manual block',
      source: 'MANUAL',
      blockedBy: 'admin',
      blockedAt: new Date('2024-01-01'),
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02')
    });
    expect(shape.expiresAt).toBeNull();
    expect(shape._id).toBe(LEGACY);
    expect(shape.source).toBe('manual');
  });

  test('stockAlert reassembles LOW_STOCK and OUT_OF_STOCK child rows', () => {
    const shape = stockAlertToMongoShape({
      id: 'pg-sa',
      legacyId: LEGACY,
      checkedAt: new Date('2024-06-01'),
      lowStockCount: 1,
      outOfStockCount: 1,
      alertSentEmail: true,
      alertSentSms: false,
      alertSentWhatsapp: false,
      createdAt: new Date('2024-06-01'),
      items: [
        {
          kind: 'LOW_STOCK',
          name: 'Low Item',
          legacyProductId: 'SKU-LOW',
          stock: 2,
          threshold: 10
        },
        {
          kind: 'OUT_OF_STOCK',
          name: 'Out Item',
          legacyProductId: 'SKU-OUT',
          stock: null,
          threshold: null
        }
      ]
    });

    expect(shape.lowStockProducts).toHaveLength(1);
    expect(shape.lowStockProducts[0]).toEqual({
      name: 'Low Item',
      productId: 'SKU-LOW',
      stock: 2,
      threshold: 10
    });
    expect(shape.outOfStockProducts).toHaveLength(1);
    expect(shape.outOfStockProducts[0]).toEqual({
      name: 'Out Item',
      productId: 'SKU-OUT'
    });
    expect(shape.alertsSent).toEqual({ email: true, sms: false, whatsapp: false });
  });

  test('securityLog shape maps enums and legacy _id', () => {
    const shape = securityLogToMongoShape({
      id: 'pg-log',
      legacyId: LEGACY,
      action: 'Order Updated',
      actor: 'admin1',
      actorType: 'ADMIN',
      ipAddress: '127.0.0.1',
      details: 'status change',
      resourceType: 'ORDER',
      resourceId: 'ORD-1',
      createdAt: new Date('2024-03-01'),
      updatedAt: new Date('2024-03-01')
    });
    expect(shape._id).toBe(LEGACY);
    expect(shape.actorType).toBe('admin');
    expect(shape.resourceType).toBe('order');
    expect(shape.__v).toBe(0);
  });

  test('loginAttempt shape maps status enum', () => {
    const shape = loginAttemptToMongoShape({
      id: 'pg-la',
      legacyId: LEGACY,
      username: 'admin',
      ipAddress: '1.2.3.4',
      status: 'OTP_FAILED',
      createdAt: new Date('2024-04-01')
    });
    expect(shape.status).toBe('otp_failed');
    expect(shape._id).toBe(LEGACY);
  });

  test('fetchActiveBanByIp uses Postgres when flag ON', async () => {
    process.env.READ_PG_BLACKLISTEDIP = 'true';
    blacklistedIpRepo.findActiveByIp.mockResolvedValue({
      id: 'pg-1',
      legacyId: LEGACY,
      ip: '198.51.100.10',
      reason: 'Auto',
      source: 'AUTO',
      blockedBy: 'system',
      blockedAt: new Date(),
      expiresAt: null
    });

    const ban = await fetchActiveBanByIp('198.51.100.10');
    expect(ban).not.toBeNull();
    expect(ban.expiresAt).toBeNull();
    expect(blacklistedIpRepo.findActiveByIp).toHaveBeenCalledWith('198.51.100.10');
  });

  test('fetchStaffAuditGroups returns grouped data from Postgres when flag ON', async () => {
    process.env.READ_PG_SECURITYLOG = 'true';
    securityLogRepo.findStaffAuditGroups.mockResolvedValue([{
      actor: 'admin1',
      totalActions: 3,
      lastActivityAt: new Date('2024-05-01'),
      resourceBreakdown: { order: 2, other: 1 }
    }]);
    securityLogRepo.countStaffAuditGroups.mockResolvedValue(1);

    const result = await fetchStaffAuditGroups({ skip: 0, limit: 25 });
    expect(result.total).toBe(1);
    expect(result.data[0].username).toBe('admin1');
    expect(result.data[0].totalActions).toBe(3);
  });
});
