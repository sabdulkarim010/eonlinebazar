/**
 * ==========================================================================
 * File Name: js/cart.js
 * Project: eOnlineBazar
 * Description: Fully Synced Premium Shopping Cart Logic (Hybrid Guest & DB Cart)
 * ==========================================================================
 */

function t(key, vars) {
    return window.i18n ? window.i18n.t(key, vars) : key;
}

function parseCartApiResponse(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.cart)) return payload.cart;
    return [];
}

const CART_IMG_ONERROR = "if(!this.dataset.fallback){this.dataset.fallback='1';this.src='/images/placeholder-product.svg';}";

function cartItemImg(item, px, catalogProduct) {
    px = px || '56px';
    const utils = window.CartDisplayUtils || {};
    let catalog = catalogProduct;
    if (!catalog && utils.findCatalogProduct && window.globalProductCatalog) {
        catalog = utils.findCatalogProduct(item, window.globalProductCatalog);
    }
    if (utils.buildItemImageHtml) {
        return utils.buildItemImageHtml(item, px, catalog);
    }

    const lineUrl = utils.resolveCartLineImageUrl
        ? utils.resolveCartLineImageUrl(item, catalog)
        : '';
    const safeUrl = utils.safeImg
        ? utils.safeImg(lineUrl)
        : (lineUrl || '/images/placeholder-product.svg');
    const onError = utils.IMG_ONERROR || CART_IMG_ONERROR;

    return `<img src="${safeUrl}"
      style="width:${px};height:${px};object-fit:cover;
      border-radius:8px;flex-shrink:0;display:block"
      onerror="${onError}">`;
}

window.cartItemImg = cartItemImg;

/* ==========================================================================
   SECTION 1: GLOBAL VARIABLES & API SYNC (শুরু এবং ডাটাবেজ সিঙ্ক)
   ========================================================================== */
let cart = [];
let globalProductCatalog = [];
const CDU = () => window.CartDisplayUtils || {};

function readGuestCart() {
    if (CDU().getNormalizedGuestCart) {
        return CDU().getNormalizedGuestCart(globalProductCatalog);
    }
    try {
        return JSON.parse(localStorage.getItem('cart') || '[]');
    } catch (_) {
        localStorage.removeItem('cart');
        return [];
    }
}

function saveGuestCart(items) {
    if (CDU().persistGuestCart) {
        return CDU().persistGuestCart(items);
    }
    localStorage.setItem('cart', JSON.stringify(items));
    return items;
}

function findCatalogProduct(productId) {
    if (CDU().findCatalogProduct) {
        return CDU().findCatalogProduct({ id: productId }, globalProductCatalog);
    }
    return globalProductCatalog.find(p =>
        String(p._id) === String(productId) ||
        String(p.productId) === String(productId) ||
        String(p.id) === String(productId)
    ) || null;
}

// 🌟 টোকেন চেক (কাস্টমার লগইন আছে কি না জানার জন্য)
const customerToken = localStorage.getItem('token') || localStorage.getItem('customerToken');

/* 🌟 ভ্যারিয়েন্ট-সচেতন লাইন হেল্পার — একই প্রোডাক্টের ভিন্ন ভ্যারিয়েন্ট কার্টে
   আলাদা লাইন হিসেবে গণ্য হয়। onclick হ্যান্ডলারে variantId নিরাপদে পাঠাতে
   encode/decode ব্যবহার করা হয়। */
function sameCartLine(item, productId, variantId) {
    return String(item.id) === String(productId) &&
        String(item.variantId || '') === String(variantId || '');
}
function encVariant(vid) { return encodeURIComponent(vid || ''); }
function decVariant(vid) { try { return decodeURIComponent(vid || ''); } catch (e) { return vid || ''; } }

// লাইভ এপিআই থেকে ক্যাটালগ ডাটা লোড করা এবং কার্ট মার্জ/সিঙ্ক করা
fetch('/api/products')
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        globalProductCatalog = Array.isArray(data) ? data : (data.data || data.products || []);
        window.globalProductCatalog = globalProductCatalog;
        document.dispatchEvent(new CustomEvent('productCatalogReady'));
        renderCartDrawerItems();
        
        // 🌟 হাইব্রিড মার্জ লজিক: ইউজার লগইন থাকলে লোকাল স্টোরেজের কার্ট ডাটাবেজে পাঠিয়ে মার্জ হবে
        if (customerToken) {
            const localCart = readGuestCart();
            if (localCart.length > 0) {
                // ব্যাকএন্ডে মার্জ রিকোয়েস্ট পাঠানো হচ্ছে
                fetch('/api/cart/merge', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${customerToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cartItems: localCart })
                })
                .then(res => res.json())
                .then(mergeData => {
                    // মার্জ সফল হলে লোকাল ইমেজ ডাটা ধরে রেখে ডাটাবেজ থেকে ফ্রেশ কার্ট আনা হবে
                    fetchLiveDBCart(localCart).finally(() => {
                        localStorage.removeItem('cart');
                    });
                })
                .catch(err => {
                    console.error("Error merging cart:", err);
                    fetchLiveDBCart(localCart);
                });
            } else {
                fetchLiveDBCart();
            }
        } else {
            renderCartDrawerItems(); // গেস্ট ইউজারের জন্য লোকাল স্টোরেজ রেন্ডার
        }
    })
    .catch(error => {
        console.error("Error loading products API in cart:", error);
        renderCartDrawerItems(); // ব্যাকআপ রেন্ডার
    });

