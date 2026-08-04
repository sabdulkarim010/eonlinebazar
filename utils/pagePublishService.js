const PageContent = require('../models/PageContent');
const { isValidSlug, normalizeSlug } = require('../models/PageContent');

/** App routes that must never be treated as CMS page slugs. */
const RESERVED_APP_SLUGS = new Set([
    'index',
    'profile',
    'login',
    'register',
    'forgot-password',
    'order-track',
    'order-details',
    'product-details',
    'search',
    'cart',
    'checkout',
    'payment',
    'footer',
    'admin',
    'admin-login',
    'finance-login',
    'finance-analytics',
    'verify-otp',
    'api',
    'uploads',
    'css',
    'js',
    'images',
    'assets',
    'public',
    'manifest',
    'service-worker',
    'robots',
    'sitemap',
    'favicon',
    'page'
]);

/** Legacy fixed map kept for explicit compatibility. */
const URL_TO_SLUG = Object.freeze({
    '/about': 'about',
    '/contact': 'contact',
    '/privacy-policy': 'privacy-policy',
    '/privacy': 'privacy-policy',
    '/terms': 'terms',
    '/terms-conditions': 'terms',
    '/terms-and-conditions': 'terms',
    '/careers': 'careers'
});

function urlToPageSlug(url = '') {
    const raw = String(url || '').trim();
    if (!raw || raw === '#' || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('//') || raw.startsWith('mailto:') || raw.startsWith('tel:')) {
        return null;
    }

    const normalized = raw.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

    if (URL_TO_SLUG[normalized]) {
        return URL_TO_SLUG[normalized];
    }

    const pagesMatch = normalized.match(/^\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
    if (pagesMatch) {
        const slug = pagesMatch[1].toLowerCase();
        return isValidSlug(slug) ? slug : null;
    }

    const bareMatch = normalized.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
    if (!bareMatch) return null;

    const slug = bareMatch[1].toLowerCase();
    if (RESERVED_APP_SLUGS.has(slug)) return null;
    return isValidSlug(slug) ? slug : null;
}

async function getPublishedPageSlugs() {
    const pages = await PageContent.find({ isPublished: { $ne: false } }).select('slug').lean();
    return new Set(pages.map((p) => p.slug));
}

/**
 * Returns true when a slug is reserved for the app (not a CMS candidate).
 */
function isReservedAppSlug(slug) {
    return RESERVED_APP_SLUGS.has(normalizeSlug(slug));
}

/**
 * Auto-create PageContent docs for internal footer links that lack a page.
 * @returns {Promise<object[]>} Newly created page admin objects.
 */
async function ensurePagesForFooterColumns(columns = []) {
    const created = [];
    const seen = new Set();

    for (const col of Array.isArray(columns) ? columns : []) {
        for (const link of col.links || []) {
            if (link.isExternal === true || link.isActive === false) continue;

            const slug = urlToPageSlug(link.url);
            if (!slug || seen.has(slug) || isReservedAppSlug(slug)) continue;
            seen.add(slug);

            const page = await PageContent.createIfMissing({
                title: link.label,
                slug
            });
            if (page) created.push(page);
        }
    }

    return created;
}

/**
 * Filter footer links: hide links whose CMS page exists but is unpublished.
 * @param {Array} columns
 * @param {Set<string>} publishedSlugs
 * @param {Set<string>} [knownSlugs] When provided, unknown (non-CMS) slugs stay visible.
 */
function filterFooterColumnsByPublishedPages(columns = [], publishedSlugs = new Set(), knownSlugs = null) {
    return (Array.isArray(columns) ? columns : [])
        .map((col) => ({
            ...col,
            links: (col.links || []).filter((link) => {
                if (link.isExternal === true) return true;
                const slug = urlToPageSlug(link.url);
                if (!slug) return true;
                if (knownSlugs && !knownSlugs.has(slug)) return true;
                return publishedSlugs.has(slug);
            })
        }))
        .filter((col) => (col.links || []).length > 0);
}

/**
 * Filter footer links using live DB publish state (preferred for public API).
 */
async function filterFooterColumnsByPublishedPagesAsync(columns = []) {
    const pages = await PageContent.find().select('slug isPublished').lean();
    const published = new Set();
    const known = new Set();
    for (const p of pages) {
        known.add(p.slug);
        if (p.isPublished !== false) published.add(p.slug);
    }
    return filterFooterColumnsByPublishedPages(columns, published, known);
}

/** Normalize labels/titles for fuzzy CMS page matching. */
function normalizeMatchKey(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Common footer labels → default CMS slugs (when title text differs slightly). */
const LABEL_TO_SLUG_ALIASES = Object.freeze({
    'privacy policy': 'privacy-policy',
    'terms': 'terms',
    'terms conditions': 'terms',
    'terms and conditions': 'terms',
    'terms of service': 'terms',
    'terms of use': 'terms',
    'about': 'about',
    'about us': 'about',
    'who we are': 'about',
    'contact': 'contact',
    'contact us': 'contact',
    'careers': 'careers',
    'careers at eonlinebazar': 'careers'
});

function isPlaceholderFooterUrl(url = '') {
    const raw = String(url || '').trim();
    return !raw || raw === '#' || raw === '/#' || raw === 'javascript:void(0)';
}

/**
 * Find a CMS page matching a footer link label (title, slug, or alias).
 * @param {string} label
 * @param {Array<{title?: string, slug?: string}>} pages
 */
function findCmsPageForLabel(label = '', pages = []) {
    const key = normalizeMatchKey(label);
    if (!key || !Array.isArray(pages) || !pages.length) return null;

    const byTitle = pages.find((p) => normalizeMatchKey(p.title) === key);
    if (byTitle) return byTitle;

    const slugFromLabel = normalizeSlug(label);
    if (slugFromLabel) {
        const bySlug = pages.find((p) => p.slug === slugFromLabel);
        if (bySlug) return bySlug;
    }

    const aliasSlug = LABEL_TO_SLUG_ALIASES[key];
    if (aliasSlug) {
        const byAlias = pages.find((p) => p.slug === aliasSlug);
        if (byAlias) return byAlias;
    }

    // Soft match: "Privacy Policy Page" ↔ "Privacy Policy"
    const soft = pages.find((p) => {
        const titleKey = normalizeMatchKey(p.title);
        return titleKey && (key.includes(titleKey) || titleKey.includes(key));
    });
    return soft || null;
}

/**
 * Replace empty/'#' footer URLs with `/${slug}` when the label matches a CMS page.
 * Does not overwrite real routes or external links.
 * @returns {{ columns: Array, changed: boolean }}
 */
function resolveFooterPlaceholderUrls(columns = [], pages = []) {
    let changed = false;
    const next = (Array.isArray(columns) ? columns : []).map((col) => ({
        ...col,
        links: (col.links || []).map((link) => {
            if (link.isExternal === true) return link;
            if (!isPlaceholderFooterUrl(link.url)) return link;

            const page = findCmsPageForLabel(link.label, pages);
            if (!page?.slug) return link;

            changed = true;
            return {
                ...link,
                url: `/${page.slug}`,
                isExternal: false
            };
        })
    }));

    return { columns: next, changed };
}

/**
 * Load CMS pages and heal placeholder footer URLs (in-memory; caller may persist).
 */
async function resolveFooterPlaceholderUrlsAsync(columns = [], { publishedOnly = false } = {}) {
    const query = publishedOnly ? { isPublished: { $ne: false } } : {};
    const pages = await PageContent.find(query).select('slug title isPublished').lean();
    return resolveFooterPlaceholderUrls(columns, pages);
}

module.exports = {
    URL_TO_SLUG,
    RESERVED_APP_SLUGS,
    LABEL_TO_SLUG_ALIASES,
    urlToPageSlug,
    isReservedAppSlug,
    getPublishedPageSlugs,
    ensurePagesForFooterColumns,
    filterFooterColumnsByPublishedPages,
    filterFooterColumnsByPublishedPagesAsync,
    normalizeMatchKey,
    isPlaceholderFooterUrl,
    findCmsPageForLabel,
    resolveFooterPlaceholderUrls,
    resolveFooterPlaceholderUrlsAsync
};
