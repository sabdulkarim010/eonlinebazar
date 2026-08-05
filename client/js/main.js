/**
 * ==========================================================================
 * File Name: js/main.js
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * Description: Secure DOM-based Product Rendering & Dynamic Frontend Logic
 * ==========================================================================
 */

/* ==========================================================================
   SECTION 1: GLOBAL VARIABLES & INITIALIZATION (শুরু এবং ভেরিয়েবল)
   ========================================================================== */
let allProducts = [];
let flashSaleState = null;
let flashSaleCountdownTimer = null;

const HOME_CATALOG = {
    page: 1,
    limit: (window.ProductCatalogUI && window.ProductCatalogUI.DEFAULT_PAGE_SIZE) || 24,
    totalPages: 0,
    totalProducts: 0,
    hasMore: false
};

function t(key, vars) {
    return window.i18n ? window.i18n.t(key, vars) : key;
}

function getCatalogUI() {
    return window.ProductCatalogUI || null;
}

document.addEventListener('DOMContentLoaded', () => {
    const UI = getCatalogUI();
    if (UI) HOME_CATALOG.limit = UI.normalizePageSize(HOME_CATALOG.limit);

    initFlashSaleEngine();
    loadNavbarCategories();
    loadSearchCategorySelect();
    loadHomepageCategories();
    fetchAndRenderProducts();
});

/* ==========================================================================
   SECTION 2: FETCH PRODUCTS FROM API (ডাটাবেজ থেকে ডাটা আনা)
   ========================================================================== */
let productFetchInFlight = false;
let productFetchFailed = false;
let productsFetchAttempted = false;

function showEmptyProductsState(message) {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;
    productGrid.innerHTML = `<p style="text-align:center;padding:20px;color:#9ca3af">${message || 'Products loading...'}</p>`;
    renderHomeCatalogControls();
}

function renderProductFetchError(message, statusCode) {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    const isRateLimited = statusCode === 429;
    if (isRateLimited) {
        showEmptyProductsState(
            window.i18n ? window.i18n.t('home.rate_limited_title') : 'Too many requests — please wait a moment.'
        );
        return;
    }
    const title = isRateLimited
        ? (window.i18n ? window.i18n.t('home.rate_limited_title') : 'Too many requests')
        : (window.i18n ? window.i18n.t('home.load_error_title') : 'Could not load products');
    const hint = message || t('common.error');

    productGrid.innerHTML = `
        <div class="product-fetch-error" role="alert">
            <div class="product-fetch-error__icon" aria-hidden="true">
                <i class="fa-solid ${isRateLimited ? 'fa-gauge-high' : 'fa-triangle-exclamation'}"></i>
            </div>
            <h3 class="product-fetch-error__title">${title}</h3>
            <p class="product-fetch-error__message">${hint}</p>
            <button type="button" class="product-fetch-error__retry" id="productFetchRetryBtn">
                <i class="fa-solid fa-rotate-right"></i> ${window.i18n ? window.i18n.t('common.try_again') : 'Try Again'}
            </button>
        </div>
    `;
    renderHomeCatalogControls({ forceHide: true });

    document.getElementById('productFetchRetryBtn')?.addEventListener('click', () => {
        productFetchFailed = false;
        productsFetchAttempted = false;
        HOME_CATALOG.page = 1;
        fetchAndRenderProducts({ manual: true });
    });
}

function renderHomeCatalogControls(opts = {}) {
    const UI = getCatalogUI();
    const loadMoreWrap = document.getElementById('homeLoadMoreWrap');
    const paginationEl = document.getElementById('homePaginationContainer');
    if (!UI) return;

    const hide = opts.forceHide === true || !HOME_CATALOG.totalProducts;

    if (loadMoreWrap) {
        UI.renderLoadMoreButton(loadMoreWrap, {
            hasMore: !hide && HOME_CATALOG.hasMore,
            loading: productFetchInFlight && opts.appending === true,
            label: 'View More Products',
            loadingLabel: window.i18n ? window.i18n.t('common.loading') : 'Loading…',
            onLoadMore: () => {
                if (!HOME_CATALOG.hasMore || productFetchInFlight) return;
                HOME_CATALOG.page += 1;
                fetchAndRenderProducts({ append: true, allowRetry: true, manual: true });
            }
        });
    }

    if (paginationEl) {
        UI.renderPaginationPills(paginationEl, {
            page: HOME_CATALOG.page,
            totalPages: hide ? 0 : HOME_CATALOG.totalPages,
            onPageChange: (p) => {
                if (p === HOME_CATALOG.page || productFetchInFlight) return;
                HOME_CATALOG.page = p;
                window.scrollTo({ top: 0, behavior: 'smooth' });
                fetchAndRenderProducts({ manual: true, allowRetry: true });
            }
        });
    }
}

