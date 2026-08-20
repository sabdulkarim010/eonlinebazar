/**
 * ==========================================================================
 * File Name: js/search.js
 * Project: eOnlineBazar
 * Description: Advanced Search Results — keyword search, filters (price,
 * brand, rating, stock), sorting, pagination, URL sync, and mobile sidebar.
 * ==========================================================================
 */

/* ==========================================================================
   SECTION 1: STATE & CONSTANTS
   ========================================================================== */
const SEARCH_STATE = {
    query: '',
    category: '',
    categoryName: '',
    browseAll: false,
    sort: 'newest',
    page: 1,
    limit: (window.ProductCatalogUI && window.ProductCatalogUI.DEFAULT_PAGE_SIZE) || 24,
    totalPages: 0,
    totalProducts: 0,
    hasMore: false,
    minPrice: '',
    maxPrice: '',
    brands: [],
    rating: '',
    inStock: false,
    priceRange: { min: 0, max: 0 },
    availableBrands: []
};

const FILTER_DEBOUNCE_MS = 400;
const MAX_VISIBLE_BRANDS = 8;

let filterDebounceTimer = null;
let brandsExpanded = false;
let searchFetchInFlight = false;

function getCatalogUI() {
    return window.ProductCatalogUI || null;
}

/* ==========================================================================
   SECTION 2: HELPERS
   ========================================================================== */
function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
}

/** Read category slug from /category/:slug path (navbar listing URLs). */
function getCategoryFromPath() {
    const match = String(window.location.pathname || '').match(/^\/category\/([^/]+)\/?$/i);
    if (!match) return '';
    try {
        return decodeURIComponent(match[1]).trim();
    } catch (_) {
        return String(match[1] || '').trim();
    }
}

/** Navbar "All" / browse-all listing at /products */
function isBrowseAllPath() {
    return /^\/products\/?$/i.test(String(window.location.pathname || ''));
}

function toBnNumber(n) {
    const lang = window.i18n?.getCurrentLang?.() || 'en';
    return Number(n || 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US');
}

function t(key, vars) {
    return window.i18n ? window.i18n.t(key, vars) : key;
}

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildApiQueryString() {
    const params = new URLSearchParams();
    if (SEARCH_STATE.query) params.set('q', SEARCH_STATE.query);
    if (SEARCH_STATE.category) params.set('category', SEARCH_STATE.category);
    if (SEARCH_STATE.minPrice !== '') params.set('minPrice', SEARCH_STATE.minPrice);
    if (SEARCH_STATE.maxPrice !== '') params.set('maxPrice', SEARCH_STATE.maxPrice);
    if (SEARCH_STATE.brands.length) {
        params.set('brand', SEARCH_STATE.brands.join(','));
    }
    if (SEARCH_STATE.rating) params.set('rating', SEARCH_STATE.rating);
    if (SEARCH_STATE.inStock) params.set('inStock', 'true');
    if (SEARCH_STATE.sort && SEARCH_STATE.sort !== 'newest') params.set('sort', SEARCH_STATE.sort);
    if (SEARCH_STATE.page > 1) params.set('page', String(SEARCH_STATE.page));
    params.set('limit', String(SEARCH_STATE.limit));
    return params.toString();
}

function syncUrl(usePush = true) {
    const params = new URLSearchParams();
    if (SEARCH_STATE.query) params.set('q', SEARCH_STATE.query);
    if (SEARCH_STATE.category) params.set('category', SEARCH_STATE.category);
    if (SEARCH_STATE.minPrice !== '') params.set('minPrice', SEARCH_STATE.minPrice);
    if (SEARCH_STATE.maxPrice !== '') params.set('maxPrice', SEARCH_STATE.maxPrice);
    if (SEARCH_STATE.brands.length) {
        params.set('brand', SEARCH_STATE.brands.join(','));
    }
    if (SEARCH_STATE.rating) params.set('rating', SEARCH_STATE.rating);
    if (SEARCH_STATE.inStock) params.set('inStock', 'true');
    if (SEARCH_STATE.sort && SEARCH_STATE.sort !== 'newest') params.set('sort', SEARCH_STATE.sort);
    if (SEARCH_STATE.page > 1) params.set('page', String(SEARCH_STATE.page));
    const defaultLimit = (getCatalogUI() && getCatalogUI().DEFAULT_PAGE_SIZE) || 24;
    if (SEARCH_STATE.limit && SEARCH_STATE.limit !== defaultLimit) {
        params.set('limit', String(SEARCH_STATE.limit));
    }

    let newUrl;
    const hasExtraFilters = params.has('minPrice') || params.has('maxPrice')
        || params.has('brand') || params.has('rating')
        || params.has('inStock') || params.has('sort') || params.has('page')
        || params.has('limit');

    // Prefer slug for clean /category/:slug; API still accepts ID or slug
    const listingSlug = (() => {
        const scope = typeof readHeaderCategoryScope === 'function'
            ? readHeaderCategoryScope()
            : null;
        if (scope?.slug) return scope.slug;
        const token = SEARCH_STATE.category;
        // Avoid putting raw ObjectIds into pretty listing URLs
        if (token && !/^[a-f0-9]{24}$/i.test(token)) return token;
        return token;
    })();

    // Keep clean /category/:slug when browsing a category listing (no keyword)
    if (!SEARCH_STATE.query && SEARCH_STATE.category && !hasExtraFilters && listingSlug
        && !/^[a-f0-9]{24}$/i.test(listingSlug)) {
        newUrl = `/category/${encodeURIComponent(listingSlug)}`;
    } else if (!SEARCH_STATE.query && !SEARCH_STATE.category && !hasExtraFilters
        && SEARCH_STATE.browseAll) {
        // Navbar "All" — clean /products URL, not empty /search prompt
        newUrl = '/products';
    } else {
        const qs = params.toString();
        newUrl = `/search${qs ? '?' + qs : ''}`;
    }

    if (usePush) {
        window.history.pushState({}, '', newUrl);
    } else {
        window.history.replaceState({}, '', newUrl);
    }
}

function readStateFromUrl() {
    SEARCH_STATE.query = getQueryParam('q').trim();
    SEARCH_STATE.category = getQueryParam('category').trim() || getCategoryFromPath();
    SEARCH_STATE.browseAll = isBrowseAllPath()
        || (!SEARCH_STATE.query && !SEARCH_STATE.category && getQueryParam('all') === '1');
    SEARCH_STATE.sort = getQueryParam('sort') || 'newest';
    SEARCH_STATE.page = Math.max(1, parseInt(getQueryParam('page'), 10) || 1);
    const UI = getCatalogUI();
    SEARCH_STATE.limit = UI
        ? UI.normalizePageSize(getQueryParam('limit') || SEARCH_STATE.limit)
        : (parseInt(getQueryParam('limit'), 10) || SEARCH_STATE.limit || 24);
    SEARCH_STATE.minPrice = getQueryParam('minPrice');
    SEARCH_STATE.maxPrice = getQueryParam('maxPrice');
    SEARCH_STATE.rating = getQueryParam('rating');
    SEARCH_STATE.inStock = getQueryParam('inStock') === 'true';

    const brandParam = getQueryParam('brand');
    SEARCH_STATE.brands = brandParam
        ? brandParam.split(',').map(s => s.trim()).filter(Boolean)
        : [];
}

function syncFilterInputsFromState() {
    const minEl = document.getElementById('minPriceInput');
    const maxEl = document.getElementById('maxPriceInput');
    const stockEl = document.getElementById('inStockCheckbox');
    const sortEl = document.getElementById('sortSelect');

    if (minEl) minEl.value = SEARCH_STATE.minPrice;
    if (maxEl) maxEl.value = SEARCH_STATE.maxPrice;
    if (stockEl) stockEl.checked = SEARCH_STATE.inStock;
    if (sortEl) sortEl.value = SEARCH_STATE.sort;

    const ratingRadio = document.querySelector(
        `#ratingFilter input[value="${SEARCH_STATE.rating}"]`
    );
    if (ratingRadio) ratingRadio.checked = true;

    updatePriceRangeDisplay();
}

function updatePriceRangeDisplay() {
    const el = document.getElementById('priceRangeDisplay');
    if (!el) return;

    const min = SEARCH_STATE.minPrice !== '' ? SEARCH_STATE.minPrice : SEARCH_STATE.priceRange.min;
    const max = SEARCH_STATE.maxPrice !== '' ? SEARCH_STATE.maxPrice : SEARCH_STATE.priceRange.max;
    el.textContent = `৳${toBnNumber(min)} — ৳${toBnNumber(max)}`;
}

function scheduleFilterSearch() {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
        SEARCH_STATE.page = 1;
        runSearch();
    }, FILTER_DEBOUNCE_MS);
}

