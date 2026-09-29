/**
 * Checkout Submit
 * Barrel: client/js/checkout.js
 *
 * Globals used from other modules:
 *  * - validationState
 * - getCheckoutItems
 * - cart
 * - customerToken
 *
 * Globals this module exposes:
 *  * - bindProceedToPaymentButton
 * - handleProceedToPayment
 * - handleProceedToPaymentAsync
 * - openCheckoutAlertModal
 * - closeCheckoutAlertModal
 */

/* =========================================================================
   💳 ৬. পেমেন্ট সাবমিশন লজিক
   ========================================================================= */
function bindProceedToPaymentButton() {
    const handler = typeof handleProceedToPayment === 'function'
        ? handleProceedToPayment
        : window.handleProceedToPayment;
    if (typeof handler !== 'function') return;

    const proceedBtn = document.getElementById('proceedToPaymentBtn')
        || document.getElementById('proceed-to-payment');
    if (proceedBtn && proceedBtn.dataset.paymentBound !== '1') {
        proceedBtn.dataset.paymentBound = '1';
        proceedBtn.addEventListener('click', handler);
    }

    if (document.documentElement.dataset.checkoutPaymentDelegated === '1') return;
    document.documentElement.dataset.checkoutPaymentDelegated = '1';
    document.addEventListener('click', (event) => {
        const btn = event.target?.closest?.('#proceedToPaymentBtn, #proceed-to-payment');
        if (!btn || btn.dataset.paymentBound === '1') return;
        handler(event);
    });
}

function handleProceedToPayment() {
    handleProceedToPaymentAsync().catch((err) => {
        console.error('Proceed to payment error:', err);
        showCouponToast('Something went wrong. Please try again.', 'error');
    });
}

