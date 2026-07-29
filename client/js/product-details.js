//File Name: js/product-details.js



// ==========================================================================
// 🌟 SECTION 1: GLOBAL CONFIGURATIONS & INITIALIZATION
// ==========================================================================
const API_BASE_URL = '/api/products'; 
let currentProductData = null;
/** Per-attribute selection for legacy flat variants */
let selectedVariantsByAttr = {};
/** Combination matrix selection: { Size: 'M', Color: 'Pink' } */
let selectedCombinationAttrs = {};
/** Resolved combination row when all matrix attributes are selected */
let matchedCombinationVariant = null;
/** Cached variant rows for active combination matrix product */
let matrixVariantsCache = [];

/** Cached gallery URLs + active slide index for carousel / thumbnail sync */
let galleryImagesCache = [];
let activeGalleryIndex = 0;
let carouselScrollLock = false;

const VU = () => window.VariantUtils || {};

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (productId) {
        fetchProductDetails(productId);
    } else {
        showToast("Product ID missing in URL!", "error");
    }

    setupEventListeners();
    setupTabSystem();
    setupCombinationMatrixDelegation();
    setupGalleryDelegation();
    setupCarouselNavButtons();
    setupShareButtons();
    renderActivePaymentBadges();
});

// ==========================================================================
// 🌟 SECTION 2: FETCH & DISPLAY PRODUCT DATA
// ==========================================================================
async function fetchProductDetails(id) {
    const loadingSpinner = document.getElementById('productLoading');
    const productContent = document.getElementById('productContent');
    const extraSection = document.getElementById('productExtraSection');

    try {
        const response = await fetch(`${API_BASE_URL}/${id}`);
        if (!response.ok) throw new Error("Product not found");
        
        const product = await response.json();
        currentProductData = product; 

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
    const str = String(raw).trim();
    if (str.startsWith('http')) return str;
    return str.startsWith('/') ? str : `/products/${str}`;
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
        product.description || product.detailedDescription || `${title} — EOnlineBazar-এ কিনুন`
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
            stockStatus.innerText = "In Stock";
            stockStatus.style.color = "var(--success-green)";
        } else {
            stockStatus.innerText = "Out of Stock";
            stockStatus.style.color = "var(--accent-red)";
        }
    }
}

// ==========================================================================
// 🌟 SECTION 3B: PRODUCT VARIANTS (Size / Color selectors + live price/stock)
// ==========================================================================

/** ছোট HTML-escape হেল্পার (XSS-নিরাপদ রেন্ডারিং) */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** একটি ভ্যারিয়েন্টের ইউনিক কী তৈরি করা (sku অগ্রাধিকার পায়) */
function getVariantKey(v) {
    if (VU().getVariantLineId) return VU().getVariantLineId(v);
    const sku = (v.sku || '').trim();
    if (sku) return sku;
    return `${(v.attribute || '').trim()}::${(v.value || '').trim()}`;
}

function getVariantAttrs(v) {
    return VU().getVariantAttributes ? VU().getVariantAttributes(v) : {};
}

function productUsesCombinationMatrix(product) {
    return VU().usesCombinationMatrix ? VU().usesCombinationMatrix(product) : false;
}

/** ভ্যারিয়েন্টের কার্যকর দাম — নিজস্ব দাম না থাকলে বেস প্রাইস */
function getVariantPrice(v) {
    const p = Number(v && v.price);
    return (Number.isFinite(p) && p > 0) ? p : Number(currentProductData.price) || 0;
}

function normalizeAttrName(name) {
    return String(name || '').trim().toLowerCase();
}

function isColorAttribute(name) {
    const n = normalizeAttrName(name);
    return n === 'color' || n === 'colour';
}

function isSizeAttribute(name) {
    return normalizeAttrName(name) === 'size';
}

function getProductImages(product) {
    const PT = window.ProductThumbnail;
    if (PT && typeof PT.pickAllValidImages === 'function') {
        const valid = PT.pickAllValidImages(product);
        if (valid.length > 0) return valid;
    }
    return [];
}

/** Supports carousel active slide and legacy single-image ids */
function getMainProductImageEl() {
    const track = getCarouselTrackEl();
    if (track && galleryImagesCache.length) {
        const activeSlide = track.querySelector(
            `.product-image-carousel__slide[data-slide-index="${activeGalleryIndex}"] img`
        );
        if (activeSlide) return activeSlide;
    }
    return document.getElementById('mainProductImg')
        || document.getElementById('mainProductImage');
}

function normalizeImageUrl(url) {
    if (!url) return '';
    const raw = String(url).trim().split('?')[0];
    try {
        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
            return new URL(raw, window.location.origin).pathname;
        }
    } catch (e) { /* fall through */ }
    return raw;
}

function resolveGalleryIndexForUrl(images, url, fallbackIndex = 0) {
    if (!Array.isArray(images) || !images.length || !url) return fallbackIndex;
    const target = normalizeImageUrl(url);
    const idx = images.findIndex((img) => normalizeImageUrl(img) === target);
    return idx >= 0 ? idx : fallbackIndex;
}

function buildColorImageDataAttrs(imageUrl, mapEntry) {
    if (!imageUrl) return '';
    let attrs = ` data-image="${escapeHtml(imageUrl)}" data-image-url="${escapeHtml(imageUrl)}"`;
    if (mapEntry && Number.isInteger(mapEntry.index)) {
        attrs += ` data-image-index="${mapEntry.index}" data-color-index="${mapEntry.index}" data-index="${mapEntry.index}"`;
    }
    return attrs;
}

function getCarouselEl() {
    return document.getElementById('productImageCarousel');
}

function getCarouselTrackEl() {
    return document.getElementById('productImageCarouselTrack');
}

function clearDetailsMediaFallback(mainBox) {
    if (!mainBox) return;
    mainBox.querySelectorAll('.product-details-media-fallback').forEach((el) => el.remove());
}

function renderDetailsMediaFallback(product, mainBox) {
    const PT = window.ProductThumbnail;
    if (!mainBox || !PT) return;

    clearDetailsMediaFallback(mainBox);

    const wrap = document.createElement('div');
    wrap.className = 'product-details-media-fallback';
    wrap.innerHTML = PT.buildThumbnailHtml(product, { variant: 'detail', alt: product.name || 'Product' });
    mainBox.appendChild(wrap);
}

function attachMainImageFallback(mainImg, product, mainBox) {
    if (!mainImg) return;

    mainImg.onerror = function () {
        this.onerror = null;
        this.style.display = 'none';
        renderDetailsMediaFallback(product, mainBox);
    };
}

/** Color value (lowercase) → { index, variant, url } from flat or matrix variants */
function getColorImageMap(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const images = getProductImages(product);
    const map = {};
    let colorIndex = 0;

    variants.forEach((cv) => {
        const attrs = getVariantAttrs(cv);
        const colorAttrKey = Object.keys(attrs).find((k) => isColorAttribute(k));
        let colorValue = '';

        if (colorAttrKey) {
            colorValue = String(attrs[colorAttrKey] || '').trim();
        } else if (isColorAttribute(cv.attribute) && (cv.value || '').trim()) {
            colorValue = String(cv.value).trim();
        }

        if (!colorValue) return;

        const key = colorValue.toLowerCase();
        if (map[key]) return;

        const variantImage = String(cv.image || '').trim();
        const primaryImage = String(product.image || '').trim();
        const galleryImage = images[Math.min(colorIndex, Math.max(images.length - 1, 0))] || '';
        // When every variant shares the primary image, fall back to gallery position per color
        const resolvedUrl = (variantImage && variantImage !== primaryImage)
            ? variantImage
            : (galleryImage || variantImage);
        const galleryIndex = resolveGalleryIndexForUrl(images, resolvedUrl, colorIndex);
        map[key] = {
            index: galleryIndex,
            variant: cv,
            colorValue,
            url: resolvedUrl
        };
        colorIndex += 1;
    });

    return map;
}

