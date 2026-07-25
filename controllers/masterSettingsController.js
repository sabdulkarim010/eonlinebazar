/********************************************************************
 * Project: EonlineBazar
 * File: masterSettingsController.js
 * Location: controllers/masterSettingsController.js
 * Description: Admin API for the unified Store Settings Engine —
 * announcement, free-shipping threshold, cashback, loyalty points and
 * refund window are all read and written through one save action.
 ********************************************************************/

const Setting = require('../models/Setting');
const Settings = require('../models/Settings');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { normalizeRewardSettings } = require('../utils/rewardSettings');
const {
    normalizeAnnouncementSettings,
    toPublicAnnouncementPayload
} = require('../utils/announcementSettings');

const VALID_SMS_GATEWAY_PROVIDERS = ['Greenweb BD', 'BulkSMS BD', 'AlphaSMS', 'Generic API', ''];

const toPublicSmsSettings = (deliverySettings = {}) => ({
    smsGatewayProvider: deliverySettings.smsGatewayProvider || '',
    smsApiKey: deliverySettings.smsApiKey || '',
    smsSenderId: deliverySettings.smsSenderId || ''
});

const toPublicMasterSettings = (doc) => normalizeRewardSettings(doc);

/**
 * The Admin Panel and older integrations use different names for the same
 * value. Both are accepted on write and both are echoed on read.
 */
const FIELD_ALIASES = {
    cashbackPercentage: ['cashbackPercentage', 'orderCashbackPercent'],
    takaToPointsRatio: ['takaToPointsRatio', 'pointsPerTaka'],
    pointsToTakaConversionRate: ['pointsToTakaConversionRate', 'pointsConversionRate'],
    refundUndoWindowHours: ['refundUndoWindowHours', 'refundUndoWindow'],
    freeShippingThreshold: ['freeShippingThreshold', 'freeShippingMinAmount', 'freeShippingLimit']
};

const NUMERIC_FIELD_RULES = {
    cashbackPercentage: { label: 'Cashback percentage', min: 0, max: 100 },
    takaToPointsRatio: { label: 'Points earned per taka spent', min: 0 },
    pointsToTakaConversionRate: { label: 'Points conversion rate', min: 0 },
    refundUndoWindowHours: { label: 'Refund undo window (hours)', min: 0 },
    freeShippingThreshold: { label: 'Free shipping threshold', min: 0 }
};

/**
 * Reads a canonical field from the request body, honouring every alias.
 * Returns `undefined` when the caller sent none of them, which is how
 * partial saves (e.g. the legacy announcement-only endpoint) avoid wiping
 * settings they never intended to touch.
 */
const readAliasedField = (body, canonicalKey) => {
    for (const alias of FIELD_ALIASES[canonicalKey]) {
        if (body[alias] !== undefined && body[alias] !== null && body[alias] !== '') {
            return body[alias];
        }
    }
    return undefined;
};

const parsePositiveNumber = (value, fieldLabel, { min = 0, max = null, required = true } = {}) => {
    if (value === undefined || value === null || value === '') {
        return required ? { error: `${fieldLabel} is required.` } : { value: min };
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return { error: `${fieldLabel} must be a valid number.` };
    }
    if (parsed < min) {
        return { error: `${fieldLabel} must be at least ${min}.` };
    }
    if (max !== null && parsed > max) {
        return { error: `${fieldLabel} must be at most ${max}.` };
    }

    return { value: parsed };
};

const parseBoolean = (value, fallback = true) => {
    if (value === undefined || value === null || value === '') return fallback;
    return value !== false && value !== 'false' && value !== 0 && value !== '0';
};

/**
 * Keeps the legacy delivery document in step with the master threshold, so
 * order placement (which reads Settings.freeShippingMinAmount) and the Admin
 * Panel's Delivery Settings card never drift from Master Settings.
 */
const mirrorThresholdToDeliverySettings = async (threshold) => {
    // A never-configured threshold is null, and Number(null) is 0 — mirroring
    // that would hand every order free shipping.
    if (threshold === null || threshold === undefined || !Number.isFinite(Number(threshold))) return;

    const deliverySettings = await Settings.getOrCreate();
    if (Number(deliverySettings.freeShippingMinAmount) === threshold) return;

    deliverySettings.freeShippingMinAmount = threshold;
    await deliverySettings.save();
};

/**
 * The complete settings payload every consumer reads: rewards, announcement,
 * the resolved free-shipping threshold, and the alias names.
 */
const buildUnifiedPayload = async (settingsDoc) => {
    const deliverySettings = await Settings.getOrCreate();
    const rewards = toPublicMasterSettings(settingsDoc);
    const announcement = normalizeAnnouncementSettings(
        settingsDoc,
        deliverySettings.freeShippingMinAmount
    );

    return {
        ...rewards,
        ...announcement,
        ...toPublicAnnouncementPayload(announcement, rewards),
        deliveryInsideCity: deliverySettings.deliveryInsideCity,
        deliveryOutsideCity: deliverySettings.deliveryOutsideCity,
        freeShippingMinAmount: announcement.freeShippingThreshold,
        orderCashbackPercent: rewards.cashbackPercentage,
        pointsPerTaka: rewards.takaToPointsRatio,
        pointsConversionRate: rewards.pointsToTakaConversionRate,
        refundUndoWindow: rewards.refundUndoWindowHours,
        enableSmsNotifications: settingsDoc.enableSmsNotifications === true,
        ...toPublicSmsSettings(deliverySettings)
    };
};

