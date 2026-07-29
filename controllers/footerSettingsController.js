/********************************************************************
 * Project: EonlineBazar
 * File: footerSettingsController.js
 * Location: controllers/footerSettingsController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin CRUD and public read for dynamic footer settings.
 ********************************************************************/

const FooterSettings = require('../models/FooterSettings');
const { DEFAULT_COPYRIGHT } = require('../models/FooterSettings');
const { footerIconPublicPath } = require('../utils/footerIconPaths');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { invalidate, CACHE_KEYS } = require('../utils/cacheService');

const MAX_COLUMNS = 8;
const MAX_LINKS_PER_COLUMN = 20;
const MAX_SOCIAL_LINKS = 20;
const MAX_PAYMENT_BADGES = 20;

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const str = String(value).trim().toLowerCase();
    return str === 'true' || str === 'on' || str === '1' || str === 'yes';
}

function readString(value, max) {
    const str = String(value ?? '').trim();
    return max ? str.slice(0, max) : str;
}

function normalizeLink(link = {}) {
    return {
        label: readString(link.label, 80),
        url: readString(link.url, 500) || '#',
        isExternal: parseBoolean(link.isExternal, false),
        isActive: parseBoolean(link.isActive, true)
    };
}

function normalizeColumn(col = {}) {
    const links = Array.isArray(col.links) ? col.links.slice(0, MAX_LINKS_PER_COLUMN) : [];
    return {
        columnTitle: readString(col.columnTitle, 60),
        isActive: parseBoolean(col.isActive, true),
        sortOrder: Math.max(0, Math.min(9999, Number(col.sortOrder) || 0)),
        links: links.map(normalizeLink).filter((link) => link.label)
    };
}

function normalizeSocialLink(item = {}) {
    return {
        platform: readString(item.platform, 40),
        iconName: readString(item.iconName, 40),
        iconUrl: readString(item.iconUrl, 500),
        linkUrl: readString(item.linkUrl, 500) || '#',
        isActive: parseBoolean(item.isActive, true),
        sortOrder: Math.max(0, Math.min(9999, Number(item.sortOrder) || 0))
    };
}

function normalizePaymentBadge(item = {}) {
    return {
        name: readString(item.name, 60),
        iconUrl: readString(item.iconUrl, 500),
        iconName: readString(item.iconName, 40),
        isActive: parseBoolean(item.isActive, true),
        sortOrder: Math.max(0, Math.min(9999, Number(item.sortOrder) || 0))
    };
}

function validateFooterPayload(body = {}) {
    const errors = [];

    if (body.copyrightText !== undefined) {
        const text = readString(body.copyrightText, 300);
        if (!text) errors.push('Copyright text cannot be empty.');
    }

    if (body.columns !== undefined) {
        if (!Array.isArray(body.columns)) {
            errors.push('Columns must be an array.');
        } else if (body.columns.length > MAX_COLUMNS) {
            errors.push(`Maximum ${MAX_COLUMNS} footer columns allowed.`);
        } else {
            body.columns.forEach((col, index) => {
                if (!readString(col.columnTitle, 60)) {
                    errors.push(`Column ${index + 1} requires a title.`);
                }
            });
        }
    }

    if (body.socialLinks !== undefined && !Array.isArray(body.socialLinks)) {
        errors.push('Social links must be an array.');
    } else if (Array.isArray(body.socialLinks) && body.socialLinks.length > MAX_SOCIAL_LINKS) {
        errors.push(`Maximum ${MAX_SOCIAL_LINKS} social links allowed.`);
    }

    if (body.paymentGateways !== undefined && !Array.isArray(body.paymentGateways)) {
        errors.push('Payment gateways must be an array.');
    } else if (Array.isArray(body.paymentGateways) && body.paymentGateways.length > MAX_PAYMENT_BADGES) {
        errors.push(`Maximum ${MAX_PAYMENT_BADGES} payment badges allowed.`);
    }

    return errors;
}

const getAdminFooterSettings = async (req, res) => {
    try {
        const doc = await FooterSettings.getOrCreate();
        res.status(200).json({ success: true, data: doc.toAdminObject() });
    } catch (error) {
        console.error('Get Footer Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load footer settings.' });
    }
};

const getPublicFooterSettings = async (req, res) => {
    try {
        const doc = await FooterSettings.getOrCreate();
        res.status(200).json({ success: true, data: doc.toPublicObject() });
    } catch (error) {
        console.error('Get Public Footer Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load footer settings.' });
    }
};

const updateFooterSettings = async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const errors = validateFooterPayload(body);
        if (errors.length) {
            return res.status(400).json({ success: false, message: errors[0], errors });
        }

        const doc = await FooterSettings.getOrCreate();

        if (body.copyrightText !== undefined) {
            doc.copyrightText = readString(body.copyrightText, 300) || DEFAULT_COPYRIGHT;
        }

        if (Array.isArray(body.columns)) {
            doc.columns = body.columns
                .slice(0, MAX_COLUMNS)
                .map(normalizeColumn)
                .filter((col) => col.columnTitle);
        }

        if (Array.isArray(body.socialLinks)) {
            doc.socialLinks = body.socialLinks
                .slice(0, MAX_SOCIAL_LINKS)
                .map(normalizeSocialLink)
                .filter((item) => item.platform);
        }

        if (Array.isArray(body.paymentGateways)) {
            doc.paymentGateways = body.paymentGateways
                .slice(0, MAX_PAYMENT_BADGES)
                .map(normalizePaymentBadge)
                .filter((item) => item.name);
        }

        await doc.save();
        await invalidate(CACHE_KEYS.FOOTER_SETTINGS);

        await logSecurityEvent({
            actor: req.admin?.username || req.admin?.email || 'admin',
            actorType: 'admin',
            action: 'Footer Settings Updated',
            ipAddress: getClientIp(req),
            details: 'Footer columns, social links, copyright, or payment badges updated.'
        });

        res.status(200).json({
            success: true,
            message: 'Footer settings saved successfully.',
            data: doc.toAdminObject()
        });
    } catch (error) {
        console.error('Update Footer Settings Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save footer settings.' });
    }
};

const uploadFooterIcon = async (req, res) => {
    try {
        const file = req.file;
        if (!file?.filename) {
            return res.status(400).json({ success: false, message: 'No icon file uploaded.' });
        }

        const iconUrl = footerIconPublicPath(file.filename);
        res.status(200).json({
            success: true,
            message: 'Icon uploaded successfully.',
            data: { iconUrl }
        });
    } catch (error) {
        console.error('Upload Footer Icon Error:', error);
        res.status(500).json({ success: false, message: 'Failed to upload icon.' });
    }
};

module.exports = {
    getAdminFooterSettings,
    getPublicFooterSettings,
    updateFooterSettings,
    uploadFooterIcon
};