function hasActiveFilters() {
    return SEARCH_STATE.category !== ''
        || SEARCH_STATE.minPrice !== ''
        || SEARCH_STATE.maxPrice !== ''
        || SEARCH_STATE.brands.length > 0
        || SEARCH_STATE.rating !== ''
        || SEARCH_STATE.inStock;
}

function slugifyCategoryName(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** 24-char hex Mongo ObjectId — never show these as labels in the UI */
function isMongoObjectId(value) {
    return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function isDisplayableCategoryName(value) {
    const name = String(value || '').trim();
    return Boolean(name) && !isMongoObjectId(name);
}

/** Flat cache of categories loaded for name resolution (id / slug / name → name) */
let categoryLookupCache = [];

function flattenCategoryTree(nodes, out = []) {
    if (!Array.isArray(nodes)) return out;
    nodes.forEach((cat) => {
        if (!cat || typeof cat !== 'object') return;
        out.push(cat);
        const kids = Array.isArray(cat.children) && cat.children.length
            ? cat.children
            : (Array.isArray(cat.subCategories) ? cat.subCategories : []);
        if (kids.length) flattenCategoryTree(kids, out);
    });
    return out;
}

function setCategoryLookupCache(categories) {
    categoryLookupCache = flattenCategoryTree(categories, []);
}

function findCategoryInCache(token) {
    const raw = String(token || '').trim();
    if (!raw || !categoryLookupCache.length) return null;
    const lower = raw.toLowerCase();
    return categoryLookupCache.find((cat) => {
        if (!cat) return false;
        if (cat._id && String(cat._id) === raw) return true;
        if (cat.slug && String(cat.slug).toLowerCase() === lower) return true;
        if (cat.name && String(cat.name).toLowerCase() === lower) return true;
        if (cat.name && slugifyCategoryName(cat.name) === lower) return true;
        return false;
    }) || null;
}

function lookupCategoryNameFromSelect(token) {
    const select = getSearchCategorySelectEl();
    if (!select || !token) return '';
    const opt = [...select.options].find((o) =>
        o.value === token
        || o.dataset.categoryId === token
        || o.dataset.slug === token
        || (o.dataset.name && o.dataset.name === token)
    );
    if (!opt || opt.value === 'all') return '';
    const fromData = String(opt.dataset.name || '').trim();
    if (isDisplayableCategoryName(fromData)) return fromData;
    const fromText = stripSearchCategoryLabel(opt.textContent);
    return isDisplayableCategoryName(fromText) ? fromText : '';
}

function updateSearchSeoTitle() {
    const q = SEARCH_STATE.query;
    const categoryName = SEARCH_STATE.categoryName || '';
    let title;
    let description;

    if (q) {
        title = `"${q}" — Search Results | EOnlineBazar`;
        description = `Find the best products for "${q}" on EOnlineBazar.`;
    } else if (isDisplayableCategoryName(categoryName)) {
        title = `${categoryName} Products | EOnlineBazar`;
        description = `Best ${categoryName} products on EOnlineBazar.`;
    } else if (SEARCH_STATE.browseAll) {
        title = 'All Products | EOnlineBazar';
        description = 'Browse all products on EOnlineBazar — best quality, fast delivery.';
    } else {
        title = 'Search Products | EOnlineBazar';
        description = 'Search products on EOnlineBazar — best quality, fast delivery.';
    }

    document.title = title;

    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', description);

    const ogTitle = document.getElementById('og-title');
    if (ogTitle) ogTitle.setAttribute('content', title);

    const ogDesc = document.getElementById('og-description');
    if (ogDesc) ogDesc.setAttribute('content', description);
}

function resolveCategoryFromFilters(filtersData) {
    if (!SEARCH_STATE.category) {
        SEARCH_STATE.categoryName = '';
        updateSearchSeoTitle();
        return;
    }

    const token = String(SEARCH_STATE.category).trim();
    const available = (filtersData && filtersData.availableCategories) || [];

    // 1) Header select (has name on option when parent category)
    let resolved = lookupCategoryNameFromSelect(token);

    // 2) Cached category tree (id / slug / name)
    if (!resolved) {
        const cached = findCategoryInCache(token);
        if (cached && isDisplayableCategoryName(cached.name)) {
            resolved = cached.name;
        }
    }

    // 3) Search API availableCategories (usually { name } only)
    if (!resolved) {
        const slug = token.toLowerCase();
        const match = available.find((cat) => {
            const name = typeof cat === 'string' ? cat : (cat && cat.name);
            const id = cat && typeof cat === 'object' ? String(cat._id || '') : '';
            if (id && id === token) return true;
            if (!name) return false;
            return slugifyCategoryName(name) === slug
                || String(name).toLowerCase() === slug;
        });
        if (match) {
            resolved = typeof match === 'string' ? match : match.name;
        }
    }

    // 4) Keep a previously resolved human name (do not overwrite with ObjectId)
    if (!resolved && isDisplayableCategoryName(SEARCH_STATE.categoryName)) {
        resolved = SEARCH_STATE.categoryName;
    }

    // 5) Slug-like token → title-case words; never surface raw ObjectIds
    if (!resolved && !isMongoObjectId(token)) {
        resolved = token.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    SEARCH_STATE.categoryName = isDisplayableCategoryName(resolved) ? resolved : '';

    // Async fallback for ObjectId / unknown slug not yet in cache
    if (!SEARCH_STATE.categoryName) {
        resolveCategoryNameAsync(token);
    }

    updateSearchSeoTitle();
}

async function resolveCategoryNameAsync(token) {
    const key = String(token || '').trim();
    if (!key) return;

    try {
        // Prefer tree cache refresh once
        if (!categoryLookupCache.length) {
            const res = await fetch('/api/categories/tree');
            const data = await res.json();
            const tree = Array.isArray(data?.data) ? data.data : [];
            if (tree.length) setCategoryLookupCache(tree);
        }

        let match = findCategoryInCache(key);

        // Public endpoint accepts slug or Mongo ObjectId
        if (!match) {
            const res = await fetch(`/api/categories/${encodeURIComponent(key)}`);
            if (res.ok) {
                const payload = await res.json();
                const cat = payload?.data || payload?.category || payload;
                if (cat && cat.name) match = cat;
            }
        }

        if (match && isDisplayableCategoryName(match.name)
            && String(SEARCH_STATE.category) === key) {
            SEARCH_STATE.categoryName = match.name;
            updateSearchSeoTitle();
            renderActiveFilterTags();
            const heading = document.getElementById('searchHeading');
            if (heading && !SEARCH_STATE.query) {
                heading.innerHTML = `<span class="search-term">${escapeHtml(match.name)}</span> Products`;
            }
        }
    } catch (_) { /* non-blocking */ }
}

/* ==========================================================================
   SECTION 3: FILTER UI
   ========================================================================== */
function renderBrandFilters() {
    const list = document.getElementById('brandFilterList');
    const expandBtn = document.getElementById('brandExpandBtn');
    if (!list) return;

    const brands = SEARCH_STATE.availableBrands;
    const visible = brandsExpanded ? brands : brands.slice(0, MAX_VISIBLE_BRANDS);

    list.innerHTML = '';
    visible.forEach(brand => {
        const id = brand.slug || brand._id;
        const li = document.createElement('li');
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = id;
        cb.checked = SEARCH_STATE.brands.includes(id) || SEARCH_STATE.brands.includes(String(brand._id));
        cb.addEventListener('change', () => {
            if (cb.checked) {
                if (!SEARCH_STATE.brands.includes(id)) SEARCH_STATE.brands.push(id);
            } else {
                SEARCH_STATE.brands = SEARCH_STATE.brands.filter(b => b !== id && b !== String(brand._id));
            }
            scheduleFilterSearch();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(`${brand.name} (${brand.productCount || 0})`));
        li.appendChild(label);
        list.appendChild(li);
    });

    if (expandBtn) {
        const hasMore = brands.length > MAX_VISIBLE_BRANDS;
        expandBtn.style.display = hasMore ? 'block' : 'none';
        expandBtn.textContent = brandsExpanded ? 'Show Less' : t('common.see_more');
    }
}

function renderSearchBreadcrumb() {
    const nav = document.getElementById('searchBreadcrumb');
    if (!nav) return;

    const parts = [{ label: 'Home', href: '/' }];
    const categoryName = String(SEARCH_STATE.categoryName || '').trim();
    const hasCategory = Boolean(SEARCH_STATE.category);

    if (hasCategory) {
        parts.push({ label: 'Categories', href: '/products' });
        const crumbLabel = isDisplayableCategoryName(categoryName)
            ? categoryName
            : (isMongoObjectId(SEARCH_STATE.category)
                ? 'Category'
                : SEARCH_STATE.category.replace(/-/g, ' '));
        parts.push({
            label: crumbLabel,
            href: null
        });
    } else if (SEARCH_STATE.query) {
        parts.push({ label: 'Search', href: '/search' });
        parts.push({ label: SEARCH_STATE.query, href: null });
    } else if (SEARCH_STATE.browseAll) {
        parts.push({ label: 'All Products', href: null });
    } else {
        nav.hidden = true;
        nav.innerHTML = '';
        return;
    }

    nav.innerHTML = parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        const sep = index === 0
            ? ''
            : '<span class="search-breadcrumb__sep" aria-hidden="true">›</span>';
        if (isLast || !part.href) {
            return `${sep}<span class="search-breadcrumb__current">${escapeHtml(part.label)}</span>`;
        }
        return `${sep}<a href="${escapeHtml(part.href)}">${escapeHtml(part.label)}</a>`;
    }).join('');
    nav.hidden = false;
}

function renderActiveFilterTags() {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    container.innerHTML = '';

    const tags = [];

    if (SEARCH_STATE.category) {
        const catLabel = isDisplayableCategoryName(SEARCH_STATE.categoryName)
            ? SEARCH_STATE.categoryName
            : (isMongoObjectId(SEARCH_STATE.category)
                ? 'Category'
                : SEARCH_STATE.category.replace(/-/g, ' '));
        tags.push({
            key: 'category',
            label: `Category: ${catLabel}`,
            className: 'filter-tag filter-tag--category'
        });
    }

    if (SEARCH_STATE.minPrice !== '' || SEARCH_STATE.maxPrice !== '') {
        const min = SEARCH_STATE.minPrice || '0';
        const max = SEARCH_STATE.maxPrice || '∞';
        tags.push({ key: 'price', label: `Price: ৳${min}-৳${max}` });
    }

    SEARCH_STATE.brands.forEach(brandId => {
        const brand = SEARCH_STATE.availableBrands.find(
            b => b.slug === brandId || String(b._id) === brandId
        );
        tags.push({
            key: `brand:${brandId}`,
            label: `Brand: ${brand ? brand.name : brandId}`
        });
    });

    if (SEARCH_STATE.rating) {
        tags.push({ key: 'rating', label: `Rating: ${SEARCH_STATE.rating}+` });
    }

    if (SEARCH_STATE.inStock) {
        tags.push({ key: 'inStock', label: 'In Stock Only' });
    }

    tags.forEach(tag => {
        const el = document.createElement('span');
        el.className = tag.className || 'filter-tag';
        el.innerHTML = `${escapeHtml(tag.label)} <button type="button" class="filter-tag-remove" aria-label="Remove ${escapeHtml(tag.label)}">&times;</button>`;
        el.querySelector('.filter-tag-remove').addEventListener('click', () => removeFilterTag(tag.key));
        container.appendChild(el);
    });

    if (tags.length) {
        const clearPill = document.createElement('button');
        clearPill.type = 'button';
        clearPill.className = 'active-filters-clear';
        clearPill.innerHTML = 'Clear Filters <span aria-hidden="true">&times;</span>';
        clearPill.addEventListener('click', clearAllFilters);
        container.appendChild(clearPill);
    }

    renderSearchBreadcrumb();
}

function clearCategoryFilter() {
    SEARCH_STATE.category = '';
    SEARCH_STATE.categoryName = '';
    SEARCH_STATE.browseAll = true;
    const categorySelect = getSearchCategorySelectEl();
    if (categorySelect) categorySelect.value = 'all';
    try {
        localStorage.removeItem('eobSearchCategoryScope');
    } catch (_) { /* ignore */ }
}

function removeFilterTag(key) {
    if (key === 'category') {
        clearCategoryFilter();
    } else if (key === 'price') {
        SEARCH_STATE.minPrice = '';
        SEARCH_STATE.maxPrice = '';
        const minEl = document.getElementById('minPriceInput');
        const maxEl = document.getElementById('maxPriceInput');
        if (minEl) minEl.value = '';
        if (maxEl) maxEl.value = '';
    } else if (key.startsWith('brand:')) {
        const brandId = key.slice(6);
        SEARCH_STATE.brands = SEARCH_STATE.brands.filter(b => b !== brandId);
        renderBrandFilters();
    } else if (key === 'rating') {
        SEARCH_STATE.rating = '';
        const allRadio = document.querySelector('#ratingFilter input[value=""]');
        if (allRadio) allRadio.checked = true;
    } else if (key === 'inStock') {
        SEARCH_STATE.inStock = false;
        const stockEl = document.getElementById('inStockCheckbox');
        if (stockEl) stockEl.checked = false;
    }
    SEARCH_STATE.page = 1;
    runSearch();
}

function clearAllFilters() {
    SEARCH_STATE.minPrice = '';
    SEARCH_STATE.maxPrice = '';
    SEARCH_STATE.brands = [];
    SEARCH_STATE.rating = '';
    SEARCH_STATE.inStock = false;
    SEARCH_STATE.page = 1;
    // Also dismiss category scope → reset to all products
    if (SEARCH_STATE.category) {
        clearCategoryFilter();
    }
    syncFilterInputsFromState();
    renderBrandFilters();
    runSearch();
}
window.clearAllFilters = clearAllFilters;

function initFilterControls() {
    const minEl = document.getElementById('minPriceInput');
    const maxEl = document.getElementById('maxPriceInput');
    const stockEl = document.getElementById('inStockCheckbox');
    const clearBtn = document.getElementById('clearFiltersBtn');
    const expandBtn = document.getElementById('brandExpandBtn');
    const mobileToggle = document.getElementById('mobileFilterToggle');
    const filtersPanel = document.getElementById('searchFilters');

    [minEl, maxEl].forEach(el => {
        if (!el) return;
        el.addEventListener('input', () => {
            SEARCH_STATE.minPrice = el === minEl ? el.value : SEARCH_STATE.minPrice;
            SEARCH_STATE.maxPrice = el === maxEl ? el.value : SEARCH_STATE.maxPrice;
            updatePriceRangeDisplay();
            scheduleFilterSearch();
        });
    });

    if (stockEl) {
        stockEl.addEventListener('change', () => {
            SEARCH_STATE.inStock = stockEl.checked;
            scheduleFilterSearch();
        });
    }

    document.querySelectorAll('#ratingFilter input[name="ratingFilter"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                SEARCH_STATE.rating = radio.value;
                scheduleFilterSearch();
            }
        });
    });

    if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);

    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            brandsExpanded = !brandsExpanded;
            renderBrandFilters();
        });
    }

    if (mobileToggle && filtersPanel) {
        mobileToggle.addEventListener('click', () => {
            const isOpen = filtersPanel.classList.toggle('is-open');
            mobileToggle.setAttribute('aria-expanded', String(isOpen));
            mobileToggle.textContent = isOpen ? `${t('search.filter')} ▲` : `${t('search.filter')} ▼`;
        });
    }
}

