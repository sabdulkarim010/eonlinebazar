/**
 * =========================================================================
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/payment.js
 * Description: Advanced Dynamic Payment Engine - LocalStorage Session Loader,
 * Interactive Payment Card Toggler, Live Instructions Generator, 
 * and MongoDB Fetch API (With Isolated Buy Now Cleanup Logic).
 * =========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // ১. চেকআউট সেশন থেকে কাস্টমার ও অর্ডারের ডাটা লোড করা
    loadCheckoutSessionData();

    // ২. পেমেন্ট মেথড কার্ডের ক্লিক এবং ইন্টারঅ্যাকশন হ্যান্ডলার
    initPaymentCardToggler();

    // ৩. প্রথমবার পেজ লোড হওয়ার সময় ডিফল্ট (বিকাশ) ইনস্ট্রাকশন শো করা
    updatePaymentInstructions("bKash");

    // ৪. ফাইনাল অর্ডার কনফার্মেশন বাটন লিসেনার
    const confirmOrderBtn = document.getElementById('confirmOrderFinalBtn');
    if (confirmOrderBtn) {
        confirmOrderBtn.addEventListener('click', handleFinalOrderSubmission);
    }
});

/* =========================================================================
   📥 ১. সেশন ডাটা লোডার (Load Data from Checkout Session)
   ========================================================================= */
function loadCheckoutSessionData() {
    const sessionData = JSON.parse(localStorage.getItem('activeCheckoutSession'));
    
    if (!sessionData) {
        alert("No active checkout session found. Redirecting to cart.");
        window.location.href = '/cart';
        return;
    }

    document.getElementById('summaryCustomerName').innerText = sessionData.customerName || "N/A";
    document.getElementById('summaryCustomerMobile').innerText = sessionData.customerPhone || sessionData.customerMobile || "N/A";
    document.getElementById('summaryCustomerAddress').innerText = sessionData.customerAddress || "N/A";

    const noteRow = document.getElementById('summaryCourierNoteRow');
    const noteSpan = document.getElementById('summaryCourierNote');
    
    // সেশন ডাটা বা লোকালস্টোরেজ থেকে নোট নেওয়া হচ্ছে
    const savedNote = sessionData.note || localStorage.getItem('shippingCourierNote') || "";
    if (savedNote && savedNote.trim() !== "") {
        if (noteSpan) noteSpan.innerText = savedNote;
        if (noteRow) noteRow.style.display = "block";
    } else {
        if (noteRow) noteRow.style.display = "none";
    }

    let totalItems = 0;
    let calculatedSubtotal = 0;

    if (sessionData.items && sessionData.items.length > 0) {
        sessionData.items.forEach(item => {
            totalItems += (parseInt(item.quantity) || 1);
            calculatedSubtotal += parseFloat(item.price) * (parseInt(item.quantity) || 1);
        });
    }

    const subtotal = Number(sessionData.subtotal) || calculatedSubtotal;
    const discountAmount = Number(sessionData.discountAmount) || 0;
    const deliveryCharge = Number(sessionData.deliveryCharge ?? sessionData.shippingFee) || 0;
    const payable = Number.isFinite(Number(sessionData.totalAmount))
        ? Number(sessionData.totalAmount)
        : Math.max(0, subtotal - discountAmount + deliveryCharge);

    document.getElementById('summaryItemsCount').innerText = `${totalItems} Item${totalItems !== 1 ? 's' : ''}`;

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

    document.getElementById('summaryPayableTotal').innerText = `৳${payable}`;
}

/* =========================================================================
   💳 ২. ইন্টারেক্টিভ কার্ড টগলার (Interactive Payment Card Click Logic)
   ========================================================================= */
function initPaymentCardToggler() {
    const cards = document.querySelectorAll('.payment-method-card');
    
    cards.forEach(card => {
        card.addEventListener('click', function() {
            cards.forEach(c => c.classList.remove('active-method'));
            this.classList.add('active-method');
            
            const radioBtn = this.querySelector('input[type="radio"]');
            if (radioBtn) {
                radioBtn.checked = true;
                updatePaymentInstructions(radioBtn.value);
            }
        });
    });
}

/* =========================================================================
   ⚡ ৩. ডাইনামিক ইনস্ট্রাকশন জেনারেটর (Dynamic Gateway Instructions)
   ========================================================================= */
