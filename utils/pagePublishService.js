const PageContent = require('../models/PageContent');

const URL_TO_SLUG = Object.freeze({
    '/about': 'about',
    '/contact': 'contact',
    '/privacy-policy': 'privacy-policy',
    '/terms': 'terms',
    '/careers': 'careers'
});

function urlToPageSlug(url = '') {
    if (!url || String(url).startsWith('http') || url === '#') return null;
    const normalized = String(url).split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    return URL_TO_SLUG[normalized] || null;
}

async function getPublishedPageSlugs() {
    await PageContent.ensureDefaults();
    const pages = await PageContent.find({ isPublished: { $ne: false } }).select('slug').lean();
    return new Set(pages.map((p) => p.slug));
}

function filterFooterColumnsByPublishedPages(columns = [], publishedSlugs = new Set()) {
    return (Array.isArray(columns) ? columns : [])
        .map((col) => ({
            ...col,
            links: (col.links || []).filter((link) => {
                const slug = urlToPageSlug(link.url);
                if (!slug) return true;
                return publishedSlugs.has(slug);
            })
        }))
        .filter((col) => (col.links || []).length > 0);
}

module.exports = {
    URL_TO_SLUG,
    urlToPageSlug,
    getPublishedPageSlugs,
    filterFooterColumnsByPublishedPages
};
