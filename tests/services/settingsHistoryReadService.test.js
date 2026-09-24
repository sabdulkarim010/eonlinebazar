/********************************************************************
 * settingsHistoryReadService — Unit Tests (Jest)
 ********************************************************************/

jest.mock('../../backend/src/models/securityLog', () => ({
  find: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock('../../backend/src/repositories/securityLogRepository', () => ({
  findSettingsHistory: jest.fn(),
  countSettingsHistory: jest.fn()
}));

const SecurityLog = require('../../backend/src/models/securityLog');
const securityLogRepo = require('../../backend/src/repositories/securityLogRepository');
const {
  isSettingsHistoryAction,
  SETTINGS_HISTORY_MONGO_FILTER
} = require('../../backend/src/utils/settingsHistoryFilter');
const {
  fetchSettingsHistoryPage,
  countSettingsHistoryRecords
} = require('../../backend/src/services/settingsHistoryReadService');

describe('settingsHistoryFilter', () => {
  test('matches resourceType setting via mongo filter shape', () => {
    expect(SETTINGS_HISTORY_MONGO_FILTER.$or).toEqual(
      expect.arrayContaining([{ resourceType: 'setting' }])
    );
  });

  test('isSettingsHistoryAction recognizes settings events', () => {
    expect(isSettingsHistoryAction('Delivery Settings Updated')).toBe(true);
    expect(isSettingsHistoryAction('Finance Settings Updated')).toBe(true);
    expect(isSettingsHistoryAction('Footer Settings Updated')).toBe(true);
    expect(isSettingsHistoryAction('Payment Method Updated')).toBe(true);
    expect(isSettingsHistoryAction('Store Branding Updated')).toBe(true);
    expect(isSettingsHistoryAction('Customer Profile Updated')).toBe(false);
    expect(isSettingsHistoryAction('Admin Login Success')).toBe(false);
  });
});

describe('settingsHistoryReadService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('flag OFF → reads from Mongo with settings filter', async () => {
    delete process.env.READ_PG_SECURITYLOG;
    const leanResult = [{ _id: '1', action: 'Delivery Settings Updated', createdAt: new Date() }];
    SecurityLog.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: () => Promise.resolve(leanResult)
          })
        })
      })
    });

    const rows = await fetchSettingsHistoryPage({ skip: 0, limit: 10 });
    expect(rows).toEqual(leanResult);
    expect(SecurityLog.find).toHaveBeenCalledWith(SETTINGS_HISTORY_MONGO_FILTER);
    expect(securityLogRepo.findSettingsHistory).not.toHaveBeenCalled();
  });

  test('flag ON → reads from Postgres repository', async () => {
    process.env.READ_PG_SECURITYLOG = 'true';
    securityLogRepo.findSettingsHistory.mockResolvedValue([
      { id: 'pg-1', action: 'Store Branding Updated', createdAt: new Date() }
    ]);

    const rows = await fetchSettingsHistoryPage({ skip: 0, limit: 5 });
    expect(rows[0].action).toBe('Store Branding Updated');
    expect(SecurityLog.find).not.toHaveBeenCalled();
  });

  test('countSettingsHistoryRecords routes to PG when flag ON', async () => {
    process.env.READ_PG_SECURITYLOG = 'true';
    securityLogRepo.countSettingsHistory.mockResolvedValue(12);

    const total = await countSettingsHistoryRecords();
    expect(total).toBe(12);
    expect(SecurityLog.countDocuments).not.toHaveBeenCalled();
  });
});