/** Resolve featured image URL for a color value (variant image → gallery map) */
function resolveColorImageUrl(product, colorValue, variants) {
    if (!product || !colorValue) return '';

    const key = String(colorValue).trim().toLowerCase();
    const pool = variants || product.variants || [];

    const matching = pool.filter((v) => {
        const attrs = getVariantAttrs(v);
        const colorKey = Object.keys(attrs).find((k) => isColorAttribute(k));
        if (colorKey) {
            return String(attrs[colorKey]).trim().toLowerCase() === key;
        }
        return isColorAttribute(v.attribute) &&
            String(v.value || '').trim().toLowerCase() === key;
    });

    const withImage = matching.find((v) => {
        const img = String(v.image || '').trim();
        const primary = String(product.image || '').trim();
        return img && img !== primary;
    });
    if (withImage) return String(withImage.image).trim();

    const mapEntry = getColorImageMap(product)[key];
    if (mapEntry?.url) return mapEntry.url;

    if (mapEntry && Array.isArray(product.images) && product.images[mapEntry.index]) {
        return product.images[mapEntry.index];
    }
    return '';
}

/** Keep gallery thumbnail active state in sync with the main image */
function syncThumbnailActiveState(imageUrl, colorIndex) {
    const thumbs = document.querySelectorAll('.thumb-img');
    if (!thumbs.length) return;

    let matchedIndex = -1;
    if (Number.isInteger(colorIndex) && colorIndex >= 0) {
        matchedIndex = colorIndex;
    } else if (imageUrl && currentProductData) {
        const images = getProductImages(currentProductData);
        matchedIndex = images.findIndex((url) => url === imageUrl);
        if (matchedIndex < 0) {
            const entry = Object.values(getColorImageMap(currentProductData))
                .find((e) => e.url === imageUrl);
            if (entry) matchedIndex = entry.index;
        }
    }

    thumbs.forEach((thumb, index) => {
        const thumbUrl = thumb.dataset.imageUrl || thumb.dataset.fullUrl || thumb.getAttribute('src') || '';
        const isActive = matchedIndex >= 0
            ? index === matchedIndex
            : normalizeImageUrl(thumbUrl) === normalizeImageUrl(imageUrl);
        thumb.classList.toggle('active', isActive);
    });
}

/** Resolve the best image + gallery index for the current variant selection */
function resolveImageForCurrentSelection() {
    if (!currentProductData) return null;

    const images = getProductImages(currentProductData);
    const colorMap = getColorImageMap(currentProductData);

    const colorFromCombo = Object.entries(selectedCombinationAttrs)
        .find(([k]) => isColorAttribute(k));
    if (colorFromCombo) {
        const colorValue = colorFromCombo[1];
        const mapEntry = colorMap[String(colorValue).trim().toLowerCase()];
        const url = mapEntry?.url || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache);
        if (url) {
            return {
                url,
                index: mapEntry?.index ?? resolveGalleryIndexForUrl(images, url, 0)
            };
        }
    }

    const colorFromLegacy = getSelectedVariantByType('color');
    if (colorFromLegacy) {
        const mapEntry = colorMap[String(colorFromLegacy.value || '').trim().toLowerCase()];
        const url = mapEntry?.url
            || String(colorFromLegacy.image || '').trim()
            || resolveColorImageUrl(currentProductData, colorFromLegacy.value, currentProductData.variants);
        if (url) {
            return {
                url,
                index: mapEntry?.index ?? resolveGalleryIndexForUrl(images, url, 0)
            };
        }
    }

    if (matchedCombinationVariant) {
        const variantImage = String(matchedCombinationVariant.image || '').trim();
        if (variantImage) {
            return {
                url: variantImage,
                index: resolveGalleryIndexForUrl(images, variantImage, 0)
            };
        }
    }

    return null;
}

/** Image URL for the currently selected color/variant (carousel-aware) */
function getSelectedVariantImageUrl() {
    if (galleryImagesCache.length && Number.isInteger(activeGalleryIndex)) {
        const slideUrl = galleryImagesCache[activeGalleryIndex];
        if (slideUrl) return slideUrl;
    }

    const resolved = resolveImageForCurrentSelection();
    if (resolved?.url) return resolved.url;

    const mainImg = getMainProductImageEl();
    if (mainImg?.getAttribute('src')) {
        return mainImg.getAttribute('src');
    }

    return '';
}

function updateStickyBarImage(imageUrl) {
    const stickyImg = document.getElementById('stickyBarImg');
    if (!stickyImg || !imageUrl) return;
    stickyImg.style.display = '';
    stickyImg.src = imageUrl;
    stickyImg.onerror = function () {
        this.style.display = 'none';
    };
}

function updateCarouselNavButtons() {
    const prevBtn = document.getElementById('productCarouselPrev');
    const nextBtn = document.getElementById('productCarouselNext');
    const hasMultiple = galleryImagesCache.length > 1;

    if (prevBtn) {
        prevBtn.hidden = !hasMultiple;
        prevBtn.disabled = activeGalleryIndex <= 0;
    }
    if (nextBtn) {
        nextBtn.hidden = !hasMultiple;
        nextBtn.disabled = activeGalleryIndex >= galleryImagesCache.length - 1;
    }
}

function setupCarouselScrollSync() {
    const carousel = getCarouselEl();
    if (!carousel || carousel.dataset.scrollBound === '1') return;
    carousel.dataset.scrollBound = '1';

    let scrollTimer = null;
    carousel.addEventListener('scroll', () => {
        if (carouselScrollLock) return;

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const slideWidth = carousel.clientWidth || 1;
            const index = Math.max(0, Math.min(
                galleryImagesCache.length - 1,
                Math.round(carousel.scrollLeft / slideWidth)
            ));

            if (index === activeGalleryIndex) return;

            activeGalleryIndex = index;
            const url = galleryImagesCache[index];
            syncThumbnailActiveState(url, index);
            updateStickyBarImage(url);
            updateCarouselNavButtons();

            if (currentProductData) {
                const colorEntry = getImageIndexToColorMap(currentProductData)[index];
                if (colorEntry?.colorValue) {
                    syncColorVariantFromGallery(colorEntry.colorValue);
                }
            }
        }, 80);
    }, { passive: true });
}

function setupCarouselNavButtons() {
    const prevBtn = document.getElementById('productCarouselPrev');
    const nextBtn = document.getElementById('productCarouselNext');
    if (!prevBtn || !nextBtn || prevBtn.dataset.bound === '1') return;
    prevBtn.dataset.bound = '1';
    nextBtn.dataset.bound = '1';

    prevBtn.addEventListener('click', () => {
        goToGalleryIndex(activeGalleryIndex - 1);
    });
    nextBtn.addEventListener('click', () => {
        goToGalleryIndex(activeGalleryIndex + 1);
    });

    const carousel = getCarouselEl();
    if (carousel) {
        carousel.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToGalleryIndex(activeGalleryIndex - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goToGalleryIndex(activeGalleryIndex + 1);
            }
        });
    }
}

function initProductImageCarousel(product, imagesArray) {
    galleryImagesCache = imagesArray.slice();
    activeGalleryIndex = 0;

    const carousel = getCarouselEl();
    const track = getCarouselTrackEl();
    const mainBox = document.querySelector('.main-image-box');
    if (!carousel || !track) return;

    track.innerHTML = '';

    imagesArray.forEach((imgUrl, index) => {
        const slide = document.createElement('div');
        slide.className = 'product-image-carousel__slide';
        slide.dataset.slideIndex = String(index);

        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = `${product.name || 'Product'} — image ${index + 1}`;
        if (index === 0) {
            img.id = 'mainProductImg';
            img.setAttribute('data-role', 'main-product-image');
        }
        img.loading = index === 0 ? 'eager' : 'lazy';
        img.draggable = false;
        attachMainImageFallback(img, product, mainBox);

        slide.appendChild(img);
        track.appendChild(slide);
    });

    setupCarouselScrollSync();
    updateCarouselNavButtons();

    if (!carousel.dataset.resizeBound) {
        carousel.dataset.resizeBound = '1';
        window.addEventListener('resize', () => {
            if (!galleryImagesCache.length) return;
            goToGalleryIndex(activeGalleryIndex, { skipScrollAnimation: true, syncColor: false });
        });
    }

    goToGalleryIndex(0, { skipScrollAnimation: true, syncColor: false });
}

