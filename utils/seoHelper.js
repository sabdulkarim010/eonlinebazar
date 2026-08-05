/********************************************************************
 * Project: EonlineBazar
 * File: seoHelper.js
 * Location: utils/seoHelper.js
 * Description: SEO HTML snippet generators — meta tags, Open Graph,
 * Twitter Cards, and JSON-LD structured data.
 ********************************************************************/

function escapeHtmlAttr(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getFrontendBaseUrl() {
    const base = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
    return base || 'http://localhost:3000';
}

function getDefaultOgImageUrl() {
    const fromEnv = String(process.env.DEFAULT_OG_IMAGE_URL || '').trim();
    if (fromEnv) return fromEnv;
    return `${getFrontendBaseUrl()}/images/og-default.jpg`;
}

function toAbsoluteUrl(url, baseUrl = getFrontendBaseUrl()) {
    if (!url) return '';
    const raw = String(url).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    return `${baseUrl}${path}`;
}

function slugifyCategory(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncate(text, maxLen = 160) {
    const clean = stripHtml(text);
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen - 1).trim()}…`;
}

function resolveProductImages(product, baseUrl = getFrontendBaseUrl()) {
    const images = [];
    if (Array.isArray(product.images)) {
        product.images.forEach((img) => {
            const abs = toAbsoluteUrl(img, baseUrl);
            if (abs) images.push(abs);
        });
    }
    if (product.image) {
        const abs = toAbsoluteUrl(product.image, baseUrl);
        if (abs && !images.includes(abs)) images.unshift(abs);
    }
    if (images.length === 0) {
        images.push(getDefaultOgImageUrl());
    }
    return images;
}

/**
 * A) generateMetaTags — returns HTML string of SEO meta tags.
 */
function generateMetaTags({
    title,
    description,
    keywords = '',
    canonicalUrl,
    imageUrl,
    type = 'website',
    noindex = false
}) {
    const safeTitle = escapeHtmlAttr(title || 'EOnlineBazar');
    const safeDescription = escapeHtmlAttr(truncate(description || ''));
    const safeKeywords = escapeHtmlAttr(keywords || '');
    const safeCanonical = escapeHtmlAttr(canonicalUrl || getFrontendBaseUrl());
    const safeImage = escapeHtmlAttr(imageUrl || getDefaultOgImageUrl());
    const safeType = escapeHtmlAttr(type === 'product' ? 'product' : 'website');

    const lines = [
        `<title>${safeTitle} | EOnlineBazar</title>`,
        `<meta name="description" content="${safeDescription}">`,
    ];

    if (safeKeywords) {
        lines.push(`<meta name="keywords" content="${safeKeywords}">`);
    }

    lines.push(`<link rel="canonical" href="${safeCanonical}">`);

    if (noindex) {
        lines.push('<meta name="robots" content="noindex,nofollow">');
    }

    lines.push(
        `<meta property="og:title" content="${safeTitle}">`,
        `<meta property="og:description" content="${safeDescription}">`,
        `<meta property="og:image" content="${safeImage}">`,
        `<meta property="og:url" content="${safeCanonical}">`,
        `<meta property="og:type" content="${safeType}">`,
        '<meta property="og:site_name" content="EOnlineBazar">',
        '<meta property="og:locale" content="bn_BD">',
        '<meta name="twitter:card" content="summary_large_image">',
        `<meta name="twitter:title" content="${safeTitle}">`,
        `<meta name="twitter:description" content="${safeDescription}">`,
        `<meta name="twitter:image" content="${safeImage}">`
    );

    return lines.join('\n    ');
}

/**
 * B) generateProductJsonLd — Product schema.org JSON-LD script tag.
 */
function generateProductJsonLd(product, { canonicalUrl, breadcrumbs } = {}) {
    const baseUrl = getFrontendBaseUrl();
    const images = resolveProductImages(product, baseUrl);
    const stockQty = Number(product.stockQuantity ?? product.stock) || 0;
    const brandName = product.brandName || 'EOnlineBazar';
    const ratingValue = product.averageRating ?? product.rating;
    const reviewCount = product.reviewCount ?? product.numOfReviews;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name || '',
        description: stripHtml(product.description || product.detailedDescription || ''),
        image: images,
        sku: product.productId || String(product._id || ''),
        brand: {
            '@type': 'Brand',
            name: brandName
        },
        offers: {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'BDT',
            availability: stockQty > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            url: canonicalUrl || baseUrl
        }
    };

    if (ratingValue != null && Number(reviewCount) > 0) {
        jsonLd.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: Number(ratingValue),
            reviewCount: Number(reviewCount)
        };
    }

    const scripts = [
        `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    ];

    if (Array.isArray(breadcrumbs) && breadcrumbs.length > 0) {
        scripts.push(generateBreadcrumbJsonLd(breadcrumbs, { asScriptOnly: true }));
    }

    return scripts.join('\n    ');
}

