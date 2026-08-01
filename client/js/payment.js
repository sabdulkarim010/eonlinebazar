/**
 * =========================================================================
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/payment.js
 * Description: Dynamic Payment Engine — loads active PaymentMethod catalog,
 * shows manual instructions / automated gateway notice, live processing-fee
 * totals, and places orders mapped to paymentMethodId for ledger/IPN.
 * =========================================================================
 */

let checkoutPaymentMethods = [];
let basePayableBeforeFee = 0;
let selectedPaymentMethod = null;
let walletOnlyMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    loadCheckoutSessionData();
    await loadDynamicPaymentMethods();

    const confirmOrderBtn = document.getElementById('confirmOrderFinalBtn');
    if (confirmOrderBtn) {
        confirmOrderBtn.addEventListener('click', handleFinalOrderSubmission);
    }
});

/* =========================================================================
   Session + summary
   ========================================================================= */
function loadCheckoutSessionData() {
    const sessionData = JSON.parse(localStorage.getItem('activeCheckoutSession'));

    if (!sessionData) {
        alert('No active checkout session found. Redirecting to cart.');
        window.location.href = '/cart';
        return;
    }

    window.__checkoutSession = sessionData;

    document.getElementById('summaryCustomerName').innerText = sessionData.customerName || 'N/A';
    document.getElementById('summaryCustomerMobile').innerText =
        sessionData.customerPhone || sessionData.customerMobile || 'N/A';
    document.getElementById('summaryCustomerAddress').innerText = sessionData.customerAddress || 'N/A';

    const noteRow = document.getElementById('summaryCourierNoteRow');
    const noteSpan = document.getElementById('summaryCourierNote');
    const savedNote = sessionData.note || localStorage.getItem('shippingCourierNote') || '';
    if (savedNote && savedNote.trim() !== '') {
        if (noteSpan) noteSpan.innerText = savedNote;
        if (noteRow) noteRow.style.display = 'block';
    } else if (noteRow) {
        noteRow.style.display = 'none';
    }

    let totalItems = 0;
    let calculatedSubtotal = 0;
    if (sessionData.items && sessionData.items.length > 0) {
        sessionData.items.forEach((item) => {
            totalItems += parseInt(item.quantity, 10) || 1;
            calculatedSubtotal += parseFloat(item.price) * (parseInt(item.quantity, 10) || 1);
        });
    }

    const subtotal = Number(sessionData.subtotal) || calculatedSubtotal;
    const discountAmount = Number(sessionData.discountAmount) || 0;
    const deliveryCharge = Number(sessionData.deliveryCharge ?? sessionData.shippingFee) || 0;
    const walletApplied = Number(sessionData.walletApplied) || 0;
    const grandBeforeWallet = Number.isFinite(Number(sessionData.grandTotal))
        ? Number(sessionData.grandTotal)
        : Math.max(0, subtotal - discountAmount + deliveryCharge);
    const payable = Number.isFinite(Number(sessionData.payableAfterWallet))
        ? Number(sessionData.payableAfterWallet)
        : Math.max(0, grandBeforeWallet - walletApplied);

    basePayableBeforeFee = payable;

    document.getElementById('summaryItemsCount').innerText =
        `${totalItems} Item${totalItems !== 1 ? 's' : ''}`;

    const walletRow = document.getElementById('summaryWalletRow');
    const walletEl = document.getElementById('summaryWalletApplied');
    if (walletApplied > 0 && walletRow) {
        walletRow.style.display = 'flex';
        if (walletEl) walletEl.innerText = `-৳${walletApplied.toLocaleString('en-US')}`;
    } else if (walletRow) {
        walletRow.style.display = 'none';
    }

    const discountRow = document.getElementById('summaryDiscountRow');
    const discountEl = document.getElementById('summaryDiscountAmount');
    const couponLabel = document.getElementById('summaryCouponCode');
    if (discountAmount > 0 && discountRow) {
        discountRow.style.display = 'flex';
        if (discountEl) discountEl.innerText = `-৳${discountAmount}`;
        if (couponLabel) couponLabel.innerText = sessionData.couponCode || '';
    } else if (discountRow) {
        discountRow.style.display = 'none';
    }

    const deliveryChargeEl = document.getElementById('summaryDeliveryCharge');
    const freeShippingBadge = document.getElementById('summaryFreeShippingBadge');
    if (deliveryChargeEl) {
        deliveryChargeEl.innerText = deliveryCharge === 0 ? '৳0' : `৳${deliveryCharge}`;
        deliveryChargeEl.style.display = deliveryCharge === 0 ? 'none' : 'inline';
    }
    if (freeShippingBadge) {
        freeShippingBadge.style.display = deliveryCharge === 0 ? 'inline-flex' : 'none';
    }

    updatePayableSummary(0, null);
    walletOnlyMode = payable <= 0 && walletApplied > 0;
}