/* ==========================================================================
   SECTION 4: CORE FETCH & RENDER
   ========================================================================== */
async function runSearch(options = {}) {
    const grid = document.getElementById('productGrid');
    const pagination = document.getElementById('paginationContainer');
    const loadMoreWrap = document.getElementById('loadMoreWrap');
    const heading = document.getElementById('searchHeading');
    const countEl = document.getElementById('searchCount');
    if (!grid) return;

    const append = options.append === true;
    const q = SEARCH_STATE.query;
    updateSearchSeoTitle();

    // Empty prompt only for bare /search — /products (All) loads the full catalog
    if (!q && !hasActiveFilters() && !SEARCH_STATE.browseAll) {
        heading.innerHTML = 'Search on EonlineBazar';
        countEl.textContent = '';
        if (pagination) pagination.innerHTML = '';
        if (loadMoreWrap) {
            loadMoreWrap.hidden = true;
            loadMoreWrap.innerHTML = '';
        }
        grid.innerHTML = `
            <div class="search-state">
                <div class="state-icon"><i class="fa fa-magnifying-glass"></i></div>
                <h3>What are you looking for?</h3>
                <p>Try keywords like "shoes", "sharee", or "kids dress", or use the filters.</p>
                <a href="/" class="search-back-btn">Continue Shopping</a>
            </div>`;
        const activeFiltersEl = document.getElementById('activeFilters');
        if (activeFiltersEl) activeFiltersEl.innerHTML = '';
        renderSearchBreadcrumb();
        syncUrl(false);
        return;
    }

    if (q) {
        heading.innerHTML = `Results for "<span class="search-term">${escapeHtml(q)}</span>"`;
    } else if (isDisplayableCategoryName(SEARCH_STATE.categoryName)) {
        heading.innerHTML = `<span class="search-term">${escapeHtml(SEARCH_STATE.categoryName)}</span> Products`;
    } else if (SEARCH_STATE.category) {
        heading.innerHTML = 'Category Products';
    } else {
        heading.innerHTML = 'All Products';
    }

    // Show trail early (category name may refine after filters payload)
    if (!append) renderSearchBreadcrumb();

    if (!append) {
        grid.innerHTML = `
            <div class="search-state">
                <div class="state-icon"><i class="fa fa-spinner fa-spin"></i></div>
                <h3>${t('common.loading')}</h3>
                <p>Finding the best matches for you.</p>
            </div>`;
        if (pagination) pagination.innerHTML = '';
        if (loadMoreWrap) {
            loadMoreWrap.hidden = true;
            loadMoreWrap.innerHTML = '';
        }
        countEl.textContent = '';
    }

    syncUrl();
    searchFetchInFlight = true;
    if (append) renderCatalogControls({ appending: true });

    try {
        const url = `/api/products/search?${buildApiQueryString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const payload = await res.json();

        const data = payload.data || payload;
        const products = data.products || payload.products
            || (Array.isArray(payload.data) ? payload.data : []);
        const paginationData = data.pagination || payload.pagination || {};
        const filtersData = data.filters || {};

        const total = paginationData.totalProducts != null
            ? paginationData.totalProducts
            : (paginationData.total != null ? paginationData.total : (payload.total || products.length));
        SEARCH_STATE.totalProducts = total;
        SEARCH_STATE.totalPages = paginationData.totalPages != null
            ? paginationData.totalPages
            : Math.ceil(total / (paginationData.limit || SEARCH_STATE.limit));
        SEARCH_STATE.page = paginationData.currentPage != null
            ? paginationData.currentPage
            : SEARCH_STATE.page;
        if (paginationData.limit != null) {
            SEARCH_STATE.limit = getCatalogUI()
                ? getCatalogUI().normalizePageSize(paginationData.limit, SEARCH_STATE.limit)
                : paginationData.limit;
        }
        SEARCH_STATE.hasMore = paginationData.hasMore === true
            || (SEARCH_STATE.page < SEARCH_STATE.totalPages);

        if (!append) {
            if (filtersData.priceRange) {
                SEARCH_STATE.priceRange = filtersData.priceRange;
                updatePriceRangeDisplay();
            }
            if (filtersData.availableBrands) {
                SEARCH_STATE.availableBrands = filtersData.availableBrands;
                renderBrandFilters();
            }
            resolveCategoryFromFilters(filtersData);
            renderActiveFilterTags();
        }

        if (!products.length && !append) {
            countEl.textContent = t('search.results', { count: toBnNumber(0) });
            grid.innerHTML = `
                <div class="search-state">
                    <div class="state-icon"><i class="fa fa-box-open"></i></div>
                    <h3>${t('search.no_results')}</h3>
                    <p>${q ? `No results for "<strong>${escapeHtml(q)}</strong>"` : 'No results for these filters'}. Try changing your filters.</p>
                    <button type="button" class="search-back-btn" onclick="clearAllFilters()">${t('search.clear_filters')}</button>
                </div>`;
            SEARCH_STATE.hasMore = false;
            renderCatalogControls({ forceHide: true });
            if (window.analytics) {
                window.analytics.trackSearch(q, 0);
            }
            return;
        }

        countEl.textContent = t('search.results', { count: toBnNumber(total) });
        renderProducts(products, { append });
        renderPageSizeControl();
        renderCatalogControls();

        if (window.analytics && !append) {
            window.analytics.trackSearch(q, total);
            window.analytics.trackViewItemList(products, 'Search Results');
        }
    } catch (err) {
        console.error('Search error:', err);
        if (append) {
            SEARCH_STATE.page = Math.max(1, SEARCH_STATE.page - 1);
            renderCatalogControls();
        } else {
            grid.innerHTML = `
                <div class="search-state">
                    <div class="state-icon"><i class="fa fa-triangle-exclamation"></i></div>
                    <h3>${t('common.error')}</h3>
                    <p>Search could not be completed. Please try again.</p>
                    <a href="/" class="search-back-btn">Back to Shopping</a>
                </div>`;
            renderCatalogControls({ forceHide: true });
        }
    } finally {
        searchFetchInFlight = false;
        renderCatalogControls();
    }
}

/* ==========================================================================
   SECTION 5: PRODUCT CARD RENDERING
   ========================================================================== */
function renderProducts(list, options = {}) {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    const append = options.append === true;
    const UI = getCatalogUI();
    if (!append) grid.innerHTML = '';

    const newCards = [];

    list.forEach(product => {
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
        const imageSource = meta.image;
        const iconData = meta.emoji;

        if (PT) {
            PT.mountInto(imgBox, product, { variant: 'card', alt: product.name || 'Product Image' });
        }

        const productInfo = document.createElement('div');
        productInfo.className = 'product-info';
        productInfo.innerHTML = `
            <h4 class="product-name">${escapeHtml(product.name || 'Unknown Product')}</h4>
            <div class="product-price-row">
                <span class="currency">৳</span>
                <span class="price-amount">${product.price || '0'}</span>
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
            } else {
                alert('Cart function not found. Please reload the page.');
            }
        });

        productLink.appendChild(imgBox);
        productLink.appendChild(productInfo);
        productCard.appendChild(productLink);
        if (wishlistBtn) productCard.appendChild(wishlistBtn);
        productCard.appendChild(addToCartBtn);
        grid.appendChild(productCard);
        newCards.push(productCard);
    });

    if (append && UI) {
        UI.markCardsEntering(newCards);
    }

    if (window.WishlistEngine && typeof window.WishlistEngine.refreshHearts === 'function') {
        window.WishlistEngine.ensureLoaded().then(() => {
            window.WishlistEngine.refreshHearts(grid);
        });
    }
}

