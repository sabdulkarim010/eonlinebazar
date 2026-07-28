/********************************************************************
 * Project: EonlineBazar
 * File: PageContent.js
 * Description: CMS pages — About, Contact info, Privacy Policy, Terms, etc.
 ********************************************************************/

const mongoose = require('mongoose');
const { markdownToHtml } = require('../utils/markdownToHtml');

const PAGE_SLUGS = Object.freeze(['about', 'contact', 'privacy-policy', 'terms', 'careers']);

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

const pageContentSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        enum: PAGE_SLUGS
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subtitle: { type: String, default: '', trim: true, maxlength: 240 },
    bodyMarkdown: { type: String, default: '', maxlength: 50000 },
    bodyHtml: { type: String, default: '' },
    isPublished: { type: Boolean, default: true },
    contactMeta: { type: contactMetaSchema, default: () => ({}) },
    sortOrder: { type: Number, default: 0 },
    updatedByAdmin: { type: String, default: '', trim: true }
}, { timestamps: true });

pageContentSchema.pre('save', function renderBodyHtml() {
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

pageContentSchema.statics.getAllForAdmin = async function getAllForAdmin() {
    await this.ensureDefaults();
    return this.find().sort({ sortOrder: 1, title: 1 });
};

pageContentSchema.statics.getPublishedBySlug = async function getPublishedBySlug(slug) {
    await this.ensureDefaults();
    const doc = await this.findOne({ slug: String(slug || '').toLowerCase() });
    if (!doc || doc.isPublished === false) return null;
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
    return {
        slug: this.slug,
        title: this.title,
        subtitle: this.subtitle || '',
        bodyHtml: this.bodyHtml || markdownToHtml(this.bodyMarkdown || ''),
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
module.exports.DEFAULT_PAGES = DEFAULT_PAGES;