function goToGalleryIndex(index, options = {}) {
    const images = galleryImagesCache;
    if (!images.length) return;

    const safeIndex = Math.max(0, Math.min(Number(index) || 0, images.length - 1));
    activeGalleryIndex = safeIndex;
    const url = images[safeIndex];

    const carousel = getCarouselEl();
    if (carousel) {
        carouselScrollLock = true;
        const slideWidth = carousel.clientWidth || carousel.offsetWidth || 1;
        carousel.scrollTo({
            left: safeIndex * slideWidth,
            behavior: options.skipScrollAnimation ? 'auto' : 'smooth'
        });
        window.setTimeout(() => {
            carouselScrollLock = false;
        }, options.skipScrollAnimation ? 0 : 320);
    }

    syncThumbnailActiveState(url, safeIndex);
    updateStickyBarImage(url);
    updateCarouselNavButtons();

    if (options.syncColor !== false && currentProductData) {
        const colorEntry = getImageIndexToColorMap(currentProductData)[safeIndex];
        if (colorEntry?.colorValue) {
            syncColorVariantFromGallery(colorEntry.colorValue);
        }
    }
}

/** Swap main carousel slide + sticky image instantly */
function setMainProductImage(imageUrl, colorIndex) {
    if (!imageUrl && !Number.isInteger(colorIndex)) return;

    if (galleryImagesCache.length && getCarouselEl()) {
        let targetIndex = colorIndex;
        if (!Number.isInteger(targetIndex) || targetIndex < 0) {
            targetIndex = resolveGalleryIndexForUrl(galleryImagesCache, imageUrl, activeGalleryIndex);
        }
        goToGalleryIndex(targetIndex, { syncColor: false });
        return;
    }

    const mainImg = getMainProductImageEl();
    const mainBox = document.querySelector('.main-image-box');

    if (mainImg && imageUrl) {
        mainImg.style.display = '';
        mainImg.src = imageUrl;
        if (currentProductData) attachMainImageFallback(mainImg, currentProductData, mainBox);
    }
    updateStickyBarImage(imageUrl);
    clearDetailsMediaFallback(mainBox);
    syncThumbnailActiveState(imageUrl, colorIndex);
}

/** Image gallery index → color variant (for thumbnail → color sync) */
function getImageIndexToColorMap(product) {
    const byColor = getColorImageMap(product);
    const map = {};
    Object.values(byColor).forEach(entry => {
        map[entry.index] = entry;
    });
    return map;
}

function getSelectedVariantByType(type) {
    return Object.entries(selectedVariantsByAttr).find(([attr]) => {
        if (type === 'color') return isColorAttribute(attr);
        if (type === 'size') return isSizeAttribute(attr);
        return false;
    })?.[1] || null;
}

function getCombinedVariantKey() {
    return Object.values(selectedVariantsByAttr)
        .map(v => getVariantKey(v))
        .sort()
        .join('|');
}

function getCombinedVariantLabel() {
    return Object.values(selectedVariantsByAttr)
        .filter(v => v.attribute && v.value)
        .map(v => `${v.attribute}: ${v.value}`)
        .join(', ');
}

/** attribute অনুযায়ী ভ্যারিয়েন্ট গ্রুপ করা (রেন্ডার অর্ডার ধরে রেখে) */
function groupVariantsByAttribute(variants) {
    const groups = [];
    const map = {};
    variants.forEach(v => {
        const key = (v.attribute || 'Option').trim() || 'Option';
        if (!map[key]) {
            map[key] = { attribute: key, items: [] };
            groups.push(map[key]);
        }
        map[key].items.push(v);
    });
    return groups;
}

/**
 * ভ্যারিয়েন্ট সিলেক্টর রেন্ডার করা। প্রোডাক্টে variants না থাকলে সেকশনটি লুকানো থাকে
 * (সাধারণ প্রোডাক্টের সাথে সম্পূর্ণ backward-compatible)।
 */
function renderVariants(product) {
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap) return;

    selectedVariantsByAttr = {};
    selectedCombinationAttrs = {};
    matchedCombinationVariant = null;

    const variants = Array.isArray(product.variants)
        ? product.variants.filter(v => Object.keys(getVariantAttrs(v)).length > 0 || v.attribute || v.value)
        : [];

    if (variants.length === 0) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        wrap.dataset.matrixMode = '';
        matrixVariantsCache = [];
        showSelectedVariantMeta(false);
        return;
    }

    if (productUsesCombinationMatrix(product)) {
        renderCombinationMatrix(product, variants, wrap);
        return;
    }

    renderLegacyFlatVariants(product, variants, wrap);
}

/** Amazon/Shopify-style matrix: pick one value per attribute, resolve one combination row */
function renderCombinationMatrix(product, variants, wrap) {
    matrixVariantsCache = variants;
    wrap.classList.remove('hidden');
    wrap.dataset.matrixMode = '1';

    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(variants) : [];
    const colorImageMap = getColorImageMap(product);

    let html = '';
    groups.forEach(group => {
        html += `<div class="variant-group" data-combo-attr-group="${escapeHtml(group.name)}">
            <span class="variant-group-label">${escapeHtml(group.name)}:
                <span class="variant-selected-value" data-combo-selected="${escapeHtml(group.name)}">Select</span>
            </span>
            <div class="variant-options">`;
        group.values.forEach(value => {
            const isColorGroup = isColorAttribute(group.name);
            const mapEntry = isColorGroup ? colorImageMap[String(value).trim().toLowerCase()] : null;
            const colorImageUrl = isColorGroup
                ? (mapEntry?.url || resolveColorImageUrl(product, value, variants))
                : '';
            const colorClass = isColorGroup ? ' variant-badge--color' : '';
            const dataImageAttrs = isColorGroup
                ? buildColorImageDataAttrs(colorImageUrl, mapEntry)
                : '';
            html += `<div class="variant-badge${colorClass}"
                        data-combo-attr="${escapeHtml(group.name)}"
                        data-combo-value="${escapeHtml(value)}"${dataImageAttrs}
                        role="button" tabindex="0"
                        aria-disabled="false">
                        <span class="variant-badge-value">${escapeHtml(value)}</span>
                    </div>`;
        });
        html += `</div></div>`;
    });
    html += `<div class="variant-hint" id="variantHint"></div>`;
    wrap.innerHTML = html;

    showSelectedVariantMeta(Boolean(product.hasVariants || variants.length));
    refreshCombinationMatrixUI();
}

/** Event delegation — one listener for all matrix pill clicks */
function setupCombinationMatrixDelegation() {
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap || wrap.dataset.matrixBound === '1') return;
    wrap.dataset.matrixBound = '1';

    wrap.addEventListener('click', (e) => {
        const badge = e.target.closest('.variant-badge[data-combo-attr]');
        if (!badge || badge.classList.contains('is-disabled')) return;
        if (!currentProductData || !matrixVariantsCache.length) return;

        const attrName = badge.getAttribute('data-combo-attr');
        const value = badge.getAttribute('data-combo-value');
        selectCombinationAttribute(attrName, value, badge);
    });

    wrap.addEventListener('keydown', (e) => {
        const badge = e.target.closest('.variant-badge[data-combo-attr]');
        if (!badge || badge.classList.contains('is-disabled')) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const attrName = badge.getAttribute('data-combo-attr');
        const value = badge.getAttribute('data-combo-value');
        selectCombinationAttribute(attrName, value, badge);
    });
}

function resolveMatchedCombination() {
    if (!matrixVariantsCache.length) {
        matchedCombinationVariant = null;
        return;
    }
    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    const allSelected = groups.every(g => selectedCombinationAttrs[g.name]);
    matchedCombinationVariant = allSelected && VU().findVariantBySelection
        ? VU().findVariantBySelection(matrixVariantsCache, selectedCombinationAttrs)
        : null;
}

/** Drop selections in other groups that no longer match the changed attribute */
function pruneInvalidCombinationSelections(changedAttr) {
    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    groups.forEach(group => {
        if (group.name === changedAttr) return;
        const value = selectedCombinationAttrs[group.name];
        if (!value) return;
        const state = VU().getOptionState
            ? VU().getOptionState(matrixVariantsCache, selectedCombinationAttrs, group.name, value)
            : 'in-stock';
        if (state === 'unavailable') delete selectedCombinationAttrs[group.name];
    });
}

/**
 * Re-evaluate every pill: highlight in-stock options, dim OOS, disable unavailable.
 * Example: Size M selected → only Colors that exist as M/* combinations stay active.
 */
