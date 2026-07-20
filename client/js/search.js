/**
 * ==========================================================================
 * File Name: js/search.js
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * Description: Advanced Search Results page logic — debounced keyword search,
 * deep-search API integration, sorting, pagination and a friendly empty state.
 * ==========================================================================
 */

/* ==========================================================================
   SECTION 1: STATE & CONSTANTS
   ========================================================================== */
const SEARCH_STATE = {
    query: '',
    sort: 'relevance',
    page: 1,
    totalPages: 0
};
const RESULTS_PER_PAGE = 20;

/* ==========================================================================
   SECTION 2: HELPERS
   ========================================================================== */
function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || '';
}

// URL-এ q/page/sort সিঙ্ক রাখা (ফুল রিলোড ছাড়াই, শেয়ারযোগ্য লিংকের জন্য)
function syncUrl() {
    const params = new URLSearchParams();
    if (SEARCH_STATE.query) params.set('q', SEARCH_STATE.query);
    if (SEARCH_STATE.sort && SEARCH_STATE.sort !== 'relevance') params.set('sort', SEARCH_STATE.sort);
    if (SEARCH_STATE.page > 1) params.set('page', String(SEARCH_STATE.page));
    const newUrl = `/search${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
}

/* ==========================================================================
   SECTION 3: CORE FETCH & RENDER
   ========================================================================== */
async function runSearch() {
    const grid = document.getElementById('productGrid');
    const pagination = document.getElementById('paginationContainer');
    const sortBox = document.getElementById('sortBox');
    const heading = document.getElementById('searchHeading');
    const countEl = document.getElementById('searchCount');
    if (!grid) return;

    const q = SEARCH_STATE.query;
    document.title = q ? `${q} | Search — EonlineBazar` : 'Search | EonlineBazar';

    // খালি কিওয়ার্ড হলে সহজ প্রম্পট দেখানো
    if (!q) {
        heading.innerHTML = 'Search EonlineBazar';
        countEl.textContent = '';
        sortBox.style.display = 'none';
        pagination.innerHTML = '';
        grid.innerHTML = `
            <div class="search-state">
                <div class="state-icon"><i class="fa fa-magnifying-glass"></i></div>
                <h3>What are you looking for?</h3>
                <p>Type a keyword like "shoes", "sharee" or "kids dress" to begin.</p>
                <a href="/" class="search-back-btn">Continue Shopping</a>
            </div>`;
        return;
    }

    heading.innerHTML = `Results for "<span class="search-term">${escapeHtml(q)}</span>"`;

    // লোডিং স্টেট
    grid.innerHTML = `
        <div class="search-state">
            <div class="state-icon"><i class="fa fa-spinner fa-spin"></i></div>
            <h3>Searching...</h3>
            <p>Finding the best matches for you.</p>
        </div>`;
    pagination.innerHTML = '';
    countEl.textContent = '';

    syncUrl();

    try {
        const url = `/api/products/search?q=${encodeURIComponent(q)}&page=${SEARCH_STATE.page}&limit=${RESULTS_PER_PAGE}&sort=${encodeURIComponent(SEARCH_STATE.sort)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const payload = await res.json();

        const products = Array.isArray(payload) ? payload : (payload.data || []);
        const total = payload.total != null ? payload.total : products.length;
        SEARCH_STATE.totalPages = payload.totalPages != null
            ? payload.totalPages
            : Math.ceil(total / RESULTS_PER_PAGE);

        // 🙁 কোনো ম্যাচ না পাওয়া গেলে বন্ধুত্বপূর্ণ empty state
        if (!products.length) {
            sortBox.style.display = 'none';
            countEl.textContent = '';
            grid.innerHTML = `
                <div class="search-state">
                    <div class="state-icon"><i class="fa fa-box-open"></i></div>
                    <h3>No products found</h3>
                    <p>We couldn't find anything for "<strong>${escapeHtml(q)}</strong>". Try a different keyword.</p>
                    <a href="/" class="search-back-btn">Return to Shopping</a>
                </div>`;
            return;
        }

        sortBox.style.display = 'flex';
        countEl.textContent = `${total} product${total > 1 ? 's' : ''} found`;
        renderProducts(products);
        renderPagination();
    } catch (err) {
        console.error('Search error:', err);
        sortBox.style.display = 'none';
        grid.innerHTML = `
            <div class="search-state">
                <div class="state-icon"><i class="fa fa-triangle-exclamation"></i></div>
                <h3>Something went wrong</h3>
                <p>We couldn't complete your search. Please try again.</p>
                <a href="/" class="search-back-btn">Return to Shopping</a>
            </div>`;
    }
}

