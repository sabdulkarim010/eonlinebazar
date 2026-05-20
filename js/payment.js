/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/payment.js
 * Description: Advanced Dynamic Payment Engine - LocalStorage Session Loader,
 * Interactive Payment Card Toggler, Live Instructions Generator, and Cart flusher.
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
        // যদি কেউ সরাসরি এই পেজে চলে আসে কোনো ডাটা ছাড়া, তাকে কার্টে ফেরত পাঠানো হবে
        alert("No active checkout session found. Redirecting to cart.");
        window.location.href = 'cart.html';
        return;
    }

    // শিপিং রিভিউ ডাটা পুশ
    document.getElementById('summaryCustomerName').innerText = sessionData.customerName || "N/A";
    document.getElementById('summaryCustomerMobile').innerText = sessionData.customerMobile || "N/A";
    document.getElementById('summaryCustomerAddress').innerText = sessionData.customerAddress || "N/A";

    // ৩ নম্বর পয়েন্ট ফিক্স: যদি কুরিয়ার নোট থাকে তবেই দেখাবে, না থাকলে নোটের বক্সটি হাইড থাকবে
    const noteRow = document.getElementById('summaryCourierNoteRow');
    const noteSpan = document.getElementById('summaryCourierNote');
    if (sessionData.courierNote && sessionData.courierNote.trim() !== "") {
        if (noteSpan) noteSpan.innerText = sessionData.courierNote;
        if (noteRow) noteRow.style.display = "block";
    } else {
        if (noteRow) noteRow.style.display = "none";
    }

    // প্রোডাক্টের ক্যালকুলেশন এবং প্রাইস লোড
    let totalItems = 0;
    let totalPrice = 0;

    if (sessionData.items && sessionData.items.length > 0) {
        sessionData.items.forEach(item => {
            totalItems += (item.quantity || 1);
            totalPrice += item.price * (item.quantity || 1);
        });
    }

    // সামারি বক্সে টেক্সট আপডেট
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
            // প্রথমে সমস্ত কার্ড থেকে অ্যাক্টিভ সিএসএস ক্লাস রিমুভ করা
            cards.forEach(c => c.classList.remove('active-method'));
            
            // বর্তমান ক্লিক করা কার্ডে অ্যাক্টিভ ক্লাস যোগ করা
            this.classList.add('active-method');
            
            // কার্ডের ভেতরের হিডেন রেডিও বাটনটিকে ট্রু/সিলেক্ট করা
            const radioBtn = this.querySelector('input[type="radio"]');
            if (radioBtn) {
                radioBtn.checked = true;
                // ডাইনামিক ইনস্ট্রাকশন টেক্সট আপডেট করার ফাংশন কল
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

    // বক্সের ভেতরের HTML টেক্সট স্মুথলি আপডেট করা
    instructionBox.innerHTML = htmlContent;
}

/* =========================================================================
   🚀 🔀 ৪. ফাইনাল অর্ডার সাবমিশন, ডাইনামিক আইডি এবং ২০ সেকেন্ড অটো-টাইমার (নিরাপদ কোড)
   ========================================================================= */
function handleFinalOrderSubmission() {
    const selectedRadio = document.querySelector('input[name="paymentGateway"]:checked');
    if (!selectedRadio) {
        alert("Please select a payment method first.");
        return;
    }

    const finalMethod = selectedRadio.value;
    
    // বাটনে লোডিং ইফেক্ট যুক্ত করা
    const confirmBtn = document.getElementById('confirmOrderFinalBtn');
    if (confirmBtn) {
        confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Your Order...`;
        confirmBtn.disabled = true;
    }

    // ১.৫ সেকেন্ড ফেক ব্যাকএন্ড রেসপন্স ডিলে
    setTimeout(() => {
        let fullCart = JSON.parse(localStorage.getItem('cart')) || [];
        
        // শুধুমাত্র চেকআউটে পাঠানো আইটেমগুলো ফিল্টার করে কার্ট আপডেট করা
        let remainingCart = fullCart.filter(item => item.selected === false);
        localStorage.setItem('cart', JSON.stringify(remainingCart));
        
        // ব্যবহৃত চেকআউট সেশন ডাটা মুছে ফেলা
        localStorage.removeItem('activeCheckoutSession');

        // মোডাল এলিমেন্টগুলো সিলেক্ট করা
        const successModal = document.getElementById('orderSuccessModal');
        const modalMessage = document.getElementById('modalGatewayMessage');
        const modalOrderIdSpan = document.getElementById('modalOrderId');
        const modalTimerSpan = document.getElementById('modalTimerCount');
        const modalCloseBtn = document.getElementById('modalCloseAndHomeBtn');

        // 🎲 ইউনিক ৬ ডিজিটের অর্ডার আইডি জেনারেট করা
        const randomOrderId = Math.floor(100000 + Math.random() * 900000);

        if (successModal) {
            // আইডি এবং মেসেজ ডাইনামিকালি পুশ করা
            if (modalOrderIdSpan) modalOrderIdSpan.innerText = `#${randomOrderId}`;
            if (modalMessage) {
                modalMessage.innerHTML = `Your order has been logged via <strong>${finalMethod}</strong>.<br>Thank you for choosing eOnlineBazar!`;
            }
            
            // 🎯 সিএসএস ডিসপ্লে ব্লক/ফ্লেক্স করে মোডালটি স্ক্রিনের একদম উপরে শো করানো
            successModal.style.setProperty('display', 'flex', 'important');
        }

        // --- অর্ডার সাকসেসফুল হওয়ার পর ফর্মের ডেটা মুছে ফেলা ---
        localStorage.removeItem('shippingFullName');
        localStorage.removeItem('shippingMobile');
        localStorage.removeItem('shippingAddress');
        localStorage.removeItem('shippingCourierNote');
        // --------------------------------------------------------
        
        // ⏱️ ২০ সেকেন্ডের সেফ কাউন্টডাউন টাইমার
        let timeLeft = 20;
        
        const countdownInterval = setInterval(() => {
            timeLeft--;
            if (modalTimerSpan) {
                modalTimerSpan.innerText = timeLeft;
            }
            
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                window.location.href = 'index.html';
            }
        }, 1000);

        // ম্যানুয়াল ক্লিক ইভেন্ট
        if (modalCloseBtn) {
            modalCloseBtn.onclick = function() {
                clearInterval(countdownInterval);
                window.location.href = 'index.html';
            };
        }
        
    }, 1500);
}

