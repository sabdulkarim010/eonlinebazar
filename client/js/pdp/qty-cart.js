/**
 * PDP Qty & Cart
 * Barrel: client/js/product-details.js
 *
 * Globals used from other modules:
 *  * - currentProductData
 * - getAvailableStock
 * - getEffectivePrice
 * - matchedCombinationVariant
 * - selectedVariantsByAttr
 * - isColorAttribute
 * - isSizeAttribute
 * - showToast
 *
 * Globals this module exposes:
 *  * - setupEventListeners
 * - getPaymentSettingsSource
 * - resolveEnabledPaymentMethods
 * - buildPaymentBadgeHtml
 * - paintActivePaymentBadges
 * - renderActivePaymentBadges
 * - getProductSharePayload
 * - openShareWindow
 * - setupShareButtons
 */

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
            icon: mediaMeta.emoji || currentProductData.icon || '',
            emoji: mediaMeta.emoji || currentProductData.icon || '',
            emojiIcon: mediaMeta.emoji || currentProductData.icon || '',
            images: currentProductData.images || [],
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

        const CDU = window.CartDisplayUtils;
        const PT = window.ProductThumbnail;
        if (CDU && typeof CDU.normalizeCartItem === 'function') {
            return CDU.normalizeCartItem(base, currentProductData);
        }
        if (PT) {
            const merged = PT.mergeMediaSources(base, currentProductData);
            const picked = PT.pickCartLineImage(merged) || PT.pickImageFromItem(merged) || '';
            const display = PT.toDisplayImageUrl ? (PT.toDisplayImageUrl(picked) || picked) : picked;
            if (display) {
                base.image = display;
                base.selectedImage = display;
                base.variantImage = display;
                base.products = display;
            }
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
        const CDU = window.CartDisplayUtils;
        let cart = CDU?.getNormalizedGuestCart
            ? CDU.getNormalizedGuestCart(window.globalProductCatalog || [])
            : (JSON.parse(localStorage.getItem('cart') || '[]'));

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

        if (CDU?.persistGuestCart) {
            CDU.persistGuestCart(cart);
        } else {
            localStorage.setItem('cart', JSON.stringify(cart));
        }
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
                    const items = (window.CartDisplayUtils && window.CartDisplayUtils.parseCartApiResponse)
                        ? window.CartDisplayUtils.parseCartApiResponse(updatedData)
                        : (Array.isArray(updatedData) ? updatedData : (Array.isArray(updatedData?.data) ? updatedData.data : []));
                    if (items.length > 0 && typeof window.syncCartFromServerItems === 'function') {
                        window.syncCartFromServerItems(items);
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

        if (window.analytics && currentProductData) {
            window.analytics.trackAddToCart(currentProductData, quantity);
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
Object.assign(window, {
    setupEventListeners,
    getPaymentSettingsSource,
    resolveEnabledPaymentMethods,
    buildPaymentBadgeHtml,
    paintActivePaymentBadges,
    renderActivePaymentBadges,
    getProductSharePayload,
    openShareWindow,
    setupShareButtons
});
