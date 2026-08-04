/********************************************************************
 * Project: EonlineBazar
 * File: FooterSettings.js
 * Location: models/FooterSettings.js
 * Author: Abdul Karim Sheikh
 * Description: Singleton footer configuration — dynamic columns, social
 * links, copyright text, and payment gateway badges for the storefront.
 ********************************************************************/

const mongoose = require('mongoose');

const FOOTER_SETTINGS_KEY = 'global';

const footerLinkSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true, maxlength: 80 },
    url: { type: String, required: true, trim: true, maxlength: 500 },
    isExternal: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
}, { _id: true });

const footerColumnSchema = new mongoose.Schema({
    columnTitle: { type: String, required: true, trim: true, maxlength: 60 },
    links: { type: [footerLinkSchema], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { _id: true });

const socialLinkSchema = new mongoose.Schema({
    platform: { type: String, required: true, trim: true, maxlength: 40 },
    iconName: { type: String, default: '', trim: true, maxlength: 40 },
    iconUrl: { type: String, default: '', trim: true, maxlength: 500 },
    linkUrl: { type: String, default: '#', trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { _id: true });

const paymentGatewayBadgeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 },
    iconUrl: { type: String, default: '', trim: true, maxlength: 500 },
    iconName: { type: String, default: '', trim: true, maxlength: 40 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { _id: true });

/** Simple name-only badges for footer bottom bar CRUD. */
const paymentBadgeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 60 }
}, { _id: false });

const DEFAULT_COPYRIGHT = '© 2026 EonlineBazar. All rights reserved. Designed by Abdul Karim Sheikh';

const DEFAULT_COLUMNS = [
    {
        columnTitle: 'COMPANY',
        sortOrder: 0,
        isActive: true,
        links: [
            { label: 'About Us', url: '/about', isExternal: false, isActive: true },
            { label: 'Contact Us', url: '/contact', isExternal: false, isActive: true },
            { label: 'Careers', url: '/careers', isExternal: false, isActive: true },
            { label: 'Privacy Policy', url: '/privacy-policy', isExternal: false, isActive: true }
        ]
    },
    {
        columnTitle: 'SUPPORT',
        sortOrder: 1,
        isActive: true,
        links: [
            { label: 'Your Account', url: '/login', isExternal: false, isActive: true },
            { label: 'Help Center', url: '#', isExternal: false, isActive: true },
            { label: 'Track Order', url: '/order-track', isExternal: false, isActive: true }
        ]
    },
    {
        columnTitle: 'QUICK LINKS',
        sortOrder: 2,
        isActive: true,
        links: [
            { label: 'Shop', url: '/', isExternal: false, isActive: true },
            { label: 'Cart', url: '/cart', isExternal: false, isActive: true },
            { label: 'Checkout', url: '/checkout', isExternal: false, isActive: true }
        ]
    }
];

const DEFAULT_SOCIAL_LINKS = [
    { platform: 'Facebook', iconName: 'facebook', linkUrl: 'https://facebook.com/', isActive: true, sortOrder: 0 },
    { platform: 'Instagram', iconName: 'instagram', linkUrl: 'https://instagram.com/', isActive: true, sortOrder: 1 },
    { platform: 'TikTok', iconName: 'tiktok', linkUrl: 'https://tiktok.com/', isActive: true, sortOrder: 2 },
    { platform: 'X', iconName: 'x-twitter', linkUrl: 'https://x.com/', isActive: true, sortOrder: 3 }
];

const DEFAULT_PAYMENT_GATEWAYS = [
    { name: 'bKash', iconName: 'bkash', isActive: true, sortOrder: 0 },
    { name: 'Nagad', iconName: 'nagad', isActive: true, sortOrder: 1 },
    { name: 'Rocket', iconName: 'rocket', isActive: true, sortOrder: 2 },
    { name: 'Visa', iconName: 'visa', isActive: true, sortOrder: 3 },
    { name: 'Mastercard', iconName: 'mastercard', isActive: true, sortOrder: 4 },
    { name: 'COD', iconName: 'cod', isActive: true, sortOrder: 5 }
];

