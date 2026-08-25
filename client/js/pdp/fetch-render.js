/**
 * PDP Fetch & Render
 * Barrel: client/js/product-details.js
 *
 * Globals used from other modules:
 *  * - currentProductData
 * - renderVariants
 * - renderProductImages
 * - initializeDefaultVariantSelections
 * - fetchProductReviews
 *
 * Globals this module exposes:
 *  * - fetchProductDetails
 * - renderBreadcrumb
 * - resolveProductImageUrl
 * - normalizeAssetUrl
 * - resolveDisplayImageUrl
 * - slugifyCategoryName
 * - stripHtmlForSeo
 * - truncateSeo
 * - setMetaContent
 * - updateSeoTags
 * - renderProductInfo
 * - renderHighlights
 * - renderDescriptions
 * - setupTabSystem
 * - showToast
 * - currentProductData
 */

const API_BASE_URL = '/api/products';
window.currentProductData = null;
window.VU = () => window.VariantUtils || {};

async function fetchProductDetails(id) {
    const loadingSpinner = document.getElementById('productLoading');
    const productContent = document.getElementById('productContent');
    const extraSection = document.getElementById('productExtraSection');

    try {
        const response = await fetch(`${API_BASE_URL}/${id}`);
        if (!response.ok) throw new Error("Product not found");
        
        const product = await response.json();
        currentProductData = product;
        window.currentProductData = product;

        if (window.analytics && product) {
            window.analytics.trackViewItem(product);
        }

        renderBreadcrumb(product);
        renderProductInfo(product);
        renderVariants(product);
        renderProductImages(product);
        initializeDefaultVariantSelections(product);
        renderHighlights(product); 
        renderDescriptions(product);
        updateSeoTags(product);
        
        // 🟢 আপডেট: এখন আলাদা এপিআই থেকে রিভিউ কল হবে
        fetchProductReviews(id); 

        if (loadingSpinner) loadingSpinner.classList.add('hidden');
        if (productContent) productContent.classList.remove('hidden');
        if (extraSection) extraSection.classList.remove('hidden');

    } catch (error) {
        console.error("Error fetching product details:", error);
        showToast("Failed to load product details!", "error");
        if (loadingSpinner) {
            loadingSpinner.innerHTML = `<p style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading product!</p>`;
        }
    }
}



// ==========================================================================
// 🌟 SECTION 3: RENDER SUB-FUNCTIONS (INFO, IMAGES, BREADCRUMB, HIGHLIGHTS)
// ==========================================================================
function renderBreadcrumb(product) {
    const breadcrumbCategory = document.getElementById('breadcrumbCategory');
    const breadcrumbTitle = document.getElementById('breadcrumbTitle');

    if (breadcrumbCategory) breadcrumbCategory.innerText = product.category || 'General';
    if (breadcrumbTitle) breadcrumbTitle.innerText = product.name || 'Product';
}

const DEFAULT_OG_IMAGE = '/images/og-default.jpg';

function resolveProductImageUrl(product) {
    const images = [];
    if (Array.isArray(product.images)) {
        product.images.forEach((img) => {
            if (img) images.push(normalizeAssetUrl(img));
        });
    }
    if (product.image) {
        const abs = normalizeAssetUrl(product.image);
        if (abs && !images.includes(abs)) images.unshift(abs);
    }
    if (images.length === 0) return new URL(DEFAULT_OG_IMAGE, window.location.origin).href;
    const first = images[0];
    return first.startsWith('http') ? first : new URL(first, window.location.origin).href;
}

function normalizeAssetUrl(raw) {
    if (!raw) return '';
    const PT = window.ProductThumbnail;
    if (PT && typeof PT.resolveProductImagePath === 'function') {
        return PT.resolveProductImagePath(raw);
    }
    const str = String(raw).trim();
    if (window.EOBUrlUtils?.isUnsafeAssetPath(str)) return '';
    if (str.startsWith('http')) return str;
    return str.startsWith('/') ? str : `/products/${str}`;
}

/** Resolve a raw DB path to a browser-ready absolute image URL. */
function resolveDisplayImageUrl(raw) {
    if (!raw) return '';
    const PT = window.ProductThumbnail;
    if (PT && typeof PT.toDisplayImageUrl === 'function') {
        const display = PT.toDisplayImageUrl(raw);
        if (display) return display;
    }
    const normalized = normalizeAssetUrl(raw);
    if (!normalized) return '';
    if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('data:')) {
        return normalized;
    }
    try {
        return new URL(normalized, window.location.origin).href;
    } catch (_) {
        return normalized;
    }
}

