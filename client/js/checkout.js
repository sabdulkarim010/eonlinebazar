/**
 * checkout.js — barrel file
 */
import './checkout/state.js';
import './checkout/render.js';
import './checkout/validation.js';
import './checkout/actions.js';
import './checkout/submit.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (window.CouponUI && typeof window.CouponUI.bindCouponForm === 'function') {
            checkoutCouponController = await window.CouponUI.bindCouponForm({
                prefix: 'checkout',
                getSubtotal: typeof getCheckoutSubtotal === 'function' ? getCheckoutSubtotal : () => 0,
                getToken: () => (typeof getCheckoutAuthToken === 'function' ? getCheckoutAuthToken() : ''),
                onAvailabilityChange: (available) => {
                    checkoutCouponsAvailable = available;
                },
                onTotalsChange: (subtotal) => {
                    if (typeof updateCheckoutTotals === 'function') updateCheckoutTotals(subtotal);
                }
            });
            checkoutCouponsAvailable = checkoutCouponController?.couponsAvailable === true;
        }

        if (typeof ensureCheckoutLocationSelectors === 'function') ensureCheckoutLocationSelectors();
        if (typeof syncCheckoutSelectPlaceholders === 'function') syncCheckoutSelectPlaceholders();
        if (typeof initSavedAddressManualEditWatchers === 'function') initSavedAddressManualEditWatchers();
        if (typeof initializeCheckoutPage === 'function') {
            await initializeCheckoutPage();
        } else if (typeof window.initializeCheckoutPage === 'function') {
            await window.initializeCheckoutPage();
        }
        if (typeof initLiveValidationEngine === 'function') initLiveValidationEngine();
        if (typeof initCheckoutWalletControls === 'function') initCheckoutWalletControls();
    } catch (err) {
        console.error('Checkout page initialization failed:', err);
    }

    if (typeof bindProceedToPaymentButton === 'function') {
        bindProceedToPaymentButton();
    } else if (typeof window.bindProceedToPaymentButton === 'function') {
        window.bindProceedToPaymentButton();
    }

    fetch('/api/products?limit=500')
        .then(res => res.json())
        .then(data => {
            globalProductCatalog = Array.isArray(data) ? data : (data.products || data.data || []);
            window.globalProductCatalog = globalProductCatalog;
            document.dispatchEvent(new CustomEvent('productCatalogReady'));
            fetchCartData();
        })
        .catch(err => {
            console.error("Catalog load error:", err);
            fetchCartData();
        });

    document.addEventListener('productCatalogReady', () => {
        if (customerToken && cart.length > 0 && checkoutCDU().normalizeCartArray) {
            cart = checkoutCDU().normalizeCartArray(cart, globalProductCatalog);
            renderCheckoutCart();
        }
    });
});
