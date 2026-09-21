/********************************************************************
 * Project: EonlineBazar
 * File: settingsController.js
 * Location: controllers/settingsController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin API for delivery charge & free-shipping settings.
 ********************************************************************/

const Settings = require('../models/Settings');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { toPublicSettings, resolveDistrictLabel } = require('../services/deliveryChargeService');
const { normalizeRewardSettings } = require('../utils/rewardSettings');
const { isValidDistrict, BANGLADESH_DISTRICTS } = require('../utils/bangladeshDistricts');
const {
    invalidateRateLimitCache,
    getPublicRateLimitSettings,
    loadRateLimitSettings
} = require('../middlewares/rateLimiter');
const { dualWrite } = require('../services/dualWriteService');
const { fetchSettingsDocument } = require('../services/settingsReadService');

function getSettingsRepository() {
    return require('../repositories/settingsRepository');
}

async function dualWriteSettingsUpsert(settings) {
    await dualWrite(
        () => settings.save(),
        async (saved) => {
            const plain = saved.toObject ? saved.toObject() : saved;
            await getSettingsRepository().upsertFromMongo(plain);
        },
        {
            model: 'Settings',
            operation: 'update',
            mongoId: (saved) => String(saved._id)
        }
    );
}

const parseNonNegativeNumber = (value, fieldLabel) => {
    if (value === undefined || value === null || value === '') {
        return { error: `${fieldLabel} is required.` };
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return { error: `${fieldLabel} must be a non-negative number.` };
    }

    return { value: parsed };
};

const getSettings = async (req, res) => {
    try {
        const settings = await fetchSettingsDocument();
        res.status(200).json({ success: true, data: toPublicSettings(settings) });
    } catch (error) {
        console.error('Get Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load delivery settings.' });
    }
};

const updateSettings = async (req, res) => {
    try {
        const shopHomeCity = resolveDistrictLabel(req.body.shopHomeCity);
        if (!shopHomeCity || !isValidDistrict(shopHomeCity)) {
            return res.status(400).json({
                success: false,
                message: 'Please select a valid shop home city / district.'
            });
        }

        const inside = parseNonNegativeNumber(req.body.deliveryInsideCity, 'Inside city charge');
        if (inside.error) {
            return res.status(400).json({ success: false, message: inside.error });
        }

        const outside = parseNonNegativeNumber(req.body.deliveryOutsideCity, 'Outside city charge');
        if (outside.error) {
            return res.status(400).json({ success: false, message: outside.error });
        }

        const freeShipping = parseNonNegativeNumber(req.body.freeShippingMinAmount, 'Free shipping minimum amount');
        if (freeShipping.error) {
            return res.status(400).json({ success: false, message: freeShipping.error });
        }

        const settings = await Settings.getOrCreate();
        settings.shopHomeCity = shopHomeCity;
        settings.deliveryInsideCity = inside.value;
        settings.deliveryOutsideCity = outside.value;
        settings.freeShippingMinAmount = freeShipping.value;
        settings.freeShippingThreshold = freeShipping.value;
        settings.announcementDiscount = String(freeShipping.value);
        await dualWriteSettingsUpsert(settings);

        await logSecurityEvent({
            action: 'Delivery Settings Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Home city: ${shopHomeCity}, Inside: ${inside.value}, Outside: ${outside.value}, Free shipping min: ${freeShipping.value}`,
            resourceType: 'setting',
            resourceId: 'delivery'
        });

        res.status(200).json({
            success: true,
            message: 'Delivery settings updated successfully.',
            data: toPublicSettings(settings)
        });
    } catch (error) {
        console.error('Update Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update delivery settings.' });
    }
};

