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

function t(key, vars) {
    return window.i18n ? window.i18n.t(key, vars) : key;
}

document.addEventListener('DOMContentLoaded', () => {
    initFlashSaleEngine();
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

    document.getElementById('productFetchRetryBtn')?.addEventListener('click', () => {
        productFetchFailed = false;
        productsFetchAttempted = false;
        fetchAndRenderProducts({ manual: true });
    });
}

function fetchAndRenderProducts(options = {}) {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    // One-time fetch on page load — no automatic retries on error
    if (productsFetchAttempted && !options.manual && !options.allowRetry) return;

    // After a failure, only retry when the user explicitly clicks Try Again
    // (or an intentional refresh such as flash-sale expiry).
    if (productFetchFailed && !options.manual && !options.allowRetry) return;
    if (productFetchInFlight && !options.manual && !options.allowRetry) return;

    if (!options.manual && !options.allowRetry) {
        productsFetchAttempted = true;
    }

    productFetchInFlight = true;

    if (options.manual || !allProducts.length) {
        productGrid.innerHTML = `
            <div class="product-fetch-loading" aria-live="polite">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>${window.i18n ? window.i18n.t('common.loading') : 'Loading products…'}</span>
            </div>
        `;
    }

    fetch('/api/products')
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
            allProducts = Array.isArray(data) ? data : (data.data || data.products || []);

            displayProducts(allProducts);
            generateCategoryButtons();
        })
        .catch(error => {
            productFetchFailed = true;
            console.error('Error fetching products:', error);
            renderProductFetchError(error.message, error.status);
        })
        .finally(() => {
            productFetchInFlight = false;
        });
}

/* ==========================================================================
   SECTION 3: RENDER PRODUCT CARDS (প্রোডাক্ট কার্ড এবং ইমেজ/ইমোজি লজিক)
   ========================================================================== */
function displayProducts(productsToDisplay) {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    productGrid.innerHTML = '';

    if (!Array.isArray(productsToDisplay) || productsToDisplay.length === 0) {
        productGrid.innerHTML = `<p style="text-align: center; width: 100%;">${t('search.no_results')}</p>`;
        return;
    }

    productsToDisplay.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';

        // 🚀 চূড়ান্ত ফিক্স: সব ধরনের আইডির নাম চেক করে সঠিক আইডি বের করা
        const productId = product._id || product.id || product.productId;

        // 🔗 লিংক তৈরি (প্রোডাক্ট ডিটেইলস পেজে যাওয়ার জন্য)
        const productLink = document.createElement('a');
        productLink.href = window.EOBUrlUtils
            ? window.EOBUrlUtils.buildUrl('/product-details.html', { id: productId })
            : `/product-details.html?id=${encodeURIComponent(productId)}`;
        productLink.style.textDecoration = 'none';
        productLink.style.color = 'inherit';
        productLink.style.display = 'block';

        // 🖼️ Image box via shared thumbnail renderer
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

        // 📝 প্রোডাক্ট ইনফো বক্স
        const productInfo = document.createElement('div');
        productInfo.className = 'product-info';
        productInfo.innerHTML = `
            <h4 class="product-name">${product.name || 'Unknown Product'}</h4>
            <div class="product-price-row">
                ${buildProductPriceMarkup(product)}
            </div>
        `;

        // ❤️ Wishlist heart button
        const wishlistBtn = (window.WishlistEngine && typeof window.WishlistEngine.createHeartButton === 'function')
            ? window.WishlistEngine.createHeartButton(productId, {
                name: product.name,
                price: product.price,
                image: imageSource,
                icon: iconData
            })
            : null;

        // 🛒 Add to Cart বাটন
        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'add-to-cart-btn';
        addToCartBtn.innerText = t('product.add_to_cart');

        addToCartBtn.addEventListener('click', (e) => {
            e.preventDefault();   // 👈 ডিফল্ট অ্যাকশন বন্ধ
            e.stopPropagation();  // 👈 কার্ডের লিংকে যাওয়া বন্ধ

            if (typeof window.addToBag === 'function') {
                window.addToBag(productId, product.name, product.price, imageSource);
            } else if (typeof addToBag === 'function') {
                addToBag(productId, product.name, product.price, imageSource);
            } else {
                alert("Cart function not found. Please reload the page.");
            }
        });

        // ডমে এলিমেন্টগুলো সাজানো
        productLink.appendChild(imgBox);
        productLink.appendChild(productInfo);
        productCard.appendChild(productLink);
        if (wishlistBtn) productCard.appendChild(wishlistBtn);
        productCard.appendChild(addToCartBtn);
        
        productGrid.appendChild(productCard);
    });

    if (window.WishlistEngine && typeof window.WishlistEngine.refreshHearts === 'function') {
        window.WishlistEngine.ensureLoaded().then(() => {
            window.WishlistEngine.refreshHearts(productGrid);
        });
    }

    if (window.analytics && productsToDisplay.length) {
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
            fetchAndRenderProducts({ allowRetry: true });
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
   SECTION 4: DYNAMIC CATEGORY BUTTONS (ক্যাটাগরি বাটন লজিক)
   ========================================================================== */
function generateCategoryButtons() {
    const btnContainer = document.getElementById('categoryButtonContainer');
    const categorySelect = document.getElementById('categorySelect');
    if (!btnContainer) return;

    const categories = ['all', ...new Set(allProducts.map(p => p.category).filter(Boolean))];
    btnContainer.innerHTML = '';

    if (categorySelect) {
        const previous = categorySelect.value || 'all';
        categorySelect.innerHTML = '<option value="all">All Categories</option>';
        categories.filter((c) => c !== 'all').forEach((category) => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
            categorySelect.appendChild(option);
        });
        if ([...categorySelect.options].some((opt) => opt.value === previous)) {
            categorySelect.value = previous;
        }
    }

    categories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'nav-category-item' + (category === 'all' ? ' active' : '');
        
        // প্রথম অক্ষর বড় হাতের করা
        const formattedName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        button.innerText = formattedName;
        
        button.addEventListener('click', () => {
            document.querySelectorAll('.nav-category-item').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            if (category === 'all') {
                displayProducts(allProducts);
            } else {
                const filtered = allProducts.filter(p => p.category === category);
                displayProducts(filtered);
            }
        });
        btnContainer.appendChild(button);
    });
}