/* ==========================================================================
   SECTION 6: PAGINATION + LOAD MORE + PAGE SIZE
   ========================================================================== */
function renderPageSizeControl() {
    const UI = getCatalogUI();
    const el = document.getElementById('pageSizeControl');
    if (!UI || !el) return;

    UI.renderPageSizeSelector(el, {
        limit: SEARCH_STATE.limit,
        label: 'Show:',
        onChange: (size) => {
            SEARCH_STATE.limit = size;
            SEARCH_STATE.page = 1;
            runSearch();
        }
    });
}

function renderCatalogControls(opts = {}) {
    const UI = getCatalogUI();
    const loadMoreWrap = document.getElementById('loadMoreWrap');
    const paginationEl = document.getElementById('paginationContainer');
    if (!UI) return;

    const hide = opts.forceHide === true || !SEARCH_STATE.totalProducts;

    if (loadMoreWrap) {
        UI.renderLoadMoreButton(loadMoreWrap, {
            hasMore: !hide && SEARCH_STATE.hasMore,
            loading: searchFetchInFlight && opts.appending === true,
            label: 'View More Products',
            loadingLabel: t('common.loading'),
            onLoadMore: () => {
                if (!SEARCH_STATE.hasMore || searchFetchInFlight) return;
                SEARCH_STATE.page += 1;
                runSearch({ append: true });
            }
        });
    }

    if (paginationEl) {
        UI.renderPaginationPills(paginationEl, {
            page: SEARCH_STATE.page,
            totalPages: hide ? 0 : SEARCH_STATE.totalPages,
            onPageChange: (p) => goToPage(p)
        });
    }
}

