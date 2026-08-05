/********************************************************************
 * Project: EonlineBazar
 * File: PageContent.js
 * Description: Fully dynamic CMS pages — created via Page Content Manager
 *              or auto-provisioned from Footer Columns & Links.
 ********************************************************************/

const mongoose = require('mongoose');
const { markdownToHtml } = require('../utils/markdownToHtml');

/** Decode accidental entity-escaped HTML (&lt;p&gt; → <p>) for storefront render. */
function decodeHtmlEntities(value) {
    let html = String(value ?? '');
    if (!html) return '';
    const map = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&apos;': "'"
    };
    for (let i = 0; i < 3; i += 1) {
        if (!/&(?:amp|lt|gt|quot|apos|#39|#x27);/i.test(html)) break;
        const next = html.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/gi, (m) => {
            const key = m.toLowerCase();
            return map[key] || m;
        });
        if (next === html) break;
        html = next;
    }
    return html;
}

/** Seeded default pages (always ensured on boot / first admin load). */
const DEFAULT_PAGE_SLUGS = Object.freeze(['about', 'contact', 'privacy-policy', 'terms', 'careers']);
/** @deprecated Use DEFAULT_PAGE_SLUGS — kept for backward-compatible imports. */
const PAGE_SLUGS = DEFAULT_PAGE_SLUGS;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const contactMetaSchema = new mongoose.Schema({
    address: { type: String, default: '', trim: true, maxlength: 500 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    email: { type: String, default: '', trim: true, maxlength: 120 },
    hours: { type: String, default: '', trim: true, maxlength: 300 },
    mapEmbedUrl: { type: String, default: '', trim: true, maxlength: 1000 }
}, { _id: false });

const DEFAULT_PAGES = [
    {
        slug: 'about',
        title: 'Who We Are',
        subtitle: 'Your trusted online shopping destination',
        bodyMarkdown: `Welcome to **EonlineBazar**, your ultimate destination for a seamless and premium online shopping experience. Founded with a vision to make everyday shopping reliable, fast, and high-quality, we bring a wide array of products straight to your doorstep.

We specialize in premium groceries, snacks, cosmetics, and essential daily items. Our platform is structured specifically to provide a clean and secure checkout experience, ensuring that your data and orders are handled with maximum care.

## Why Choose Us?

At EonlineBazar, customer satisfaction is our top priority. We focus on transparency, product freshness, and absolute authenticity in everything we deliver.

- **100% Authentic Products** — sourced directly from verified suppliers
- **Super Fast Delivery** — orders processed instantly with care
- **Secure Checkout** — every transaction is encrypted and safe`,
        sortOrder: 0
    },
    {
        slug: 'contact',
        title: 'Our Store Info',
        subtitle: 'Reach us anytime during business hours',
        bodyMarkdown: `Visit us or send a message — our support team is ready to help.`,
        contactMeta: {
            address: 'Telidanga, Post: Mahajon Bazar, Upazila: Kalia, Narail, Bangladesh.',
            phone: '+880 1XXXXXXXXX',
            email: 'support@eonlinebazar.com',
            hours: 'Saturday - Thursday: 9:00 AM - 10:00 PM\nFriday: Closed',
            mapEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3650.0!2d89.5!3d23.0!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjPCsDAwJzAwLjAiTiA4OcKwMzAnMDAuMCJF!5e0!3m2!1sen!2sbd!4v1'
        },
        sortOrder: 1
    },
    {
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        subtitle: 'How we collect, use, and protect your information',
        bodyMarkdown: `## Information We Collect

We collect information you provide when placing orders, creating an account, or contacting support — including name, phone number, email, and delivery address.

## How We Use Your Data

Your data is used solely to process orders, improve our service, and communicate order updates. We never sell personal information to third parties.

## Data Security

All checkout and account data is transmitted over encrypted connections. Payment details are handled by trusted payment partners.

## Contact

Questions about this policy? Email **support@eonlinebazar.com**.`,
        sortOrder: 2
    },
    {
        slug: 'terms',
        title: 'Terms & Conditions',
        subtitle: 'Rules governing use of EonlineBazar',
        bodyMarkdown: `## Orders & Payments

All orders are subject to product availability and verification. Prices are listed in Bangladeshi Taka (৳).

## Shipping & Delivery

Delivery timelines vary by location. Free shipping may apply above the threshold shown on our storefront announcement.

## Returns & Refunds

Eligible returns must be requested within the window stated on your order confirmation. Approved refunds are credited to your EonlineBazar wallet.

## Account Responsibility

You are responsible for keeping your login credentials secure. Notify us immediately of any unauthorized account activity.`,
        sortOrder: 3
    },
    {
        slug: 'careers',
        title: 'Careers at EonlineBazar',
        subtitle: 'Join our growing team',
        bodyMarkdown: `## Work With Us

EonlineBazar is building Bangladesh's most trusted online shopping experience. We're always looking for passionate people in operations, customer support, and technology.

## Open Roles

- **Customer Support Associate** — help shoppers via phone, email, and chat
- **Warehouse & Fulfillment Staff** — pick, pack, and ship orders accurately
- **Delivery Operations Coordinator** — coordinate last-mile delivery partners

## How to Apply

Send your CV and a short introduction to **careers@eonlinebazar.com** with the role title in the subject line.`,
        sortOrder: 4
    }
];

function normalizeSlug(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/^pages\//, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function isValidSlug(slug) {
    return typeof slug === 'string' && SLUG_PATTERN.test(slug) && slug.length <= 80;
}

function buildFooterPageSeed(title, slug) {
    const safeTitle = String(title || '').trim().slice(0, 120) || slug;
    return {
        slug,
        title: safeTitle,
        subtitle: `${safeTitle} details and guidelines`,
        bodyMarkdown: `## ${safeTitle}\n\nWrite details here...`,
        isPublished: true,
        sortOrder: 100
    };
}

const pageContentSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        maxlength: 80,
        validate: {
            validator: isValidSlug,
            message: 'Invalid page slug. Use lowercase letters, numbers, and hyphens only.'
        }
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, default: '', trim: true, maxlength: 240 },
    bodyMarkdown: { type: String, default: '', maxlength: 50000 },
    bodyHtml: { type: String, default: '', maxlength: 200000 },
    /** 'markdown' (default Page Content Manager) or 'html' (Quill / navbar CMS). */
    contentFormat: {
        type: String,
        enum: ['markdown', 'html'],
        default: 'markdown'
    },
    isPublished: { type: Boolean, default: true },
    contactMeta: { type: contactMetaSchema, default: () => ({}) },
    sortOrder: { type: Number, default: 0 },
    updatedByAdmin: { type: String, default: '', trim: true }
}, { timestamps: true });

