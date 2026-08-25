/**
 * checkout.js — barrel file
 */
import './checkout/state.js';
import './checkout/render.js';
import './checkout/validation.js';
import './checkout/actions.js';
import './checkout/submit.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (window.CouponUI) {
        checkoutCouponController = await CouponUI.bindCouponForm({
            prefix: 'checkout',
            getSubtotal: getCheckoutSubtotal,
            getToken: () => getCheckoutAuthToken(),
            onAvailabilityChange: (available) => {
                checkoutCouponsAvailable = available;
            },
            onTotalsChange: (subtotal) => updateCheckoutTotals(subtotal)
        });
        checkoutCouponsAvailable = checkoutCouponController?.couponsAvailable === true;
    }

    ensureCheckoutLocationSelectors();
    syncCheckoutSelectPlaceholders();
    initSavedAddressManualEditWatchers();
    await initializeCheckoutPage();
    initLiveValidationEngine();
    initCheckoutWalletControls();

    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) proceedBtn.addEventListener('click', handleProceedToPayment);

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