const getMasterSettings = async (req, res) => {
    try {
        const settings = await Setting.getOrCreate();
        res.status(200).json({ success: true, data: await buildUnifiedPayload(settings) });
    } catch (error) {
        console.error('Get Master Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load master settings.' });
    }
};

const getAnnouncementSettings = async (req, res) => {
    try {
        const settings = await Setting.getOrCreate();
        res.status(200).json({ success: true, data: await buildUnifiedPayload(settings) });
    } catch (error) {
        console.error('Get Announcement Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load announcement settings.' });
    }
};

/**
 * Single save action behind every settings route. Only the fields present in
 * the request body are written, so the unified form, the legacy rewards-only
 * form, and the legacy announcement-only form can all share this handler
 * without one erasing another's values.
 */
const saveMasterSettings = async (req, res, { scope = 'Master' } = {}) => {
    const body = req.body || {};
    const settings = await Setting.getOrCreate();
    const changes = [];

    for (const [canonicalKey, rule] of Object.entries(NUMERIC_FIELD_RULES)) {
        const raw = readAliasedField(body, canonicalKey);
        if (raw === undefined) continue;

        const parsed = parsePositiveNumber(raw, rule.label, { min: rule.min, max: rule.max ?? null });
        if (parsed.error) {
            return res.status(400).json({ success: false, message: parsed.error });
        }

        settings[canonicalKey] = parsed.value;
        changes.push(`${rule.label}: ${parsed.value}`);
    }

    if (body.announcementText !== undefined) {
        settings.announcementText = String(body.announcementText ?? '').trim();
        changes.push(`Custom text: ${settings.announcementText ? 'yes' : 'no'}`);
    }

    if (body.isAnnouncementActive !== undefined) {
        settings.isAnnouncementActive = parseBoolean(body.isAnnouncementActive);
        changes.push(`Announcement active: ${settings.isAnnouncementActive}`);
    }

    if (body.enableSmsNotifications !== undefined) {
        settings.enableSmsNotifications = parseBoolean(body.enableSmsNotifications, false);
        changes.push(`SMS notifications: ${settings.enableSmsNotifications}`);
    }

    const deliverySettings = await Settings.getOrCreate();

    if (body.smsGatewayProvider !== undefined) {
        const provider = String(body.smsGatewayProvider || '').trim();
        if (provider && !VALID_SMS_GATEWAY_PROVIDERS.includes(provider)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid SMS gateway provider selected.'
            });
        }
        deliverySettings.smsGatewayProvider = provider;
        changes.push(`SMS gateway: ${provider || 'none'}`);
    }

    if (body.smsApiKey !== undefined) {
        deliverySettings.smsApiKey = String(body.smsApiKey ?? '').trim();
        changes.push('SMS API key updated');
    }

    if (body.smsSenderId !== undefined) {
        deliverySettings.smsSenderId = String(body.smsSenderId ?? '').trim();
        changes.push(`SMS sender ID: ${deliverySettings.smsSenderId || 'none'}`);
    }

    if (
        body.smsGatewayProvider !== undefined
        || body.smsApiKey !== undefined
        || body.smsSenderId !== undefined
    ) {
        await deliverySettings.save();
    }

    // The legacy free-text field stays in sync with the numeric threshold so
    // old announcement payloads keep resolving to the same offer.
    const hasNonNumericDiscount = body.announcementDiscount !== undefined
        && Number.isNaN(Number(body.announcementDiscount));
    if (hasNonNumericDiscount) {
        settings.announcementDiscount = String(body.announcementDiscount).trim();
    } else if (settings.freeShippingThreshold !== null && settings.freeShippingThreshold !== undefined) {
        settings.announcementDiscount = String(settings.freeShippingThreshold);
    }

    if (changes.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No settings were provided to update.'
        });
    }

    await settings.save();
    await mirrorThresholdToDeliverySettings(settings.freeShippingThreshold);

    await logSecurityEvent({
        action: `${scope} Settings Updated`,
        actor: req.admin?.username || 'admin',
        actorType: 'admin',
        ipAddress: getClientIp(req),
        details: changes.join(', ')
    });

    return res.status(200).json({
        success: true,
        message: 'Master settings saved successfully.',
        data: await buildUnifiedPayload(settings)
    });
};

const updateMasterSettings = async (req, res) => {
    try {
        return await saveMasterSettings(req, res, { scope: 'Master' });
    } catch (error) {
        console.error('Update Master Settings Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update master settings.' });
    }
};

const updateAnnouncementSettings = async (req, res) => {
    try {
        return await saveMasterSettings(req, res, { scope: 'Announcement' });
    } catch (error) {
        console.error('Update Announcement Settings Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update announcement settings.' });
    }
};

module.exports = {
    getMasterSettings,
    updateMasterSettings,
    getAnnouncementSettings,
    updateAnnouncementSettings,
    buildUnifiedPayload,
    toPublicMasterSettings
};