function goToPage(p) {
    if (p === SEARCH_STATE.page || searchFetchInFlight) return;
    SEARCH_STATE.page = p;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    runSearch();
}

/* ==========================================================================
   SECTION 7: HEADER SEARCH BAR + CATEGORY SCOPE (Amazon-style)
   --------------------------------------------------------------------------
   Dropdown change updates pending scope only — no navigate / API / runSearch.
   Search runs on Enter or search-icon click using keyword + selected scope.
   ========================================================================== */
function stripSearchCategoryLabel(label) {
    return String(label || '')
        .replace(/^[\s\u00A0]*[—–\-└]\s*/, '')
        .trim();
}

function getSearchCategorySelectEl() {
    return document.getElementById('searchCategorySelect')
        || document.getElementById('categorySelect')
        || document.querySelector('.search-box-container .search-category');
}

function categoryParentRefId(cat) {
    if (!cat || cat.parentCategory == null || cat.parentCategory === '') return null;
    return String(cat.parentCategory._id || cat.parentCategory);
}

/** Top-level (parent) categories only — hide child sub-categories here. */
function getTopLevelCategories(categories) {
    if (!Array.isArray(categories) || !categories.length) return [];
    return categories.filter((c) => !categoryParentRefId(c));
}

function populateSearchCategorySelectOptions(select, categories, previousValue) {
    if (window.HeaderSearch?.populateSearchCategorySelect) {
        window.HeaderSearch.populateSearchCategorySelect(categories, previousValue);
        const val = String(select.value || '');
        return !!(val && val !== 'all');
    }

    select.innerHTML = '<option value="all">All Categories</option>';

    getTopLevelCategories(categories).forEach((cat) => {
        if (!cat?._id && !cat?.slug && !cat?.name) return;

        const option = document.createElement('option');
        const id = cat._id ? String(cat._id) : '';
        const slug = String(cat.slug || '').trim()
            || String(cat.name || '')
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '');
        option.value = id || slug || cat.name;
        option.textContent = cat.name || slug;
        option.dataset.level = '0';
        if (id) option.dataset.categoryId = id;
        if (slug) option.dataset.slug = slug;
        if (cat.name) option.dataset.name = cat.name;
        select.appendChild(option);
    });

    const previous = previousValue || 'all';
    const match = [...select.options].find((opt) =>
        opt.value === previous
        || opt.dataset.slug === previous
        || opt.dataset.categoryId === previous
        || opt.dataset.name === previous
    );
    if (match) {
        select.value = match.value;
        return true;
    }
    // Sub-category URL scopes are not listed — keep "All Categories" visually
    select.value = 'all';
    return false;
}