function updatePaymentInstructions(method) {
    const instructionBox = document.getElementById('paymentInstructionsBox');
    if (!instructionBox) return;

    let htmlContent = "";

    switch(method) {
        case "bKash":
            htmlContent = `
                <p><strong><i class="fa-solid fa-building-columns"></i> bKash Payment Instructions:</strong></p>
                <ol style="margin-left: 20px; padding-top: 5px;">
                    <li>Go to your bKash app or dial *247#</li>
                    <li>Choose <strong>Send Money</strong> to our Personal Wallet: <strong style="color: #d12053;">017XXXXXXXX</strong></li>
                    <li>Enter the total payable amount shown in your order summary.</li>
                    <li>After successful payment, keep the Transaction ID (Txnid) for safety.</li>
                </ol>
                <div class="instruction-important-note">
                    <i class="fa-solid fa-circle-info"></i> Our team will verify your mobile number and payment within 15-30 minutes after placing the order.
                </div>
            `;
            break;
            
        case "Nagad":
            htmlContent = `
                <p><strong><i class="fa-solid fa-bolt"></i> Nagad Payment Instructions:</strong></p>
                <ol style="margin-left: 20px; padding-top: 5px;">
                    <li>Open your Nagad App or dial *167#</li>
                    <li>Select <strong>Send Money</strong> to our Wallet: <strong style="color: #f64a1e;">019XXXXXXXX</strong></li>
                    <li>Send the exact amount stated in the summary section.</li>
                </ol>
                <div class="instruction-important-note">
                    <i class="fa-solid fa-circle-info"></i> Please ensure you are sending from your personal Nagad wallet for automated logging.
                </div>
            `;
            break;
            
        case "Bank":
            htmlContent = `
                <p><strong><i class="fa-solid fa-building-columns"></i> Bank Account Information:</strong></p>
                <div style="background: #ffffff; padding: 10px; border-radius: 6px; margin-top: 8px; border: 1px solid #e2e8f0;">
                    <div>Bank Name: <strong>Islami Bank Bangladesh PLC</strong></div>
                    <div>Account Name: <strong>eOnlineBazar Enterprise</strong></div>
                    <div>Account No: <strong>2050XXXXXXXXXXXXX</strong></div>
                    <div>Branch: <strong>Dhaka Main Branch</strong></div>
                </div>
                <div class="instruction-important-note">
                    <i class="fa-solid fa-circle-info"></i> Please mention your Mobile Number in the bank deposit reference field.
                </div>
            `;
            break;
            
        case "COD":
            htmlContent = `
                <p><strong><i class="fa-solid fa-truck"></i> Cash on Delivery (COD) Selected:</strong></p>
                <p style="font-size: 13px; color: #475569; margin-top: 5px;">
                    You don't need to pay online right now! You will check and pay the total amount in cash to the delivery agent once the package safely reaches your doorstep.
                </p>
                <div class="instruction-important-note" style="color: #166534; background: #e2fbe8; padding: 8px; border-radius: 4px;">
                    <i class="fa-solid fa-circle-check"></i> Standard Delivery takes 2-3 working days across Bangladesh.
                </div>
            `;
            break;
            
        default:
            htmlContent = `<p>Please select a valid payment method to proceed.</p>`;
    }

    instructionBox.innerHTML = htmlContent;
}

