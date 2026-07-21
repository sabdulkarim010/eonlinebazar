//File Name: js/product-details.js



// ==========================================================================
// 🌟 SECTION 1: GLOBAL CONFIGURATIONS & INITIALIZATION
// ==========================================================================
const API_BASE_URL = '/api/products'; 
let currentProductData = null;
/** Per-attribute selection, e.g. { Size: variantObj, Color: variantObj } */
let selectedVariantsByAttr = {};

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
        if (product.stock > 0) {
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
    const sku = (v.sku || '').trim();
    if (sku) return sku;
    return `${(v.attribute || '').trim()}::${(v.value || '').trim()}`;
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

/** Color value (lowercase) → { index, variant } based on variant order vs. images array */
function getColorImageMap(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const colorVariants = variants.filter(v => isColorAttribute(v.attribute) && (v.value || '').trim());
    const images = getProductImages(product);
    const map = {};
    colorVariants.forEach((cv, i) => {
        const key = String(cv.value).trim().toLowerCase();
        const index = Math.min(i, images.length - 1);
        map[key] = { index, variant: cv, url: images[index] };
    });
    return map;
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

    const variants = Array.isArray(product.variants) ? product.variants.filter(v => (v.attribute || v.value)) : [];

    selectedVariantsByAttr = {};

    if (variants.length === 0) {
        wrap.classList.add('hidden');
        wrap.innerHTML = '';
        return;
    }

    wrap.classList.remove('hidden');
    const groups = groupVariantsByAttribute(variants);

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
            html += `<div class="variant-badge${disabled ? ' is-disabled' : ''}"
                        data-variant-key="${escapeHtml(key)}"
                        data-variant-attr="${escapeHtml(v.attribute || '')}"
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

/** Default Size / Color (and other groups) after gallery + selectors are rendered */
function initializeDefaultVariantSelections(product) {
    const variants = Array.isArray(product.variants) ? product.variants.filter(v => (v.attribute || v.value)) : [];
    if (variants.length === 0) return;

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
    const entry = getColorImageMap(currentProductData)[colorKey];
    if (!entry) return;

    const mainImg = document.getElementById('mainProductImg');
    const stickyImg = document.getElementById('stickyBarImg');
    if (mainImg) mainImg.src = entry.url;
    if (stickyImg) stickyImg.src = entry.url;

    document.querySelectorAll('.thumb-img').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === entry.index);
    });
}

function syncPriceFromSelection() {
    const sizeVariant = getSelectedVariantByType('size');
    const priceSource = sizeVariant || Object.values(selectedVariantsByAttr)[0];
    const price = priceSource ? getVariantPrice(priceSource) : Number(currentProductData?.price) || 0;

    const priceEl = document.getElementById('productPrice');
    const stickyPrice = document.getElementById('stickyBarPrice');
    if (priceEl) priceEl.innerText = `৳ ${price.toLocaleString()}`;
    if (stickyPrice) stickyPrice.innerText = `৳ ${price.toLocaleString()}`;
}

function syncStockFromSelection() {
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
        syncMainImageFromColor(variant);
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

/** CSS attribute-selector নিরাপদ করার হেল্পার */
function cssEscape(str) {
    return String(str).replace(/["\\]/g, '\\$&');
}

/** স্টক স্ট্যাটাস ব্যাজ আপডেট */
function updateStockStatus(stock) {
    const stockStatus = document.getElementById('stockStatus');
    if (!stockStatus) return;
    if (stock > 0) {
        stockStatus.innerText = "In Stock";
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
    const sizeVariant = getSelectedVariantByType('size');
    if (sizeVariant) return Number(sizeVariant.stock) || 0;
    const any = Object.values(selectedVariantsByAttr)[0];
    if (any) return Number(any.stock) || 0;
    return Number(currentProductData && currentProductData.stock) || 0;
}

function getEffectivePrice() {
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

function renderProductImages(product) {
    const mainImg = document.getElementById('mainProductImg');
    const stickyImg = document.getElementById('stickyBarImg');
    const gallery = document.getElementById('thumbGallery');
    const mainBox = document.querySelector('.main-image-box');

    clearDetailsMediaFallback(mainBox);

    const imagesArray = getProductImages(product);
    const indexToColor = getImageIndexToColorMap(product);

    if (imagesArray.length === 0) {
        if (mainImg) {
            mainImg.style.display = 'none';
            mainImg.removeAttribute('src');
        }
        if (stickyImg) {
            stickyImg.style.display = 'none';
            stickyImg.removeAttribute('src');
        }
        if (gallery) gallery.innerHTML = '';
        renderDetailsMediaFallback(product, mainBox);
        return;
    }

    if (mainImg) mainImg.style.display = '';
    if (stickyImg) stickyImg.style.display = '';

    const mainImageUrl = imagesArray[0];
    if (mainImg) {
        mainImg.src = mainImageUrl;
        attachMainImageFallback(mainImg, product, mainBox);
    }
    if (stickyImg) {
        stickyImg.src = mainImageUrl;
        stickyImg.onerror = function () {
            this.style.display = 'none';
        };
    }

    if (gallery) {
        gallery.innerHTML = '';

        imagesArray.forEach((imgUrl, index) => {
            const imgBtn = document.createElement('img');
            imgBtn.src = imgUrl;
            imgBtn.classList.add('thumb-img');
            imgBtn.dataset.imageIndex = String(index);

            const colorEntry = indexToColor[index];
            if (colorEntry) {
                imgBtn.dataset.colorValue = colorEntry.variant.value;
                imgBtn.title = colorEntry.variant.value;
            }

            if (index === 0) imgBtn.classList.add('active');

            imgBtn.addEventListener('click', () => {
                if (colorEntry) {
                    selectVariantOption(colorEntry.variant);
                    return;
                }

                document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
                imgBtn.classList.add('active');
                if (mainImg) {
                    mainImg.style.display = '';
                    mainImg.src = imgUrl;
                    attachMainImageFallback(mainImg, product, mainBox);
                }
                if (stickyImg) {
                    stickyImg.style.display = '';
                    stickyImg.src = imgUrl;
                }
                clearDetailsMediaFallback(mainBox);
            });

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
            variantSku: ''
        };
        const selectedList = Object.values(selectedVariantsByAttr);
        if (selectedList.length > 0) {
            base.variantId = getCombinedVariantKey();
            base.variantLabel = getCombinedVariantLabel();
            base.variantAttribute = selectedList.map(v => v.attribute).filter(Boolean).join(', ');
            base.variantValue = selectedList.map(v => v.value).filter(Boolean).join(', ');
            base.variantSku = selectedList.map(v => (v.sku || '').trim()).filter(Boolean).join('|');
        }
        return base;
    };

    /** ভ্যারিয়েন্ট থাকা সত্ত্বেও সিলেক্ট না করলে ব্লক করা */
    const ensureVariantSelected = () => {
        const variants = Array.isArray(currentProductData.variants)
            ? currentProductData.variants.filter(v => v.attribute || v.value)
            : [];
        if (variants.length === 0) return true;

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
            existingItem.price = newItem.price; // দাম সিঙ্ক রাখা
            cart.unshift(existingItem); 
        } else {
            cart.unshift(newItem);
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        if (typeof window.updateCartCount === 'function') window.updateCartCount();
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