async function loadSearchCategoryFilter() {
    const select = getSearchCategorySelectEl();
    if (!select) return;

    try {
        const res = await fetch('/api/categories/tree');
        const data = await res.json();
        let categories = Array.isArray(data?.data) ? data.data : [];
        if (!categories.length) {
            const fallback = await fetch('/api/categories').then((r) => r.json());
            categories = Array.isArray(fallback.flat) && fallback.flat.length
                ? fallback.flat
                : (Array.isArray(fallback.data) ? fallback.data : []);
        }
        if (!categories.length) return;

        setCategoryLookupCache(categories);

        const restored = populateSearchCategorySelectOptions(
            select,
            categories,
            SEARCH_STATE.category || 'all'
        );

        if (restored) {
            const selected = select.selectedOptions[0];
            const label = selected?.dataset?.name
                || stripSearchCategoryLabel(selected?.textContent);
            if (isDisplayableCategoryName(label)) {
                SEARCH_STATE.categoryName = label;
            }
            // Prefer ID for subsequent API calls (recursive parent expand)
            if (selected?.dataset?.categoryId) {
                SEARCH_STATE.category = selected.dataset.categoryId;
            }
        } else if (SEARCH_STATE.category) {
            // Child slug / ID not in parent-only select — resolve from tree cache
            const cached = findCategoryInCache(SEARCH_STATE.category);
            if (cached && isDisplayableCategoryName(cached.name)) {
                SEARCH_STATE.categoryName = cached.name;
            }
        }
        // If previous was a child slug, keep SEARCH_STATE.category for results;
        // header select shows All Categories (parents only).
    } catch (err) {
        console.warn('Search category filter load error:', err);
    }
}