async function handleProceedToPaymentAsync() {
    // পেমেন্টের আগে হাইব্রিড কার্ট চেক (সেন্ট্রাল ফাংশন দিয়ে)
    const checkedItems = getCheckoutItems();

    if (checkedItems.length === 0) {
        openCheckoutAlertModal("Your cart is empty! Please add products.");
        return;
    }

    let errorMessages = [];
    
    if (!validationState.name) {
        errorMessages.push("⚠️ Please enter your Full Name (at least 2 characters).");
    }
    if (!validationState.mobile) {
        errorMessages.push("⚠️ Please enter a valid 11-digit Mobile Number.");
    }
    if (!validationState.address) {
        errorMessages.push("⚠️ Please enter your Delivery Address.");
    }
    if (!validationState.district) {
        errorMessages.push("⚠️ Please select your District / City.");
    }
    if (!validationState.upazila) {
        errorMessages.push("⚠️ Please select your Upazila / Thana.");
    }

    if (errorMessages.length > 0) {
        const finalMessage = errorMessages.join("\n\n"); 
        openCheckoutAlertModal(finalMessage);
        return;
    }

    if (typeof refreshOrderQuoteNow === 'function') {
        const freshQuote = await refreshOrderQuoteNow({ silent: true });
        if (typeof isQuoteBlockingCheckout === 'function' && isQuoteBlockingCheckout()) {
            const meta = window.EOBCheckoutState?.get('quoteMeta');
            const msg = meta?.error
                || meta?.itemErrors?.[0]?.message
                || 'Some items are unavailable. Update your cart and try again.';
            openCheckoutAlertModal(msg);
            return;
        }
        if (!freshQuote && window.EOBCheckoutState?.get('quoteMeta')?.fallback) {
            showCouponToast('Live pricing is temporarily unavailable. You can continue with estimated totals.', 'warning');
        }
    }

    const nameVal = document.getElementById('shippingFullName')?.value.trim() || '';
    const mobileVal = document.getElementById('shippingMobile')?.value.trim() || '';
    const emailVal = document.getElementById('shippingEmail')?.value.trim() || '';
    const streetAddressVal = document.getElementById('shippingAddress')?.value.trim() || '';
    const noteVal = document.getElementById('shippingCourierNote')?.value.trim() || "";
    const shippingDistrict = document.getElementById('shippingDistrict')?.value?.trim() || selectedShippingDistrict;
    const shippingUpazila = document.getElementById('shippingUpazila')?.value?.trim() || selectedShippingUpazila;
    const addressVal = buildCompleteDeliveryAddress({
        streetText: streetAddressVal,
        upazila: shippingUpazila,
        district: shippingDistrict
    });
    const shippingLocationType = resolveShippingZoneLabel() || 'Outside City';
    const deliveryLocationType = shippingLocationType === 'Inside City' ? 'inside' : 'outside';

    const serverQuote = typeof getActiveQuote === 'function' ? getActiveQuote() : null;
    const quoteMeta = window.EOBCheckoutState?.get('quoteMeta');
    const useServerQuote = serverQuote && quoteMeta && quoteMeta.valid !== false && quoteMeta.fallback !== true;

    let subtotal;
    let discountAmount = 0;
    let couponCode = '';
    let deliveryCharge = 0;
    let vatAmount = 0;
    let totalAmount = 0;
    let payableAfterWallet = 0;
    let walletSummary = { walletApplied: 0, payableTotal: 0 };
    let loyaltySummary = { pointsUsed: 0, loyaltyDiscount: 0, merchandiseAfterLoyalty: 0 };

    if (useServerQuote) {
        subtotal = serverQuote.subtotal;
        discountAmount = serverQuote.discountAmount;
        couponCode = serverQuote.couponCode || '';
        deliveryCharge = serverQuote.shippingFee;
        vatAmount = serverQuote.vatAmount;
        totalAmount = serverQuote.grandTotal;
        walletSummary = {
            walletApplied: serverQuote.walletApplied,
            payableTotal: serverQuote.payableAfterWallet
        };
        payableAfterWallet = serverQuote.payableAfterWallet;
        loyaltySummary = {
            pointsUsed: serverQuote.loyaltyPointsToUse,
            loyaltyDiscount: serverQuote.loyaltyDiscount,
            merchandiseAfterLoyalty: serverQuote.merchandisePayable
        };
    } else {
        subtotal = checkedItems.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);

        const couponsStillAvailable = await refreshCheckoutCouponAvailability();
        if (!couponsStillAvailable) {
            setAppliedCoupon(null);
        }

        const applied = getAppliedCoupon();
        let merchandisePayable = subtotal;

        if (applied && applied.code && Math.round(Number(applied.subtotal) * 100) === Math.round(Number(subtotal) * 100)) {
            discountAmount = Number(applied.discountAmount) || 0;
            couponCode = applied.code;
            merchandisePayable = Number(applied.finalTotal);
            if (!Number.isFinite(merchandisePayable)) merchandisePayable = Math.max(0, subtotal - discountAmount);
        } else if (applied) {
            setAppliedCoupon(null);
        }

        deliveryCharge = calculateDeliveryCharge(subtotal);
        loyaltySummary = typeof calculateLoyaltyApplication === 'function'
            ? calculateLoyaltyApplication(merchandisePayable)
            : { pointsUsed: 0, loyaltyDiscount: 0, merchandiseAfterLoyalty: merchandisePayable };
        totalAmount = Math.round((loyaltySummary.merchandiseAfterLoyalty + deliveryCharge) * 100) / 100;
        walletSummary = calculateWalletApplication(totalAmount);
        payableAfterWallet = walletSummary.payableTotal;
    }
    const SE = window.ShippingEstimator;
    const shippingQuote = SE
        ? SE.calculateShippingQuote(deliverySettings, { district: shippingDistrict, subtotal })
        : null;

    const checkoutOrderSession = {
        orderId: `EOB${Math.floor(100000 + Math.random() * 900000)}`, 
        customerName: nameVal,
        customerPhone: mobileVal,
        customerEmail: emailVal,
        customerAddress: addressVal,
        shippingDistrict,
        shippingUpazila,
        shippingStreetAddress: streetAddressVal,
        saveAddressToProfile: document.getElementById('saveAddressToProfile')?.checked === true,
        saveAddressAsDefault: document.getElementById('saveAddressToProfile')?.checked === true,
        addressLabel: 'Home',
        selectedSavedAddressId: selectedSavedAddressId || null,
        subtotal,
        subTotal: subtotal,
        discountAmount,
        couponCode,
        vatAmount,
        taxAmount: vatAmount,
        deliveryLocationType,
        shippingLocationType,
        deliveryCharge,
        shippingFee: deliveryCharge,
        estimatedDelivery: (useServerQuote && serverQuote.estimatedDelivery)
            ? { label: serverQuote.estimatedDelivery }
            : (shippingQuote?.estimatedDelivery || null),
        totalAmount,
        grandTotal: totalAmount,
        walletApplied: walletSummary.walletApplied,
        payableAfterWallet,
        serverQuote: useServerQuote ? serverQuote : null,
        quoteGeneratedAt: useServerQuote ? serverQuote.quoteGeneratedAt : null,
        applyWallet: applyWalletAtCheckout && walletSummary.walletApplied > 0,
        applyLoyaltyPoints: applyLoyaltyAtCheckout && loyaltySummary.pointsUsed > 0,
        loyaltyPointsToUse: loyaltySummary.pointsUsed || 0,
        loyaltyDiscount: loyaltySummary.loyaltyDiscount || 0,
        status: "Pending",
        items: checkedItems,
        note: noteVal
    };

    if (typeof ensureCheckoutIdempotencyKey === 'function') {
        checkoutOrderSession.idempotencyKey = ensureCheckoutIdempotencyKey(checkedItems);
        checkoutOrderSession.idempotencyFingerprint = typeof computeCheckoutAttemptFingerprint === 'function'
            ? computeCheckoutAttemptFingerprint(checkedItems)
            : '';
        if (window.EOBCheckoutState) {
            window.EOBCheckoutState.set('idempotencyKey', checkoutOrderSession.idempotencyKey);
            window.EOBCheckoutState.set('idempotencyFingerprint', checkoutOrderSession.idempotencyFingerprint);
        }
    }

    if (window.EOBCommerce) {
        window.EOBCommerce.setCheckoutSessionObject(checkoutOrderSession);
    } else {
        window.EOBStorage.setJSON(window.EOBStorageKeys.ACTIVE_CHECKOUT_SESSION, checkoutOrderSession);
    }

    if (!isGuestCheckoutUser()) {
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_NAME, nameVal);
        window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_PHONE, mobileVal);
        if (emailVal) window.EOBStorage.set(window.EOBStorageKeys.CHECKOUT_EMAIL, emailVal);
    }
    
    window.location.href = '/payment';
}

function openCheckoutAlertModal(msg) {
    const modal = document.getElementById('checkoutAlertModal');
    if (modal) {
        modal.querySelector('.custom-alert-modal-message').innerText = msg;
        modal.style.display = 'flex';
    } else { alert(msg); }
}

function closeCheckoutAlertModal() {
    const modal = document.getElementById('checkoutAlertModal');
    if(modal) modal.style.display = 'none';
}
Object.assign(window, {
    bindProceedToPaymentButton,
    handleProceedToPayment,
    handleProceedToPaymentAsync,
    openCheckoutAlertModal,
    closeCheckoutAlertModal
});