pageContentSchema.pre('save', function renderBodyHtml() {
    // HTML pages (Quill) keep bodyHtml as authored — do not overwrite from markdown.
    if (this.contentFormat === 'html') return;
    if (this.isModified('bodyMarkdown')) {
        this.bodyHtml = markdownToHtml(this.bodyMarkdown || '');
    }
});

pageContentSchema.statics.ensureDefaults = async function ensureDefaults() {
    for (const seed of DEFAULT_PAGES) {
        const exists = await this.findOne({ slug: seed.slug });
        if (!exists) {
            await this.create({
                ...seed,
                bodyHtml: markdownToHtml(seed.bodyMarkdown)
            });
        }
    }
};

/**
 * Create a CMS page for a footer link when the slug does not already exist.
 * @returns {Promise<object|null>} Created admin object, or null if already exists / invalid.
 */
pageContentSchema.statics.createIfMissing = async function createIfMissing({ title, slug } = {}) {
    const normalized = normalizeSlug(slug);
    if (!isValidSlug(normalized)) return null;

    const existing = await this.findOne({ slug: normalized });
    if (existing) return null;

    const seed = buildFooterPageSeed(title, normalized);
    const doc = await this.create({
        ...seed,
        bodyHtml: markdownToHtml(seed.bodyMarkdown)
    });
    return doc.toAdminObject();
};

pageContentSchema.statics.getAllForAdmin = async function getAllForAdmin() {
    // Fully dynamic — only return pages that exist in DB (no hardcoded seed injection).
    return this.find().sort({ sortOrder: 1, title: 1 });
};

pageContentSchema.statics.getPublishedBySlug = async function getPublishedBySlug(slug) {
    const doc = await this.findOne({ slug: normalizeSlug(slug) });
    if (!doc || doc.isPublished === false) return null;
    return doc;
};

/**
 * Create a new CMS page. Fails if slug already exists or is invalid.
 * @returns {Promise<object>} Created mongoose document.
 */
pageContentSchema.statics.createPage = async function createPage({
    title,
    slug,
    subtitle = '',
    bodyMarkdown = '',
    bodyHtml = '',
    contentFormat = 'markdown',
    isPublished = true,
    sortOrder = 100
} = {}) {
    const safeTitle = String(title || '').trim().slice(0, 120);
    const normalized = normalizeSlug(slug || safeTitle);
    if (!safeTitle) {
        const err = new Error('Page title is required.');
        err.statusCode = 400;
        throw err;
    }
    if (!isValidSlug(normalized)) {
        const err = new Error('Invalid page slug. Use lowercase letters, numbers, and hyphens only.');
        err.statusCode = 400;
        throw err;
    }

    const existing = await this.findOne({ slug: normalized });
    if (existing) {
        const err = new Error(`A page with slug "${normalized}" already exists.`);
        err.statusCode = 409;
        throw err;
    }

    const format = contentFormat === 'html' ? 'html' : 'markdown';
    if (format === 'html') {
        const html = String(bodyHtml || '').slice(0, 200000)
            || `<p>Write details for <strong>${safeTitle}</strong> here…</p>`;
        return this.create({
            slug: normalized,
            title: safeTitle,
            subtitle: String(subtitle || '').trim().slice(0, 240),
            bodyMarkdown: '',
            bodyHtml: html,
            contentFormat: 'html',
            isPublished: isPublished !== false,
            sortOrder: Math.max(0, Number(sortOrder) || 100)
        });
    }

    const markdown = String(bodyMarkdown || '').slice(0, 50000)
        || `## ${safeTitle}\n\nWrite details here...`;

    return this.create({
        slug: normalized,
        title: safeTitle,
        subtitle: String(subtitle || '').trim().slice(0, 240),
        bodyMarkdown: markdown,
        bodyHtml: markdownToHtml(markdown),
        contentFormat: 'markdown',
        isPublished: isPublished !== false,
        sortOrder: Math.max(0, Number(sortOrder) || 100)
    });
};