function readHeaderCategoryScope() {
    if (window.HeaderSearch?.readScope) {
        const scope = window.HeaderSearch.readScope();
        return {
            category: scope.category || '',
            categoryName: scope.categoryName || '',
            slug: scope.slug || ''
        };
    }
    const categorySelect = getSearchCategorySelectEl();
    if (!categorySelect) return { category: '', categoryName: '', slug: '' };
    const val = String(categorySelect.value || '').trim();
    if (!val || val === 'all') return { category: '', categoryName: '', slug: '' };
    const selected = categorySelect.selectedOptions[0];
    return {
        category: selected?.dataset?.categoryId || val,
        categoryName: stripSearchCategoryLabel(selected?.textContent),
        slug: selected?.dataset?.slug || ''
    };
}

function initHeaderSearch() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('headerSearchBtn')
        || document.querySelector('.search-box-container .search-submit-btn');
    const categorySelect = getSearchCategorySelectEl();
    if (!input) return;

    input.value = SEARCH_STATE.query;

    // Pending scope lives on the <select> until Enter / icon click applies it
    const submitHeaderSearch = () => {
        const scope = readHeaderCategoryScope();
        // Prefer ID for recursive API expand; keep slug in state for clean URLs when possible
        SEARCH_STATE.category = scope.category || scope.slug || '';
        SEARCH_STATE.categoryName = scope.categoryName;
        SEARCH_STATE.query = input.value.trim();
        SEARCH_STATE.page = 1;
        SEARCH_STATE.browseAll = !SEARCH_STATE.query && !SEARCH_STATE.category;
        runSearch();
    };

    // Scope selector only — updates select value; no navigate / submit / API
    if (categorySelect && categorySelect.dataset.scopeBound !== '1') {
        categorySelect.dataset.scopeBound = '1';
        categorySelect.addEventListener('change', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
    }

    // Enter → search with keyword + selected category scope
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitHeaderSearch();
        }
    });

    // Search glass icon → same as Enter
    if (btn && btn.dataset.searchBound !== '1') {
        btn.dataset.searchBound = '1';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            submitHeaderSearch();
        });
    }
}

