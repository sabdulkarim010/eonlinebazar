/********************************************************************
 * settingsExportImportService / sanitizer — Unit Tests (Jest)
 ********************************************************************/

jest.mock('../../backend/src/models/Settings', () => ({
  getOrCreate: jest.fn()
}));

jest.mock('../../backend/src/models/category', () => ({
  find: jest.fn()
}));

jest.mock('../../backend/src/services/settingsReadService', () => ({
  fetchSettingsDocument: jest.fn()
}));

jest.mock('../../backend/src/services/platformSettingsReadService', () => ({
  fetchPlatformAdminSettingsSafe: jest.fn()
}));

jest.mock('../../backend/src/repositories/sidebarLabelRepository', () => ({
  findAllMap: jest.fn(),
  bulkUpsertLabels: jest.fn()
}));

jest.mock('../../backend/src/repositories/categoryRepository', () => ({
  findAll: jest.fn(),
  findBySlug: jest.fn(),
  update: jest.fn()
}));

jest.mock('../../backend/src/services/dualWriteService', () => ({
  dualWrite: jest.fn(async (mongoFn) => mongoFn())
}));

jest.mock('../../backend/src/services/cacheService', () => ({
  invalidate: jest.fn(),
  CACHE_KEYS: { STORE_SETTINGS: 'store', FLASH_SALE: 'flash' }
}));

jest.mock('../../backend/src/models/admin', () => ({
  findOne: jest.fn().mockResolvedValue({
    username: 'admin',
    save: jest.fn().mockResolvedValue(undefined)
  })
}));

jest.mock('../../backend/src/utils/adminDualWriteHelpers', () => ({
  adminDualWrite: jest.fn(async (fn) => fn()),
  mirrorAdminUpdate: jest.fn()
}));

const Settings = require('../../backend/src/models/Settings');
const categoryRepo = require('../../backend/src/repositories/categoryRepository');
const sidebarRepo = require('../../backend/src/repositories/sidebarLabelRepository');
const { fetchSettingsDocument } = require('../../backend/src/services/settingsReadService');
const { fetchPlatformAdminSettingsSafe } = require('../../backend/src/services/platformSettingsReadService');
const {
  sanitizeSettingsDocument,
  validateImportPayload,
  isSecretKey
} = require('../../backend/src/utils/settingsExportSanitizer');
const {
  buildSettingsExportPayload,
  applySettingsImportPayload
} = require('../../backend/src/services/settingsExportImportService');

describe('settingsExportSanitizer', () => {
  test('isSecretKey detects credential field names', () => {
    expect(isSecretKey('smsApiKey')).toBe(true);
    expect(isSecretKey('resendApiKeyEnc')).toBe(true);
    expect(isSecretKey('storeName')).toBe(false);
  });

  test('sanitizeSettingsDocument strips secrets from settings doc', () => {
    const sanitized = sanitizeSettingsDocument({
      shopHomeCity: 'Dhaka',
      smsApiKey: 'secret-key',
      courierSecretKey: 'courier-secret',
      notificationSettings: {
        emailProvider: 'resend',
        resendFromEmail: 'noreply@test.com',
        resendApiKeyEnc: 'enc:abc'
      }
    });

    expect(sanitized.shopHomeCity).toBe('Dhaka');
    expect(sanitized.smsApiKey).toBeUndefined();
    expect(sanitized.courierSecretKey).toBeUndefined();
    expect(sanitized.notificationSettings.emailProvider).toBe('resend');
    expect(sanitized.notificationSettings.resendApiKeyEnc).toBeUndefined();
  });

  test('validateImportPayload rejects missing version', () => {
    const result = validateImportPayload({ settings: {} });
    expect(result.valid).toBe(false);
  });

  test('validateImportPayload accepts version 1 payload', () => {
    const result = validateImportPayload({ version: 1, settings: { orderPrefix: 'ORD' } });
    expect(result.valid).toBe(true);
  });
});

describe('settingsExportImportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildSettingsExportPayload assembles sanitized sections', async () => {
    fetchSettingsDocument.mockResolvedValue({
      shopHomeCity: 'Dhaka',
      smsApiKey: 'hidden',
      toObject() {
        return { shopHomeCity: 'Dhaka', smsApiKey: 'hidden' };
      }
    });
    fetchPlatformAdminSettingsSafe.mockResolvedValue({
      storeName: 'Test Store',
      currency: 'BDT',
      password: 'never'
    });
    sidebarRepo.findAllMap.mockResolvedValue({ dashboard: 'Home' });
    categoryRepo.findAll.mockResolvedValue([
      { slug: 'electronics', name: 'Electronics', position: 1, isActive: true }
    ]);

    const payload = await buildSettingsExportPayload({ username: 'admin' });

    expect(payload.version).toBe(1);
    expect(payload.settings.smsApiKey).toBeUndefined();
    expect(payload.platform.storeName).toBe('Test Store');
    expect(payload.platform.password).toBeUndefined();
    expect(payload.sidebarLabels.dashboard).toBe('Home');
    expect(payload.categories).toHaveLength(1);
  });

  test('applySettingsImportPayload merges allowlisted settings only', async () => {
    const markModified = jest.fn();
    const save = jest.fn().mockResolvedValue(undefined);
    Settings.getOrCreate.mockResolvedValue({
      shopHomeCity: 'Old City',
      notificationSettings: {},
      markModified,
      save,
      toObject() {
        return { shopHomeCity: 'Dhaka' };
      }
    });
    sidebarRepo.bulkUpsertLabels.mockResolvedValue({ saved: 1 });
    categoryRepo.findBySlug.mockResolvedValue(null);

    const summary = await applySettingsImportPayload({
      version: 1,
      settings: {
        shopHomeCity: 'Dhaka',
        smsApiKey: 'must-be-ignored',
        orderPrefix: 'EOB'
      },
      sidebarLabels: { orders: 'Sales' },
      categories: [{ slug: 'missing', name: 'Ghost' }],
      platform: { storeName: 'Imported Store', apiSecret: 'nope' }
    }, { username: 'admin', actorId: 'admin' });

    expect(summary.settingsFields).toBeGreaterThanOrEqual(2);
    expect(summary.sidebarLabelsSaved).toBe(1);
    expect(save).toHaveBeenCalled();
  });
});
