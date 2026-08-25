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
 *  * - handleProceedToPayment
 * - handleProceedToPaymentAsync
 * - openCheckoutAlertModal
 * - closeCheckoutAlertModal
 * - closeCheckoutAlertModal
 */

/* =========================================================================
   💳 ৬. পেমেন্ট সাবমিশন লজিক
   ========================================================================= */
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

    const nameVal = document.getElementById('shippingFullName').value.trim();
    const mobileVal = document.getElementById('shippingMobile').value.trim();
    const emailVal = document.getElementById('shippingEmail')?.value.trim() || '';
    const streetAddressVal = document.getElementById('shippingAddress').value.trim();
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

    let subtotal = checkedItems.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);

    const couponsStillAvailable = await refreshCheckoutCouponAvailability();
    if (!couponsStillAvailable) {
        setAppliedCoupon(null);
    }

    const applied = getAppliedCoupon();
    let discountAmount = 0;
    let couponCode = '';
    let merchandisePayable = subtotal;

    if (applied && applied.code && Math.round(Number(applied.subtotal) * 100) === Math.round(Number(subtotal) * 100)) {
        discountAmount = Number(applied.discountAmount) || 0;
        couponCode = applied.code;
        merchandisePayable = Number(applied.finalTotal);
        if (!Number.isFinite(merchandisePayable)) merchandisePayable = Math.max(0, subtotal - discountAmount);
    } else if (applied) {
        // Stale coupon — clear before payment
        setAppliedCoupon(null);
    }

    const deliveryCharge = calculateDeliveryCharge(subtotal);
    const totalAmount = Math.round((merchandisePayable + deliveryCharge) * 100) / 100;
    const walletSummary = calculateWalletApplication(totalAmount);
    const payableAfterWallet = walletSummary.payableTotal;
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
        deliveryLocationType,
        shippingLocationType,
        deliveryCharge,
        shippingFee: deliveryCharge,
        estimatedDelivery: shippingQuote?.estimatedDelivery || null,
        totalAmount,
        grandTotal: totalAmount,
        walletApplied: walletSummary.walletApplied,
        payableAfterWallet,
        applyWallet: applyWalletAtCheckout && walletSummary.walletApplied > 0,
        status: "Pending",
        items: checkedItems,
        note: noteVal
    };

    localStorage.setItem('activeCheckoutSession', JSON.stringify(checkoutOrderSession));

    if (!isGuestCheckoutUser()) {
        localStorage.setItem('checkout_name', nameVal);
        localStorage.setItem('checkout_phone', mobileVal);
        if (emailVal) localStorage.setItem('checkout_email', emailVal);
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
    handleProceedToPayment,
    handleProceedToPaymentAsync,
    openCheckoutAlertModal,
    closeCheckoutAlertModal
});