function refreshCombinationMatrixUI() {
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap || wrap.dataset.matrixMode !== '1') return;

    wrap.querySelectorAll('.variant-badge[data-combo-attr]').forEach(badge => {
        const attrName = badge.getAttribute('data-combo-attr');
        const value = badge.getAttribute('data-combo-value');
        const state = VU().getOptionState
            ? VU().getOptionState(matrixVariantsCache, selectedCombinationAttrs, attrName, value)
            : 'in-stock';
        const isActive = selectedCombinationAttrs[attrName] === value;

        badge.classList.remove('is-active', 'is-disabled', 'is-oos', 'is-unavailable');
        if (isActive) badge.classList.add('is-active');

        if (state === 'unavailable') {
            badge.classList.add('is-disabled', 'is-unavailable');
            badge.setAttribute('aria-disabled', 'true');
            badge.tabIndex = -1;
        } else if (state === 'oos') {
            badge.classList.add('is-disabled', 'is-oos');
            badge.setAttribute('aria-disabled', 'true');
            badge.tabIndex = -1;
        } else {
            badge.setAttribute('aria-disabled', 'false');
            badge.tabIndex = 0;
        }

        let oosTag = badge.querySelector('.variant-oos-tag');
        if (state === 'oos') {
            if (!oosTag) {
                oosTag = document.createElement('span');
                oosTag.className = 'variant-oos-tag';
                oosTag.textContent = 'Out of Stock';
                badge.appendChild(oosTag);
            }
        } else if (oosTag) {
            oosTag.remove();
        }
    });

    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    groups.forEach(group => {
        const label = wrap.querySelector(`[data-combo-selected="${cssEscape(group.name)}"]`);
        if (label) label.innerText = selectedCombinationAttrs[group.name] || 'Select';
    });
}

function showSelectedVariantMeta(show) {
    const meta = document.getElementById('selectedVariantMeta');
    if (meta) meta.classList.toggle('hidden', !show);
}

function syncCombinationDisplay() {
    const skuEl = document.getElementById('selectedVariantSku');
    const comboEl = document.getElementById('selectedVariantCombo');
    const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(matrixVariantsCache) : [];
    const allSelected = groups.every(g => selectedCombinationAttrs[g.name]);

    if (matchedCombinationVariant && allSelected) {
        const attrs = getVariantAttrs(matchedCombinationVariant);
        const sku = (matchedCombinationVariant.sku || '').trim();
        if (skuEl) skuEl.textContent = sku || '—';
        if (comboEl) {
            const label = VU().resolveVariantLabel
                ? VU().resolveVariantLabel(matchedCombinationVariant)
                : Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(' | ');
            comboEl.textContent = label;
        }

        if (matchedCombinationVariant.image) {
            const resolved = resolveImageForCurrentSelection();
            if (resolved?.url) {
                setMainProductImage(resolved.url, resolved.index);
            } else {
                setMainProductImage(matchedCombinationVariant.image);
            }
        } else {
            const resolved = resolveImageForCurrentSelection();
            if (resolved?.url) {
                setMainProductImage(resolved.url, resolved.index);
            } else {
                const colorEntry = Object.entries(attrs).find(([k]) => isColorAttribute(k));
                if (colorEntry) {
                    const url = resolveColorImageUrl(currentProductData, colorEntry[1], matrixVariantsCache);
                    const mapEntry = getColorImageMap(currentProductData)[String(colorEntry[1]).trim().toLowerCase()];
                    if (url) setMainProductImage(url, mapEntry?.index);
                }
            }
        }

        syncPriceFromSelection();
        syncStockFromSelection();
    } else {
        if (skuEl) skuEl.textContent = '—';
        if (comboEl) comboEl.textContent = allSelected ? '' : 'Select all options to see SKU and price';
        if (!allSelected) {
            setAddToCartEnabled(false);
        }
    }

    const hint = document.getElementById('variantHint');
    if (hint) {
        if (!allSelected) {
            hint.innerText = '';
        } else if (!matchedCombinationVariant) {
            hint.innerText = 'This combination is not available.';
        } else if ((Number(matchedCombinationVariant.stock) || 0) <= 0) {
            hint.innerText = 'Selected combination is out of stock.';
        } else {
            hint.innerText = '';
        }
    }
}

function syncMainImageFromCombinationColor(colorValue) {
    const mapEntry = getColorImageMap(currentProductData)[String(colorValue).trim().toLowerCase()];
    const url = mapEntry?.url || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache);
    if (url) setMainProductImage(url, mapEntry?.index);
}

function readColorImageFromBadge(badge, colorValue) {
    if (!badge) {
        const mapEntry = getColorImageMap(currentProductData)[String(colorValue).trim().toLowerCase()];
        return {
            url: mapEntry?.url || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache),
            index: mapEntry?.index
        };
    }

    const url = badge.getAttribute('data-image-url')
        || badge.getAttribute('data-image')
        || resolveColorImageUrl(currentProductData, colorValue, matrixVariantsCache);
    let index;
    if (badge.hasAttribute('data-image-index')) {
        index = parseInt(badge.getAttribute('data-image-index'), 10);
    } else if (badge.hasAttribute('data-index')) {
        index = parseInt(badge.getAttribute('data-index'), 10);
    } else if (badge.hasAttribute('data-color-index')) {
        index = parseInt(badge.getAttribute('data-color-index'), 10);
    } else {
        index = getColorImageMap(currentProductData)[String(colorValue).trim().toLowerCase()]?.index;
    }

    return { url, index };
}

function selectCombinationAttribute(attrName, value, sourceBadge) {
    selectedCombinationAttrs[attrName] = value;

    if (isColorAttribute(attrName)) {
        const { url: imageUrl, index: colorIndex } = readColorImageFromBadge(sourceBadge, value);
        if (imageUrl) setMainProductImage(imageUrl, colorIndex);
    }

    pruneInvalidCombinationSelections(attrName);
    resolveMatchedCombination();
    refreshCombinationMatrixUI();
    syncCombinationDisplay();
}

function applyDefaultCombinationSelection(product, variants) {
    matrixVariantsCache = variants;
    const pick = variants.find(v => (Number(v.stock) || 0) > 0) || variants[0];
    if (!pick) return;

    selectedCombinationAttrs = { ...getVariantAttrs(pick) };
    resolveMatchedCombination();
    refreshCombinationMatrixUI();
    syncCombinationDisplay();
    showSelectedVariantMeta(true);
}

