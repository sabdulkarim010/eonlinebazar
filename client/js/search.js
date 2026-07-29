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
    sort: 'newest',
    page: 1,
    totalPages: 0,
    minPrice: '',
    maxPrice: '',
    brands: [],
    rating: '',
    inStock: false,
    priceRange: { min: 0, max: 0 },
    availableBrands: []
};

const RESULTS_PER_PAGE = 20;
const FILTER_DEBOUNCE_MS = 400;
const MAX_VISIBLE_BRANDS = 8;

let filterDebounceTimer = null;
let brandsExpanded = false;

/* ==========================================================================
   SECTION 2: HELPERS
   ========================================================================== */
function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
}

function toBnNumber(n) {
    return Number(n || 0).toLocaleString('bn-BD');
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
    params.set('limit', String(RESULTS_PER_PAGE));
    return params.toString();
}

function syncUrl(usePush = true) {
    const qs = buildApiQueryString();
    const newUrl = `/search${qs ? '?' + qs : ''}`;
    if (usePush) {
        window.history.pushState({}, '', newUrl);
    } else {
        window.history.replaceState({}, '', newUrl);
    }
}

function readStateFromUrl() {
    SEARCH_STATE.query = getQueryParam('q').trim();
    SEARCH_STATE.category = getQueryParam('category').trim();
    SEARCH_STATE.sort = getQueryParam('sort') || 'newest';
    SEARCH_STATE.page = Math.max(1, parseInt(getQueryParam('page'), 10) || 1);
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

function updateSearchSeoTitle() {
    const q = SEARCH_STATE.query;
    const categoryName = SEARCH_STATE.categoryName || '';
    let title;
    let description;

    if (q) {
        title = `"${q}" — সার্চ ফলাফল | EOnlineBazar`;
        description = `"${q}" এর জন্য EOnlineBazar-এ সেরা পণ্য খুঁজুন।`;
    } else if (categoryName) {
        title = `${categoryName} পণ্য | EOnlineBazar`;
        description = `${categoryName} ক্যাটাগরির সেরা পণ্য EOnlineBazar-এ।`;
    } else {
        title = 'পণ্য খুঁজুন | EOnlineBazar';
        description = 'EOnlineBazar-এ পণ্য খুঁজুন — সেরা মান, দ্রুত ডেলিভারি।';
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

    const available = filtersData.availableCategories || [];
    const slug = SEARCH_STATE.category.toLowerCase();
    const match = available.find((cat) => {
        const name = typeof cat === 'string' ? cat : cat.name;
        return slugifyCategoryName(name) === slug
            || String(name).toLowerCase() === slug;
    });

    if (match) {
        SEARCH_STATE.categoryName = typeof match === 'string' ? match : match.name;
    } else {
        SEARCH_STATE.categoryName = SEARCH_STATE.category.replace(/-/g, ' ');
    }
    updateSearchSeoTitle();
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
        expandBtn.textContent = brandsExpanded ? 'কম দেখুন' : 'আরো দেখুন';
    }
}

function renderActiveFilterTags() {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    container.innerHTML = '';

    const tags = [];

    if (SEARCH_STATE.minPrice !== '' || SEARCH_STATE.maxPrice !== '') {
        const min = SEARCH_STATE.minPrice || '০';
        const max = SEARCH_STATE.maxPrice || '∞';
        tags.push({ key: 'price', label: `দাম: ৳${min}-৳${max}` });
    }

    SEARCH_STATE.brands.forEach(brandId => {
        const brand = SEARCH_STATE.availableBrands.find(
            b => b.slug === brandId || String(b._id) === brandId
        );
        tags.push({
            key: `brand:${brandId}`,
            label: `ব্র্যান্ড: ${brand ? brand.name : brandId}`
        });
    });

    if (SEARCH_STATE.rating) {
        tags.push({ key: 'rating', label: `রেটিং: ${SEARCH_STATE.rating}+` });
    }

    if (SEARCH_STATE.inStock) {
        tags.push({ key: 'inStock', label: 'শুধু স্টকে আছে' });
    }

    tags.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'filter-tag';
        el.innerHTML = `${escapeHtml(tag.label)} <button type="button" class="filter-tag-remove" aria-label="Remove filter">&times;</button>`;
        el.querySelector('.filter-tag-remove').addEventListener('click', () => removeFilterTag(tag.key));
        container.appendChild(el);
    });
}

