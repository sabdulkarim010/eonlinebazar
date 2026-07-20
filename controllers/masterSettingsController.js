/********************************************************************
 * Project: EonlineBazar
 * File: masterSettingsController.js
 * Location: controllers/masterSettingsController.js
 * Description: Admin API for global cashback, points, and refund settings.
 ********************************************************************/

const Setting = require('../models/Setting');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { normalizeRewardSettings } = require('../utils/rewardSettings');

const toPublicMasterSettings = (doc) => normalizeRewardSettings(doc);

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

const getMasterSettings = async (req, res) => {
    try {
        const settings = await Setting.getOrCreate();
        res.status(200).json({
            success: true,
            data: toPublicMasterSettings(settings)
        });
    } catch (error) {
        console.error('Get Master Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load master settings.' });
    }
};

const updateMasterSettings = async (req, res) => {
    try {
        const cashback = parsePositiveNumber(req.body.cashbackPercentage, 'Cashback percentage', { min: 0, max: 100 });
        if (cashback.error) {
            return res.status(400).json({ success: false, message: cashback.error });
        }

        const takaRatio = parsePositiveNumber(req.body.takaToPointsRatio, 'Points earned per taka spent', { min: 0 });
        if (takaRatio.error) {
            return res.status(400).json({ success: false, message: takaRatio.error });
        }

        const conversion = parsePositiveNumber(req.body.pointsToTakaConversionRate, 'Points conversion rate', { min: 0 });
        if (conversion.error) {
            return res.status(400).json({ success: false, message: conversion.error });
        }

        const refundWindow = parsePositiveNumber(req.body.refundUndoWindowHours, 'Refund undo window (hours)', { min: 0 });
        if (refundWindow.error) {
            return res.status(400).json({ success: false, message: refundWindow.error });
        }

        const settings = await Setting.getOrCreate();
        settings.cashbackPercentage = cashback.value;
        settings.takaToPointsRatio = takaRatio.value;
        settings.pointsToTakaConversionRate = conversion.value;
        settings.refundUndoWindowHours = refundWindow.value;
        await settings.save();

        await logSecurityEvent({
            action: 'Master Settings Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Cashback: ${cashback.value}%, Taka/Points: ${takaRatio.value}, Conversion: ${conversion.value}, Refund window: ${refundWindow.value}h`
        });

        res.status(200).json({
            success: true,
            message: 'Master settings saved successfully.',
            data: toPublicMasterSettings(settings)
        });
    } catch (error) {
        console.error('Update Master Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update master settings.' });
    }
};

module.exports = {
    getMasterSettings,
    updateMasterSettings,
    toPublicMasterSettings
};