/**
 * Upsert an HTML CMS page (used by Navbar custom page creator).
 * Updates title/html/publish state when the slug already exists.
 */
pageContentSchema.statics.upsertHtmlPage = async function upsertHtmlPage({
    title,
    slug,
    subtitle = '',
    bodyHtml = '',
    isPublished = true
} = {}) {
    const safeTitle = String(title || '').trim().slice(0, 120);
    const normalized = normalizeSlug(slug || safeTitle);
    if (!safeTitle) {
        const err = new Error('Page title is required.');
        err.statusCode = 400;
        throw err;
    }
    if (!isValidSlug(normalized)) {
        const err = new Error('Invalid page slug. Use lowercase letters, numbers, and hyphens only.');
        err.statusCode = 400;
        throw err;
    }

    const html = String(bodyHtml || '').slice(0, 200000)
        || `<p>Write details for <strong>${safeTitle}</strong> here…</p>`;

    let doc = await this.findOne({ slug: normalized });
    if (!doc) {
        doc = await this.create({
            slug: normalized,
            title: safeTitle,
            subtitle: String(subtitle || '').trim().slice(0, 240),
            bodyMarkdown: '',
            bodyHtml: html,
            contentFormat: 'html',
            isPublished: isPublished !== false,
            sortOrder: 100
        });
        return doc;
    }

    doc.title = safeTitle;
    if (subtitle !== undefined) doc.subtitle = String(subtitle || '').trim().slice(0, 240);
    doc.bodyHtml = html;
    doc.bodyMarkdown = '';
    doc.contentFormat = 'html';
    doc.isPublished = isPublished !== false;
    await doc.save();
    return doc;
};

pageContentSchema.methods.toAdminObject = function toAdminObject() {
    return {
        id: String(this._id),
        slug: this.slug,
        title: this.title,
        subtitle: this.subtitle || '',
        bodyMarkdown: this.bodyMarkdown || '',
        bodyHtml: this.bodyHtml || '',
        contentFormat: this.contentFormat === 'html' ? 'html' : 'markdown',
        isPublished: this.isPublished !== false,
        isActive: this.isPublished !== false,
        contactMeta: this.slug === 'contact' ? {
            address: this.contactMeta?.address || '',
            phone: this.contactMeta?.phone || '',
            email: this.contactMeta?.email || '',
            hours: this.contactMeta?.hours || '',
            mapEmbedUrl: this.contactMeta?.mapEmbedUrl || ''
        } : undefined,
        sortOrder: Number(this.sortOrder) || 0,
        updatedAt: this.updatedAt
    };
};

pageContentSchema.methods.toPublicObject = function toPublicObject() {
    const html = this.contentFormat === 'html'
        ? (this.bodyHtml || '')
        : (this.bodyHtml || markdownToHtml(this.bodyMarkdown || ''));
    return {
        slug: this.slug,
        title: this.title,
        subtitle: this.subtitle || '',
        bodyHtml: decodeHtmlEntities(html),
        content: decodeHtmlEntities(html),
        contentFormat: this.contentFormat === 'html' ? 'html' : 'markdown',
        isPublished: this.isPublished !== false,
        contactMeta: this.slug === 'contact' ? {
            address: this.contactMeta?.address || '',
            phone: this.contactMeta?.phone || '',
            email: this.contactMeta?.email || '',
            hours: this.contactMeta?.hours || '',
            mapEmbedUrl: this.contactMeta?.mapEmbedUrl || ''
        } : undefined,
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('PageContent', pageContentSchema);
module.exports.PAGE_SLUGS = PAGE_SLUGS;
module.exports.DEFAULT_PAGE_SLUGS = DEFAULT_PAGE_SLUGS;
module.exports.DEFAULT_PAGES = DEFAULT_PAGES;
module.exports.normalizeSlug = normalizeSlug;
module.exports.isValidSlug = isValidSlug;
module.exports.buildFooterPageSeed = buildFooterPageSeed;