function fetchAndRenderProducts(options = {}) {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    const append = options.append === true;

    // Initial auto-fetch once; later calls must pass manual/allowRetry/append
    if (productsFetchAttempted && !options.manual && !options.allowRetry && !append) return;

    if (productFetchFailed && !options.manual && !options.allowRetry && !append) return;
    if (productFetchInFlight && !options.manual && !options.allowRetry && !append) return;

    if (!options.manual && !options.allowRetry && !append) {
        productsFetchAttempted = true;
    }

    productFetchInFlight = true;

    if (!append && (options.manual || !allProducts.length)) {
        productGrid.innerHTML = `
            <div class="product-fetch-loading" aria-live="polite">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>${window.i18n ? window.i18n.t('common.loading') : 'Loading products…'}</span>
            </div>
        `;
    }

    if (append) {
        renderHomeCatalogControls({ appending: true });
    }

    const params = new URLSearchParams({
        page: String(HOME_CATALOG.page),
        limit: String(HOME_CATALOG.limit)
    });

    fetch(`/api/products?${params.toString()}`)
        .then(async (response) => {
            let payload = null;
            try {
                payload = await response.json();
            } catch (_) {
                payload = null;
            }

            if (!response.ok) {
                const err = new Error(
                    payload?.message
                    || (response.status === 429
                        ? 'You have made too many requests. Please wait a moment and try again.'
                        : 'Unable to load products right now.')
                );
                err.status = response.status;
                throw err;
            }

            return payload;
        })
        .then(data => {
            productFetchFailed = false;
            const products = Array.isArray(data)
                ? data
                : (data.products || data.data || []);
            const pagination = (!Array.isArray(data) && data.pagination) ? data.pagination : {};

            HOME_CATALOG.totalProducts = pagination.totalProducts != null
                ? pagination.totalProducts
                : (append ? allProducts.length + products.length : products.length);
            HOME_CATALOG.totalPages = pagination.totalPages != null
                ? pagination.totalPages
                : Math.ceil(HOME_CATALOG.totalProducts / HOME_CATALOG.limit);
            HOME_CATALOG.page = pagination.currentPage != null ? pagination.currentPage : HOME_CATALOG.page;
            HOME_CATALOG.hasMore = pagination.hasMore === true
                || (HOME_CATALOG.page < HOME_CATALOG.totalPages);
            HOME_CATALOG.limit = pagination.limit != null ? pagination.limit : HOME_CATALOG.limit;

            if (append) {
                allProducts = allProducts.concat(products);
            } else {
                allProducts = products;
            }
            window.globalProductCatalog = allProducts;

            displayProducts(products, { append });
            renderHomeCatalogControls();
        })
        .catch(error => {
            productFetchFailed = true;
            console.error('Error fetching products:', error);
            if (append) {
                HOME_CATALOG.page = Math.max(1, HOME_CATALOG.page - 1);
                renderHomeCatalogControls();
            } else {
                renderProductFetchError(error.message, error.status);
            }
        })
        .finally(() => {
            productFetchInFlight = false;
            if (!productFetchFailed) {
                renderHomeCatalogControls();
            }
        });
}

/* ==========================================================================
   SECTION 3: RENDER PRODUCT CARDS (প্রোডাক্ট কার্ড এবং ইমেজ/ইমোজি লজিক)
   ========================================================================== */