/**
 * C) generateBreadcrumbJsonLd — BreadcrumbList schema.
 */
function generateBreadcrumbJsonLd(breadcrumbs, { asScriptOnly = false } = {}) {
    const baseUrl = getFrontendBaseUrl();
    const itemListElement = (breadcrumbs || []).map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: toAbsoluteUrl(crumb.url, baseUrl)
    }));

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement
    };

    const script = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
    return asScriptOnly ? script : script;
}

/**
 * D) generateOrganizationJsonLd — Organization schema for storefront.
 */
function generateOrganizationJsonLd(storeSettings = {}) {
    const baseUrl = getFrontendBaseUrl();
    const storeName = storeSettings.storeName || 'EOnlineBazar';
    const logo = toAbsoluteUrl(
        storeSettings.logoPath || storeSettings.logoUrl || storeSettings.storeLogo || '/images/favicon.png',
        baseUrl
    );

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: storeName,
        url: baseUrl,
        logo
    };

    if (storeSettings.email) {
        jsonLd.email = storeSettings.email;
    }
    if (storeSettings.phone) {
        jsonLd.telephone = storeSettings.phone;
    }
    if (storeSettings.publicSupportWhatsApp) {
        jsonLd.contactPoint = {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            telephone: storeSettings.publicSupportWhatsApp,
            availableLanguage: ['bn', 'en']
        };
    }

    return `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

/**
 * Inject SEO HTML snippet before </head>, replacing any existing <title>.
 */
function injectSeoIntoHtml(html, seoHtml) {
    let output = html.replace(/<title>[\s\S]*?<\/title>\s*/i, '');
    if (output.includes('</head>')) {
        return output.replace('</head>', `    ${seoHtml}\n</head>`);
    }
    return `${seoHtml}\n${output}`;
}

/**
 * Build product page canonical URL (matches existing clean URL pattern).
 */
function buildProductCanonicalUrl(product) {
    const baseUrl = getFrontendBaseUrl();
    const id = product.productId || product._id;
    return `${baseUrl}/product-details?id=${encodeURIComponent(String(id))}`;
}

/**
 * Build category search canonical URL.
 */
function buildCategoryCanonicalUrl(categoryName) {
    const baseUrl = getFrontendBaseUrl();
    const slug = slugifyCategory(categoryName);
    return `${baseUrl}/category/${encodeURIComponent(slug)}`;
}

module.exports = {
    escapeHtmlAttr,
    getFrontendBaseUrl,
    getDefaultOgImageUrl,
    toAbsoluteUrl,
    slugifyCategory,
    stripHtml,
    truncate,
    resolveProductImages,
    generateMetaTags,
    generateProductJsonLd,
    generateBreadcrumbJsonLd,
    generateOrganizationJsonLd,
    injectSeoIntoHtml,
    buildProductCanonicalUrl,
    buildCategoryCanonicalUrl
};