/* ==========================================================================
   SECTION 4: PRODUCT CARD RENDERING (হোমপেজের সাথে ভিজ্যুয়ালি সামঞ্জস্যপূর্ণ)
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

        const imageSource = product.image ? product.image.trim() : (product.photo ? product.photo.trim() : '');
        const iconData = product.icon ? product.icon.trim() : '';

        const imgBox = document.createElement('div');
        imgBox.className = 'product-img-box';

        const applyFallback = () => {
            imgBox.innerHTML = '';
            if (iconData !== '') {
                imgBox.innerHTML = `<div class="product-emoji-display" style="font-size: 40px; text-align: center; padding: 20px;">${iconData}</div>`;
            } else {
                imgBox.innerHTML = `<div class="no-photo-box" style="text-align: center; padding: 20px; color: #888;">NO PHOTO</div>`;
            }
        };

        let hasValidImage = false;
        if (imageSource !== '') {
            const lowerPath = imageSource.toLowerCase();
            if (lowerPath.includes('.jpg') || lowerPath.includes('.png') || lowerPath.includes('.jpeg') || lowerPath.includes('.webp') || lowerPath.includes('.heic')) {
                hasValidImage = true;
            }
        }

        if (hasValidImage) {
            let finalImagePath = imageSource;
            if (!finalImagePath.startsWith('/') && !finalImagePath.startsWith('http') && !finalImagePath.startsWith('products/') && !finalImagePath.startsWith('uploads/')) {
                finalImagePath = '/products/' + finalImagePath;
            } else if (finalImagePath.startsWith('products/') || finalImagePath.startsWith('uploads/')) {
                finalImagePath = '/' + finalImagePath;
            }

            const imgElement = document.createElement('img');
            imgElement.src = finalImagePath;
            imgElement.alt = product.name || 'Product Image';
            imgElement.className = 'product-img';
            imgElement.onerror = applyFallback;
            imgBox.appendChild(imgElement);
        } else {
            applyFallback();
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
   SECTION 5: PAGINATION
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

    // চারপাশে সংক্ষিপ্ত উইন্ডো দেখানো (খুব বেশি বাটন এড়াতে)
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
   SECTION 6: HEADER SEARCH BAR (300ms ডিবাউন্স, ফুল রিলোড ছাড়াই লাইভ সার্চ)
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
        // খালি করলে সাথে সাথে প্রম্পট দেখাই; নইলে ৩০০ms ডিবাউন্স
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
   SECTION 7: INIT
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    SEARCH_STATE.query = getQueryParam('q').trim();
    SEARCH_STATE.sort = getQueryParam('sort') || 'relevance';
    SEARCH_STATE.page = Math.max(1, parseInt(getQueryParam('page'), 10) || 1);

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = SEARCH_STATE.sort;
        sortSelect.addEventListener('change', () => {
            SEARCH_STATE.sort = sortSelect.value;
            SEARCH_STATE.page = 1;
            runSearch();
        });
    }

    initHeaderSearch();
    runSearch();
    syncNavbarUser();
    loadFooter();
});

/* ==========================================================================
   SECTION 8: SHARED UI (ফুটার + নেভবার ইউজার সিঙ্ক — হোমপেজের সাথে সামঞ্জস্যপূর্ণ)
   ========================================================================== */
function loadFooter() {
    const script = document.createElement('script');
    script.src = 'js/footer.js';
    script.onload = () => {
        if (typeof window.initGlobalFooterEngine === 'function') {
            window.initGlobalFooterEngine();
        }
    };
    document.body.appendChild(script);
}

function syncNavbarUser() {
    const token = localStorage.getItem('customerToken');
    const userName = localStorage.getItem('userName');
    if (!token) return;

    const navUserLink = document.getElementById('nav-user-link');
    const navUserLine1 = document.getElementById('nav-user-line1');
    const navUserLine2 = document.getElementById('nav-user-line2');
    const navUserAvatar = document.getElementById('nav-user-avatar');

    if (navUserLink) {
        navUserLink.setAttribute('onclick', "window.location.href='/profile'");
        navUserLink.style.display = 'flex';
        navUserLink.style.alignItems = 'center';
        navUserLink.style.cursor = 'pointer';
    }
    if (navUserLine1) navUserLine1.textContent = 'Hello,';
    if (navUserLine2) navUserLine2.textContent = userName || 'My Account';

    fetch('/api/customer/profile', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
            if (data && data.avatar && navUserAvatar) {
                navUserAvatar.src = data.avatar;
                navUserAvatar.style.display = 'block';
            }
        })
        .catch(() => { /* নীরবে উপেক্ষা */ });
}

/* সহজ HTML এস্কেপ (XSS নিরাপত্তার জন্য কিওয়ার্ড/নাম রেন্ডারে) */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