function createHomeProductCard(product) {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';

    const productId = product._id || product.id || product.productId;

    const productLink = document.createElement('a');
    productLink.href = window.EOBUrlUtils
        ? window.EOBUrlUtils.buildUrl('/product-details.html', { id: productId })
        : `/product-details.html?id=${encodeURIComponent(productId)}`;
    productLink.style.textDecoration = 'none';
    productLink.style.color = 'inherit';
    productLink.style.display = 'block';

    const imgBox = document.createElement('div');
    imgBox.className = 'product-img-box';

    const PT = window.ProductThumbnail;
    const meta = PT ? PT.getDisplayMeta(product) : { image: product.image || product.photo || '', emoji: product.icon || '' };
    const imageSource = PT && typeof PT.toDisplayImageUrl === 'function'
        ? (PT.toDisplayImageUrl(meta.image) || meta.image)
        : meta.image;
    const iconData = meta.emoji;

    if (PT) {
        PT.mountInto(imgBox, product, { variant: 'card', alt: product.name || 'Product Image' });
    }

    const productInfo = document.createElement('div');
    productInfo.className = 'product-info';
    productInfo.innerHTML = `
        <h4 class="product-name">${product.name || 'Unknown Product'}</h4>
        <div class="product-price-row">
            ${buildProductPriceMarkup(product)}
        </div>
    `;

    const wishlistBtn = (window.WishlistEngine && typeof window.WishlistEngine.createHeartButton === 'function')
        ? window.WishlistEngine.createHeartButton(productId, {
            name: product.name,
            price: product.price,
            image: imageSource,
            icon: iconData
        })
        : null;

    const addToCartBtn = document.createElement('button');
    addToCartBtn.className = 'add-to-cart-btn';
    addToCartBtn.innerText = t('product.add_to_cart');

    addToCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (typeof window.addToBag === 'function') {
            window.addToBag(productId, product.name, product.price, imageSource);
        } else if (typeof addToBag === 'function') {
            addToBag(productId, product.name, product.price, imageSource);
        } else {
            alert("Cart function not found. Please reload the page.");
        }
    });

    productLink.appendChild(imgBox);
    productLink.appendChild(productInfo);
    productCard.appendChild(productLink);
    if (wishlistBtn) productCard.appendChild(wishlistBtn);
    productCard.appendChild(addToCartBtn);

    return productCard;
}

function displayProducts(productsToDisplay, options = {}) {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    const append = options.append === true;
    const UI = getCatalogUI();

    if (!append) {
        productGrid.innerHTML = '';
    }

    if (!Array.isArray(productsToDisplay) || productsToDisplay.length === 0) {
        if (!append) {
            productGrid.innerHTML = `<p style="text-align: center; width: 100%;">${t('search.no_results')}</p>`;
            renderHomeCatalogControls({ forceHide: true });
        }
        return;
    }

    const newCards = [];
    productsToDisplay.forEach(product => {
        const productCard = createHomeProductCard(product);
        productGrid.appendChild(productCard);
        newCards.push(productCard);
    });

    if (append && UI) {
        UI.markCardsEntering(newCards);
    }

    if (window.WishlistEngine && typeof window.WishlistEngine.refreshHearts === 'function') {
        window.WishlistEngine.ensureLoaded().then(() => {
            window.WishlistEngine.refreshHearts(productGrid);
        });
    }

    if (window.analytics && productsToDisplay.length && !append) {
        window.analytics.trackViewItemList(productsToDisplay, 'Featured Products');
    }
}



/* ==========================================================================
   SECTION 3B: FLASH SALE ENGINE (Banner, Countdown, Dynamic Pricing)
   ========================================================================== */
async function initFlashSaleEngine() {
    try {
        const res = await fetch('/api/store/flash-sale');
        const data = await res.json();
        if (data.success && data.data) {
            flashSaleState = data.data;
            renderFlashSaleBanner(flashSaleState);
        }
    } catch (error) {
        console.error('Flash sale load error:', error);
    }
}

function renderFlashSaleBanner(state) {
    const banner = document.getElementById('flashSaleBanner');
    if (!banner || !state?.isActive) {
        if (banner) banner.style.display = 'none';
        if (flashSaleCountdownTimer) clearInterval(flashSaleCountdownTimer);
        return;
    }

    banner.style.display = 'block';
    const titleEl = document.getElementById('flashSaleTitle');
    const subtitleEl = document.getElementById('flashSaleSubtitle');
    if (titleEl) titleEl.textContent = state.flashSaleTitle || `⚡ ${t('home.flash_sale')}`;
    if (subtitleEl) {
        subtitleEl.textContent = `Up to ${state.flashSaleDiscountPercent || 0}% off on selected products — hurry before time runs out!`;
    }

    startFlashSaleCountdown(state.endsAt);
}

