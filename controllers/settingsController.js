/********************************************************************
 * Project: EonlineBazar
 * File: settingsController.js
 * Location: controllers/settingsController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin API for delivery charge & free-shipping settings.
 ********************************************************************/

const Settings = require('../models/Settings');
const Setting = require('../models/Setting');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { toPublicSettings, resolveDistrictLabel } = require('../utils/deliveryChargeService');
const { isValidDistrict, BANGLADESH_DISTRICTS } = require('../utils/bangladeshDistricts');
const {
    invalidateRateLimitCache,
    getPublicRateLimitSettings,
    loadRateLimitSettings
} = require('../middleware/rateLimiter');

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
        const settings = await Settings.getOrCreate();
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
        await settings.save();

        // Master Settings owns the threshold for the announcement and the
        // storefront badges; mirror it here so both cards always agree.
        const masterSettings = await Setting.getOrCreate();
        if (Number(masterSettings.freeShippingThreshold) !== freeShipping.value) {
            masterSettings.freeShippingThreshold = freeShipping.value;
            masterSettings.announcementDiscount = String(freeShipping.value);
            await masterSettings.save();
        }

        await logSecurityEvent({
            action: 'Delivery Settings Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Home city: ${shopHomeCity}, Inside: ${inside.value}, Outside: ${outside.value}, Free shipping min: ${freeShipping.value}`
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
        await settings.save();

        await logSecurityEvent({
            action: 'Service Worker Cache Settings Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Service worker cache ${settings.serviceWorkerEnabled ? 'enabled' : 'disabled'}`
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Update Cache Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update cache settings.' });
    }
};

module.exports = {
    getSettings,
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

            await settings.save();
            invalidateRateLimitCache();

            await logSecurityEvent({
                action: 'Rate Limit Settings Updated',
                actor: req.admin?.username || 'admin',
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: `Enabled: ${settings.rateLimitEnabled}, Max: ${settings.rateLimitMaxRequests}/${settings.rateLimitWindowMs}ms, Bypass admin/localhost: ${settings.bypassAdminAndLocalhost}`
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
    }
};
