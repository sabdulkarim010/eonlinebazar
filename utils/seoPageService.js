/********************************************************************
 * Project: EonlineBazar
 * File: seoPageService.js
 * Location: utils/seoPageService.js
 * Description: Server-side SEO injection for product and search pages.
 ********************************************************************/

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Product = require('../models/product');
const Category = require('../models/category');
const Admin = require('../models/admin');
const { ROLES } = require('../config/permissions');
const { applyBrandingToHtml } = require('./brandingHtml');
const { DEFAULT_SETTINGS } = require('./storeSettingsService');
const {
    generateMetaTags,
    generateProductJsonLd,
    generateBreadcrumbJsonLd,
    generateOrganizationJsonLd,
    injectSeoIntoHtml,
    buildProductCanonicalUrl,
    buildCategoryCanonicalUrl,
    resolveProductImages,
    truncate,
    slugifyCategory,
    getDefaultOgImageUrl
} = require('./seoHelper');

const CLIENT_DIR = path.join(__dirname, '..', 'client');

async function fetchOrganizationContact() {
    try {
        const admin = await Admin.findOne({ role: ROLES.SUPER_ADMIN })
            .select('email phone')
            .sort({ createdAt: 1 })
            .lean();
        return admin || {};
    } catch (_err) {
        return {};
    }
}

function readClientHtml(filename) {
    return fs.readFileSync(path.join(CLIENT_DIR, filename), 'utf8');
}

function sendBrandedHtml(res, filename, settings) {
    const html = applyBrandingToHtml(readClientHtml(filename), settings || DEFAULT_SETTINGS);
    res.type('html').send(html);
}

async function resolveCategoryByParam(categoryParam) {
    if (!categoryParam) return null;
    const token = String(categoryParam).trim();
    if (!token) return null;

    if (mongoose.Types.ObjectId.isValid(token)) {
        const catDoc = await Category.findById(token).select('name').lean();
        if (catDoc) return catDoc;
    }

    const slug = token.toLowerCase();
    const allCategories = await Category.find().select('name').lean();
    const bySlug = allCategories.find((cat) => slugifyCategory(cat.name) === slug);
    if (bySlug) return bySlug;

    const byName = await Category.findOne({
        name: new RegExp(`^${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).select('name').lean();
    if (byName) return byName;

    return { name: token };
}

async function findProductByQuery(idParam) {
    if (!idParam) return null;
    const token = String(idParam).trim();
    if (!token) return null;

    const query = mongoose.Types.ObjectId.isValid(token)
        ? { _id: token }
        : { productId: token };

    let product = await Product.findOne(query).lean();
    if (!product) {
        product = await Product.findOne({ slug: token }).lean();
    }
    return product;
}

async function serveProductDetailsWithSeo(req, res) {
    const settings = res.locals.settings || DEFAULT_SETTINGS;
    const productId = req.query.id;

    if (!productId) {
        return sendBrandedHtml(res, 'product-details.html', settings);
    }

    try {
        const product = await findProductByQuery(productId);
        if (!product) {
            return sendBrandedHtml(res, 'product-details.html', settings);
        }

        const canonicalUrl = buildProductCanonicalUrl(product);
        const images = resolveProductImages(product);
        const description = truncate(
            product.description || product.detailedDescription || `${product.name} — EOnlineBazar-এ কিনুন`
        );
        const keywords = [product.name, product.category, product.brandName, ...(product.tags || [])]
            .filter(Boolean)
            .join(', ');

        const breadcrumbs = [
            { name: 'Home', url: '/' },
            { name: product.category || 'Products', url: `/search?category=${encodeURIComponent(slugifyCategory(product.category || ''))}` },
            { name: product.name, url: `/product-details?id=${encodeURIComponent(String(product.productId || product._id))}` }
        ];

        const contact = await fetchOrganizationContact();
        const orgSettings = { ...settings, ...contact };

        const seoHtml = [
            generateMetaTags({
                title: product.name,
                description,
                keywords,
                canonicalUrl,
                imageUrl: images[0],
                type: 'product'
            }),
            generateProductJsonLd(product, { canonicalUrl, breadcrumbs }),
            generateBreadcrumbJsonLd(breadcrumbs),
            generateOrganizationJsonLd(orgSettings)
        ].join('\n    ');

        const html = injectSeoIntoHtml(
            applyBrandingToHtml(readClientHtml('product-details.html'), settings),
            seoHtml
        );
        return res.type('html').send(html);
    } catch (err) {
        console.error('Product SEO page error:', err);
        return sendBrandedHtml(res, 'product-details.html', settings);
    }
}

async function serveSearchWithSeo(req, res) {
    const settings = res.locals.settings || DEFAULT_SETTINGS;
    const categoryParam = req.query.category;

    if (!categoryParam) {
        return sendBrandedHtml(res, 'search.html', settings);
    }

    try {
        const category = await resolveCategoryByParam(categoryParam);
        if (!category || !category.name) {
            return sendBrandedHtml(res, 'search.html', settings);
        }

        const canonicalUrl = buildCategoryCanonicalUrl(category.name);
        const title = `${category.name} পণ্য`;
        const description = `${category.name} ক্যাটাগরির সেরা পণ্য EOnlineBazar-এ। দ্রুত ডেলিভারি ও সহজ রিটার্ন।`;

        const breadcrumbs = [
            { name: 'Home', url: '/' },
            { name: category.name, url: `/search?category=${encodeURIComponent(slugifyCategory(category.name))}` }
        ];

        const contact = await fetchOrganizationContact();
        const orgSettings = { ...settings, ...contact };

        const seoHtml = [
            generateMetaTags({
                title,
                description,
                keywords: `${category.name}, EOnlineBazar, online shopping Bangladesh`,
                canonicalUrl,
                imageUrl: getDefaultOgImageUrl(),
                type: 'website'
            }),
            generateBreadcrumbJsonLd(breadcrumbs),
            generateOrganizationJsonLd(orgSettings)
        ].join('\n    ');

        const html = injectSeoIntoHtml(
            applyBrandingToHtml(readClientHtml('search.html'), settings),
            seoHtml
        );
        return res.type('html').send(html);
    } catch (err) {
        console.error('Search SEO page error:', err);
        return sendBrandedHtml(res, 'search.html', settings);
    }
}

module.exports = {
    serveProductDetailsWithSeo,
    serveSearchWithSeo
};
