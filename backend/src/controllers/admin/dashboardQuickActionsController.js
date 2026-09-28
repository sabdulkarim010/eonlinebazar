/********************************************************************
 * Project: EonlineBazar — Admin Dashboard Quick Actions (Phase 4.1)
 * File: dashboardQuickActionsController.js
 * Description: Lightweight status + maintenance toggle for overview toolbar.
 ********************************************************************/

'use strict';

const { fetchSettingsDocumentSafe } = require('../../services/settingsReadService');
const { saveSettings } = require('../../services/settingsService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

async function getQuickActionsStatus(req, res) {
    try {
        const doc = await fetchSettingsDocumentSafe();
        res.status(200).json({
            success: true,
            data: {
                maintenanceMode: doc?.maintenanceMode === true
            }
        });
    } catch (error) {
        console.error('getQuickActionsStatus Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load quick action status.'
        });
    }
}

async function toggleMaintenanceMode(req, res) {
    try {
        let nextMode = false;

        const result = await saveSettings({
            mutate: (settings) => {
                nextMode = !settings.maintenanceMode;
                settings.maintenanceMode = nextMode;
                return { maintenanceMode: nextMode };
            }
        });

        if (!result.ok) {
            return res.status(result.conflict ? 409 : 500).json({
                success: false,
                message: result.conflict
                    ? 'Settings were updated elsewhere. Refresh and try again.'
                    : 'Failed to update maintenance mode.'
            });
        }

        try {
            require('../../middlewares/maintenanceModeMiddleware').invalidateMaintenanceCache();
        } catch (_) { /* noop */ }

        await logSecurityEvent({
            action: 'MAINTENANCE_MODE_TOGGLED',
            actor: req.admin?.username || req.adminAccount?.username || 'admin',
            actorId: req.adminId != null ? String(req.adminId) : undefined,
            actorType: 'admin',
            ip: getClientIp(req),
            detail: `Maintenance mode ${nextMode ? 'ENABLED' : 'DISABLED'} via dashboard quick action`
        });

        res.status(200).json({
            success: true,
            data: {
                maintenanceMode: nextMode
            }
        });
    } catch (error) {
        console.error('toggleMaintenanceMode Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle maintenance mode.'
        });
    }
}

module.exports = {
    getQuickActionsStatus,
    toggleMaintenanceMode
};
