/********************************************************************
 * Project: EonlineBazar
 * File: NavbarLink.js
 * Location: models/NavbarLink.js
 * Author: Abdul Karim Sheikh
 * Description: Top-bar promotional / operational navbar links
 * (separate from product category mega-menu / ☰ All drawer).
 ********************************************************************/

const mongoose = require('mongoose');

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const TARGETS = Object.freeze(['_self', '_blank']);

const navbarLinkSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Navbar link title is required.'],
        trim: true,
        maxlength: 80
    },
    /** Destination href — relative (/deals) or absolute (https://…). */
    url: {
        type: String,
        required: [true, 'Navbar link URL is required.'],
        trim: true,
        maxlength: 500
    },
    /** Optional URL-friendly key (auto from title when omitted). */
    slug: {
        type: String,
        trim: true,
        lowercase: true,
        index: true
    },
    target: {
        type: String,
        enum: TARGETS,
        default: '_self'
    },
    isPublished: {
        type: Boolean,
        default: true
    },
    /**
     * When true, this link owns a dynamic CMS page at /page/:slug (and /:slug).
     * Rich HTML is synced to PageContent on save.
     */
    hasCustomPage: {
        type: Boolean,
        default: false
    },
    /** Quill / rich-text HTML for the linked CMS page (optional). */
    pageHtml: {
        type: String,
        default: '',
        maxlength: 200000
    },
    sortOrder: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

navbarLinkSchema.index({ isPublished: 1, sortOrder: 1, title: 1 });

navbarLinkSchema.pre('save', function assignSlug() {
    if (!this.slug && this.title) {
        this.slug = slugify(this.title);
    } else if (this.isModified('slug') && this.slug) {
        this.slug = slugify(this.slug);
    }
});

navbarLinkSchema.methods.toPublicObject = function toPublicObject() {
    return {
        id: String(this._id),
        _id: this._id,
        title: this.title,
        url: this.url,
        slug: this.slug || '',
        target: this.target === '_blank' ? '_blank' : '_self',
        hasCustomPage: this.hasCustomPage === true,
        sortOrder: Number(this.sortOrder) || 0
    };
};

navbarLinkSchema.methods.toAdminObject = function toAdminObject() {
    return {
        id: String(this._id),
        _id: this._id,
        title: this.title,
        url: this.url,
        slug: this.slug || '',
        target: this.target === '_blank' ? '_blank' : '_self',
        isPublished: this.isPublished === true,
        hasCustomPage: this.hasCustomPage === true,
        pageHtml: this.hasCustomPage === true ? (this.pageHtml || '') : '',
        sortOrder: Number(this.sortOrder) || 0,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

navbarLinkSchema.statics.slugify = slugify;
navbarLinkSchema.statics.TARGETS = TARGETS;

navbarLinkSchema.statics.findPublishedSorted = function findPublishedSorted() {
    return this.find({ isPublished: true }).sort({ sortOrder: 1, title: 1 });
};

module.exports = mongoose.models.NavbarLink || mongoose.model('NavbarLink', navbarLinkSchema);
