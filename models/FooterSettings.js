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
            { label: 'Track Order', url: '#', isExternal: false, isActive: true }
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
    paymentGateways: { type: [paymentGatewayBadgeSchema], default: () => DEFAULT_PAYMENT_GATEWAYS }
}, { timestamps: true });

footerSettingsSchema.statics.getOrCreate = async function getOrCreate() {
    let doc = await this.findOne({ key: FOOTER_SETTINGS_KEY });
    if (!doc) {
        doc = await this.create({ key: FOOTER_SETTINGS_KEY });
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

    const paymentGateways = (this.paymentGateways || [])
        .filter((item) => item.isActive !== false)
        .sort(sortByOrder)
        .map((item) => ({
            name: item.name,
            iconUrl: item.iconUrl || '',
            iconName: item.iconName || ''
        }));

    return {
        columns,
        socialLinks,
        copyrightText: this.copyrightText || DEFAULT_COPYRIGHT,
        paymentGateways
    };
};

/** Admin panel payload — full editable state with MongoDB _id values preserved. */
footerSettingsSchema.methods.toAdminObject = function toAdminObject() {
    const mapId = (doc) => (doc && doc._id ? { ...doc.toObject(), id: String(doc._id) } : doc);

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
        paymentGateways: (this.paymentGateways || []).map((item) => ({
            id: String(item._id),
            name: item.name,
            iconUrl: item.iconUrl || '',
            iconName: item.iconName || '',
            isActive: item.isActive !== false,
            sortOrder: Number(item.sortOrder) || 0
        })),
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('FooterSettings', footerSettingsSchema);
module.exports.FOOTER_SETTINGS_KEY = FOOTER_SETTINGS_KEY;
module.exports.DEFAULT_COPYRIGHT = DEFAULT_COPYRIGHT;
module.exports.DEFAULT_COLUMNS = DEFAULT_COLUMNS;
module.exports.DEFAULT_SOCIAL_LINKS = DEFAULT_SOCIAL_LINKS;
module.exports.DEFAULT_PAYMENT_GATEWAYS = DEFAULT_PAYMENT_GATEWAYS;