function mapClientCartItem(item = {}) {
    const catalogProduct = findCatalogProduct(item.productId || item.id);
    if (CDU().normalizeCartItem) {
        return CDU().normalizeCartItem(item, catalogProduct);
    }
    const displayImage = String(
        item.selectedImage
        || item.variantImage
        || item.image
        || item.products
        || ''
    ).trim();
    return {
        id: item.productId || item.id,
        name: item.name,
        price: Number(item.price),
        products: displayImage,
        image: displayImage,
        selectedImage: displayImage,
        variantImage: displayImage,
        images: item.images || catalogProduct?.images || [],
        icon: item.icon || item.emojiIcon || catalogProduct?.icon || '',
        emojiIcon: item.emojiIcon || item.icon || catalogProduct?.icon || '',
        quantity: item.quantity,
        selected: item.selected !== false,
        variantId: item.variantId || '',
        variantLabel: item.variantLabel || '',
        variantAttribute: item.variantAttribute || '',
        variantValue: item.variantValue || '',
        variantSku: item.variantSku || '',
        selectedColor: item.selectedColor || '',
        selectedSize: item.selectedSize || '',
        selectedVariant: item.selectedVariant || null
    };
}

function buildCartLineItem(fields) {
    const catalogProduct = findCatalogProduct(fields.id || fields.productId);
    if (CDU().normalizeCartItem) {
        return CDU().normalizeCartItem(fields, catalogProduct);
    }
    const image = fields.image || fields.products || '';
    return {
        ...fields,
        image,
        products: image,
        selectedImage: image,
        variantImage: image,
        images: fields.images || catalogProduct?.images || [],
        emojiIcon: fields.emojiIcon || fields.icon || fields.emoji || catalogProduct?.icon || ''
    };
}

function buildItemImageHtml(item, size) {
    return cartItemImg(item, size || '56px');
}

