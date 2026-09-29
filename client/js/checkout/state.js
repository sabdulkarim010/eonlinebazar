/**
 * Checkout State
 * Barrel: client/js/checkout.js
 *
 * Persistent cart/checkout data: EOBCommerce + EOBStorage.
 * Ephemeral checkout UI state: checkoutState.js (EOBCheckoutState).
 */

window.checkoutCDU = () => window.CartDisplayUtils || {};

function readGuestCartForCheckout() {
    if (window.EOBCommerce) {
        return window.EOBCommerce.readGuestCartFromStorage(globalProductCatalog);
    }
    if (checkoutCDU().getNormalizedGuestCart) {
        return checkoutCDU().getNormalizedGuestCart(globalProductCatalog);
    }
    return window.EOBStorage.getJSON(window.EOBStorageKeys.CART, []);
}

function saveGuestCartForCheckout(items) {
    if (window.EOBCommerce) {
        return window.EOBCommerce.persistGuestCartToStorage(items);
    }
    if (checkoutCDU().persistGuestCart) {
        return checkoutCDU().persistGuestCart(items);
    }
    window.EOBStorage.setJSON(window.EOBStorageKeys.CART, items);
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

function getCheckoutAuthToken() {
    if (window.EOBCommerce) return window.EOBCommerce.getAuthToken();
    return window.EOBStorage.get(window.EOBStorageKeys.TOKEN)
        || window.EOBStorage.get(window.EOBStorageKeys.CUSTOMER_TOKEN);
}

function isGuestCheckoutUser() {
    return !getCheckoutAuthToken();
}

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

function getCheckoutItems() {
    const commerce = window.EOBCommerce;
    const isBuyNow = commerce
        ? commerce.isBuyNowMode()
        : window.EOBStorage.get(window.EOBStorageKeys.IS_BUY_NOW_MODE) === 'true';

    if (isBuyNow) {
        const buyNowItems = commerce
            ? commerce.getBuyNowItems()
            : window.EOBStorage.getJSON(window.EOBStorageKeys.BUY_NOW_ITEM, []);
        return checkoutCDU().normalizeCartArray
            ? checkoutCDU().normalizeCartArray(buyNowItems, globalProductCatalog)
            : buyNowItems;
    }

    const currentCart = customerToken ? cart : readGuestCartForCheckout();
    return currentCart.filter((item) => item.selected !== false);
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