/* ==========================================================================
   SECTION 8: INIT
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    readStateFromUrl();
    syncFilterInputsFromState();
    initFilterControls();
    initHeaderSearch();
    renderPageSizeControl();

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = SEARCH_STATE.sort;
        sortSelect.addEventListener('change', () => {
            SEARCH_STATE.sort = sortSelect.value;
            SEARCH_STATE.page = 1;
            runSearch();
        });
    }

    window.addEventListener('popstate', () => {
        readStateFromUrl();
        syncFilterInputsFromState();
        renderPageSizeControl();
        renderBrandFilters();
        const categorySelect = getSearchCategorySelectEl();
        if (categorySelect) {
            const match = [...categorySelect.options].some(
                (opt) => opt.value === (SEARCH_STATE.category || 'all')
            );
            categorySelect.value = match ? (SEARCH_STATE.category || 'all') : 'all';
        }
        runSearch();
    });

    loadSearchCategoryFilter().finally(() => {
        runSearch();
        updateSearchSeoTitle();
    });
    syncNavbarUser();
    loadFooter();
});

document.addEventListener('languageChanged', () => {
    if (window.i18n) window.i18n.applyTranslations();
    runSearch();
});

/* ==========================================================================
   SECTION 9: SHARED UI
   ========================================================================== */
function loadFooter() {
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
}

function syncNavbarUser() {
    const token = localStorage.getItem('customerToken');
    if (!token) return;

    const navUserLink = document.getElementById('nav-user-link');
    const navUserAvatar = document.getElementById('nav-user-avatar');

    if (navUserLink) {
        navUserLink.setAttribute('onclick', "window.location.href='/profile'");
        navUserLink.style.display = 'flex';
        navUserLink.style.alignItems = 'center';
        navUserLink.style.cursor = 'pointer';
    }

    if (window.EOBSession && typeof window.EOBSession.updateNavbarUI === 'function') {
        window.EOBSession.updateNavbarUI();
    }

    fetch('/api/customer/profile', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
            if (!data) return;
            if (data.avatar && navUserAvatar) {
                navUserAvatar.src = data.avatar;
                navUserAvatar.style.display = 'block';
                navUserAvatar.classList.add('is-visible');
            }
            if (data.name) localStorage.setItem('userName', data.name);
            try {
                const prev = JSON.parse(localStorage.getItem('customerData') || '{}');
                localStorage.setItem('customerData', JSON.stringify({ ...prev, ...data }));
            } catch (_) { /* ignore */ }
            if (typeof syncNavDrawerGreeting === 'function') syncNavDrawerGreeting();
            else if (window.SidebarDrawer?.syncGreeting) window.SidebarDrawer.syncGreeting();
        })
        .catch(() => { /* silent */ });
}