// 🌟 ডাটাবেজ থেকে লাইভ কার্ট আইটেম নিয়ে আসার ফাংশন
function fetchLiveDBCart(localFallbackItems) {
    if (!customerToken) return Promise.resolve();
    return fetch('/api/cart', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${customerToken}` }
    })
    .then(res => res.json())
    .then(dbCartItems => {
        const items = parseCartApiResponse(dbCartItems);
        const localItems = localFallbackItems || readGuestCart();
        if (CDU().mergeCartItems && localItems.length > 0) {
            cart = CDU().mergeCartItems(items, localItems);
        } else {
            cart = items.map(mapClientCartItem);
        }
        updateCartCount();
        renderCartDrawerItems();
        return cart;
    })
    .catch(err => {
        console.error("Error fetching live DB cart:", err);
        return cart;
    });
}

function syncCartFromServerItems(dbCartItems, localFallbackItems) {
    const items = parseCartApiResponse(dbCartItems);
    const localItems = localFallbackItems || [];
    if (CDU().mergeCartItems && localItems.length > 0) {
        cart = CDU().mergeCartItems(items, localItems);
    } else {
        cart = items.map(mapClientCartItem);
    }
    updateCartCount();
    renderCartDrawerItems();
    return cart;
}

/* ==========================================================================
   SECTION 2: LIVE COUNTERS (নেভবার ব্যাজ কাউন্টার)
   ========================================================================== */
function updateCartCount() {
    // 🌟 ফিক্স: এখানে nav-cart-count আইডিটিও চেক করবে
    const cartCountBadge = document.getElementById('cartCountBadge') || 
                           document.getElementById('nav-cart-count') || 
                           document.querySelector('.Bag span');
    const drawerCount = document.getElementById('cartDrawerCount');
    
    let count = customerToken ? cart.length : readGuestCart().length;

    if (cartCountBadge) cartCountBadge.innerText = count;
    if (drawerCount) drawerCount.innerText = count;
}


/* ==========================================================================
   SECTION 3: RENDER CART ITEMS (ফটো, ইমোজি ও বাটন ফিক্সড রেন্ডার + প্রোফাইল অর্ডার প্যানেল)
   ========================================================================== */
function renderCartDrawerItems() {
    const drawerContainer = document.getElementById('cartDrawerItems');
    
    // প্রোফাইল পেজ বা চেকআউটের কন্টেইনার
    const pageContainer = document.getElementById('cartItemsContainer') || 
                          document.getElementById('checkoutItemsContainer') || 
                          document.getElementById('cart-items-preview-list');
                          
    const cartFooter = document.getElementById('cartDrawerFooter');
    const summarySection = document.getElementById('cartSummarySection'); 
    
    const container = drawerContainer || pageContainer;
    if (!container) return;


    // লগইন থাকলে লাইভ কার্ট অ্যারে, না থাকলে লোকাল স্টোরেজ
    let currentCart = customerToken ? cart : readGuestCart();
    const CDU = window.CartDisplayUtils || {};
    if (CDU.normalizeCartArray) {
        currentCart = CDU.normalizeCartArray(currentCart, globalProductCatalog);
    } else if (CDU.normalizeCartItem) {
        currentCart = currentCart.map((item) => {
            const pid = item.id || item.productId;
            return CDU.normalizeCartItem(item, findCatalogProduct(pid));
        });
    }
    container.innerHTML = '';

    const isProfilePreview = pageContainer && pageContainer.id === 'cart-items-preview-list';
    let itemsHost = container;
    if (isProfilePreview && currentCart.length > 0) {
        const itemsWrapper = document.createElement('div');
        itemsWrapper.className = 'cart-preview-items-inner';
        container.appendChild(itemsWrapper);
        itemsHost = itemsWrapper;
    }

    // ১. কার্ট খালি থাকলে Empty Bag দেখাবে
    if (currentCart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart-container" style="text-align:center; padding:60px 20px; color:#777; width:100%;">
                <i class="fa fa-shopping-bag" style="font-size:48px; color:#bbb; margin-bottom:15px; display:block;"></i>
                <span style="font-size:18px; font-weight:600; color:#334155; display:block; margin-bottom:8px;">${t('cart.empty')}</span>
                <span style="font-size:14px; color:#64748b; margin-bottom:24px; display:block;">Please add some products to your cart.</span>
                <a href="/" style="background:#f97316; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block; transition:0.3s;">${t('nav.home')}</a>
            </div>
        `;
        if (cartFooter) cartFooter.style.display = 'none';
        if (summarySection) summarySection.style.display = 'none'; 
        updateCartTotal();
        return;
    }

    if (cartFooter) cartFooter.style.display = 'block';
    if (summarySection) summarySection.style.display = 'block';

    // ২. কার্ট আইটেম রেন্ডারিং লুপ
    const escapeHtml = CDU.escapeHtml || ((s) => String(s == null ? '' : s));
    const isCartPage = pageContainer && pageContainer.id === 'cartItemsContainer';
    const isCheckoutPreview = pageContainer && pageContainer.id === 'checkoutItemsContainer';

    currentCart.forEach((item, index) => {
        const itemProductId = item.id || item.productId;
        let realProduct = globalProductCatalog.find(p =>
            String(p._id) === String(itemProductId) ||
            String(p.productId) === String(itemProductId) ||
            String(p.id) === String(itemProductId)
        );

        let imageSize = '56px';
        if (drawerContainer) {
            imageSize = '40px';
        } else if (isProfilePreview || isCheckoutPreview) {
            imageSize = '52px';
        }
        const mediaHTML = cartItemImg(item, imageSize, realProduct);

        const isChecked = item.selected !== false ? 'checked' : '';
        const quantity = item.quantity || 1;
        const itemTotal = item.price * quantity; 
        const vid = encVariant(item.variantId);
        const productUrl = CDU.getProductDetailUrl ? CDU.getProductDetailUrl(item, realProduct) : '#';
        const variantBadges = CDU.buildVariantBadgesHtml ? CDU.buildVariantBadgesHtml(item, realProduct) : '';
        const safeName = escapeHtml(item.name);

        const SA = window.StockAlert;
        const stock = SA ? SA.getItemStock(item, realProduct) : null;
        const stockBadge = SA ? SA.buildStockAlertHtml(stock) : '';
        const plusDisabled = SA ? SA.isIncreaseDisabled(stock, quantity) : false;
        const plusDisabledAttr = plusDisabled ? 'disabled' : '';
        const plusBtnClass = plusDisabled ? 'qty-btn qty-btn--disabled' : 'qty-btn';
        const plusControlClass = plusDisabled ? 'qty-control-btn qty-control-btn--disabled' : 'qty-control-btn';
        
        const row = document.createElement('div');
        
        if (drawerContainer) {
            row.className = 'cart-item-row';
            row.innerHTML = `
                <div class="cart-item-row__main">
                    <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked} onchange="toggleItemSelection('${item.id}', '${vid}')">
                    <a href="${productUrl}" class="cart-product-link cart-product-link--media">
                        <div class="cart-item-media">${mediaHTML}</div>
                    </a>
                    <div class="cart-item-info">
                        <a href="${productUrl}" class="cart-product-link cart-item-name" title="${safeName}">${safeName}</a>
                        ${variantBadges}
                        ${stockBadge}
                        <div class="cart-item-price-qty">৳${Number(item.price).toLocaleString()} × ${quantity}</div>
                    </div>
                </div>
                <button type="button" class="cart-delete-btn" onclick="deleteCartItem('${item.id}', '${vid}')" aria-label="Remove item">
                    <i class="fa fa-trash"></i>
                </button>
            `;
        } else {
            const profileItemClass = isProfilePreview ? ' cart-preview-item' : '';
            const wishlistIds = window.__profileWishlistProductIds || [];
            const inWishlist = wishlistIds.some((id) => String(id) === String(item.id));
            const heartIconClass = inWishlist ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            const heartBtnClass = inWishlist ? 'cart-wishlist-heart-btn is-saved' : 'cart-wishlist-heart-btn';
            const qtyBlock = isCartPage
                ? `<div class="cart-quantity-controller">
                        <button type="button" class="qty-control-btn" aria-label="Decrease quantity" onclick="updateQty('${item.id}', -1, '${vid}')"><i class="fa-solid fa-minus"></i></button>
                        <div class="qty-display-number">${quantity}</div>
                        <button type="button" class="${plusControlClass}" aria-label="Increase quantity" ${plusDisabledAttr} onclick="updateQty('${item.id}', 1, '${vid}')"><i class="fa-solid fa-plus"></i></button>
                    </div>`
                : `<span class="cart-item-qty-label">Qty: ${quantity}</span>`;
            row.className = `cart-item-card${profileItemClass}${item.selected === false ? ' is-unchecked' : ''}`;
            row.innerHTML = `
                <div class="cart-item-left-group">
                    <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked} onchange="toggleItemSelection('${item.id}', '${vid}')">
                    <a href="${productUrl}" class="cart-product-link cart-product-link--media">
                        <div class="cart-item-media-box">${mediaHTML}</div>
                    </a>
                    <div class="cart-item-info-box">
                        <div class="cart-item-title-row">
                            <a href="${productUrl}" class="cart-product-link product-title-text" title="${safeName}">${safeName}</a>
                            ${isProfilePreview ? `<button type="button" class="${heartBtnClass}" data-product-id="${item.id}" aria-label="${inWishlist ? 'Saved to wishlist' : 'Add to wishlist'}" title="${inWishlist ? 'Saved to wishlist' : 'Add to wishlist'}"><i class="${heartIconClass}"></i></button>` : ''}
                        </div>
                        ${variantBadges}
                        ${stockBadge}
                        <span class="product-unit-price">৳${Number(item.price).toLocaleString()}</span>
                    </div>
                </div>
                
                <div class="cart-item-right-group">
                    ${qtyBlock}
                    <div class="cart-item-total-price">৳${itemTotal.toLocaleString()}</div>
                    <button type="button" class="cart-item-trash-btn" onclick="deleteCartItem('${item.id}', '${vid}')" title="Remove Product">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        }
        itemsHost.appendChild(row);
    });

    if (isProfilePreview && currentCart.length > 0) {
        const dynamicSummary = document.createElement('div');
        dynamicSummary.className = 'profile-dynamic-checkout-panel';
        dynamicSummary.innerHTML = `
            <div class="profile-cart-summary-bar">
                <div class="profile-cart-summary-meta">
                    <span class="profile-cart-summary-count">Selected Items: <strong id="profileCartItemsCount">0</strong></span>
                    <h3 class="profile-cart-summary-total">Total: <span id="profileCartTotalAmount">৳0</span></h3>
                </div>
                <button type="button" id="profileCheckoutBtn" class="profile-cart-checkout-btn">
                    Proceed to Order <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        `;
        container.appendChild(dynamicSummary);
    }

    // সবশেষে টোটাল ক্যালকুলেট আপডেট করা
    updateCartTotal();
}

/* ==========================================================================
   SECTION 4: CART INTERACTIONS (চেক ও ক্যালকুলেশন লজিক)
   ========================================================================== */
window.toggleItemSelection = function(productId, variantIdEnc) {
    const variantId = decVariant(variantIdEnc);
    if (customerToken) {
        const item = cart.find(i => sameCartLine(i, productId, variantId));
        if (item) {
            const checkbox = document.querySelector(`.cart-item-checkbox[data-id="${productId}"]`);
            item.selected = checkbox ? checkbox.checked : !item.selected;

            fetch('/api/cart/toggle-selection', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, selected: item.selected, variantId })
            }).then(() => renderCartDrawerItems());
        }
    } else {
        let currentCart = readGuestCart();
        const item = currentCart.find(i => sameCartLine(i, productId, variantId));
        if (item) {
            const checkbox = document.querySelector(`.cart-item-checkbox[data-id="${productId}"]`);
            item.selected = checkbox ? checkbox.checked : !item.selected;
        }
        saveGuestCart(currentCart);
        renderCartDrawerItems();
    }
};

// Cached copy of the admin's store settings so the cart can show live
// free-shipping progress without refetching on every quantity change.
let cartDeliverySettings = null;

function renderCartFreeShippingProgress(subtotal) {
    const wrapEl = document.getElementById('cartFreeShippingProgress');
    const textEl = document.getElementById('cartFreeShippingProgressText');
    const barEl = document.getElementById('cartFreeShippingProgressBar');
    const SE = window.ShippingEstimator;
    if (!wrapEl || !textEl || !barEl || !SE) return;

    if (!cartDeliverySettings) {
        SE.fetchDeliverySettings().then((settings) => {
            cartDeliverySettings = settings;
            renderCartFreeShippingProgress(subtotal);
        });
        return;
    }

    const progress = SE.getFreeShippingProgress(cartDeliverySettings, subtotal);
    if (progress.threshold === 0 || subtotal <= 0) {
        wrapEl.style.display = 'none';
        return;
    }

    wrapEl.style.display = 'block';
    wrapEl.classList.toggle('is-unlocked', progress.unlocked);
    barEl.style.width = `${progress.progressPercent}%`;
    textEl.textContent = progress.unlocked
        ? (SE.formatFreeShippingUnlockedMessage?.() || t('cart.free_shipping'))
        : (SE.formatFreeShippingRemainingMessage?.(progress.remaining) || t('cart.free_shipping_remaining', { amount: progress.remaining }));
}

function wireCheckoutButton(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.onclick = function() {
        localStorage.setItem('activeCheckoutSession', 'true');
        if (window.MiniCartDrawer && typeof window.MiniCartDrawer.close === 'function') {
            window.MiniCartDrawer.close();
        }
        window.location.href = '/checkout';
    };
}

function disableCheckoutButton(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.onclick = null;
}

function updateCartTotal() {
    const totalSpan = document.getElementById('cartDrawerTotal');
    const itemsCountSpan = document.getElementById('cartSelectedItemsCount');
    const miniCartSelectedCount = document.getElementById('miniCartSelectedCount');
    const subtotalEl = document.getElementById('cartSubtotalAmount');
    const checkoutRedirectBtn = document.getElementById('proceedToCheckoutBtn');
    const miniCartCheckoutBtn = document.getElementById('miniCartCheckoutBtn');
    const summarySection = document.getElementById('cartSummarySection');
    const profileTotalEl = document.getElementById('profileCartTotalAmount');
    const profileCountEl = document.getElementById('profileCartItemsCount');
    const profileBtn = document.getElementById('profileCheckoutBtn');

    let currentCart = customerToken ? cart : readGuestCart();
    let checkedItems = currentCart.filter(item => item.selected !== false);
    let uniqueSelectedCount = checkedItems.length;
    let subtotal = 0;

    checkedItems.forEach(item => {
        subtotal += item.price * (item.quantity || 1);
    });

    if (totalSpan) totalSpan.innerText = subtotal.toLocaleString();
    if (itemsCountSpan) itemsCountSpan.innerText = `${uniqueSelectedCount} Items`;
    if (miniCartSelectedCount) {
        miniCartSelectedCount.textContent = `${uniqueSelectedCount} item${uniqueSelectedCount === 1 ? '' : 's'} selected`;
    }
    if (subtotalEl) subtotalEl.innerText = window.i18n?.formatCurrency?.(subtotal) || `৳${subtotal.toLocaleString()}`;

    if (profileTotalEl) profileTotalEl.innerText = `৳${subtotal.toLocaleString()}`;
    if (profileCountEl) profileCountEl.innerText = uniqueSelectedCount;

    renderCartFreeShippingProgress(subtotal);

    const checkoutButtons = [checkoutRedirectBtn, miniCartCheckoutBtn, profileBtn].filter(Boolean);
    const hasCheckoutItems = currentCart.length > 0 && uniqueSelectedCount > 0;

    if (!hasCheckoutItems) {
        if (summarySection) summarySection.style.display = 'none';
        checkoutButtons.forEach(disableCheckoutButton);
    } else {
        if (summarySection) summarySection.style.display = 'block';
        checkoutButtons.forEach(wireCheckoutButton);
    }
}




/* ==========================================================================
   SECTION 5: QUANTITY & DELETE CONTROLS (আপডেটেড উইথ ব্যাকএন্ড সিঙ্ক)
   ========================================================================== */
window.updateQty = function(productId, change, variantIdEnc) {
    const variantId = decVariant(variantIdEnc);
    let currentCart = customerToken ? cart : readGuestCart();
    const item = currentCart.find(i => sameCartLine(i, productId, variantId));

    if (item) {
        // স্টক ভ্যালিডেশন (ভ্যারিয়েন্ট থাকলে সেটির স্টক অনুযায়ী)
        if (change > 0) {
            const realProduct = globalProductCatalog.find(p => String(p._id) === String(productId) || String(p.productId) === String(productId) || String(p.id) === String(productId));
            if (realProduct) {
                let availableStock = Number(realProduct.stock || 0);
                if (item.variantId && Array.isArray(realProduct.variants)) {
                    const matched = (window.VariantUtils && window.VariantUtils.matchVariantInProduct)
                        ? window.VariantUtils.matchVariantInProduct(realProduct, item)
                        : realProduct.variants.find(v =>
                            (v.sku && v.sku === item.variantSku) ||
                            (`${v.attribute}::${v.value}` === item.variantId) ||
                            (v.value === item.variantValue && v.attribute === item.variantAttribute)
                        );
                    if (matched) availableStock = Number(matched.stock || 0);
                }
                if ((item.quantity + change) > availableStock) {
                    if (typeof window.showStockExceededToast === 'function') {
                        window.showStockExceededToast();
                    } else if (typeof window.showToast === 'function') {
                        window.showToast('⚠️ Requested quantity exceeds available stock', 'error');
                    } else {
                        alert(`Sorry! Only ${availableStock} items are available in stock for this option.`);
                    }
                    return;
                }
            }
        }

        const targetQty = item.quantity + change;
        if (targetQty < 1) {
            deleteCartItem(productId, variantIdEnc);
            return;
        }

        if (customerToken) {
            // 🌟 লগইন থাকলে ডাটাবেজে পরিমাণ আপডেট করা হচ্ছে
            fetch('/api/cart/update-quantity', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${customerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ productId, quantity: targetQty, variantId })
            })
            .then(res => res.json())
            .then(() => {
                item.quantity = targetQty;
                updateCartCount();
                renderCartDrawerItems();
            })
            .catch(err => console.error("Error updating qty in DB:", err));
        } else {
            // গেস্ট ইউজারের জন্য লোকাল স্টোরেজ আপডেট
            item.quantity = targetQty;
            saveGuestCart(currentCart);
            updateCartCount();
            renderCartDrawerItems();
        }
    }
};

window.deleteCartItem = function(productId, variantIdEnc, options) {
    const silent = options && options.silent === true;
    const variantId = decVariant(variantIdEnc);
    const guestCart = readGuestCart();
    const removedItem = (customerToken ? cart : guestCart).find(item => sameCartLine(item, productId, variantId));

    if (customerToken) {
        // 🌟 লগইন থাকলে ডাটাবেজ থেকে নির্দিষ্ট ভ্যারিয়েন্ট লাইন রিমুভ করা হবে
        fetch(`/api/cart/remove/${productId}?variantId=${encodeURIComponent(variantId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${customerToken}` }
        })
        .then(() => {
            cart = cart.filter(item => !sameCartLine(item, productId, variantId));
            updateCartCount();
            renderCartDrawerItems();
        })
        .catch(err => console.error("Error deleting from DB cart:", err));
    } else {
        // গেস্ট ইউজারের লোকাল স্টোরেজ হ্যান্ডলিং
        let currentCart = readGuestCart();
        currentCart = currentCart.filter(item => !sameCartLine(item, productId, variantId));
        saveGuestCart(currentCart);
        updateCartCount();
        renderCartDrawerItems();
    }

    if (removedItem && window.analytics) {
        window.analytics.trackRemoveFromCart(removedItem, removedItem.quantity);
    }

    if (!silent) {
        if (typeof window.showCartRemovedToast === 'function') {
            window.showCartRemovedToast();
        } else if (typeof window.showToast === 'function') {
            window.showToast('Item removed from Cart', 'info');
        }
    }
};


/* ==========================================================================
   SECTION 6: TOAST NOTIFICATIONS & ANIMATIONS (নোটিফিকেশন ও ফ্লাইং ইফেক্ট)
   ========================================================================== */
function notifyToast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return true;
    }
    return false;
}

function showCardNotification(clickedButton, message, type = 'success') {
    notifyToast(message, type);
}

function triggerFlyAnimation(clickedButton, assetData) {
    const cartTarget = document.getElementById('cartCountBadge') || document.querySelector('.Bag');
    if (!cartTarget || !clickedButton) return;

    const productCard = clickedButton.closest('.product-card');
    if (!productCard) return;

    let finalAssetHTML = '';
    let targetVisualElement = null;

    const liveImg = productCard.querySelector('img');
    const liveEmoji = productCard.querySelector('.prod-emoji-box, .product-emoji, .product-emoji-display, .emoji-box, .item-emoji, .product-emoji-icon');

    if (liveImg && liveImg.src) {
        finalAssetHTML = `<img src="${liveImg.src}" alt="flying-prod" style="width:100%; height:100%; object-fit:contain; border-radius:8px;" onerror="${CART_IMG_ONERROR}">`;
        targetVisualElement = liveImg;
    } else if (liveEmoji) {
        finalAssetHTML = `<div class="emoji-fly" style="font-size:30px;">${liveEmoji.innerText}</div>`;
        targetVisualElement = liveEmoji;
    }

    if (!finalAssetHTML) {
        if (assetData && (assetData.endsWith('.jpg') || assetData.endsWith('.png') || assetData.endsWith('.jpeg') || assetData.endsWith('.webp'))) {
            const PT = window.ProductThumbnail;
            let imagePath = PT && typeof PT.resolveProductImagePath === 'function'
                ? PT.resolveProductImagePath(assetData)
                : (assetData.startsWith('/') ? assetData : '/products/' + assetData);
            if (imagePath) {
                finalAssetHTML = `<img src="${imagePath}" alt="flying-prod" onerror="${CART_IMG_ONERROR}">`;
            } else {
                finalAssetHTML = `<div class="emoji-fly" style="font-size:40px;">🛍️</div>`;
            }
        } else {
            finalAssetHTML = `<div class="emoji-fly" style="font-size:40px;">🛍️</div>`;
        }
        targetVisualElement = clickedButton;
    }

    const visualRect = targetVisualElement.getBoundingClientRect();
    const cartRect = cartTarget.getBoundingClientRect();

    const flyElement = document.createElement('div');
    flyElement.className = 'flying-cart-asset';
    flyElement.style.position = 'absolute';
    flyElement.style.zIndex = '99999';

    flyElement.style.top = `${visualRect.top + window.scrollY + visualRect.height / 2}px`;
    flyElement.style.left = `${visualRect.left + window.scrollX + visualRect.width / 2}px`;

    flyElement.innerHTML = finalAssetHTML;
    document.body.appendChild(flyElement);

    setTimeout(() => {
        flyElement.style.top = `${cartRect.top + window.scrollY + cartRect.height / 2}px`;
        flyElement.style.left = `${cartRect.left + window.scrollX + cartRect.width / 2}px`;
        flyElement.style.transform = 'translate(-50%, -50%) scale(0.1)';
        flyElement.style.opacity = '0.2';
    }, 50);

    setTimeout(() => {
        flyElement.remove();
        cartTarget.style.transform = 'scale(1.3)';
        setTimeout(() => cartTarget.style.transform = 'scale(1)', 200);
    }, 850);
}


/* ==========================================================================
   SECTION 7: ADD TO BAG CORE (আপডেটেড উইথ ডাটাবেজ পুশ লজিক)
   ========================================================================== */
function fireAddToCartAnalytics(productId, productName, productPrice, quantity) {
    if (!window.analytics) return;
    const realProduct = globalProductCatalog.find(p =>
        String(p._id) === String(productId) ||
        String(p.productId) === String(productId) ||
        String(p.id) === String(productId)
    );
    const product = realProduct || {
        productId,
        _id: productId,
        name: productName,
        price: Number(productPrice) || 0
    };
    window.analytics.trackAddToCart(product, quantity || 1);
}

window.addToBag = function(productId, productName, productPrice, productImage) {
    let currentCart = customerToken ? cart : readGuestCart();
    const existingItem = currentCart.find(item => String(item.id) === String(productId));
    const clickedButton = window.event ? window.event.target.closest('button') : null;

    // স্টক ভ্যালিডেশন
    const realProduct = globalProductCatalog.find(p => String(p._id) === String(productId) || String(p.productId) === String(productId) || String(p.id) === String(productId));

    // 🌟 ভ্যারিয়েন্ট প্রোডাক্ট হলে সরাসরি কার্টে যোগ না করে ডিটেইলস পেজে পাঠানো হয়,
    // যাতে কাস্টমার Size/Color নির্বাচন করতে পারে (Shopify স্টাইল)।
    if (realProduct && (realProduct.hasVariants || (Array.isArray(realProduct.variants) &&
        realProduct.variants.some(v => v.attribute || v.value || (v.attributes && Object.keys(v.attributes).length))))) {
        const detailId = realProduct._id || realProduct.productId || productId;
        if (clickedButton && typeof showCardNotification === 'function') {
            showCardNotification(clickedButton, 'Select product options first', 'info');
        }
        setTimeout(() => { window.location.href = `/product-details.html?id=${detailId}`; }, 350);
        return;
    }
    
    if (realProduct) {
        let availableStock = Number(realProduct.stock || 0);
        let currentQtyInCart = existingItem ? existingItem.quantity : 0;
        let quantityToAdd = currentQtyInCart + 1;

        if (availableStock <= 0) {
            if (typeof window.showOutOfStockToast === 'function') {
                window.showOutOfStockToast();
            } else {
                showCardNotification(clickedButton, 'Out of stock!', 'error');
            }
            return;
        }
        
        if (quantityToAdd > availableStock) {
            if (typeof window.showStockExceededToast === 'function') {
                window.showStockExceededToast();
            } else {
                showCardNotification(clickedButton, `Stock limit: ${availableStock}`, 'warning');
            }
            return;
        }
    }

    const PT = window.ProductThumbnail;
    const mediaMeta = PT
        ? PT.getDisplayMeta(realProduct || { image: productImage, products: productImage })
        : { image: productImage || '', emoji: '' };
    const productIcon = mediaMeta.emoji || realProduct?.icon || realProduct?.emojiIcon || '';
    const resolvedImage = CDU().resolveCartLineImageUrl
        ? CDU().resolveCartLineImageUrl(
            {
                image: mediaMeta.image || productImage,
                products: productImage,
                icon: productIcon,
                emojiIcon: productIcon,
                images: realProduct?.images || []
            },
            realProduct
        )
        : (mediaMeta.image || productImage || '');

    const newLineBase = {
        id: productId,
        name: productName,
        price: Number(productPrice),
        image: resolvedImage,
        products: resolvedImage,
        selectedImage: resolvedImage,
        variantImage: resolvedImage,
        images: realProduct?.images || [],
        icon: productIcon,
        emoji: productIcon,
        emojiIcon: productIcon,
        quantity: 1,
        selected: true
    };
    const normalizedNewLine = buildCartLineItem(newLineBase);

    if (customerToken) {
        // 🌟 লগইন থাকলে সরাসরি ব্যাকএন্ড API এর মাধ্যমে সম্পূর্ণ ডাটা ডাটাবেজে অ্যাড হবে
        fetch('/api/cart/add', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            // ফিক্স: শুধুমাত্র আইডি ও কোয়ান্টিটি নয়, বরং সম্পূর্ণ ডাটা পাঠানো হচ্ছে
            body: JSON.stringify({ 
                productId: productId, 
                quantity: 1,
                name: productName,
                price: Number(productPrice),
                image: normalizedNewLine.image || resolvedImage || '',
                selectedImage: normalizedNewLine.selectedImage || '',
                variantImage: normalizedNewLine.variantImage || '',
                icon: productIcon,
                images: normalizedNewLine.images || realProduct?.images || []
            })
        })
        .then(res => res.json())
        .then(updatedData => {
            if (Array.isArray(updatedData)) {
                syncCartFromServerItems(updatedData);
                if (existingItem) {
                    notifyToast('🛒 Cart quantity updated!', 'success');
                } else {
                    triggerFlyAnimation(clickedButton, normalizedNewLine.image || productImage);
                    if (typeof window.showCartAddedToast === 'function') {
                        window.showCartAddedToast();
                    } else {
                        showCardNotification(clickedButton, 'Added to bag!', 'success');
                    }
                }
                fireAddToCartAnalytics(productId, productName, productPrice, 1);
                return;
            }

            if (existingItem) {
                existingItem.quantity += 1;
                notifyToast('🛒 Cart quantity updated!', 'success');
            } else {
                triggerFlyAnimation(clickedButton, normalizedNewLine.image || productImage);
                cart.unshift(normalizedNewLine);
                if (typeof window.showCartAddedToast === 'function') {
                    window.showCartAddedToast();
                } else {
                    showCardNotification(clickedButton, 'Added to bag!', 'success');
                }
            }
            fireAddToCartAnalytics(productId, productName, productPrice, 1);
            updateCartCount();
            renderCartDrawerItems();
        })
        .catch(err => console.error("Error adding to DB cart:", err));

    } else {
        // গেস্ট ইউজারের জন্য লোকাল স্টোরেজ লজিক
        if (existingItem) {
            existingItem.quantity = (existingItem.quantity || 1) + 1;
            notifyToast('🛒 Cart quantity updated!', 'success');
        } else {
            triggerFlyAnimation(clickedButton, normalizedNewLine.image || productImage);

            currentCart.unshift(normalizedNewLine);
        }

        saveGuestCart(currentCart);
        fireAddToCartAnalytics(productId, productName, productPrice, 1);
        setTimeout(() => {
            updateCartCount();
            if (!existingItem) {
                if (typeof window.showCartAddedToast === 'function') {
                    window.showCartAddedToast();
                } else {
                    showCardNotification(clickedButton, 'Added to bag!', 'success');
                }
            }
            renderCartDrawerItems();
        }, 800);
    }
};

// গ্লোবাল ফাংশন এক্সপোজার
window.readGuestCart = readGuestCart;
window.saveGuestCart = saveGuestCart;
window.updateCartCount = updateCartCount;
window.renderCartDrawerItems = renderCartDrawerItems;
window.buildItemImageHtml = buildItemImageHtml;
window.cartItemImg = cartItemImg;
window.fetchLiveDBCart = fetchLiveDBCart;
window.syncCartFromServerItems = syncCartFromServerItems;
window.getSelectedCartSubtotal = function getSelectedCartSubtotal() {
    const currentCart = customerToken ? cart : readGuestCart();
    return currentCart
        .filter(item => item.selected !== false)
        .reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
};


/* ==========================================================================
   SECTION 8: INITIALIZATION ON LOAD (পেজ লোড সিঙ্ক)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    renderCartDrawerItems();
});

document.addEventListener('languageChanged', () => {
    if (window.i18n) window.i18n.applyTranslations();
    renderCartDrawerItems();
    updateCartTotal();
});