function computeProcessingFee(method, amount) {
    if (!method) return 0;
    const fee = Number(method.processingFee) || 0;
    if (fee <= 0) return 0;
    const base = Math.max(0, Number(amount) || 0);
    const raw = method.feeType === 'flat' ? fee : (base * fee) / 100;
    return Math.round(raw * 100) / 100;
}

function updatePayableSummary(processingFee = 0, method = null) {
    const feeRow = document.getElementById('summaryProcessingFeeRow');
    const feeAmountEl = document.getElementById('summaryProcessingFeeAmount');
    const feeLabelEl = document.getElementById('summaryProcessingFeeLabel');
    const payableEl = document.getElementById('summaryPayableTotal');
    const fee = Math.max(0, Number(processingFee) || 0);
    const total = Math.max(0, basePayableBeforeFee + fee);

    if (feeRow && feeAmountEl) {
        if (fee > 0 && method) {
            feeRow.style.display = 'flex';
            feeAmountEl.innerText = `৳${fee.toLocaleString('en-US')}`;
            if (feeLabelEl) {
                feeLabelEl.innerText = method.feeType === 'flat'
                    ? `${method.name}`
                    : `${method.processingFee}% · ${method.name}`;
            }
        } else {
            feeRow.style.display = 'none';
        }
    }

    if (payableEl) payableEl.innerText = `৳${total.toLocaleString('en-US')}`;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function methodFallbackIcon(method) {
    const code = String(method?.code || method?.name || '').toLowerCase();
    if (code.includes('bkash')) return 'fa-mobile-screen-button bkash-color';
    if (code.includes('nagad')) return 'fa-bolt nagad-color';
    if (code.includes('bank')) return 'fa-building-columns bank-color';
    if (code.includes('cod') || code.includes('cash')) return 'fa-truck-ramp-box cod-color';
    if (code.includes('visa') || code.includes('master') || code.includes('card')) {
        return 'fa-credit-card bank-color';
    }
    return method?.type === 'automated' ? 'fa-shield-halved bank-color' : 'fa-wallet wallet-color';
}

function formatFeeHint(method) {
    const fee = Number(method?.processingFee) || 0;
    if (fee <= 0) return '';
    return method.feeType === 'flat' ? `+৳${fee} fee` : `+${fee}% fee`;
}

/* =========================================================================
   Dynamic catalog
   ========================================================================= */
async function loadDynamicPaymentMethods() {
    const grid = document.getElementById('paymentOptionsGrid');
    if (!grid) return;

    if (walletOnlyMode) {
        renderWalletOnlyOption(grid);
        return;
    }

    try {
        const res = await fetch('/api/payments/methods');
        const data = await res.json();
        const methods = Array.isArray(data?.data?.methods)
            ? data.data.methods
            : (Array.isArray(data?.data?.paymentMethods) ? data.data.paymentMethods : []);

        checkoutPaymentMethods = methods
            .slice()
            .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));

        if (!checkoutPaymentMethods.length) {
            grid.innerHTML = `
                <div class="payment-methods-empty">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>No payment methods are available right now. Please contact support or try again later.</p>
                </div>`;
            document.getElementById('paymentInstructionsBox').innerHTML = '';
            const confirmBtn = document.getElementById('confirmOrderFinalBtn');
            if (confirmBtn) confirmBtn.disabled = true;
            return;
        }

        renderPaymentMethodCards(grid, checkoutPaymentMethods);
        selectPaymentMethod(checkoutPaymentMethods[0]);
    } catch (err) {
        console.error('Failed to load payment methods:', err);
        grid.innerHTML = `
            <div class="payment-methods-empty">
                <i class="fa-solid fa-wifi"></i>
                <p>Could not load payment methods. Please refresh the page.</p>
            </div>`;
    }
}