const updateCacheSettings = async (req, res) => {
    try {
        const enabled = req.body.serviceWorkerEnabled;
        if (enabled === undefined) {
            return res.status(400).json({
                success: false,
                message: 'serviceWorkerEnabled is required.'
            });
        }

        const settings = await Settings.getOrCreate();
        settings.serviceWorkerEnabled = enabled !== false && enabled !== 'false' && enabled !== 0 && enabled !== '0';
        await dualWriteSettingsUpsert(settings);

        await logSecurityEvent({
            action: 'Service Worker Cache Settings Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Service worker cache ${settings.serviceWorkerEnabled ? 'enabled' : 'disabled'}`,
            resourceType: 'setting',
            resourceId: 'cache'
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Update Cache Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update cache settings.' });
    }
};

/**
 * GET /api/admin/all-settings
 * Unified read layer — single Settings singleton (consolidated 2026-09-12).
 */
const getAllSettings = async (req, res) => {
    try {
        const doc = await fetchSettingsDocument();

        res.status(200).json({
            success: true,
            data: {
                global: toPublicSettings(doc),
                master: normalizeRewardSettings(doc)
            },
            meta: {
                model: 'Settings.js — consolidated singleton (delivery, loyalty, SMS, courier, flash sale)',
                migration: 'Run scripts/mergeSettingsModels.js once if upgrading from dual Setting/Settings layout.'
            }
        });
    } catch (error) {
        console.error('Get All Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load unified settings.' });
    }
};

module.exports = {
    getSettings,
    getAllSettings,
    updateSettings,
    updateCacheSettings,
    getDistrictOptions: (req, res) => {
        res.status(200).json({ success: true, data: BANGLADESH_DISTRICTS });
    },
    getRateLimitSettings: async (req, res) => {
        try {
            const settings = await loadRateLimitSettings(true);
            res.status(200).json({ success: true, data: getPublicRateLimitSettings(settings) });
        } catch (error) {
            console.error('Get Rate Limit Settings Error:', error);
            res.status(500).json({ success: false, message: 'Failed to load rate limit settings.' });
        }
    },
    updateRateLimitSettings: async (req, res) => {
        try {
            const enabled = req.body.rateLimitEnabled;
            const bypass = req.body.bypassAdminAndLocalhost;
            const windowMs = Number(req.body.rateLimitWindowMs);
            const maxRequests = Number(req.body.rateLimitMaxRequests);

            if (req.body.rateLimitWindowMs !== undefined && (!Number.isFinite(windowMs) || windowMs < 60000)) {
                return res.status(400).json({
                    success: false,
                    message: 'Rate limit window must be at least 60 seconds (60000 ms).'
                });
            }

            if (req.body.rateLimitMaxRequests !== undefined && (!Number.isFinite(maxRequests) || maxRequests < 1)) {
                return res.status(400).json({
                    success: false,
                    message: 'Max requests must be at least 1.'
                });
            }

            const settings = await Settings.getOrCreate();

            if (enabled !== undefined) {
                settings.rateLimitEnabled = enabled !== false && enabled !== 'false' && enabled !== 0 && enabled !== '0';
            }
            if (bypass !== undefined) {
                settings.bypassAdminAndLocalhost = bypass !== false && bypass !== 'false' && bypass !== 0 && bypass !== '0';
            }
            if (req.body.rateLimitWindowMs !== undefined) settings.rateLimitWindowMs = windowMs;
            if (req.body.rateLimitMaxRequests !== undefined) settings.rateLimitMaxRequests = maxRequests;

            await dualWriteSettingsUpsert(settings);
            invalidateRateLimitCache();

            await logSecurityEvent({
                action: 'Rate Limit Settings Updated',
                actor: req.admin?.username || 'admin',
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: `Enabled: ${settings.rateLimitEnabled}, Max: ${settings.rateLimitMaxRequests}/${settings.rateLimitWindowMs}ms, Bypass admin/localhost: ${settings.bypassAdminAndLocalhost}`,
                resourceType: 'setting',
                resourceId: 'rate-limit'
            });

            res.status(200).json({
                success: true,
                message: 'Rate limiting settings saved.',
                data: getPublicRateLimitSettings({
                    rateLimitEnabled: settings.rateLimitEnabled,
                    rateLimitWindowMs: settings.rateLimitWindowMs,
                    rateLimitMaxRequests: settings.rateLimitMaxRequests,
                    bypassAdminAndLocalhost: settings.bypassAdminAndLocalhost
                })
            });
        } catch (error) {
            console.error('Update Rate Limit Settings Error:', error);
            res.status(500).json({ success: false, message: 'Failed to update rate limit settings.' });
        }
    },

    getGatewayStatus: async (req, res) => {
        try {
            const { getGatewayStatus } = require('../services/gatewayStatusService');
            const data = await getGatewayStatus();
            return res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Gateway Status Error:', error);
            const { DEFAULT_GATEWAY_STATUS } = require('../services/gatewayStatusService');
            return res.status(200).json({
                success: true,
                data: { ...DEFAULT_GATEWAY_STATUS, checkedAt: new Date().toISOString() }
            });
        }
    },

    getNotificationConfig: async (req, res) => {
        try {
            const { getNotificationConfig } = require('../services/notificationConfigService');
            const data = await getNotificationConfig();
            return res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Notification Config Error:', error);
            return res.status(500).json({ success: false, message: 'Failed to load notification settings.' });
        }
    },

    saveNotificationConfig: async (req, res) => {
        try {
            const { saveNotificationConfig } = require('../services/notificationConfigService');
            const data = await saveNotificationConfig(req.body || {});

            await logSecurityEvent({
                action: 'Notification Settings Updated',
                actor: req.admin?.username || 'admin',
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: `Email provider: ${data.emailProvider || 'resend'}`,
                resourceType: 'setting',
                resourceId: 'notifications'
            });

            return res.status(200).json({
                success: true,
                message: 'Notification settings saved.',
                data
            });
        } catch (error) {
            console.error('Save Notification Config Error:', error);
            return res.status(400).json({ success: false, message: error.message || 'Failed to save notification settings.' });
        }
    },

    testNotificationEmail: async (req, res) => {
        try {
            const { sendTestEmail } = require('../services/notificationConfigService');
            const adminEmail = req.body?.email
                || req.adminAccount?.email
                || process.env.ADMIN_ALERT_EMAIL
                || process.env.SMTP_USER;
            const result = await sendTestEmail(adminEmail);
            return res.status(result.success ? 200 : 502).json({ success: result.success, ...result });
        } catch (error) {
            console.error('Test Notification Email Error:', error);
            return res.status(500).json({ success: false, message: error.message || 'Test email failed.' });
        }
    },

    getWhatsAppConnectionStatus: async (req, res) => {
        try {
            const { getWhatsAppStatus } = require('../services/whatsappService');
            const data = getWhatsAppStatus();
            return res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('WhatsApp Status Error:', error);
            return res.status(200).json({
                success: true,
                data: { status: 'disconnected', hasQR: false, qrDataURL: null }
            });
        }
    },

    enableWhatsAppNotifications: async (req, res) => {
        try {
            const { enableWhatsAppConnection } = require('../services/notificationConfigService');
            const data = await enableWhatsAppConnection();
            return res.status(200).json({
                success: true,
                message: 'WhatsApp enabled. Scan the QR code if prompted.',
                data
            });
        } catch (error) {
            console.error('Enable WhatsApp Error:', error);
            return res.status(500).json({ success: false, message: error.message || 'Failed to enable WhatsApp.' });
        }
    },

    disconnectWhatsAppNotifications: async (req, res) => {
        try {
            const { disableWhatsAppConnection } = require('../services/notificationConfigService');
            const data = await disableWhatsAppConnection();
            return res.status(200).json({
                success: true,
                message: 'WhatsApp disconnected.',
                data
            });
        } catch (error) {
            console.error('Disconnect WhatsApp Error:', error);
            return res.status(500).json({ success: false, message: error.message || 'Failed to disconnect WhatsApp.' });
        }
    },

    testNotificationWhatsApp: async (req, res) => {
        try {
            const { sendTestWhatsApp } = require('../services/notificationConfigService');
            const result = await sendTestWhatsApp();
            return res.status(result.success ? 200 : 502).json({ success: result.success, ...result });
        } catch (error) {
            console.error('Test WhatsApp Error:', error);
            return res.status(500).json({ success: false, message: error.message || 'Test WhatsApp failed.' });
        }
    },

    getAttendanceSettings: async (req, res) => {
        try {
            const { getAttendanceSettings } = require('../services/attendanceSettingsService');
            const data = await getAttendanceSettings();
            return res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get Attendance Settings Error:', error);
            return res.status(500).json({ success: false, message: 'Failed to load attendance settings.' });
        }
    },

    updateAttendanceSettings: async (req, res) => {
        try {
            const { saveAttendanceSettings } = require('../services/attendanceSettingsService');
            const data = await saveAttendanceSettings(req.body || {});

            await logSecurityEvent({
                action: 'Attendance Settings Updated',
                actor: req.admin?.username || 'admin',
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: `Office ${data.officeStart}-${data.officeEnd}, grace ${data.gracePeriodMinutes}min`,
                resourceType: 'setting',
                resourceId: 'attendance_settings'
            });

            return res.status(200).json({
                success: true,
                message: 'Attendance settings saved.',
                data
            });
        } catch (error) {
            console.error('Update Attendance Settings Error:', error);
            return res.status(500).json({ success: false, message: 'Failed to save attendance settings.' });
        }
    }
};
