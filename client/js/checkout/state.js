/**
 * Checkout State
 * Barrel: client/js/checkout.js
 *
 * Globals used from other modules:
 *  * - CartDisplayUtils
 *
 * Globals this module exposes:
 *  * - cart
 * - globalProductCatalog
 * - customerToken
 * - validationState
 * - deliverySettings
 */

window.globalProductCatalog = [];
window.cart = [];
window.checkoutCDU = () => window.CartDisplayUtils || {};

function readGuestCartForCheckout() {
    if (checkoutCDU().getNormalizedGuestCart) {
        return checkoutCDU().getNormalizedGuestCart(globalProductCatalog);
    }
    try {
        return JSON.parse(localStorage.getItem('cart') || '[]');
    } catch (_) {
        localStorage.removeItem('cart');
        return [];
    }
}

function saveGuestCartForCheckout(items) {
    if (checkoutCDU().persistGuestCart) {
        return checkoutCDU().persistGuestCart(items);
    }
    localStorage.setItem('cart', JSON.stringify(items));
    return items;
}

function mapCheckoutCartItem(item = {}) {
    const catalogProduct = checkoutCDU().findCatalogProduct
        ? checkoutCDU().findCatalogProduct(item, globalProductCatalog)
        : globalProductCatalog.find((p) =>
            String(p._id) === String(item.productId || item.id) ||
            String(p.productId) === String(item.productId || item.id) ||
            String(p.id) === String(item.productId || item.id)
        );
    if (checkoutCDU().normalizeCartItem) {
        return checkoutCDU().normalizeCartItem(item, catalogProduct);
    }
    const displayImage = String(
        item.selectedImage || item.variantImage || item.image || item.products || ''
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

window.deliverySettings = {
    shopHomeCity: 'Dhaka',
    deliveryInsideCity: 60,
    deliveryOutsideCity: 120,
    freeShippingMinAmount: 1000,
    freeShippingThreshold: 1000
};
window.selectedShippingDistrict = '';
window.selectedShippingUpazila = '';
window.checkoutProfileCache = null;
window.savedCheckoutAddresses = [];
window.selectedSavedAddressId = null;
window.isApplyingSavedAddress = false;

function getCheckoutAuthToken() {
    return localStorage.getItem('token') || localStorage.getItem('customerToken');
}

function isGuestCheckoutUser() {
    return !getCheckoutAuthToken();
}

window.customerToken = getCheckoutAuthToken();

window.validationState = {
    name: false,
    mobile: false,
    address: false,
    district: false,
    upazila: false
};

window.checkoutCouponsAvailable = false;
window.checkoutCouponController = null;
window.checkoutWalletBalance = 0;
window.checkoutBeginTracked = false;
window.applyWalletAtCheckout = false;

function getAppliedCoupon() {
    return window.CouponUI ? window.CouponUI.getAppliedCoupon() : null;
}

function setAppliedCoupon(data) {
    if (window.CouponUI) window.CouponUI.setAppliedCoupon(data);
}

function hideCheckoutCouponSection() {
    checkoutCouponsAvailable = false;
    const container = document.getElementById('checkout-coupon-container');
    if (container) container.style.display = 'none';
    setAppliedCoupon(null);
    CouponUI?.syncCouponPanel({ prefix: 'checkout', subtotal: 0, couponsAvailable: false });
}

async function refreshCheckoutCouponAvailability() {
    if (checkoutCouponController?.recheckAvailability) {
        return checkoutCouponController.recheckAvailability();
    }

    const available = await (window.CouponUI?.checkActiveCoupons() || Promise.resolve(false));
    checkoutCouponsAvailable = available;
    const container = document.getElementById('checkout-coupon-container');
    if (container) container.style.display = available ? 'block' : 'none';
    if (!available) setAppliedCoupon(null);
    return available;
}

function showCouponToast(message, type = 'success') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type === 'error' ? 'error' : (type === 'warning' ? 'warning' : 'success'),
            title: message,
            showConfirmButton: false,
            timer: 2800,
            timerProgressBar: true
        });
        return;
    }
    alert(message);
}

window.checkoutLocationPair = null;

/* =========================================================================
   ২. কোর লজিক: চেকআউট আইটেম ফিল্টার (Buy Now vs Cart)
   ========================================================================= */
function getCheckoutItems() {
    const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
    
    if (isBuyNow) {
        let buyNowItems = [];
        try {
            buyNowItems = JSON.parse(localStorage.getItem('buy_now_item') || '[]');
            if (!Array.isArray(buyNowItems)) buyNowItems = [];
        } catch (_) {
            buyNowItems = [];
        }
        return checkoutCDU().normalizeCartArray
            ? checkoutCDU().normalizeCartArray(buyNowItems, globalProductCatalog)
            : buyNowItems;
    }

    const currentCart = customerToken ? cart : readGuestCartForCheckout();
    return currentCart.filter(item => item.selected !== false);
}
Object.assign(window, {
    readGuestCartForCheckout,
    saveGuestCartForCheckout,
    mapCheckoutCartItem,
    getCheckoutAuthToken,
    isGuestCheckoutUser,
    getAppliedCoupon,
    setAppliedCoupon,
    hideCheckoutCouponSection,
    refreshCheckoutCouponAvailability,
    showCouponToast,
    getCheckoutItems
});