function renderWalletOnlyOption(grid) {
    grid.innerHTML = `
        <label class="payment-method-card active-method" for="methodWallet">
            <div class="card-radio-wrapper">
                <input type="radio" id="methodWallet" name="paymentGateway" value="wallet" data-method-id="wallet" checked>
                <span class="custom-radio-circle"></span>
            </div>
            <div class="method-details">
                <span class="method-title">Paid via Wallet</span>
                <span class="method-subtitle">Your order is fully covered by wallet balance</span>
            </div>
            <div class="method-logo-box">
                <i class="fa-solid fa-wallet logo-fallback-icon wallet-color"></i>
            </div>
        </label>`;

    selectedPaymentMethod = {
        id: 'wallet',
        code: 'wallet',
        name: 'Wallet',
        type: 'manual',
        processingFee: 0,
        feeType: 'flat',
        instructions: 'Your wallet balance fully covers this order. Confirm below to place the order and deduct the wallet amount instantly.'
    };
    updatePaymentInstructions(selectedPaymentMethod);
    updatePayableSummary(0, null);
}

function renderPaymentMethodCards(grid, methods) {
    grid.innerHTML = methods.map((method, index) => {
        const id = escapeHtml(method.id);
        const inputId = `paymentMethod_${escapeHtml(method.code || method.id)}`;
        const feeHint = formatFeeHint(method);
        const logo = method.logoUrl
            ? `<img src="${escapeHtml(method.logoUrl)}" alt="${escapeHtml(method.name)}" class="method-logo-img" loading="lazy">`
            : `<i class="fa-solid ${methodFallbackIcon(method)} logo-fallback-icon"></i>`;

        return `
            <label class="payment-method-card ${index === 0 ? 'active-method' : ''}" for="${inputId}" data-method-id="${id}">
                <div class="card-radio-wrapper">
                    <input type="radio"
                        id="${inputId}"
                        name="paymentGateway"
                        value="${escapeHtml(method.code || method.id)}"
                        data-method-id="${id}"
                        ${index === 0 ? 'checked' : ''}>
                    <span class="custom-radio-circle"></span>
                </div>
                <div class="method-details">
                    <span class="method-title">${escapeHtml(method.name)}</span>
                    <span class="method-subtitle">${escapeHtml(method.description || (method.type === 'automated' ? 'Secure gateway checkout' : 'Pay using this method'))}</span>
                    ${feeHint ? `<span class="method-fee-hint">${escapeHtml(feeHint)}</span>` : ''}
                </div>
                <div class="method-logo-box">${logo}</div>
            </label>`;
    }).join('');

    grid.querySelectorAll('.payment-method-card').forEach((card) => {
        card.addEventListener('click', () => {
            const methodId = card.dataset.methodId;
            const method = checkoutPaymentMethods.find((m) => String(m.id) === String(methodId));
            if (method) selectPaymentMethod(method);
        });
    });
}

function selectPaymentMethod(method) {
    if (!method) return;
    selectedPaymentMethod = method;

    document.querySelectorAll('.payment-method-card').forEach((card) => {
        const isActive = String(card.dataset.methodId) === String(method.id);
        card.classList.toggle('active-method', isActive);
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = isActive;
    });

    const fee = computeProcessingFee(method, basePayableBeforeFee);
    updatePayableSummary(fee, method);
    updatePaymentInstructions(method);
}

function updatePaymentInstructions(method) {
    const instructionBox = document.getElementById('paymentInstructionsBox');
    if (!instructionBox || !method) return;

    if (method.code === 'wallet' || method.id === 'wallet') {
        instructionBox.innerHTML = `
            <p><strong><i class="fa-solid fa-wallet"></i> Paid via Wallet</strong></p>
            <p class="payment-instruction-copy">${escapeHtml(method.instructions)}</p>
            <div class="instruction-important-note" style="color:#166534;background:#e2fbe8;padding:8px;border-radius:4px;">
                <i class="fa-solid fa-circle-check"></i> Confirm below to place the order and deduct the wallet amount instantly.
            </div>`;
        return;
    }

    if (method.type === 'automated') {
        instructionBox.innerHTML = `
            <p><strong><i class="fa-solid fa-shield-halved"></i> Secure Gateway Payment</strong></p>
            <p class="payment-instruction-copy">
                You will be redirected to a secure payment gateway to complete your payment for
                <strong>${escapeHtml(method.name)}</strong>.
            </p>
            <div class="instruction-important-note">
                <i class="fa-solid fa-circle-info"></i>
                Never share OTP or card details with anyone claiming to be from the store.
            </div>`;
        return;
    }

    const accountLine = method.accountNumber
        ? `<div class="payment-account-chip">Account: <strong>${escapeHtml(method.accountNumber)}</strong></div>`
        : '';
    const instructions = method.instructions
        ? `<p class="payment-instruction-copy">${escapeHtml(method.instructions).replace(/\n/g, '<br>')}</p>`
        : `<p class="payment-instruction-copy">Follow the payment steps for <strong>${escapeHtml(method.name)}</strong> and keep your transaction reference.</p>`;

    instructionBox.innerHTML = `
        <p><strong><i class="fa-solid fa-circle-info"></i> ${escapeHtml(method.name)} Instructions</strong></p>
        ${accountLine}
        ${instructions}
        <div class="instruction-important-note">
            <i class="fa-solid fa-circle-info"></i>
            Our team verifies payments shortly after you place the order.
        </div>`;
}

