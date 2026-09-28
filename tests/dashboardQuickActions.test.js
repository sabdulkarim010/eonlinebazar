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

const { fetchSettingsDocumentSafe } = require('../backend/src/services/settingsReadService');
const { saveSettings } = require('../backend/src/services/settingsService');
const {
    getQuickActionsStatus,
    toggleMaintenanceMode
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