function renderLegacyFlatVariants(product, variants, wrap) {
    wrap.classList.remove('hidden');
    const groups = groupVariantsByAttribute(variants);
    const colorImageMap = getColorImageMap(product);

    let html = '';
    groups.forEach(group => {
        html += `<div class="variant-group" data-attr="${escapeHtml(group.attribute)}">
            <span class="variant-group-label">${escapeHtml(group.attribute)}:
                <span class="variant-selected-value" data-attr-value="${escapeHtml(group.attribute)}">Select</span>
            </span>
            <div class="variant-options">`;
        group.items.forEach(v => {
            const key = getVariantKey(v);
            const stock = Number(v.stock) || 0;
            const disabled = stock <= 0;
            const price = getVariantPrice(v);
            const showPrice = !isColorAttribute(group.attribute)
                && Number(v.price) > 0
                && Number(v.price) !== Number(product.price);
            const isColorGroup = isColorAttribute(group.attribute);
            const mapEntry = isColorGroup ? colorImageMap[String(v.value || '').trim().toLowerCase()] : null;
            const colorImageUrl = isColorGroup
                ? (mapEntry?.url || resolveColorImageUrl(product, v.value, variants))
                : '';
            const colorClass = isColorGroup ? ' variant-badge--color' : '';
            const dataImageAttrs = isColorGroup
                ? buildColorImageDataAttrs(colorImageUrl, mapEntry)
                : '';
            html += `<div class="variant-badge${disabled ? ' is-disabled' : ''}${colorClass}"
                        data-variant-key="${escapeHtml(key)}"
                        data-variant-attr="${escapeHtml(v.attribute || '')}"${dataImageAttrs}
                        role="button" tabindex="${disabled ? -1 : 0}"
                        aria-disabled="${disabled}">
                        <span class="variant-badge-value">${escapeHtml(v.value || v.attribute)}</span>
                        ${showPrice ? `<span class="variant-badge-price">৳${price.toLocaleString()}</span>` : ''}
                        ${disabled ? `<span class="variant-oos-tag">Out of Stock</span>` : ''}
                    </div>`;
        });
        html += `</div></div>`;
    });
    html += `<div class="variant-hint" id="variantHint"></div>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll('.variant-badge').forEach(badge => {
        if (badge.classList.contains('is-disabled')) return;
        const key = badge.getAttribute('data-variant-key');
        const variant = variants.find(v => getVariantKey(v) === key);
        badge.addEventListener('click', () => selectVariantOption(variant));
        badge.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectVariantOption(variant); }
        });
    });
}

function initializeDefaultVariantSelections(product) {
    const variants = Array.isArray(product.variants)
        ? product.variants.filter(v => Object.keys(getVariantAttrs(v)).length > 0 || v.attribute || v.value)
        : [];
    if (variants.length === 0) return;

    if (productUsesCombinationMatrix(product)) {
        applyDefaultCombinationSelection(product, variants);

        const anyInStock = variants.some(v => (Number(v.stock) || 0) > 0);
        if (!anyInStock) {
            updateStockStatus(0);
            setAddToCartEnabled(false);
            const hint = document.getElementById('variantHint');
            if (hint) hint.innerText = 'All combinations are currently out of stock.';
        }
        return;
    }

    showSelectedVariantMeta(false);
    const wrap = document.getElementById('variantSelectorWrap');
    if (wrap) wrap.dataset.matrixMode = '';
    matrixVariantsCache = [];

    const groups = groupVariantsByAttribute(variants);
    groups.forEach(group => {
        const pick = group.items.find(v => (Number(v.stock) || 0) > 0) || group.items[0];
        if (pick) selectVariantOption(pick, { skipHint: true });
    });

    const anyInStock = variants.some(v => (Number(v.stock) || 0) > 0);
    if (!anyInStock) {
        updateStockStatus(0);
        setAddToCartEnabled(false);
        const hint = document.getElementById('variantHint');
        if (hint) hint.innerText = 'All variants are currently out of stock.';
    }
}

function updateVariantBadgeUI(attr, variant) {
    const key = getVariantKey(variant);
    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap) return;

    wrap.querySelectorAll('.variant-badge').forEach(b => {
        const badgeAttr = (b.getAttribute('data-variant-attr') || '').trim();
        if (badgeAttr !== attr) return;
        b.classList.toggle('is-active', b.getAttribute('data-variant-key') === key);
    });

    const label = wrap.querySelector(`.variant-selected-value[data-attr-value="${cssEscape(attr)}"]`);
    if (label) label.innerText = variant.value || '';
}

function syncMainImageFromColor(colorVariant) {
    if (!currentProductData || !colorVariant) return;

    const colorKey = String(colorVariant.value || '').trim().toLowerCase();
    const variantImage = String(colorVariant.image || '').trim();
    const entry = getColorImageMap(currentProductData)[colorKey];
    const url = variantImage || entry?.url || '';
    if (!url) return;

    setMainProductImage(url, entry?.index);
}

function syncPriceFromSelection() {
    if (matchedCombinationVariant) {
        const price = getVariantPrice(matchedCombinationVariant);
        const priceEl = document.getElementById('productPrice');
        const stickyPrice = document.getElementById('stickyBarPrice');
        if (priceEl) priceEl.innerText = `৳ ${price.toLocaleString()}`;
        if (stickyPrice) stickyPrice.innerText = `৳ ${price.toLocaleString()}`;
        return;
    }

    const sizeVariant = getSelectedVariantByType('size');
    const priceSource = sizeVariant || Object.values(selectedVariantsByAttr)[0];
    const price = priceSource ? getVariantPrice(priceSource) : Number(currentProductData?.price) || 0;

    const priceEl = document.getElementById('productPrice');
    const stickyPrice = document.getElementById('stickyBarPrice');
    if (priceEl) priceEl.innerText = `৳ ${price.toLocaleString()}`;
    if (stickyPrice) stickyPrice.innerText = `৳ ${price.toLocaleString()}`;
}

function syncStockFromSelection() {
    if (matchedCombinationVariant) {
        const stock = Number(matchedCombinationVariant.stock) || 0;
        updateStockStatus(stock);
        clampQuantityToStock(stock);
        setAddToCartEnabled(stock > 0);
        return;
    }

    const sizeVariant = getSelectedVariantByType('size');
    const stockSource = sizeVariant || Object.values(selectedVariantsByAttr)[0];
    const stock = stockSource
        ? Number(stockSource.stock) || 0
        : Number(currentProductData?.stock) || 0;

    updateStockStatus(stock);
    clampQuantityToStock(stock);
    setAddToCartEnabled(stock > 0);
}

/** Select one option within an attribute group — Color syncs image; Size syncs price */
function selectVariantOption(variant, options = {}) {
    if (!variant) return;

    const attr = (variant.attribute || 'Option').trim() || 'Option';
    selectedVariantsByAttr[attr] = variant;
    updateVariantBadgeUI(attr, variant);

    if (isColorAttribute(attr)) {
        const badge = document.querySelector(
            `.variant-badge[data-variant-key="${cssEscape(getVariantKey(variant))}"]`
        );
        const { url: imageUrl, index: colorIndex } = readColorImageFromBadge(badge, variant.value);
        if (imageUrl) {
            setMainProductImage(imageUrl, colorIndex);
        } else {
            syncMainImageFromColor(variant);
        }
    }

    if (isSizeAttribute(attr)) {
        syncPriceFromSelection();
        syncStockFromSelection();
    } else if (!getSelectedVariantByType('size')) {
        syncPriceFromSelection();
        syncStockFromSelection();
    }

    if (!options.skipHint) {
        const hint = document.getElementById('variantHint');
        if (hint) hint.innerText = '';
    }
}

/** CSS attribute-selector safe escaping */
function cssEscape(str) {
    const value = String(str);
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }
    return value.replace(/["\\]/g, '\\$&');
}

/** স্টক স্ট্যাটাস ব্যাজ আপডেট */
function updateStockStatus(stock) {
    const stockStatus = document.getElementById('stockStatus');
    if (!stockStatus) return;
    if (stock > 0) {
        stockStatus.innerText = `In Stock${stock <= 5 ? ` (${stock} left)` : ''}`;
        stockStatus.style.color = "var(--success-green)";
    } else {
        stockStatus.innerText = "Out of Stock";
        stockStatus.style.color = "var(--accent-red)";
    }
}

/** Add to Cart / Buy Now বাটন enable/disable */
function setAddToCartEnabled(enabled) {
    ['addToCartBtn', 'buyNowBtn', 'stickyAddToCartBtn', 'stickyBuyNowBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? '' : '0.55';
        btn.style.cursor = enabled ? '' : 'not-allowed';
    });
}

/** কোয়ান্টিটি ইনপুট স্টকের মধ্যে সীমাবদ্ধ রাখা */
function clampQuantityToStock(stock) {
    const qtyInput = document.getElementById('productQtyInput');
    if (!qtyInput) return;
    let val = parseInt(qtyInput.value) || 1;
    if (stock > 0 && val > stock) val = stock;
    if (val < 1) val = 1;
    qtyInput.value = val;
}

/** বর্তমানে কার্যকর স্টক (Size ভ্যারিয়েন্ট অগ্রাধিকার, নইলে প্রোডাক্টের) */
function getAvailableStock() {
    if (matchedCombinationVariant) return Number(matchedCombinationVariant.stock) || 0;

    const sizeVariant = getSelectedVariantByType('size');
    if (sizeVariant) return Number(sizeVariant.stock) || 0;
    const any = Object.values(selectedVariantsByAttr)[0];
    if (any) return Number(any.stock) || 0;
    return Number(currentProductData && currentProductData.stock) || 0;
}

function getEffectivePrice() {
    if (matchedCombinationVariant) return getVariantPrice(matchedCombinationVariant);

    const sizeVariant = getSelectedVariantByType('size');
    if (sizeVariant) return getVariantPrice(sizeVariant);
    const any = Object.values(selectedVariantsByAttr)[0];
    if (any) return getVariantPrice(any);
    return Number(currentProductData?.price) || 0;
}

// 👈 নতুন ফাংশন: ডাটাবেজ থেকে হাইলাইটস অ্যারে রেন্ডার করার জন্য
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

function syncColorVariantFromGallery(colorValue) {
    if (!colorValue || !currentProductData) return;

    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap) return;

    if (wrap.dataset.matrixMode === '1') {
        const groups = VU().extractAttributeGroups
            ? VU().extractAttributeGroups(matrixVariantsCache)
            : [];
        const colorGroup = groups.find((g) => isColorAttribute(g.name));
        const colorAttrName = colorGroup?.name || 'Color';
        const badge = wrap.querySelector(
            `.variant-badge[data-combo-attr="${cssEscape(colorAttrName)}"][data-combo-value="${cssEscape(colorValue)}"]`
        );
        if (badge && !badge.classList.contains('is-disabled')) {
            if (badge.classList.contains('is-active')) return;
            selectCombinationAttribute(colorAttrName, colorValue, badge);
        }
        return;
    }

    const variants = Array.isArray(currentProductData.variants) ? currentProductData.variants : [];
    const variant = variants.find((v) => {
        if (isColorAttribute(v.attribute)) {
            return String(v.value || '').trim().toLowerCase() === String(colorValue).trim().toLowerCase();
        }
        const attrs = getVariantAttrs(v);
        const colorKey = Object.keys(attrs).find((k) => isColorAttribute(k));
        return colorKey && String(attrs[colorKey]).trim().toLowerCase() === String(colorValue).trim().toLowerCase();
    });
    if (variant) selectVariantOption(variant);
}

/** Single delegated listener — survives gallery re-renders after product fetch */
function setupGalleryDelegation() {
    const gallery = document.getElementById('thumbGallery');
    if (!gallery || gallery.dataset.galleryBound === '1') return;
    gallery.dataset.galleryBound = '1';

    gallery.addEventListener('click', (e) => {
        const thumb = e.target.closest('.thumb-img');
        if (!thumb) return;

        const imgUrl = thumb.dataset.imageUrl || thumb.dataset.fullUrl || thumb.getAttribute('src') || '';
        if (!imgUrl) return;

        const parsedIndex = parseInt(thumb.dataset.imageIndex, 10);
        const imageIndex = Number.isFinite(parsedIndex) ? parsedIndex : undefined;

        if (galleryImagesCache.length && getCarouselEl()) {
            goToGalleryIndex(imageIndex ?? resolveGalleryIndexForUrl(galleryImagesCache, imgUrl, 0), {
                syncColor: false
            });
        } else {
            setMainProductImage(imgUrl, imageIndex);
        }

        const colorValue = thumb.dataset.colorValue;
        if (colorValue) {
            syncColorVariantFromGallery(colorValue);
        }
    });

    gallery.addEventListener('keydown', (e) => {
        const thumb = e.target.closest('.thumb-img');
        if (!thumb || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        thumb.click();
    });
}

function renderProductImages(product) {
    const gallery = document.getElementById('thumbGallery');
    const mainBox = document.querySelector('.main-image-box');
    const stickyImg = document.getElementById('stickyBarImg');

    clearDetailsMediaFallback(mainBox);

    const imagesArray = getProductImages(product);
    const indexToColor = getImageIndexToColorMap(product);

    galleryImagesCache = [];
    activeGalleryIndex = 0;

    if (imagesArray.length === 0) {
        const track = getCarouselTrackEl();
        if (track) track.innerHTML = '';
        if (stickyImg) {
            stickyImg.style.display = 'none';
            stickyImg.removeAttribute('src');
        }
        if (gallery) gallery.innerHTML = '';
        updateCarouselNavButtons();
        renderDetailsMediaFallback(product, mainBox);
        return;
    }

    initProductImageCarousel(product, imagesArray);

    if (gallery) {
        gallery.innerHTML = '';

        imagesArray.forEach((imgUrl, index) => {
            const imgBtn = document.createElement('img');
            imgBtn.src = imgUrl;
            imgBtn.classList.add('thumb-img');
            imgBtn.dataset.imageIndex = String(index);
            imgBtn.dataset.index = String(index);
            imgBtn.dataset.imageUrl = imgUrl;
            imgBtn.dataset.fullUrl = imgUrl;
            imgBtn.setAttribute('role', 'button');
            imgBtn.setAttribute('tabindex', '0');
            imgBtn.setAttribute('aria-label', `View product image ${index + 1}`);

            const colorEntry = indexToColor[index];
            if (colorEntry) {
                const colorLabel = colorEntry.colorValue || colorEntry.variant?.value || '';
                imgBtn.dataset.colorValue = colorLabel;
                imgBtn.title = colorLabel;
            }

            if (index === 0) imgBtn.classList.add('active');

            gallery.appendChild(imgBtn);
        });
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

// ==========================================================================
// 🌟 SECTION 5: REVIEWS MANAGEMENT
// ==========================================================================
function renderReviews(reviews) {
    const container = document.getElementById('reviewsListContainer');
    const tabCount = document.getElementById('tabReviewCount');
    const summaryCount = document.getElementById('productReviewCount');

    if (tabCount) tabCount.innerText = reviews.length;
    if (summaryCount) summaryCount.innerText = `(${reviews.length} Customer Reviews)`;

    if (!container) return;

    if (reviews.length === 0) {
        container.innerHTML = `
            <p class="no-reviews-msg">
                <i class="fa-solid fa-comment-slash"></i> No reviews yet. Be the first to review this product!
            </p>`;
        return;
    }

    container.innerHTML = '';
    reviews.forEach(rev => {
        const revCard = document.createElement('div');
        revCard.classList.add('review-card');

        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            starsHTML += i <= rev.rating
                ? `<i class="fa-solid fa-star"></i>`
                : `<i class="fa-regular fa-star"></i>`;
        }

        // 🟢 ডাটাবেস থেকে ইউজারের নাম বের করার লজিক
        const reviewerName = rev.userId?.name || rev.name || "Verified Customer";
        const initial = reviewerName.trim().charAt(0).toUpperCase() || 'U';
        const reviewDate = rev.createdAt
            ? new Date(rev.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';

        revCard.innerHTML = `
            <div class="review-card-head">
                <div class="reviewer-identity">
                    <span class="reviewer-avatar">${escapeHtml(initial)}</span>
                    <div class="reviewer-meta">
                        <strong class="reviewer-name">${escapeHtml(reviewerName)}</strong>
                        <span class="reviewer-verified"><i class="fa-solid fa-circle-check"></i> Verified Purchase</span>
                    </div>
                </div>
                <div class="review-card-stars">${starsHTML}</div>
            </div>
            <p class="review-card-comment">${escapeHtml(rev.comment)}</p>
            ${rev.photo ? `<div class="review-card-photo"><img src="${escapeHtml(rev.photo)}" alt="Review Photo"></div>` : ''}
            ${reviewDate ? `<span class="review-card-date"><i class="fa-regular fa-clock"></i> ${reviewDate}</span>` : ''}
        `;
        container.appendChild(revCard);
    });
}

// ==========================================================================
// 🌟 SECTION 6: QUANTITY CONTROLS & INTERACTIONS
// ==========================================================================
function setupEventListeners() {
    const qtyInput = document.getElementById('productQtyInput');
    const decreaseBtn = document.getElementById('decreaseQtyBtn');
    const increaseBtn = document.getElementById('increaseQtyBtn');
    
    const addToCartBtn = document.getElementById('addToCartBtn');
    const buyNowBtn = document.getElementById('buyNowBtn');
    const stickyAddToCartBtn = document.getElementById('stickyAddToCartBtn');
    const stickyBuyNowBtn = document.getElementById('stickyBuyNowBtn');

    if (increaseBtn && qtyInput) {
        increaseBtn.addEventListener('click', () => {
            const next = parseInt(qtyInput.value) + 1;
            const stock = getAvailableStock();
            if (stock > 0 && next > stock) {
                if (typeof window.showStockExceededToast === 'function') {
                    window.showStockExceededToast();
                } else {
                    showToast(`Only ${stock} in stock for this option.`, 'error');
                }
                return;
            }
            qtyInput.value = next;
        });
    }

    if (decreaseBtn && qtyInput) {
        decreaseBtn.addEventListener('click', () => {
            if (parseInt(qtyInput.value) > 1) {
                qtyInput.value = parseInt(qtyInput.value) - 1;
            }
        });
    }

    /**
     * 🌟 হেল্পার: বর্তমান সিলেকশন থেকে একটি কার্ট-আইটেম অবজেক্ট তৈরি করা।
     * ভ্যারিয়েন্ট থাকলে তার দাম ও ভ্যারিয়েন্ট মেটাডাটা যুক্ত হয়; না থাকলে
     * সাধারণ প্রোডাক্ট হিসেবে আচরণ করে (backward-compatible)।
     */
    const buildCartItem = (quantity) => {
        const prodId = currentProductData._id || currentProductData.productId || currentProductData.id;
        const mediaMeta = (window.ProductThumbnail && window.ProductThumbnail.getDisplayMeta)
            ? window.ProductThumbnail.getDisplayMeta(currentProductData)
            : { image: currentProductData.image || '', emoji: currentProductData.icon || '' };
        const base = {
            id: prodId,
            name: currentProductData.name,
            price: getEffectivePrice(),
            icon: mediaMeta.emoji || '',
            products: mediaMeta.image || '',
            quantity: quantity,
            selected: true,
            variantId: '',
            variantLabel: '',
            variantAttribute: '',
            variantValue: '',
            variantSku: '',
            selectedColor: '',
            selectedSize: '',
            selectedVariant: null
        };

        const applyColorSizeFromAttrs = (attrs) => {
            Object.entries(attrs || {}).forEach(([k, v]) => {
                const val = String(v || '').trim();
                if (!val) return;
                if (isColorAttribute(k)) base.selectedColor = val;
                if (isSizeAttribute(k)) base.selectedSize = val;
            });
        };

        const selectedList = Object.values(selectedVariantsByAttr);
        if (matchedCombinationVariant && VU().buildVariantCartMeta) {
            const meta = VU().buildVariantCartMeta(matchedCombinationVariant);
            Object.assign(base, meta);
            applyColorSizeFromAttrs(getVariantAttrs(matchedCombinationVariant));
        } else if (matchedCombinationVariant) {
            const attrs = getVariantAttrs(matchedCombinationVariant);
            base.variantId = getVariantKey(matchedCombinationVariant);
            base.variantLabel = Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(', ');
            base.variantAttribute = base.variantLabel;
            base.variantValue = Object.values(attrs).join(', ');
            base.variantSku = (matchedCombinationVariant.sku || '').trim();
            applyColorSizeFromAttrs(attrs);
            base.selectedVariant = {
                attributes: attrs,
                sku: base.variantSku,
                price: getEffectivePrice(),
                stock: Number(matchedCombinationVariant.stock) || 0,
                image: matchedCombinationVariant.image || '',
                variantId: base.variantId
            };
        } else if (Object.keys(selectedCombinationAttrs).length > 0) {
            base.variantLabel = Object.entries(selectedCombinationAttrs)
                .map(([k, v]) => `${k}: ${v}`).join(', ');
            applyColorSizeFromAttrs(selectedCombinationAttrs);
        } else if (selectedList.length > 0) {
            base.variantId = getCombinedVariantKey();
            base.variantLabel = getCombinedVariantLabel();
            base.variantAttribute = selectedList.map(v => v.attribute).filter(Boolean).join(', ');
            base.variantValue = selectedList.map(v => v.value).filter(Boolean).join(', ');
            base.variantSku = selectedList.map(v => (v.sku || '').trim()).filter(Boolean).join('|');
            selectedList.forEach((v) => {
                if (isColorAttribute(v.attribute)) base.selectedColor = String(v.value || '').trim();
                if (isSizeAttribute(v.attribute)) base.selectedSize = String(v.value || '').trim();
            });
        }

        const variantImageUrl = getSelectedVariantImageUrl();
        if (variantImageUrl) {
            base.image = variantImageUrl;
            base.selectedImage = variantImageUrl;
            base.variantImage = variantImageUrl;
            base.products = variantImageUrl;
        }

        return base;
    };

    /** ভ্যারিয়েন্ট থাকা সত্ত্বেও সিলেক্ট না করলে ব্লক করা */
    const ensureVariantSelected = () => {
        const variants = Array.isArray(currentProductData.variants)
            ? currentProductData.variants.filter(v => Object.keys(getVariantAttrs(v)).length > 0 || v.attribute || v.value)
            : [];
        if (variants.length === 0) return true;

        if (productUsesCombinationMatrix(currentProductData)) {
            const groups = VU().extractAttributeGroups ? VU().extractAttributeGroups(variants) : [];
            const missing = groups.filter(g => !selectedCombinationAttrs[g.name]);
            if (missing.length > 0 || !matchedCombinationVariant) {
                const hint = document.getElementById('variantHint');
                if (hint) hint.innerText = 'Please select all options before adding to cart.';
                showToast("Please select all product options first.", "error");
                return false;
            }
            return true;
        }

        const groups = groupVariantsByAttribute(variants);
        const missing = groups.filter(g => !selectedVariantsByAttr[g.attribute]);
        if (missing.length > 0) {
            const hint = document.getElementById('variantHint');
            if (hint) hint.innerText = 'Please select all options before adding to cart.';
            showToast("Please select all product options first.", "error");
            return false;
        }
        return true;
    };

    // 👈 Add to Cart লজিক (ভ্যারিয়েন্ট-সচেতন, লোকাল কার্টে অ্যাড করে)
    const handleAddToCart = () => {
        if (!currentProductData) return showToast("Please wait, product data is loading...", "error");
        if (!ensureVariantSelected()) return;

        const stock = getAvailableStock();
        if (Array.isArray(currentProductData.variants) && currentProductData.variants.length && stock <= 0) {
            if (typeof window.showOutOfStockToast === 'function') {
                return window.showOutOfStockToast();
            }
            return showToast("This option is out of stock.", "error");
        }

        const quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        let cart = JSON.parse(localStorage.getItem('cart')) || []; 

        const newItem = buildCartItem(quantity);
        // একই প্রোডাক্ট + একই ভ্যারিয়েন্ট হলেই লাইন মার্জ হবে
        const existingItemIndex = cart.findIndex(item =>
            String(item.id) === String(newItem.id) &&
            String(item.variantId || '') === String(newItem.variantId || '')
        );

        if (existingItemIndex > -1) {
            let existingItem = cart.splice(existingItemIndex, 1)[0]; 
            existingItem.quantity += quantity; 
            existingItem.price = newItem.price;
            existingItem.selectedColor = newItem.selectedColor;
            existingItem.selectedSize = newItem.selectedSize;
            existingItem.variantLabel = newItem.variantLabel;
            existingItem.variantId = newItem.variantId;
            existingItem.selectedVariant = newItem.selectedVariant;
            if (newItem.image) {
                existingItem.image = newItem.image;
                existingItem.selectedImage = newItem.selectedImage;
                existingItem.variantImage = newItem.variantImage;
                existingItem.products = newItem.products;
            }
            cart.unshift(existingItem); 
        } else {
            cart.unshift(newItem);
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        if (typeof window.updateCartCount === 'function') window.updateCartCount();

        const authToken = localStorage.getItem('token') || localStorage.getItem('customerToken');
        if (authToken) {
            fetch('/api/cart/add', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    productId: newItem.id,
                    quantity,
                    name: newItem.name,
                    price: newItem.price,
                    image: newItem.image || newItem.products || '',
                    selectedImage: newItem.selectedImage || newItem.image || '',
                    variantImage: newItem.variantImage || newItem.image || '',
                    icon: newItem.icon || '',
                    variantId: newItem.variantId || '',
                    variantLabel: newItem.variantLabel || '',
                    variantAttribute: newItem.variantAttribute || '',
                    variantValue: newItem.variantValue || '',
                    variantSku: newItem.variantSku || '',
                    selectedColor: newItem.selectedColor || '',
                    selectedSize: newItem.selectedSize || '',
                    selectedVariant: newItem.selectedVariant || null
                })
            })
                .then((res) => res.json())
                .then((updatedData) => {
                    if (Array.isArray(updatedData) && typeof window.syncCartFromServerItems === 'function') {
                        window.syncCartFromServerItems(updatedData);
                    }
                })
                .catch((err) => console.error('Add to cart API sync failed:', err));
        }
        const label = newItem.variantLabel ? ` (${newItem.variantLabel})` : '';
        if (typeof window.showCartAddedToast === 'function') {
            window.showCartAddedToast();
        } else {
            showToast(`Product${label} added to cart successfully! 🛒`, 'success');
        }
    };
    

    // 👈 রিয়েল Buy Now লজিক (সাধারণ কার্টে হাত না দিয়ে আইসোলেটেড মোডে চেকআউটে পাঠাবে)
    const handleBuyNow = () => {
        if (!currentProductData) return showToast("Please wait, product data is loading...", "error");
        if (!ensureVariantSelected()) return;

        const stockAvail = getAvailableStock();
        if (Array.isArray(currentProductData.variants) && currentProductData.variants.length && stockAvail <= 0) {
            if (typeof window.showOutOfStockToast === 'function') {
                return window.showOutOfStockToast();
            }
            return showToast("This option is out of stock.", "error");
        }

        const quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

        // Buy Now এর জন্য শুধু এই একটি প্রোডাক্ট দিয়ে একটি নতুন অ্যারে তৈরি
        const buyNowItem = [buildCartItem(quantity)];

        // কার্টকে না ছুঁয়ে সম্পূর্ণ ভিন্ন একটি স্টোরেজ বাক্সে রাখা হচ্ছে
        localStorage.setItem('isBuyNowMode', 'true');
        localStorage.setItem('buy_now_item', JSON.stringify(buyNowItem));
        localStorage.setItem("activeCheckoutSession", "true");

        showToast("Proceeding to checkout...", "success");
        
        setTimeout(() => {
            window.location.href = '/checkout'; 
        }, 500); 
    };

    // বাটনগুলোর সাথে ফাংশন জুড়ে দেওয়া
    if (addToCartBtn) addToCartBtn.addEventListener('click', handleAddToCart);
    if (stickyAddToCartBtn) stickyAddToCartBtn.addEventListener('click', handleAddToCart);
    if (buyNowBtn) buyNowBtn.addEventListener('click', handleBuyNow);
    if (stickyBuyNowBtn) stickyBuyNowBtn.addEventListener('click', handleBuyNow);

    // মোবাইল স্টিকি বার স্ক্রোল ইফেক্ট
    window.addEventListener('scroll', () => {
        const mobileStickyBar = document.getElementById('mobileStickyBar');
        if (mobileStickyBar) {
            if (window.scrollY > 300) {
                mobileStickyBar.classList.remove('hidden');
            } else {
                mobileStickyBar.classList.add('hidden');
            }
        }
    });
}

// ==========================================================================
// 🌟 SECTION 7A: DYNAMIC PAYMENT BADGES (Admin-controlled, uploaded logos)
// ==========================================================================

function getPaymentSettingsSource(settings = {}) {
    const nested = settings.systemSettings;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return { ...settings, ...nested };
    }
    return settings;
}

function resolveEnabledPaymentMethods(settings = {}) {
    const src = getPaymentSettingsSource(settings);

    if (Array.isArray(src.enabledPaymentMethods) && src.enabledPaymentMethods.length) {
        return src.enabledPaymentMethods.filter((method) => method && method.id);
    }

    const gateways = src.paymentGateways;
    if (gateways && typeof gateways === 'object' && !Array.isArray(gateways)) {
        return Object.entries(gateways)
            .filter(([, entry]) => entry?.enabled === true)
            .map(([id, entry]) => ({
                id,
                name: entry?.name || id,
                logoUrl: entry?.logoUrl || ''
            }));
    }

    const legacyGateways = src.activePaymentGateways;
    if (legacyGateways && typeof legacyGateways === 'object' && !Array.isArray(legacyGateways)) {
        return Object.entries(legacyGateways)
            .filter(([, enabled]) => enabled === true)
            .map(([id]) => ({
                id,
                name: window.PaymentBrandLogos?.DEFAULT_GATEWAY_NAMES?.[id] || id,
                logoUrl: ''
            }));
    }

    return [];
}

function buildPaymentBadgeHtml(method) {
    if (!method || !method.id) return '';

    const name = method.name || method.id;
    const logoUrl = method.logoUrl || '';

    if (logoUrl) {
        return `<img src="${logoUrl}" alt="${name}" class="payment-brand-logo payment-brand-logo--storefront payment-brand-logo--${String(method.id).toLowerCase()}" loading="lazy" decoding="async">`;
    }

    return `<span class="payment-name-badge payment-name-badge--${String(method.id).toLowerCase()}">${name}</span>`;
}

function paintActivePaymentBadges(methods) {
    const container = document.getElementById('activePaymentBadges');
    const zone = document.getElementById('paymentIconsZone');
    if (!container) return;

    const list = Array.isArray(methods) ? methods : [];
    if (!list.length) {
        container.innerHTML = '';
        zone?.classList.add('hidden');
        return;
    }

    zone?.classList.remove('hidden');
    container.innerHTML = list.map(buildPaymentBadgeHtml).join('');
}

async function renderActivePaymentBadges() {
    const inline = window.__STORE_SETTINGS__ || {};
    let methods = resolveEnabledPaymentMethods(inline);

    const src = getPaymentSettingsSource(inline);
    if (!methods.length && !src.enabledPaymentMethods && !src.paymentGateways && !src.activePaymentGateways) {
        try {
            const res = await fetch('/api/store/payment-methods');
            const data = await res.json();
            if (data.success && data.data) {
                methods = resolveEnabledPaymentMethods(data.data);
            }
        } catch (err) {
            console.warn('Payment methods fallback fetch failed:', err);
        }
    }

    paintActivePaymentBadges(methods);
}

// ==========================================================================
// 🌟 SECTION 7B: SOCIAL SHARE & COPY LINK
// ==========================================================================
function getProductSharePayload() {
    const title = (currentProductData && currentProductData.name)
        ? String(currentProductData.name).trim()
        : (document.getElementById('productTitle')?.innerText || 'Check out this product').trim();
    const url = window.location.href.split('#')[0];
    const text = `${title} — ${url}`;
    return { title, url, text };
}

function openShareWindow(shareUrl) {
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=520');
}

function setupShareButtons() {
    const whatsappBtn = document.getElementById('shareWhatsApp');
    const facebookBtn = document.getElementById('shareFacebook');
    const messengerBtn = document.getElementById('shareMessenger');
    const copyBtn = document.getElementById('shareCopyLink');

    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', () => {
            const { text } = getProductSharePayload();
            openShareWindow(`https://wa.me/?text=${encodeURIComponent(text)}`);
        });
    }

    if (facebookBtn) {
        facebookBtn.addEventListener('click', () => {
            const { url } = getProductSharePayload();
            openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
        });
    }

    if (messengerBtn) {
        messengerBtn.addEventListener('click', () => {
            const { url } = getProductSharePayload();
            openShareWindow(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}&display=popup`);
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const { url } = getProductSharePayload();
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    const helper = document.createElement('textarea');
                    helper.value = url;
                    helper.setAttribute('readonly', '');
                    helper.style.position = 'fixed';
                    helper.style.opacity = '0';
                    document.body.appendChild(helper);
                    helper.select();
                    document.execCommand('copy');
                    helper.remove();
                }
                showToast('Link copied to clipboard!', 'success');
            } catch (err) {
                console.error('Copy link failed:', err);
                showToast('Could not copy link. Please copy the URL manually.', 'error');
            }
        });
    }
}

// ==========================================================================
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




// ==========================================================================
// 🌟 SECTION 9: FETCH PRODUCT REVIEWS (NEW)
// ==========================================================================
async function fetchProductReviews(productId) {
    try {
        const response = await fetch(`/api/reviews/${productId}`);
        const data = await response.json();
        
        if (data.success && data.reviews) {
            renderReviews(data.reviews);
        } else {
            renderReviews([]);
        }
    } catch (error) {
        console.error("Error fetching reviews from database:", error);
        renderReviews([]); // এরর হলে খালি দেখাবে
    }
}

// NOTE: Review submission has moved to the User Dashboard (My Orders).
// This page is now read-only for reviews - customers can only submit a
// review from their dashboard once the related order status is "Delivered".