const DEFAULT_PAYMENT_BADGES = DEFAULT_PAYMENT_GATEWAYS.map((g) => ({ name: g.name }));

const footerSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        default: FOOTER_SETTINGS_KEY,
        unique: true,
        immutable: true
    },
    columns: { type: [footerColumnSchema], default: () => DEFAULT_COLUMNS },
    socialLinks: { type: [socialLinkSchema], default: () => DEFAULT_SOCIAL_LINKS },
    copyrightText: { type: String, default: DEFAULT_COPYRIGHT, trim: true, maxlength: 300 },
    paymentGateways: { type: [paymentGatewayBadgeSchema], default: () => DEFAULT_PAYMENT_GATEWAYS },
    /** Master switch — when false, storefront hides the entire payment badges strip. */
    paymentBadgesEnabled: { type: Boolean, default: true },
    // No default — undefined means "not migrated yet"; empty array means intentionally cleared
    paymentBadges: { type: [paymentBadgeSchema], default: undefined }
}, { timestamps: true });

/** Active payment gateway badges for storefront (respects master enable flag). */
footerSettingsSchema.methods.getActivePaymentGateways = function getActivePaymentGateways() {
    if (this.paymentBadgesEnabled === false) return [];

    return (this.paymentGateways || [])
        .filter((item) => item.isActive !== false && item.name)
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
        .map((item) => ({
            name: String(item.name).trim(),
            iconUrl: item.iconUrl || '',
            iconName: item.iconName || String(item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
        }))
        .filter((item) => item.name);
};

/** Resolve simple payment badges; empty array is valid (all badges removed). */
footerSettingsSchema.methods.getPaymentBadges = function getPaymentBadges() {
    if (this.paymentBadgesEnabled === false) return [];

    const fromGateways = this.getActivePaymentGateways().map((item) => ({ name: item.name }));
    if (fromGateways.length || Array.isArray(this.paymentGateways)) {
        return fromGateways;
    }

    if (Array.isArray(this.paymentBadges)) {
        return this.paymentBadges
            .map((item) => ({ name: String(item?.name || item || '').trim() }))
            .filter((item) => item.name);
    }

    return [];
};

/** Keep simple paymentBadges names in sync with full gateway badges. */
footerSettingsSchema.methods.syncPaymentBadgesFromGateways = function syncPaymentBadgesFromGateways(gateways) {
    const list = (Array.isArray(gateways) ? gateways : (this.paymentGateways || []))
        .filter((item) => item && item.name)
        .map((item, index) => ({
            name: String(item.name).trim(),
            iconUrl: item.iconUrl || '',
            iconName: item.iconName || String(item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
            isActive: item.isActive !== false,
            sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index
        }))
        .filter((item) => item.name);

    this.paymentGateways = list;
    this.paymentBadges = list.map((item) => ({ name: item.name }));
};

/** @deprecated Prefer syncPaymentBadgesFromGateways — kept for legacy name-only CRUD routes. */
footerSettingsSchema.methods.syncPaymentGatewaysFromBadges = function syncPaymentGatewaysFromBadges(badges) {
    const list = (Array.isArray(badges) ? badges : (this.paymentBadges || []))
        .map((item) => {
            if (typeof item === 'string') return { name: item.trim() };
            return {
                name: String(item?.name || '').trim(),
                iconUrl: item?.iconUrl || '',
                iconName: item?.iconName || '',
                isActive: item?.isActive !== false,
                sortOrder: Number(item?.sortOrder) || 0
            };
        })
        .filter((item) => item.name);

    this.syncPaymentBadgesFromGateways(list.map((badge, index) => ({
        name: badge.name,
        iconUrl: badge.iconUrl || '',
        iconName: badge.iconName || String(badge.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
        isActive: badge.isActive !== false,
        sortOrder: index
    })));
};

footerSettingsSchema.statics.getOrCreate = async function getOrCreate() {
    let doc = await this.findOne({ key: FOOTER_SETTINGS_KEY });
    if (!doc) {
        doc = await this.create({
            key: FOOTER_SETTINGS_KEY,
            paymentBadges: DEFAULT_PAYMENT_BADGES
        });
        return doc;
    }

    // One-time backfill from legacy paymentGateways when paymentBadges was never set
    if (!Array.isArray(doc.paymentBadges)) {
        if ((doc.paymentGateways || []).length) {
            doc.syncPaymentBadgesFromGateways(doc.paymentGateways);
        } else {
            doc.syncPaymentGatewaysFromBadges(DEFAULT_PAYMENT_BADGES);
        }
        await doc.save();
    }

    if (doc.paymentBadgesEnabled === undefined || doc.paymentBadgesEnabled === null) {
        doc.paymentBadgesEnabled = true;
        await doc.save();
    }

    return doc;
};

/** Storefront payload — only active columns, links, social, and payment badges. */
footerSettingsSchema.methods.toPublicObject = function toPublicObject() {
    const sortByOrder = (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);

    const columns = (this.columns || [])
        .filter((col) => col.isActive !== false)
        .sort(sortByOrder)
        .map((col) => ({
            columnTitle: col.columnTitle,
            links: (col.links || [])
                .filter((link) => link.isActive !== false)
                .map((link) => ({
                    label: link.label,
                    url: link.url,
                    isExternal: link.isExternal === true
                }))
        }))
        .filter((col) => col.links.length > 0);

    const socialLinks = (this.socialLinks || [])
        .filter((item) => item.isActive !== false && item.linkUrl)
        .sort(sortByOrder)
        .map((item) => ({
            platform: item.platform,
            iconName: item.iconName || '',
            iconUrl: item.iconUrl || '',
            linkUrl: item.linkUrl
        }));

    const paymentGateways = this.getActivePaymentGateways();
    const paymentBadges = paymentGateways.map((badge) => ({ name: badge.name }));

    return {
        columns,
        socialLinks,
        copyrightText: this.copyrightText || DEFAULT_COPYRIGHT,
        paymentBadgesEnabled: this.paymentBadgesEnabled !== false,
        paymentGateways,
        paymentBadges
    };
};

/** Admin panel payload — full editable state with MongoDB _id values preserved. */
footerSettingsSchema.methods.toAdminObject = function toAdminObject() {
    return {
        columns: (this.columns || []).map((col) => ({
            id: String(col._id),
            columnTitle: col.columnTitle,
            isActive: col.isActive !== false,
            sortOrder: Number(col.sortOrder) || 0,
            links: (col.links || []).map((link) => ({
                id: String(link._id),
                label: link.label,
                url: link.url,
                isExternal: link.isExternal === true,
                isActive: link.isActive !== false
            }))
        })),
        socialLinks: (this.socialLinks || []).map((item) => ({
            id: String(item._id),
            platform: item.platform,
            iconName: item.iconName || '',
            iconUrl: item.iconUrl || '',
            linkUrl: item.linkUrl || '#',
            isActive: item.isActive !== false,
            sortOrder: Number(item.sortOrder) || 0
        })),
        copyrightText: this.copyrightText || DEFAULT_COPYRIGHT,
        paymentBadgesEnabled: this.paymentBadgesEnabled !== false,
        paymentGateways: (this.paymentGateways || []).map((item) => ({
            id: String(item._id),
            name: item.name,
            iconUrl: item.iconUrl || '',
            iconName: item.iconName || '',
            isActive: item.isActive !== false,
            sortOrder: Number(item.sortOrder) || 0
        })),
        paymentBadges: (this.paymentGateways || [])
            .filter((item) => item.name)
            .map((item) => ({ name: item.name })),
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('FooterSettings', footerSettingsSchema);
module.exports.FOOTER_SETTINGS_KEY = FOOTER_SETTINGS_KEY;
module.exports.DEFAULT_COPYRIGHT = DEFAULT_COPYRIGHT;
module.exports.DEFAULT_COLUMNS = DEFAULT_COLUMNS;
module.exports.DEFAULT_SOCIAL_LINKS = DEFAULT_SOCIAL_LINKS;
module.exports.DEFAULT_PAYMENT_GATEWAYS = DEFAULT_PAYMENT_GATEWAYS;
module.exports.DEFAULT_PAYMENT_BADGES = DEFAULT_PAYMENT_BADGES;
