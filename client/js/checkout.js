/**
 * checkout.js — barrel file
 */
import './checkout/state.js';
import './checkout/quote.js';
import './checkout/idempotency.js';
import { initCheckoutCrossTabSync } from './checkout/checkoutCrossTabSync.js';
import './checkout/render.js';
import './checkout/validation.js';
import './checkout/actions.js';
import './checkout/submit.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        initCheckoutCrossTabSync();
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
                    if (typeof requestOrderQuoteRefresh === 'function') requestOrderQuoteRefresh();
                }
            });
            checkoutCouponsAvailable = checkoutCouponController?.couponsAvailable === true;
        }

        if (window.EOBVoucherWallet && typeof window.EOBVoucherWallet.createVoucherWallet === 'function') {
            window.checkoutVoucherWallet = window.EOBVoucherWallet.createVoucherWallet({
                rootId: 'checkout-voucher-wallet',
                prefix: 'checkout',
                getSubtotal: typeof getCheckoutSubtotal === 'function' ? getCheckoutSubtotal : () => 0,
                getCartItems: typeof getCheckoutItems === 'function' ? getCheckoutItems : () => [],
                getToken: () => (typeof getCheckoutAuthToken === 'function' ? getCheckoutAuthToken() : ''),
                feedbackElId: 'checkoutCouponFeedbackMsg',
                onApplied: () => {
                    if (typeof requestOrderQuoteRefresh === 'function') requestOrderQuoteRefresh();
                    if (window.checkoutVoucherWallet?.scheduleRefresh) window.checkoutVoucherWallet.scheduleRefresh();
                },
                onRemoved: () => {
                    if (typeof requestOrderQuoteRefresh === 'function') requestOrderQuoteRefresh();
                    if (window.checkoutVoucherWallet?.scheduleRefresh) window.checkoutVoucherWallet.scheduleRefresh();
                }
            });
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
        if (typeof initCheckoutLoyaltyControls === 'function') initCheckoutLoyaltyControls();
    } catch (err) {
        console.error('Checkout page initialization failed:', err);
    }

    if (typeof bindProceedToPaymentButton === 'function') {
        bindProceedToPaymentButton();
    } else if (typeof window.bindProceedToPaymentButton === 'function') {
        window.bindProceedToPaymentButton();
    }

    async function bootstrapCheckoutCatalog() {
        try {
            fetchCartData();
            const items = typeof getCheckoutItems === 'function' ? getCheckoutItems() : [];
            if (window.EOBCatalogClient?.hydrateCatalogForCart) {
                await window.EOBCatalogClient.hydrateCatalogForCart(items);
            }
            document.dispatchEvent(new CustomEvent('productCatalogReady'));
            if (typeof renderCheckoutCart === 'function') renderCheckoutCart();
        } catch (err) {
            console.error('Catalog hydrate error:', err);
            fetchCartData();
        }
    }
    bootstrapCheckoutCatalog();

    document.addEventListener('productCatalogReady', () => {
        if (customerToken && cart.length > 0 && checkoutCDU().normalizeCartArray) {
            cart = checkoutCDU().normalizeCartArray(cart, globalProductCatalog);
            renderCheckoutCart();
        }
    });
});