function slugifyCategoryName(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function stripHtmlForSeo(text) {
    return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateSeo(text, maxLen = 160) {
    const clean = stripHtmlForSeo(text);
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen - 1).trim()}…`;
}

function setMetaContent(id, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('content', value || '');
}

function updateSeoTags(product) {
    if (!product) return;

    const productId = product.productId || product._id;
    const canonicalUrl = `${window.location.origin}/product-details?id=${encodeURIComponent(String(productId))}`;
    const title = product.name || 'Product';
    const description = truncateSeo(
        product.description || product.detailedDescription || `Buy ${title} on EOnlineBazar`
    );
    const imageUrl = resolveProductImageUrl(product);
    const stockQty = Number(product.stockQuantity ?? product.stock) || 0;
    const ratingValue = product.averageRating ?? product.rating;
    const reviewCount = product.reviewCount ?? product.numOfReviews;

    document.title = `${title} | EOnlineBazar`;
    setMetaContent('meta-description', description);
    setMetaContent('og-title', title);
    setMetaContent('og-description', description);
    setMetaContent('og-image', imageUrl);
    setMetaContent('og-url', canonicalUrl);
    setMetaContent('twitter-title', title);
    setMetaContent('twitter-description', description);
    setMetaContent('twitter-image', imageUrl);

    const canonicalLink = document.getElementById('canonical-link');
    if (canonicalLink) canonicalLink.setAttribute('href', canonicalUrl);

    const images = [];
    if (Array.isArray(product.images)) {
        product.images.forEach((img) => {
            const abs = normalizeAssetUrl(img);
            if (abs) {
                images.push(abs.startsWith('http') ? abs : new URL(abs, window.location.origin).href);
            }
        });
    }
    if (product.image) {
        const abs = normalizeAssetUrl(product.image);
        const full = abs.startsWith('http') ? abs : new URL(abs, window.location.origin).href;
        if (!images.includes(full)) images.unshift(full);
    }
    if (images.length === 0) images.push(imageUrl);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: title,
        description: stripHtmlForSeo(product.description || product.detailedDescription || ''),
        image: images,
        sku: String(product.productId || product._id || ''),
        brand: {
            '@type': 'Brand',
            name: product.brandName || 'EOnlineBazar'
        },
        offers: {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'BDT',
            availability: stockQty > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            url: canonicalUrl
        }
    };

    if (ratingValue != null && Number(reviewCount) > 0) {
        jsonLd.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: Number(ratingValue),
            reviewCount: Number(reviewCount)
        };
    }

    const jsonLdEl = document.getElementById('product-jsonld');
    if (jsonLdEl) jsonLdEl.textContent = JSON.stringify(jsonLd);
}

function renderProductInfo(product) {
    const title = document.getElementById('productTitle');
    const category = document.getElementById('infoCategory');
    const price = document.getElementById('productPrice');
    const stockStatus = document.getElementById('stockStatus');
    
    // মোবাইল স্টিকি বার এলিমেন্ট
    const stickyTitle = document.getElementById('stickyBarTitle');
    const stickyPrice = document.getElementById('stickyBarPrice');

    if (title) title.innerText = product.name;
    if (stickyTitle) stickyTitle.innerText = product.name;
    if (category) category.innerText = product.category || 'General';
    if (price) price.innerText = `৳ ${product.price.toLocaleString()}`;
    if (stickyPrice) stickyPrice.innerText = `৳ ${product.price.toLocaleString()}`;

    if (stockStatus) {
        const totalStock = Number(product.stockQuantity ?? product.stock) || 0;
        if (totalStock > 0) {
            stockStatus.innerText = window.i18n ? window.i18n.t('product.in_stock') : 'In Stock';
            stockStatus.style.color = "var(--success-green)";
        } else {
            stockStatus.innerText = window.i18n ? window.i18n.t('product.out_of_stock') : 'Out of Stock';
            stockStatus.style.color = "var(--accent-red)";
        }
    }
}

function renderHighlights(product) {
    const highlightsContainer = document.getElementById('productHighlightsList'); 
    if (!highlightsContainer) return;

    if (product.highlights && product.highlights.length > 0) {
        // লক্ষ্য করুন: এখানে ব্যাকটিক (`) ব্যবহার করা হয়েছে, সিঙ্গেল কোট (') নয়!
        highlightsContainer.innerHTML = product.highlights
            .map(item => `<li><i class="fa-solid fa-circle-check" style="color: var(--success-green); margin-right: 5px;"></i> ${item}</li>`)
            .join('');
    } else {
        // যদি হাইলাইটস খালি থাকে
        highlightsContainer.innerHTML = `
            <li><i class="fa-solid fa-circle-check" style="color: var(--success-green); margin-right: 5px;"></i> 100% Original Product</li>
            <li><i class="fa-solid fa-circle-check" style="color: var(--success-green); margin-right: 5px;"></i> Best quality guaranteed</li>
        `;
    }
}

// ==========================================================================
// 🌟 SECTION 4: DYNAMIC SHORT & DETAILED DESCRIPTION LOGIC
// ==========================================================================
function renderDescriptions(product) {
    const shortDescElement = document.getElementById('productShortDesc');
    const detailedDescElement = document.getElementById('productDetailedDesc');

    // ফিউচার প্রুফ লজিক: নতুন ফিল্ড চেক করবে, না থাকলে মেইন description ফিল্ড নিবে
    const shortDescText = product.shortDescription || product.description;
    const detailedDescText = product.detailedDescription || product.description;

    if (shortDescElement) {
        shortDescElement.innerText = (shortDescText && shortDescText.trim() !== "") 
            ? shortDescText 
            : "No short description available.";
    }

    if (detailedDescElement) {
        detailedDescElement.innerHTML = (detailedDescText && detailedDescText.trim() !== "") 
            ? detailedDescText 
            : "No detailed description available.";
    }
}

// 🌟 SECTION 7: MODERN TABS CONTROLLER
// ==========================================================================
function setupTabSystem() {
    const tabs = document.querySelectorAll('.tab-trigger');
    const panes = document.querySelectorAll('.tab-content-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetPane = document.getElementById(tab.dataset.tab);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

// ==========================================================================
// 🌟 SECTION 8: GLOBAL TOAST DELEGATE
// ==========================================================================
function showToast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    }
}

document.addEventListener('languageChanged', () => {
    if (window.i18n) window.i18n.applyTranslations();
    if (currentProductData) {
        updateStockStatus(getAvailableStock());
        renderVariants(currentProductData);
    }
});
Object.assign(window, {
    fetchProductDetails,
    renderBreadcrumb,
    resolveProductImageUrl,
    normalizeAssetUrl,
    resolveDisplayImageUrl,
    slugifyCategoryName,
    stripHtmlForSeo,
    truncateSeo,
    setMetaContent,
    updateSeoTags,
    renderProductInfo,
    renderHighlights,
    renderDescriptions,
    setupTabSystem,
    showToast
});