/* =========================================================================
🚀 🔀 ৪. ফাইনাল অর্ডার সাবমিশন (MongoDB API & Cart Sync Integration)
========================================================================= */
window.handleFinalOrderSubmission = async function() {
    const selectedRadio = document.querySelector('input[name="paymentGateway"]:checked');

    if (!selectedRadio) {
        alert("Please select a payment method first.");
        return;
    }

    const finalMethod = selectedRadio.value;
    const confirmBtn = document.getElementById('confirmOrderFinalBtn');
    
    if (confirmBtn) {
        confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Order...`;
        confirmBtn.disabled = true;
    }

    try {
        const sessionData = JSON.parse(localStorage.getItem('activeCheckoutSession'));
        if (!sessionData || !sessionData.items) {
            throw new Error("Checkout session expired. Please go back to cart.");
        }

        const orderData = {
            orderId: sessionData.orderId || "EOB" + Math.floor(100000 + Math.random() * 900000),
            customerName: sessionData.customerName,
            customerPhone: sessionData.customerPhone,
            customerAddress: sessionData.customerAddress,
            shippingDistrict: sessionData.shippingDistrict || '',
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
            totalAmount: Number(sessionData.grandTotal ?? sessionData.totalAmount) || 0,
            paymentMethod: finalMethod,
            status: "Pending",
            note: sessionData.note || localStorage.getItem('shippingCourierNote') || ""
        };

        const token = localStorage.getItem('token') || localStorage.getItem('customerToken');

        // ১. অর্ডার সেভ করার রিকোয়েস্ট
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
            const verifiedOrderId = result.data?.orderId || orderData.orderId;
            const lockedPricing = result.lockedPricing || {
                subTotal: result.data?.subTotal,
                deliveryCharge: result.data?.deliveryCharge,
                grandTotal: result.data?.grandTotal,
                totalAmount: result.data?.totalAmount
            };

            if (lockedPricing && Object.keys(lockedPricing).length > 0) {
                localStorage.setItem('lastOrderLockedPricing', JSON.stringify({
                    orderId: verifiedOrderId,
                    ...lockedPricing
                }));
            }

            // 🟢 ফিক্স: চেক করা হচ্ছে অর্ডারটি Buy Now থেকে এসেছে কিনা
            const isBuyNow = localStorage.getItem('isBuyNowMode') === 'true';

            if (isBuyNow) {
                // যদি Buy Now হয়, তবে মেইন কার্টে কোনো হাত দেওয়া হবে না। শুধু Buy Now মোড ক্লিয়ার হবে।
                localStorage.removeItem('isBuyNowMode');
                localStorage.removeItem('buy_now_item');
            } else {
                // ২. যদি কার্ট থেকে অর্ডার হয়, তবেই ডাটাবেজ কার্ট ক্লিয়ার করা হবে
                if (token) {
                    await fetch('/api/cart/clear-ordered', {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).catch(err => console.error("DB Cart cleanup failed", err));
                }

                // ৩. লোকাল কার্ট আপডেট করা (শুধু সিলেক্ট না করা আইটেমগুলো রাখা হবে)
                let fullCart = JSON.parse(localStorage.getItem('cart')) || [];
                let remainingCart = fullCart.filter(item => item.selected === false);
                localStorage.setItem('cart', JSON.stringify(remainingCart));
            }

            // ৪. চেকআউট সেশন ক্লিনআপ (সবার জন্য সাধারণ ক্লিনআপ)
            localStorage.removeItem('activeCheckoutSession');
            localStorage.removeItem('appliedCoupon');
            localStorage.removeItem('shippingFullName');
            localStorage.removeItem('shippingMobile');
            localStorage.removeItem('shippingAddress');
            localStorage.removeItem('shippingCourierNote');

            // ৫. সাকসেস মডাল শো
            const successModal = document.getElementById('orderSuccessModal');
            if (successModal) {
                document.getElementById('modalOrderId').innerText = verifiedOrderId;
                document.getElementById('modalGatewayMessage').innerHTML = `Your order <strong>${verifiedOrderId}</strong> via <strong>${finalMethod}</strong> has been placed.`;
                document.getElementById('modalDeliveryDate').innerText = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString();
                
                successModal.style.setProperty('display', 'flex', 'important');

                // 🛑 অর্ডার আইডি কপি লজিক (ইন্টারঅ্যাক্টিভ)
                const copyBtn = document.getElementById('copyOrderIdBtn');
                if (copyBtn) {
                    copyBtn.onclick = function() {
                        navigator.clipboard.writeText(verifiedOrderId).then(() => {
                            const originalHTML = copyBtn.innerHTML;
                            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                            setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
                        });
                    };
                }
            }

            // ৬. রিডাইরেক্ট টাইমার হ্যান্ডলার
            let timeLeft = 30;
            const timer = setInterval(() => {
                timeLeft--;
                if (document.getElementById('modalTimerCount')) document.getElementById('modalTimerCount').innerText = timeLeft;
                if (timeLeft <= 0) { clearInterval(timer); window.location.href = '/'; }
            }, 1000);

            // ৭. কন্টিনিউ শপিং বাটনের জন্য হ্যান্ডলার
            const continueBtn = document.getElementById('modalCloseAndHomeBtn');
            if (continueBtn) {
                continueBtn.onclick = function() {
                    clearInterval(timer); 
                    window.location.href = '/';
                };
            }

        } else {
            throw new Error(result.message || "Failed to place order.");
        }

    } catch (error) {
        console.error("Order error:", error);
        alert("Error: " + error.message);
        if (confirmBtn) {
            confirmBtn.innerHTML = `Confirm Order`;
            confirmBtn.disabled = false;
        }
    }
}




