/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/payment.js
 * Description: Advanced Dynamic Payment Engine - LocalStorage Session Loader,
 * Interactive Payment Card Toggler, Live Instructions Generator, and MongoDB Fetch API.
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
    let totalPrice = 0;

    if (sessionData.items && sessionData.items.length > 0) {
        sessionData.items.forEach(item => {
            totalItems += (parseInt(item.quantity) || 1);
            totalPrice += parseFloat(item.price) * (parseInt(item.quantity) || 1);
        });
    }

    document.getElementById('summaryItemsCount').innerText = `${totalItems} Item${totalItems !== 1 ? 's' : ''}`;
    document.getElementById('summaryPayableTotal').innerText = `৳${totalPrice}`;
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
🚀 🔀 ৪. ফাইনাল অর্ডার সাবমিশন (MongoDB API ইন্টিগ্রেশন)
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
        confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Your Order...`;
        confirmBtn.disabled = true;
    }

    try {
        let fullCart = JSON.parse(localStorage.getItem('cart')) || [];
        let orderedItems = fullCart.filter(item => item.selected !== false);
        let remainingCart = fullCart.filter(item => item.selected === false);
        
        const custName = localStorage.getItem('shippingFullName') || "Guest Customer";
        const custPhone = localStorage.getItem('shippingMobile') || "N/A";
        const custAddress = localStorage.getItem('shippingAddress') || "N/A";
        const custNote = localStorage.getItem('shippingCourierNote') || "";
        
        let totalAmount = orderedItems.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);

        const generatedOrderId = "EOB" + Math.floor(100000 + Math.random() * 900000);
        const estimatedDeliveryDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

        // 🌟 MongoDB-এর জন্য ডেটা প্যাকেট
        const orderData = {
            orderId: generatedOrderId, 
            customerName: custName,
            customerPhone: custPhone,
            customerAddress: custAddress,
            items: orderedItems,
            totalAmount: totalAmount,
            paymentMethod: finalMethod,
            status: "Pending",
            note: custNote
        };

        // 🚀 আমাদের নিজস্ব ব্যাকএন্ডে (MongoDB) POST রিকোয়েস্ট পাঠানো হচ্ছে
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
            // ডাটাবেজে সেভ সফল হলে কার্ট পরিষ্কার করা
            localStorage.setItem('cart', JSON.stringify(remainingCart));
            localStorage.removeItem('activeCheckoutSession');
            localStorage.removeItem('shippingFullName');
            localStorage.removeItem('shippingMobile');
            localStorage.removeItem('shippingAddress');
            localStorage.removeItem('shippingCourierNote');

            // সাকসেস মডাল শো করানো
            const successModal = document.getElementById('orderSuccessModal');
            const modalMessage = document.getElementById('modalGatewayMessage');
            const modalOrderIdSpan = document.getElementById('modalOrderId');
            const modalTimerSpan = document.getElementById('modalTimerCount');
            const modalCloseBtn = document.getElementById('modalCloseAndHomeBtn');
            const modalDeliveryDateSpan = document.getElementById('modalDeliveryDate');

            if (successModal) {
                if (modalOrderIdSpan) modalOrderIdSpan.innerText = generatedOrderId;
                if (modalMessage) {
                    modalMessage.innerHTML = `Your order has been logged via <strong>${finalMethod}</strong>.<br>Thank you for choosing EonlineBazar!`;
                }
                if (modalDeliveryDateSpan) {
                    modalDeliveryDateSpan.innerText = estimatedDeliveryDate;
                }
                
                successModal.style.setProperty('display', 'flex', 'important');
            }

            let timeLeft = 30;
            const countdownInterval = setInterval(() => {
                timeLeft--;
                if (modalTimerSpan) {
                    modalTimerSpan.innerText = timeLeft;
                }
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    window.location.href = '/';
                }
            }, 1000);

            if (modalCloseBtn) {
                modalCloseBtn.onclick = function() {
                    clearInterval(countdownInterval);
                    window.location.href = '/';
                };
            }
        } else {
            alert("Failed to place order. Please try again.");
            if (confirmBtn) {
                confirmBtn.innerHTML = `Confirm Order`;
                confirmBtn.disabled = false;
            }
        }

    } catch (error) {
        console.error("Order submission error:", error);
        alert("An error occurred while connecting to the server. Please check if the server is running.");
        if (confirmBtn) {
            confirmBtn.innerHTML = `Confirm Order`;
            confirmBtn.disabled = false;
        }
    }
}

// 🌟 অর্ডার আইডি কপি করার ফাংশন
window.copyOrderId = function() {
    const orderId = document.getElementById('modalOrderId').innerText;
    
    navigator.clipboard.writeText(orderId).then(() => {
        const btn = document.querySelector('.copy-order-id-btn');
        if (btn) {
            const originalIcon = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-check"></i>`; 
            
            setTimeout(() => {
                btn.innerHTML = originalIcon; 
            }, 1500);
        }
    }).catch(err => {
        console.error("Copy failed: ", err);
    });
};







