/********************************************************************
 * Dashboard quick actions — maintenance status & toggle
 ********************************************************************/

jest.mock('../backend/src/services/settingsReadService', () => ({
    fetchSettingsDocumentSafe: jest.fn()
}));

jest.mock('../backend/src/services/settingsService', () => ({
    saveSettings: jest.fn()
}));

jest.mock('../backend/src/utils/securityLogger', () => ({
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
    getClientIp: jest.fn().mockReturnValue('127.0.0.1')
}));

jest.mock('../backend/src/middlewares/maintenanceModeMiddleware', () => ({
    invalidateMaintenanceCache: jest.fn()
}));

jest.mock('../backend/src/models/admin', () => ({
    findById: jest.fn()
}));

jest.mock('../backend/src/services/dualWriteService', () => ({
    dualWrite: jest.fn(async (mongoFn, pgFn) => {
        const result = await mongoFn();
        await pgFn(result);
        return result;
    })
}));

jest.mock('../backend/src/repositories/adminRepository', () => ({
    updateByLegacyId: jest.fn().mockResolvedValue({})
}));

const { fetchSettingsDocumentSafe } = require('../backend/src/services/settingsReadService');
const { saveSettings } = require('../backend/src/services/settingsService');
const Admin = require('../backend/src/models/admin');
const { dualWrite } = require('../backend/src/services/dualWriteService');
const adminRepository = require('../backend/src/repositories/adminRepository');
const {
    getQuickActionsStatus,
    toggleMaintenanceMode,
    getQuickActionPreferences,
    saveQuickActionPreferences
} = require('../backend/src/controllers/admin/dashboardQuickActionsController');

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('dashboardQuickActionsController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('getQuickActionsStatus returns maintenance flag', async () => {
        fetchSettingsDocumentSafe.mockResolvedValue({ maintenanceMode: true });
        const res = mockRes();

        await getQuickActionsStatus({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { maintenanceMode: true }
        });
    });

    test('getQuickActionPreferences returns sanitized pinned ids', async () => {
        Admin.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    quickActionPreferences: ['create-order', 'invalid-id', 'add-product']
                })
            })
        });

        const res = mockRes();
        await getQuickActionPreferences({ adminId: '507f1f77bcf86cd799439011' }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { pinnedIds: ['create-order', 'add-product'] }
        });
    });

    test('saveQuickActionPreferences persists via dual-write', async () => {
        const saveMock = jest.fn().mockResolvedValue(undefined);
        Admin.findById.mockResolvedValue({
            quickActionPreferences: [],
            save: saveMock
        });

        const res = mockRes();
        await saveQuickActionPreferences({
            adminId: '507f1f77bcf86cd799439011',
            body: { pinnedIds: ['open-pos', 'create-order'] }
        }, res);

        expect(dualWrite).toHaveBeenCalled();
        expect(saveMock).toHaveBeenCalled();
        expect(adminRepository.updateByLegacyId).toHaveBeenCalledWith(
            '507f1f77bcf86cd799439011',
            { quickActionPreferences: ['open-pos', 'create-order'] }
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('toggleMaintenanceMode flips maintenance via saveSettings', async () => {
        saveSettings.mockImplementation(async ({ mutate }) => {
            const settings = { maintenanceMode: false };
            await mutate(settings);
            return { ok: true };
        });

        const res = mockRes();
        await toggleMaintenanceMode({ admin: { username: 'admin' }, adminId: '1' }, res);

        expect(saveSettings).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { maintenanceMode: true }
        });
    });
});