function startFlashSaleCountdown(endsAt) {
    const endTime = new Date(endsAt).getTime();
    if (Number.isNaN(endTime)) return;

    const hoursEl = document.getElementById('flashHours');
    const minutesEl = document.getElementById('flashMinutes');
    const secondsEl = document.getElementById('flashSeconds');
    const banner = document.getElementById('flashSaleBanner');

    const tick = () => {
        const diff = endTime - Date.now();
        if (diff <= 0) {
            if (hoursEl) hoursEl.textContent = '00';
            if (minutesEl) minutesEl.textContent = '00';
            if (secondsEl) secondsEl.textContent = '00';
            if (banner) banner.style.display = 'none';
            if (flashSaleCountdownTimer) clearInterval(flashSaleCountdownTimer);
            flashSaleState = { ...(flashSaleState || {}), isActive: false };
            HOME_CATALOG.page = 1;
            fetchAndRenderProducts({ allowRetry: true, manual: true });
            return;
        }

        const totalSeconds = Math.floor(diff / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
        if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
        if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
    };

    tick();
    if (flashSaleCountdownTimer) clearInterval(flashSaleCountdownTimer);
    flashSaleCountdownTimer = setInterval(tick, 1000);
}

function buildProductPriceMarkup(product) {
    const fmt = window.i18n?.formatCurrency || ((n) => `৳${Number(n).toLocaleString()}`);
    const currentPrice = Number(product.price) || 0;
    const originalPrice = Number(product.originalPrice) || 0;
    const onFlashSale = product.flashSaleActive === true && originalPrice > currentPrice;

    if (onFlashSale) {
        return `
            <span class="price-original">${fmt(originalPrice)}</span>
            <span class="currency">৳</span>
            <span class="price-amount">${currentPrice.toLocaleString(window.i18n?.getCurrentLang?.() === 'bn' ? 'bn-BD' : 'en-US')}</span>
            <span class="flash-sale-tag">-${product.flashSaleDiscountPercent || 0}%</span>
        `;
    }

    return `
        <span class="currency">৳</span>
        <span class="price-amount">${currentPrice.toLocaleString(window.i18n?.getCurrentLang?.() === 'bn' ? 'bn-BD' : 'en-US')}</span>
    `;
}



/* ==========================================================================
   SECTION 4: TOP NAV LINKS + CATEGORY DRAWER + HOMEPAGE CATEGORIES
   - Top bar: GET /api/navbar-links (promo / operational links)
   - ☰ All drawer: GET /api/categories/navbar (catalog categories only)
   ========================================================================== */
function escapeCatHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Normalize public category API payloads: { data } | { categories } | array */
function extractCategories(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.categories)) return payload.categories;
    return [];
}

function categoryParentId(cat) {
    if (!cat || cat.parentCategory == null || cat.parentCategory === '') return null;
    return String(cat.parentCategory._id || cat.parentCategory);
}

/** Top-level (parent) categories only — no sub-categories in the header search select. */
function getTopLevelCategories(categories) {
    if (!Array.isArray(categories) || !categories.length) return [];
    return categories.filter((c) => !categoryParentId(c));
}

function categoryAccent(cat) {
    return cat?.accentColor || cat?.color || '#f97316';
}

function categoryImage(cat) {
    return cat?.imageUrl || cat?.image || cat?.iconUrl || '';
}

