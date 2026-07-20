/********************************************************************
 * Project: EonlineBazar
 * File: settingsController.js
 * Location: controllers/settingsController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin API for delivery charge & free-shipping settings.
 ********************************************************************/

const Settings = require('../models/Settings');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { toPublicSettings, resolveDistrictLabel } = require('../utils/deliveryChargeService');
const { isValidDistrict, BANGLADESH_DISTRICTS } = require('../utils/bangladeshDistricts');

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

module.exports = {
    getSettings,
    updateSettings,
    getDistrictOptions: (req, res) => {
        res.status(200).json({ success: true, data: BANGLADESH_DISTRICTS });
    }
};
