/********************************************************************
 * platformSettingsReadService — Unit Tests (Jest)
 * PG-first read, Mongo fallback, safe defaults on total DB failure.
 ********************************************************************/

jest.mock('../../backend/src/models/admin', () => ({
  findOne: jest.fn()
}));

jest.mock('../../backend/src/repositories/adminRepository', () => ({
  findByUsername: jest.fn()
}));

const Admin = require('../../backend/src/models/admin');
const adminRepo = require('../../backend/src/repositories/adminRepository');
const {
  DEFAULT_PLATFORM_ADMIN_SETTINGS,
  fetchPlatformAdminSettings,
  fetchPlatformAdminSettingsSafe,
  buildDefaultPlatformSettings
} = require('../../backend/src/services/platformSettingsReadService');

describe('platformSettingsReadService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('buildDefaultPlatformSettings merges username into defaults', () => {
    const settings = buildDefaultPlatformSettings('shop-admin');
    expect(settings.username).toBe('shop-admin');
    expect(settings.storeName).toBe(DEFAULT_PLATFORM_ADMIN_SETTINGS.storeName);
    expect(settings.currency).toBe('BDT');
  });

  test('flag OFF → reads from Mongo', async () => {
    delete process.env.READ_PG_ADMIN;
    const mongoDoc = {
      username: 'admin',
      displayName: 'Owner',
      storeName: 'My Store',
      logoUrl: '',
      faviconUrl: ''
    };
    Admin.findOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(mongoDoc)
      })
    });

    const result = await fetchPlatformAdminSettings('admin');
    expect(result.username).toBe('admin');
    expect(result.displayName).toBe('Owner');
    expect(adminRepo.findByUsername).not.toHaveBeenCalled();
  });

  test('flag ON → reads from Postgres', async () => {
    process.env.READ_PG_ADMIN = 'true';
    adminRepo.findByUsername.mockResolvedValue({
      _id: 'pg-1',
      username: 'admin',
      displayName: 'PG Admin',
      storeName: 'PG Store',
      logoUrl: '',
      faviconUrl: ''
    });

    const result = await fetchPlatformAdminSettings('admin');
    expect(result.displayName).toBe('PG Admin');
    expect(Admin.findOne).not.toHaveBeenCalled();
  });

  test('flag ON + Postgres throws → falls back to Mongo', async () => {
    process.env.READ_PG_ADMIN = 'true';
    adminRepo.findByUsername.mockRejectedValue(new Error('Neon timeout'));
    Admin.findOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({
          username: 'admin',
          displayName: 'Mongo Admin',
          logoUrl: '',
          faviconUrl: ''
        })
      })
    });

    const result = await fetchPlatformAdminSettings('admin');
    expect(result.displayName).toBe('Mongo Admin');
    expect(Admin.findOne).toHaveBeenCalled();
  });

  test('fetchPlatformAdminSettingsSafe returns defaults when both DBs fail', async () => {
    process.env.READ_PG_ADMIN = 'true';
    adminRepo.findByUsername.mockRejectedValue(new Error('PG down'));
    Admin.findOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.reject(new Error('Mongo down'))
      })
    });

    const result = await fetchPlatformAdminSettingsSafe('admin');
    expect(result.fallback).toBe(true);
    expect(result.admin.username).toBe('admin');
    expect(result.admin.storeName).toBe('EonlineBazar');
    expect(result.notFound).toBeUndefined();
  });

  test('fetchPlatformAdminSettingsSafe returns notFound when admin missing', async () => {
    delete process.env.READ_PG_ADMIN;
    Admin.findOne.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(null)
      })
    });

    const result = await fetchPlatformAdminSettingsSafe('missing-user');
    expect(result.fallback).toBe(false);
    expect(result.notFound).toBe(true);
    expect(result.admin).toBeNull();
  });
});