/** Slugify a category name for listing URLs (matches Category model / SEO helper). */
function slugifyCategoryToken(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Category product listing URL — never bare /search for a real category.
 * Prefers /category/:slug so navbar clicks land on a filtered listing, not the empty search prompt.
 */
function categoryListingHref(catOrSlug) {
    let slug = '';
    if (catOrSlug && typeof catOrSlug === 'object') {
        slug = String(catOrSlug.slug || '').trim() || slugifyCategoryToken(catOrSlug.name);
    } else {
        slug = slugifyCategoryToken(catOrSlug);
    }
    if (!slug) return '/products';
    return `/category/${encodeURIComponent(slug)}`;
}

/** @deprecated Use categoryListingHref — kept as alias for older call sites */
function categorySearchHref(slug) {
    return categoryListingHref(slug);
}

/** Header search scope select (#categorySelect / #searchCategorySelect). */
function getSearchCategorySelect() {
    return document.getElementById('searchCategorySelect')
        || document.getElementById('categorySelect')
        || document.querySelector('.search-box-container .search-category')
        || document.querySelector('.search-category');
}

/**
 * Amazon-style scope selector: top-level parents only.
 * option.value = category _id; data-slug for clean /category/:slug URLs.
 * Prefers HeaderSearch module when loaded.
 */
function populateSearchCategorySelect(categories) {
    if (window.HeaderSearch?.populateSearchCategorySelect) {
        return window.HeaderSearch.populateSearchCategorySelect(categories);
    }

    const categorySelect = getSearchCategorySelect();
    if (!categorySelect || !Array.isArray(categories)) return;

    const previous = categorySelect.value || 'all';
    categorySelect.innerHTML = '<option value="all">All Categories</option>';

    getTopLevelCategories(categories).forEach((cat) => {
        if (!cat?._id && !cat?.slug && !cat?.name) return;

        const option = document.createElement('option');
        const id = cat._id ? String(cat._id) : '';
        const slug = String(cat.slug || '').trim() || slugifyCategoryToken(cat.name);
        option.value = id || slug || cat.name;
        option.textContent = cat.name || slug;
        option.dataset.level = '0';
        if (id) option.dataset.categoryId = id;
        if (slug) option.dataset.slug = slug;
        if (cat.name) option.dataset.name = cat.name;
        categorySelect.appendChild(option);
    });

    const match = [...categorySelect.options].find((opt) =>
        opt.value === previous
        || opt.dataset.slug === previous
        || opt.dataset.categoryId === previous
    );
    categorySelect.value = match ? match.value : 'all';
}

/** Header search category dropdown — parent categories only (public API). */
async function loadSearchCategorySelect() {
    if (window.HeaderSearch?.loadSearchCategorySelect) {
        return window.HeaderSearch.loadSearchCategorySelect();
    }
    try {
        const res = await fetch('/api/categories/tree');
        const data = await res.json();
        let categories = extractCategories(data);
        if (!categories.length) {
            const fallback = await fetch('/api/categories').then((r) => r.json());
            const flat = Array.isArray(fallback?.flat) ? fallback.flat : null;
            categories = flat && flat.length ? flat : extractCategories(fallback);
        }
        if (!categories.length) return;
        populateSearchCategorySelect(categories);
    } catch (err) {
        console.warn('Search category select load error:', err);
    }
}

/** Alias used by some call sites / docs */
async function loadCategoryDropdown() {
    return loadSearchCategorySelect();
}

/**
 * Top horizontal bar = ☰ All + published NavbarLink promo links.
 * Product categories / sub-categories load only into the ☰ All side drawer.
 */
async function loadNavbarCategories() {
    const btnContainer = document.getElementById('categoryButtonContainer')
        || document.querySelector('.category-nav ul')
        || document.querySelector('#category-navbar')
        || document.querySelector('.navbar-categories')
        || document.querySelector('nav .nav-links');

    if (!btnContainer) {
        console.warn('Navbar container not found');
        return;
    }

    // ☰ All opens the Amazon-style side drawer (categories only — not a /products link)
    const allBtn = `
        <button type="button"
                class="nav-all-btn nav-category-item"
                id="navDrawerOpenBtn"
                data-nav-all
                aria-haspopup="dialog"
                aria-controls="navDrawer"
                aria-expanded="false"
                aria-label="Open all departments menu">
            <span class="nav-all-btn__icon" aria-hidden="true"><span></span><span></span><span></span></span>
            All
        </button>
    `;

    const [linksResult, categoriesResult] = await Promise.allSettled([
        fetch('/api/navbar-links').then((r) => r.json()),
        (async () => {
            // Prefer /tree for nested subCategories; fall back to /navbar
            try {
                const treeRes = await fetch('/api/categories/tree');
                const treeJson = await treeRes.json();
                if (treeRes.ok && Array.isArray(treeJson?.data)) {
                    return treeJson;
                }
            } catch (_) { /* fall through */ }
            return fetch('/api/categories/navbar').then((r) => r.json());
        })()
    ]);

    let links = [];
    if (linksResult.status === 'fulfilled') {
        const payload = linksResult.value;
        links = Array.isArray(payload?.data) ? payload.data
            : Array.isArray(payload) ? payload
            : [];
    } else {
        console.error('Failed to load navbar links:', linksResult.reason);
    }

    let categories = [];
    if (categoriesResult.status === 'fulfilled') {
        categories = extractCategories(categoriesResult.value);
        // Drawer shows navbar-flagged parents when the flag is present
        if (categories.length && categories.some((c) => 'showInNavbar' in c)) {
            categories = categories.filter((c) => c.showInNavbar !== false);
        }
    } else {
        console.error('Failed to load drawer categories:', categoriesResult.reason);
    }

    // Clear prior dynamic top-bar nodes (promo links + legacy category tabs)
    btnContainer.querySelectorAll('[data-navbar-link-id], [data-category-id]').forEach((el) => {
        const drop = el.closest('.nav-category-item.has-dropdown') || el;
        drop.remove();
    });
    btnContainer.querySelectorAll('.nav-promo-link, #navDrawerOpenBtn').forEach((el) => el.remove());

    const linkMarkup = links.map((link) => {
        const title = escapeCatHtml(link.title || '');
        const href = escapeCatHtml(link.url || '#');
        const id = escapeCatHtml(link.id || link._id || '');
        const target = link.target === '_blank' ? '_blank' : '_self';
        const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
        return `
            <a href="${href}"
               class="nav-promo-link nav-category-item"
               data-navbar-link-id="${id}"
               target="${target}"${rel}>${title}</a>
        `;
    }).join('');

    btnContainer.innerHTML = allBtn + linkMarkup;
    initNavDrawer(categories);
}

/** Alias — top bar is driven by NavbarLink; categories feed the drawer only. */
async function loadNavbarLinks() {
    return loadNavbarCategories();
}
window.loadNavbarLinks = loadNavbarLinks;

/* ==========================================================================
   Amazon-style left side drawer (☰ All) — delegated to sidebarDrawer.js
   ========================================================================== */
function ensureSidebarDrawerLoaded() {
    if (window.SidebarDrawer?.init) return Promise.resolve();
    if (window.__sidebarDrawerLoading) return window.__sidebarDrawerLoading;

    window.__sidebarDrawerLoading = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-sidebar-drawer]');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = '/js/sidebarDrawer.js';
        script.async = false;
        script.dataset.sidebarDrawer = '1';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load sidebarDrawer.js'));
        document.head.appendChild(script);
    });
    return window.__sidebarDrawerLoading;
}