/* ==========================================================================
   SECTION 5: SEARCH LOGIC (কিওয়ার্ড রাউটিং → /search পেজ)
   --------------------------------------------------------------------------
   হেডারের সার্চ বার এখন কাস্টমারকে ডেডিকেটেড /search?q=keyword পেজে পাঠায়
   (Daraz/Shopify স্টাইল)। টাইপ করার সময় 300ms ডিবাউন্স ব্যবহার করা হয় যাতে
   অপ্রয়োজনীয়ভাবে বারবার নেভিগেট/API হিট না হয়।
   ========================================================================== */

// একটি কিওয়ার্ড নিয়ে ক্লিন সার্চ পেজে রিডাইরেক্ট করার হেল্পার
function goToSearchPage(term) {
    const q = String(term || '').trim();
    const categoryEl = document.getElementById('categorySelect');
    const category = categoryEl && categoryEl.value && categoryEl.value !== 'all'
        ? String(categoryEl.value).trim()
        : '';

    if (q.length < 1 && !category) return;

    const params = {};
    if (q.length >= 1) params.q = q;
    if (category) params.category = category;

    window.location.href = window.EOBUrlUtils
        ? window.EOBUrlUtils.buildUrl('/search', params)
        : `/search?${new URLSearchParams(params).toString()}`;
}

// Enter/বাটন ক্লিকে সাথে সাথে সার্চ পেজে যাওয়া
window.triggerSearch = function() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    goToSearchPage(searchInput.value);
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    // 🌟 ডিবাউন্স (300ms): টাইপ থামলে তবেই সার্চ পেজে সিমলেসভাবে রিডাইরেক্ট
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const term = searchInput.value.trim();
        // অন্তত ২ অক্ষর হলে অটো-নেভিগেট (অকালীন রিডাইরেক্ট এড়াতে)
        if (term.length < 2) return;
        debounceTimer = setTimeout(() => goToSearchPage(term), 300);
    });

    // Enter চাপলে ডিবাউন্স ছাড়াই তাৎক্ষণিক সার্চ
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            clearTimeout(debounceTimer);
            triggerSearch();
        }
    });
});

/* ==========================================================================
   SECTION 6: DYNAMIC FOOTER LOADER (ফুটার স্ক্রিপ্ট লোড করা)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
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
        if (response.ok && data.avatar && avatarElement) {
            avatarElement.src = data.avatar;   // ক্লাউডিনারি বা ডাটাবেজের ইউআরএল সেট
            avatarElement.style.display = 'block'; // ইমেজটি স্ক্রিনে শো করানো হলো
        }
    } catch (error) {
        console.error('Error fetching navbar profile data:', error);
    }
}

document.addEventListener('languageChanged', () => {
    if (allProducts.length) displayProducts(allProducts);
    if (flashSaleState?.isActive) renderFlashSaleBanner(flashSaleState);
    if (window.i18n) window.i18n.applyTranslations();
});

