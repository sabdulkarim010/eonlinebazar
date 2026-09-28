/********************************************************************
 * Project: EonlineBazar — Admin Dashboard Quick Actions (Phase 4.1)
 * File: dashboardQuickActionsController.js
 * Description: Lightweight status + maintenance toggle for overview toolbar.
 ********************************************************************/

'use strict';

const Admin = require('../../models/admin');
const { fetchSettingsDocumentSafe } = require('../../services/settingsReadService');
const { saveSettings } = require('../../services/settingsService');
const { dualWrite } = require('../../services/dualWriteService');
const adminRepository = require('../../repositories/adminRepository');
const {
    DEFAULT_QUICK_ACTION_PREFERENCES,
    sanitizeQuickActionPreferences
} = require('../../config/dashboardQuickActions');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

function resolveAdminMongoId(req) {
    if (req.adminId != null) return String(req.adminId);
    if (req.adminAccount?._id != null) return String(req.adminAccount._id);
    if (req.admin?._id != null) return String(req.admin._id);
    return null;
}

async function getQuickActionPreferences(req, res) {
    try {
        const mongoId = resolveAdminMongoId(req);
        if (!mongoId) {
            return res.status(401).json({ success: false, message: 'Admin session required.' });
        }

        const admin = await Admin.findById(mongoId).select('quickActionPreferences').lean();
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin account not found.' });
        }

        const pinnedIds = sanitizeQuickActionPreferences(admin.quickActionPreferences);

        return res.status(200).json({
            success: true,
            data: { pinnedIds }
        });
    } catch (error) {
        console.error('getQuickActionPreferences Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load quick action preferences.'
        });
    }
}

async function saveQuickActionPreferences(req, res) {
    try {
        const mongoId = resolveAdminMongoId(req);
        if (!mongoId) {
            return res.status(401).json({ success: false, message: 'Admin session required.' });
        }

        const pinnedIds = sanitizeQuickActionPreferences(req.body?.pinnedIds);

        await dualWrite(
            async () => {
                const admin = await Admin.findById(mongoId);
                if (!admin) {
                    const err = new Error('Admin account not found.');
                    err.status = 404;
                    throw err;
                }
                admin.quickActionPreferences = pinnedIds;
                await admin.save();
                return admin;
            },
            async () => {
                await adminRepository.updateByLegacyId(mongoId, { quickActionPreferences: pinnedIds });
            },
            {
                model: 'Admin',
                operation: 'update',
                source: 'dashboard-quick-actions',
                mongoId
            }
        );

        return res.status(200).json({
            success: true,
            data: { pinnedIds }
        });
    } catch (error) {
        if (error.status === 404) {
            return res.status(404).json({ success: false, message: error.message });
        }
        console.error('saveQuickActionPreferences Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to save quick action preferences.'
        });
    }
}

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
    toggleMaintenanceMode,
    getQuickActionPreferences,
    saveQuickActionPreferences,
    DEFAULT_QUICK_ACTION_PREFERENCES
};