function initNavDrawer(categories) {
    const cats = Array.isArray(categories) ? categories : [];
    if (window.SidebarDrawer?.init) {
        window.SidebarDrawer.init(cats);
        return;
    }
    ensureSidebarDrawerLoaded()
        .then(() => {
            if (window.SidebarDrawer?.init) window.SidebarDrawer.init(cats);
        })
        .catch((err) => console.warn('SidebarDrawer unavailable:', err));
}

function openNavDrawer() {
    if (window.SidebarDrawer?.open) {
        window.SidebarDrawer.open();
        return;
    }
    ensureSidebarDrawerLoaded().then(() => window.SidebarDrawer?.open?.());
}

function closeNavDrawer() {
    if (window.SidebarDrawer?.close) window.SidebarDrawer.close();
}

window.openNavDrawer = openNavDrawer;
window.closeNavDrawer = closeNavDrawer;

/** Keep .sub-navbar overflow visible while a category dropdown is open (clips hero otherwise). */
function bindNavbarDropdownOverflow() {
    const subNav = document.getElementById('subNavbar')
        || document.querySelector('.sub-navbar');
    if (!subNav) return;

    subNav.querySelectorAll('.nav-category-item.has-dropdown').forEach((item) => {
        if (item.dataset.dropdownBound === '1') return;
        item.dataset.dropdownBound = '1';

        const open = () => subNav.classList.add('is-dropdown-open');
        const close = () => {
            // Delay so moving into the dropdown panel doesn't flicker-close
            requestAnimationFrame(() => {
                if (!subNav.querySelector('.has-dropdown:hover, .has-dropdown:focus-within')) {
                    subNav.classList.remove('is-dropdown-open');
                }
            });
        };

        item.addEventListener('mouseenter', open);
        item.addEventListener('mouseleave', close);
        item.addEventListener('focusin', open);
        item.addEventListener('focusout', close);
    });
}

