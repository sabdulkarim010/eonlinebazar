/********************************************************************
 * Project: EonlineBazar
 * File: seoRoutes.js
 * Location: routes/seoRoutes.js
 * Description: Public SEO routes — sitemap.xml and robots.txt.
 ********************************************************************/

const express = require('express');
const Product = require('../models/product');
const Category = require('../models/category');
const redisClient = require('../utils/redisClient');
const { isRedisAvailable } = require('../utils/redisClient');
const {
    getFrontendBaseUrl,
    slugifyCategory
} = require('../utils/seoHelper');

const router = express.Router();

const SITEMAP_CACHE_KEY = 'seo:sitemap:xml';
const SITEMAP_TTL_SECONDS = 3600;

let memorySitemapCache = { xml: null, expiresAt: 0 };

function formatSitemapDate(date) {
    if (!date) return new Date().toISOString().slice(0, 10);
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
}

function buildUrlEntry({ loc, lastmod, changefreq, priority }) {
    return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        '  </url>'
    ].join('\n');
}

async function generateSitemapXml() {
    const baseUrl = getFrontendBaseUrl();
    const now = formatSitemapDate(new Date());
    const entries = [];

    const staticPages = [
        { path: '/', changefreq: 'monthly', priority: '1.0', lastmod: now },
        { path: '/search', changefreq: 'monthly', priority: '0.5', lastmod: now },
        { path: '/products', changefreq: 'daily', priority: '0.8', lastmod: now },
        { path: '/about', changefreq: 'monthly', priority: '0.5', lastmod: now },
        { path: '/contact', changefreq: 'monthly', priority: '0.5', lastmod: now },
        { path: '/privacy-policy', changefreq: 'monthly', priority: '0.5', lastmod: now },
        { path: '/terms', changefreq: 'monthly', priority: '0.5', lastmod: now }
    ];

    staticPages.forEach((page) => {
        entries.push(buildUrlEntry({
            loc: `${baseUrl}${page.path}`,
            lastmod: page.lastmod,
            changefreq: page.changefreq,
            priority: page.priority
        }));
    });

    const [products, categories] = await Promise.all([
        Product.find({ status: { $ne: 'inactive' } })
            .select('productId category updatedAt createdAt')
            .lean(),
        Category.find().select('name createdAt updatedAt').lean()
    ]);

    products.forEach((product) => {
        const id = product.productId || product._id;
        entries.push(buildUrlEntry({
            loc: `${baseUrl}/product-details?id=${encodeURIComponent(String(id))}`,
            lastmod: formatSitemapDate(product.updatedAt || product.createdAt),
            changefreq: 'weekly',
            priority: '0.8'
        }));
    });

    const categoryNames = new Set();
    categories.forEach((cat) => {
        if (cat.name) categoryNames.add(cat.name);
    });
    products.forEach((product) => {
        if (product.category) categoryNames.add(product.category);
    });

    categoryNames.forEach((name) => {
        const slug = slugifyCategory(name);
        if (!slug) return;
        entries.push(buildUrlEntry({
            loc: `${baseUrl}/category/${encodeURIComponent(slug)}`,
            lastmod: now,
            changefreq: 'weekly',
            priority: '0.6'
        }));
    });

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        entries.join('\n'),
        '</urlset>'
    ].join('\n');
}

async function getCachedSitemap() {
    const now = Date.now();

    if (memorySitemapCache.xml && now < memorySitemapCache.expiresAt) {
        return memorySitemapCache.xml;
    }

    if (isRedisAvailable()) {
        try {
            const cached = await redisClient.get(SITEMAP_CACHE_KEY);
            if (cached) {
                memorySitemapCache = {
                    xml: cached,
                    expiresAt: now + SITEMAP_TTL_SECONDS * 1000
                };
                return cached;
            }
        } catch (_err) {
            /* fall through to regenerate */
        }
    }

    const xml = await generateSitemapXml();
    memorySitemapCache = {
        xml,
        expiresAt: now + SITEMAP_TTL_SECONDS * 1000
    };

    if (isRedisAvailable()) {
        try {
            await redisClient.set(SITEMAP_CACHE_KEY, xml, 'EX', SITEMAP_TTL_SECONDS);
        } catch (_err) {
            /* ignore cache write failure */
        }
    }

    return xml;
}

router.get('/sitemap.xml', async (req, res) => {
    try {
        const xml = await getCachedSitemap();
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(xml);
    } catch (err) {
        console.error('Sitemap generation error:', err);
        res.status(500).type('text/plain').send('Unable to generate sitemap');
    }
});

router.get('/robots.txt', (req, res) => {
    const baseUrl = getFrontendBaseUrl();
    const body = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /api/',
        'Disallow: /profile',
        '',
        `Sitemap: ${baseUrl}/sitemap.xml`
    ].join('\n');

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(body);
});

module.exports = router;
module.exports.generateSitemapXml = generateSitemapXml;