/* =========================================================================
   Place order
   ========================================================================= */
window.handleFinalOrderSubmission = async function handleFinalOrderSubmission() {
    if (!selectedPaymentMethod && !walletOnlyMode) {
        alert('Please select a payment method first.');
        return;
    }

    const confirmBtn = document.getElementById('confirmOrderFinalBtn');
    if (confirmBtn) {
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Order...';
        confirmBtn.disabled = true;
    }

    try {
        const sessionData = JSON.parse(localStorage.getItem('activeCheckoutSession'));
        if (!sessionData || !sessionData.items) {
            throw new Error('Checkout session expired. Please go back to cart.');
        }

        const method = selectedPaymentMethod;
        const isWallet = walletOnlyMode || method?.code === 'wallet' || method?.id === 'wallet';
        const processingFee = isWallet ? 0 : computeProcessingFee(method, basePayableBeforeFee);

        const orderData = {
            orderId: sessionData.orderId || `EOB${Math.floor(100000 + Math.random() * 900000)}`,
            customerName: sessionData.customerName,
            customerPhone: sessionData.customerPhone,
            customerEmail: sessionData.customerEmail || '',
            customerAddress: sessionData.customerAddress,
            shippingDistrict: sessionData.shippingDistrict || '',
            shippingUpazila: sessionData.shippingUpazila || '',
            shippingStreetAddress: sessionData.shippingStreetAddress || '',
            saveAddressToProfile: sessionData.saveAddressToProfile === true,
            saveAddressAsDefault: sessionData.saveAddressAsDefault === true,
            addressLabel: sessionData.addressLabel || 'Home',
            items: sessionData.items,
            subtotal: Number(sessionData.subtotal) || 0,
            discountAmount: Number(sessionData.discountAmount) || 0,
            couponCode: sessionData.couponCode || '',
            deliveryLocationType: sessionData.deliveryLocationType || 'inside',
            shippingLocationType: sessionData.shippingLocationType
                || (sessionData.deliveryLocationType === 'outside' ? 'Outside City' : 'Inside City'),
            deliveryCharge: Number(sessionData.deliveryCharge ?? sessionData.shippingFee) || 0,
            shippingFee: Number(sessionData.deliveryCharge ?? sessionData.shippingFee) || 0,
            subTotal: Number(sessionData.subTotal ?? sessionData.subtotal) || 0,
            grandTotal: Number(sessionData.grandTotal ?? sessionData.totalAmount) || 0,
            totalAmount: Number(sessionData.payableAfterWallet ?? sessionData.grandTotal ?? sessionData.totalAmount) || 0,
            walletApplied: Number(sessionData.walletApplied) || 0,
            applyWallet: sessionData.applyWallet === true,
            paymentMethodId: isWallet ? undefined : method.id,
            paymentMethod: isWallet ? 'Wallet' : (method.code || method.name),
            status: 'Pending',
            note: sessionData.note || localStorage.getItem('shippingCourierNote') || ''
        };

        const authToken = localStorage.getItem('token') || localStorage.getItem('customerToken');
        const orderHeaders = { 'Content-Type': 'application/json' };
        if (authToken) orderHeaders.Authorization = `Bearer ${authToken}`;

        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: orderHeaders,
            body: JSON.stringify(orderData)
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to place order.');
        }

        const verifiedOrderId = result.data?.orderId || orderData.orderId;

        if (window.analytics) {
            window.analytics.trackPurchase({
                orderId: verifiedOrderId,
                grandTotal: result.data?.grandTotal ?? orderData.grandTotal,
                deliveryCharge: result.data?.deliveryCharge ?? orderData.deliveryCharge,
                couponCode: orderData.couponCode,
                items: orderData.items
            });
        }

        const lockedPricing = result.lockedPricing || {
            subTotal: result.data?.subTotal,
            deliveryCharge: result.data?.deliveryCharge,
            processingFee: result.data?.processingFee ?? processingFee,
            grandTotal: result.data?.grandTotal,
            totalAmount: result.data?.totalAmount
        };

        if (lockedPricing && Object.keys(lockedPricing).length > 0) {
            localStorage.setItem('lastOrderLockedPricing', JSON.stringify({
                orderId: verifiedOrderId,
                ...lockedPricing
            }));
        }

        const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';
        if (isBuyNow) {
            localStorage.removeItem('isBuyNowMode');
            localStorage.removeItem('buy_now_item');
        } else {
            if (authToken) {
                await fetch('/api/cart/clear-ordered', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${authToken}` }
                }).catch((err) => console.error('DB Cart cleanup failed', err));
            }

            const fullCart = JSON.parse(localStorage.getItem('cart')) || [];
            const remainingCart = fullCart.filter((item) => item.selected === false);
            localStorage.setItem('cart', JSON.stringify(remainingCart));
        }

        localStorage.removeItem('activeCheckoutSession');
        localStorage.removeItem('appliedCoupon');
        localStorage.removeItem('shippingFullName');
        localStorage.removeItem('shippingMobile');
        localStorage.removeItem('shippingAddress');
        localStorage.removeItem('shippingCourierNote');

        // Automated gateways: attempt hosted redirect when the adapter is live.
        if (!isWallet && method?.type === 'automated') {
            try {
                const initHeaders = { 'Content-Type': 'application/json' };
                if (authToken) initHeaders.Authorization = `Bearer ${authToken}`;

                const initRes = await fetch('/api/payments/initiate', {
                    method: 'POST',
                    headers: initHeaders,
                    body: JSON.stringify({
                        orderId: verifiedOrderId,
                        paymentMethodId: method.id
                    })
                });
                const initData = await initRes.json();
                if (initData.success && initData.data?.redirectUrl) {
                    window.location.href = initData.data.redirectUrl;
                    return;
                }
            } catch (gatewayErr) {
                console.warn('Gateway initiate deferred:', gatewayErr);
            }
        }

        const methodLabel = isWallet ? 'Wallet' : (method?.name || 'selected method');
        showOrderSuccessModal(verifiedOrderId, methodLabel, method?.type === 'automated');
    } catch (error) {
        console.error('Order error:', error);
        alert(`Error: ${error.message}`);
        if (confirmBtn) {
            confirmBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Confirm & Place Order';
            confirmBtn.disabled = false;
        }
    }
};

function showOrderSuccessModal(verifiedOrderId, methodLabel, isAutomated = false) {
    const successModal = document.getElementById('orderSuccessModal');
    if (!successModal) {
        window.location.href = '/';
        return;
    }

    document.getElementById('modalOrderId').innerText = verifiedOrderId;
    document.getElementById('modalGatewayMessage').innerHTML = isAutomated
        ? `Your order <strong>${escapeHtml(verifiedOrderId)}</strong> via <strong>${escapeHtml(methodLabel)}</strong> is placed. Complete payment on the gateway when prompted.`
        : `Your order <strong>${escapeHtml(verifiedOrderId)}</strong> via <strong>${escapeHtml(methodLabel)}</strong> has been placed.`;
    document.getElementById('modalDeliveryDate').innerText =
        new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString();

    successModal.style.setProperty('display', 'flex', 'important');

    const copyBtn = document.getElementById('copyOrderIdBtn');
    if (copyBtn) {
        copyBtn.onclick = function copyOrderId() {
            navigator.clipboard.writeText(verifiedOrderId).then(() => {
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 2000);
            });
        };
    }

    let timeLeft = 30;
    const timer = setInterval(() => {
        timeLeft -= 1;
        if (document.getElementById('modalTimerCount')) {
            document.getElementById('modalTimerCount').innerText = timeLeft;
        }
        if (timeLeft <= 0) {
            clearInterval(timer);
            window.location.href = '/';
        }
    }, 1000);

    const continueBtn = document.getElementById('modalCloseAndHomeBtn');
    if (continueBtn) {
        continueBtn.onclick = function goHome() {
            clearInterval(timer);
            window.location.href = '/';
        };
    }
}