async function loadHomepageCategories() {
    const container = document.getElementById('homepageCats')
        || document.querySelector('#category-grid')
        || document.querySelector('.categories-grid')
        || document.querySelector('.homepage-categories')
        || document.querySelector('[data-section="categories"]');

    if (!container) {
        console.warn('Homepage category container not found');
        return;
    }

    try {
        const res = await fetch('/api/categories/homepage');
        const data = await res.json();
        const categories = extractCategories(data);

        if (!categories.length) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = '';
        container.innerHTML = `
            <div class="hp-cats-header">
                <h2>Shop by Category</h2>
                <a href="/products" class="hp-cats-see-all">See All →</a>
            </div>
            <div class="hp-cats-grid" id="category-grid">
                ${categories.map((cat) => {
                    const name = escapeCatHtml(cat.name);
                    const color = escapeCatHtml(categoryAccent(cat));
                    const img = categoryImage(cat);
                    const icon = escapeCatHtml(cat.icon || '🏷️');
                    const href = categoryListingHref(cat);
                    const id = escapeCatHtml(cat._id || '');
                    const imgHtml = img
                        ? `<img src="${escapeCatHtml(img)}" alt="${name}" class="hp-cat-img"
                                onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='inline')">
                           <span class="hp-cat-emoji" style="display:none">${icon}</span>`
                        : `<span class="hp-cat-emoji">${icon}</span>`;

                    return `
                        <a href="${href}"
                           class="hp-cat-card category-card"
                           data-category-id="${id}"
                           style="--cat-color: ${color}">
                            <div class="hp-cat-img-wrap"
                                 style="background:${color}20;border-color:${color}">
                                ${imgHtml}
                            </div>
                            <div class="hp-cat-name">${name}</div>
                            ${cat.productCount ? `
                                <div class="hp-cat-count">${Number(cat.productCount)} items</div>
                            ` : ''}
                        </a>`;
                }).join('')}
            </div>
        `;
    } catch (err) {
        console.error('Failed to load homepage categories:', err);
        container.style.display = 'none';
    }
}

/* ==========================================================================
   SECTION 5: SEARCH LOGIC (Amazon-style header search)
   --------------------------------------------------------------------------
   Category dropdown is a scope selector only — no navigate/API on change.
   Search runs only on Enter or search-icon click (keyword + category scope).
   ========================================================================== */

function getHeaderSearchScope() {
    if (window.HeaderSearch?.readScope) {
        return window.HeaderSearch.readScope();
    }
    const categoryEl = getSearchCategorySelect();
    if (!categoryEl) return { category: '', slug: '', categoryId: '', categoryName: '' };
    const val = String(categoryEl.value || '').trim();
    if (!val || val === 'all') {
        return { category: '', slug: '', categoryId: '', categoryName: '' };
    }
    const selected = categoryEl.selectedOptions[0];
    const slug = selected?.dataset?.slug || '';
    const categoryId = selected?.dataset?.categoryId || val;
    return {
        category: categoryId || slug || val,
        slug,
        categoryId,
        categoryName: String(selected?.textContent || '').trim()
    };
}

// Navigate to search results using keyword + selected category scope (ID)
function goToSearchPage(term) {
    const q = String(term || '').trim();
    const scope = getHeaderSearchScope();
    const categoryToken = scope.category || '';
    const listingSlug = scope.slug || categoryToken;

    if (q.length < 1 && !categoryToken) return;

    // Category-only browse → clean /category/:slug listing (recursive filter server-side)
    if (q.length < 1 && listingSlug) {
        window.location.href = `/category/${encodeURIComponent(listingSlug)}`;
        return;
    }

    const params = {};
    if (q.length >= 1) params.q = q;
    // Prefer category ID so the API expands parent + all nested children
    if (categoryToken) params.category = categoryToken;

    window.location.href = window.EOBUrlUtils
        ? window.EOBUrlUtils.buildUrl('/search', params)
        : `/search?${new URLSearchParams(params).toString()}`;
}