function removeFilterTag(key) {
    if (key === 'price') {
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
            mobileToggle.textContent = isOpen ? 'ফিল্টার লুকান 🔼' : 'ফিল্টার দেখুন 🔽';
        });
    }
}

/* ==========================================================================
   SECTION 4: CORE FETCH & RENDER
   ========================================================================== */
async function runSearch() {
    const grid = document.getElementById('productGrid');
    const pagination = document.getElementById('paginationContainer');
    const heading = document.getElementById('searchHeading');
    const countEl = document.getElementById('searchCount');
    if (!grid) return;

    const q = SEARCH_STATE.query;
    updateSearchSeoTitle();

    if (!q && !hasActiveFilters()) {
        heading.innerHTML = 'EonlineBazar এ সার্চ করুন';
        countEl.textContent = '';
        pagination.innerHTML = '';
        grid.innerHTML = `
            <div class="search-state">
                <div class="state-icon"><i class="fa fa-magnifying-glass"></i></div>
                <h3>আপনি কী খুঁজছেন?</h3>
                <p>"shoes", "sharee" বা "kids dress" এর মতো কিওয়ার্ড লিখুন, অথবা ফিল্টার ব্যবহার করুন।</p>
                <a href="/" class="search-back-btn">কেনাকাটা চালিয়ে যান</a>
            </div>`;
        syncUrl(false);
        return;
    }

    if (q) {
        heading.innerHTML = `"<span class="search-term">${escapeHtml(q)}</span>" এর জন্য ফলাফল`;
    } else if (SEARCH_STATE.categoryName) {
        heading.innerHTML = `<span class="search-term">${escapeHtml(SEARCH_STATE.categoryName)}</span> পণ্য`;
    } else {
        heading.innerHTML = 'সকল পণ্য';
    }

    grid.innerHTML = `
        <div class="search-state">
            <div class="state-icon"><i class="fa fa-spinner fa-spin"></i></div>
            <h3>সার্চ করা হচ্ছে...</h3>
            <p>আপনার জন্য সেরা ম্যাচ খুঁজছি।</p>
        </div>`;
    pagination.innerHTML = '';
    countEl.textContent = '';

    syncUrl();

    try {
        const url = `/api/products/search?${buildApiQueryString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const payload = await res.json();

        const data = payload.data || payload;
        const products = data.products || (Array.isArray(payload.data) ? payload.data : []);
        const paginationData = data.pagination || {};
        const filtersData = data.filters || {};

        const total = paginationData.total != null ? paginationData.total : (payload.total || products.length);
        SEARCH_STATE.totalPages = paginationData.totalPages != null
            ? paginationData.totalPages
            : Math.ceil(total / RESULTS_PER_PAGE);

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

        if (!products.length) {
            countEl.textContent = '০টি পণ্য পাওয়া গেছে';
            grid.innerHTML = `
                <div class="search-state">
                    <div class="state-icon"><i class="fa fa-box-open"></i></div>
                    <h3>কোনো পণ্য পাওয়া যায়নি</h3>
                    <p>${q ? `"<strong>${escapeHtml(q)}</strong>" এর জন্য` : 'এই ফিল্টারে'} কোনো ফলাফল নেই। ফিল্টার পরিবর্তন করে দেখুন।</p>
                    <button type="button" class="search-back-btn" onclick="clearAllFilters()">ফিল্টার পরিষ্কার করুন</button>
                </div>`;
            return;
        }

        countEl.textContent = `${toBnNumber(total)}টি পণ্য পাওয়া গেছে`;
        renderProducts(products);
        renderPagination();
    } catch (err) {
        console.error('Search error:', err);
        grid.innerHTML = `
            <div class="search-state">
                <div class="state-icon"><i class="fa fa-triangle-exclamation"></i></div>
                <h3>কিছু একটা ভুল হয়েছে</h3>
                <p>সার্চ সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।</p>
                <a href="/" class="search-back-btn">কেনাকাটায় ফিরুন</a>
            </div>`;
    }
}

/* ==========================================================================
   SECTION 5: PRODUCT CARD RENDERING
   ========================================================================== */
function renderProducts(list) {
    const grid = document.getElementById('productGrid');
    grid.innerHTML = '';

    list.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';

        const productId = product._id || product.id || product.productId;

        const productLink = document.createElement('a');
        productLink.href = `/product-details.html?id=${productId}`;
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
        addToCartBtn.innerText = 'Add to Bag';
        addToCartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.addToBag === 'function') {
                window.addToBag(productId, product.name, product.price, imageSource);
            } else {
                alert('কার্ট ফাংশনটি খুঁজে পাওয়া যাচ্ছে না। পেজ রিলোড দিন।');
            }
        });

        productLink.appendChild(imgBox);
        productLink.appendChild(productInfo);
        productCard.appendChild(productLink);
        if (wishlistBtn) productCard.appendChild(wishlistBtn);
        productCard.appendChild(addToCartBtn);
        grid.appendChild(productCard);
    });

    if (window.WishlistEngine && typeof window.WishlistEngine.refreshHearts === 'function') {
        window.WishlistEngine.ensureLoaded().then(() => {
            window.WishlistEngine.refreshHearts(grid);
        });
    }
}

/* ==========================================================================
   SECTION 6: PAGINATION
   ========================================================================== */
function renderPagination() {
    const container = document.getElementById('paginationContainer');
    container.innerHTML = '';
    const { page, totalPages } = SEARCH_STATE;
    if (totalPages <= 1) return;

    const makeBtn = (label, targetPage, opts = {}) => {
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (opts.active ? ' active' : '');
        btn.innerHTML = label;
        if (opts.disabled) btn.disabled = true;
        else btn.addEventListener('click', () => goToPage(targetPage));
        return btn;
    };

    container.appendChild(makeBtn('<i class="fa fa-angle-left"></i>', page - 1, { disabled: page <= 1 }));

    const windowSize = 2;
    const start = Math.max(1, page - windowSize);
    const end = Math.min(totalPages, page + windowSize);

    if (start > 1) {
        container.appendChild(makeBtn('1', 1));
        if (start > 2) {
            const dots = document.createElement('span');
            dots.textContent = '…';
            dots.style.padding = '0 4px';
            container.appendChild(dots);
        }
    }
    for (let i = start; i <= end; i++) {
        container.appendChild(makeBtn(String(i), i, { active: i === page }));
    }
    if (end < totalPages) {
        if (end < totalPages - 1) {
            const dots = document.createElement('span');
            dots.textContent = '…';
            dots.style.padding = '0 4px';
            container.appendChild(dots);
        }
        container.appendChild(makeBtn(String(totalPages), totalPages));
    }

    container.appendChild(makeBtn('<i class="fa fa-angle-right"></i>', page + 1, { disabled: page >= totalPages }));
}

function goToPage(p) {
    SEARCH_STATE.page = p;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    runSearch();
}

/* ==========================================================================
   SECTION 7: HEADER SEARCH BAR
   ========================================================================== */
function initHeaderSearch() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('headerSearchBtn');
    if (!input) return;

    input.value = SEARCH_STATE.query;

    let debounceTimer = null;
    const applyTerm = (term) => {
        SEARCH_STATE.query = term.trim();
        SEARCH_STATE.page = 1;
        runSearch();
    };

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const term = input.value.trim();
        if (term.length === 0) { applyTerm(''); return; }
        if (term.length < 2) return;
        debounceTimer = setTimeout(() => applyTerm(term), 300);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(debounceTimer);
            applyTerm(input.value);
        }
    });

    if (btn) {
        btn.addEventListener('click', () => {
            clearTimeout(debounceTimer);
            applyTerm(input.value);
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
        renderBrandFilters();
        runSearch();
    });

    runSearch();
    updateSearchSeoTitle();
    syncNavbarUser();
    loadFooter();
});

/* ==========================================================================
   SECTION 9: SHARED UI
   ========================================================================== */
function loadFooter() {
    const rendererScript = document.createElement('script');
    rendererScript.src = 'js/footerRenderer.js';
    rendererScript.onload = () => {
        const script = document.createElement('script');
        script.src = 'js/footer.js';
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
            if (data && data.avatar && navUserAvatar) {
                navUserAvatar.src = data.avatar;
                navUserAvatar.style.display = 'block';
            }
        })
        .catch(() => { /* silent */ });
}
