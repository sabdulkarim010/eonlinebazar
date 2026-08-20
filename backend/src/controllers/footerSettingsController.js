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
const { invalidate, CACHE_KEYS } = require('../services/cacheService');
const {
    ensurePagesForFooterColumns,
    resolveFooterPlaceholderUrlsAsync
} = require('../services/pagePublishService');

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

    if (body.paymentBadges !== undefined && !Array.isArray(body.paymentBadges)) {
        errors.push('Payment badges must be an array.');
    } else if (Array.isArray(body.paymentBadges) && body.paymentBadges.length > MAX_PAYMENT_BADGES) {
        errors.push(`Maximum ${MAX_PAYMENT_BADGES} payment badges allowed.`);
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

        // Auto-link empty/'#' routes to matching CMS pages (Privacy Policy → /privacy-policy).
        try {
            const { columns, changed } = await resolveFooterPlaceholderUrlsAsync(doc.columns);
            if (changed) {
                doc.columns = columns;
                doc.markModified('columns');
                await doc.save();
                await invalidate(CACHE_KEYS.FOOTER_SETTINGS);
            }
        } catch (healErr) {
            console.error('Footer CMS route auto-link failed:', healErr);
        }

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
            let columns = body.columns
                .slice(0, MAX_COLUMNS)
                .map(normalizeColumn)
                .filter((col) => col.columnTitle);

            // Replace placeholder '#' URLs with real CMS page routes when labels match.
            try {
                const healed = await resolveFooterPlaceholderUrlsAsync(columns);
                columns = healed.columns;
            } catch (healErr) {
                console.error('Footer CMS route auto-link on save failed:', healErr);
            }

            doc.columns = columns;
        }

        if (Array.isArray(body.socialLinks)) {
            doc.socialLinks = body.socialLinks
                .slice(0, MAX_SOCIAL_LINKS)
                .map(normalizeSocialLink)
                .filter((item) => item.platform);
        }

        if (body.paymentBadgesEnabled !== undefined) {
            doc.paymentBadgesEnabled = parseBoolean(body.paymentBadgesEnabled, true);
        }

        // Prefer full gateway badges (with icon uploads); fall back to name-only badges
        if (Array.isArray(body.paymentGateways)) {
            const gateways = body.paymentGateways
                .slice(0, MAX_PAYMENT_BADGES)
                .map(normalizePaymentBadge)
                .filter((item) => item.name);
            doc.syncPaymentBadgesFromGateways(gateways);
        } else if (Array.isArray(body.paymentBadges)) {
            const badges = body.paymentBadges
                .slice(0, MAX_PAYMENT_BADGES)
                .map((item) => ({ name: readString(typeof item === 'string' ? item : item?.name, 60) }))
                .filter((item) => item.name);
            doc.syncPaymentGatewaysFromBadges(badges);
        }

        await doc.save();

        // Auto-provision CMS pages for new internal footer links (e.g. /return-policy).
        let createdPages = [];
        try {
            createdPages = await ensurePagesForFooterColumns(doc.columns);
            if (createdPages.length) {
                await Promise.all(
                    createdPages.map((page) => invalidate(CACHE_KEYS.PAGE_CONTENT(page.slug)))
                );
            }
        } catch (pageErr) {
            console.error('Auto-create CMS pages from footer links failed:', pageErr);
        }

        await invalidate(CACHE_KEYS.FOOTER_SETTINGS);

        const createdNote = createdPages.length
            ? ` Created ${createdPages.length} page(s) in Page Content Manager.`
            : '';

        await logSecurityEvent({
            actor: req.admin?.username || req.admin?.email || 'admin',
            actorType: 'admin',
            action: 'Footer Settings Updated',
            ipAddress: getClientIp(req),
            details: `Footer columns, social links, copyright, or payment badges updated.${createdNote}`
        });

        res.status(200).json({
            success: true,
            message: `Footer settings saved successfully.${createdNote}`,
            data: doc.toAdminObject(),
            createdPages
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

const getPaymentBadges = async (req, res) => {
    try {
        const doc = await FooterSettings.getOrCreate();
        res.status(200).json({ success: true, badges: doc.getPaymentBadges() });
    } catch (error) {
        console.error('Get Payment Badges Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load payment badges.' });
    }
};

const addPaymentBadge = async (req, res) => {
    try {
        const name = readString(req.body?.name, 60);
        if (!name) {
            return res.status(400).json({ success: false, message: 'Badge name is required.' });
        }

        const doc = await FooterSettings.getOrCreate();
        const badges = doc.getPaymentBadges();

        if (badges.length >= MAX_PAYMENT_BADGES) {
            return res.status(400).json({
                success: false,
                message: `Maximum ${MAX_PAYMENT_BADGES} payment badges allowed.`
            });
        }

        const exists = badges.some((b) => b.name.toLowerCase() === name.toLowerCase());
        if (exists) {
            return res.status(400).json({ success: false, message: 'This payment badge already exists.' });
        }

        badges.push({ name });
        doc.syncPaymentGatewaysFromBadges(badges);
        await doc.save();
        await invalidate(CACHE_KEYS.FOOTER_SETTINGS);

        await logSecurityEvent({
            actor: req.admin?.username || req.admin?.email || 'admin',
            actorType: 'admin',
            action: 'Footer Payment Badge Added',
            ipAddress: getClientIp(req),
            details: `Added payment badge: ${name}`
        });

        res.status(200).json({
            success: true,
            message: 'Badge added.',
            badges: doc.getPaymentBadges()
        });
    } catch (error) {
        console.error('Add Payment Badge Error:', error);
        res.status(500).json({ success: false, message: 'Failed to add payment badge.' });
    }
};

const deletePaymentBadge = async (req, res) => {
    try {
        const index = Number(req.params.index);
        if (!Number.isInteger(index) || index < 0) {
            return res.status(400).json({ success: false, message: 'Invalid badge index.' });
        }

        const doc = await FooterSettings.getOrCreate();
        const badges = doc.getPaymentBadges();

        if (index >= badges.length) {
            return res.status(404).json({ success: false, message: 'Payment badge not found.' });
        }

        const removed = badges.splice(index, 1)[0];
        doc.syncPaymentGatewaysFromBadges(badges);
        await doc.save();
        await invalidate(CACHE_KEYS.FOOTER_SETTINGS);

        await logSecurityEvent({
            actor: req.admin?.username || req.admin?.email || 'admin',
            actorType: 'admin',
            action: 'Footer Payment Badge Removed',
            ipAddress: getClientIp(req),
            details: `Removed payment badge: ${removed?.name || index}`
        });

        res.status(200).json({
            success: true,
            message: 'Badge removed.',
            badges: doc.getPaymentBadges()
        });
    } catch (error) {
        console.error('Delete Payment Badge Error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove payment badge.' });
    }
};

module.exports = {
    getAdminFooterSettings,
    getPublicFooterSettings,
    updateFooterSettings,
    uploadFooterIcon,
    getPaymentBadges,
    addPaymentBadge,
    deletePaymentBadge
};