// Enter / search-icon only — never call from category dropdown change
window.triggerSearch = function() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    goToSearchPage(searchInput.value);
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('headerSearchBtn')
        || document.querySelector('.search-box-container .search-submit-btn');
    const categorySelect = getSearchCategorySelect();
    if (!searchInput) return;

    // Scope selector: update local selection only — no navigate, submit, or API
    if (categorySelect && categorySelect.dataset.scopeBound !== '1') {
        categorySelect.dataset.scopeBound = '1';
        categorySelect.addEventListener('change', (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Intentionally no-op beyond the select's own value (pending scope)
        });
    }

    // Enter → search with current keyword + category scope
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            triggerSearch();
        }
    });

    // Search glass icon → same as Enter
    if (searchBtn && searchBtn.dataset.searchBound !== '1') {
        searchBtn.dataset.searchBound = '1';
        searchBtn.addEventListener('click', (event) => {
            event.preventDefault();
            triggerSearch();
        });
    }
});

/* ==========================================================================
   SECTION 6: DYNAMIC FOOTER LOADER (ফুটার স্ক্রিপ্ট লোড করা)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    // Absolute paths so dynamic routes (/page/:slug, /pages/:slug, /:slug)
    // never resolve to /page/js/... (404 / wrong MIME).
    const rendererScript = document.createElement('script');
    rendererScript.src = '/js/footerRenderer.js';

    rendererScript.onload = () => {
        const script = document.createElement('script');
        script.src = '/js/footer.js';

        script.onload = () => {
            if (typeof window.initGlobalFooterEngine === 'function') {
                window.initGlobalFooterEngine();
            }
        };

        document.body.appendChild(script);
    };

    document.body.appendChild(rendererScript);
});

/* ==========================================================================
   SECTION 7: NAVBAR/HEADER USER AUTHENTICATION SYNC (হেডারে ইউজার প্রোফাইল)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('customerToken');
    const navUserLink = document.getElementById('nav-user-link');
    const navUserAvatar = document.getElementById('nav-user-avatar');

    // ৩. ইউজার যদি অলরেডি লগইন থাকে
    if (token) {
        if (navUserLink) {
            navUserLink.setAttribute('onclick', "window.location.href='/profile'");
            navUserLink.style.display = 'flex';
            navUserLink.style.alignItems = 'center';
            navUserLink.style.cursor = 'pointer';
        }

        if (window.EOBSession && typeof window.EOBSession.updateNavbarUI === 'function') {
            window.EOBSession.updateNavbarUI();
        }

        fetchNavbarProfile(token, navUserAvatar);
        if (typeof syncNavDrawerGreeting === 'function') syncNavDrawerGreeting();
    } else if (typeof syncNavDrawerGreeting === 'function') {
        syncNavDrawerGreeting();
    }
});

// প্রোফাইল পিকচার ব্যাকঅ্যান্ড থেকে নিয়ে আসার ফাংশন
async function fetchNavbarProfile(token, avatarElement) {
    try {
        const response = await fetch('/api/customer/profile', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        // যদি ব্যাকঅ্যান্ড থেকে ইমেজ সাকসেসফুলি আসে এবং এলিমেন্টটি থাকে
        if (response.ok && data) {
            if (data.avatar && avatarElement) {
                avatarElement.src = data.avatar;
                avatarElement.style.display = 'block';
                avatarElement.classList.add('is-visible');
            }
            if (data.name) localStorage.setItem('userName', data.name);
            try {
                const prev = JSON.parse(localStorage.getItem('customerData') || '{}');
                localStorage.setItem('customerData', JSON.stringify({ ...prev, ...data }));
            } catch (_) { /* ignore */ }
            if (typeof syncNavDrawerGreeting === 'function') syncNavDrawerGreeting();
            else if (window.SidebarDrawer?.syncGreeting) window.SidebarDrawer.syncGreeting();
        }
    } catch (error) {
        console.error('Error fetching navbar profile data:', error);
    }
}

document.addEventListener('languageChanged', () => {
    if (allProducts.length) displayProducts(allProducts, { append: false });
    renderHomeCatalogControls();
    if (flashSaleState?.isActive) renderFlashSaleBanner(flashSaleState);
    if (window.i18n) window.i18n.applyTranslations();
});

