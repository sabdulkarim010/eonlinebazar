/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/checkout.js
 * Description: Advanced Checkout Logic - Temporary selection removal (No Cart Deletion),
 * Professional Name/Contact Rules, Courier Note reader, and Payment Page integration.
 * Updates: Integrated Custom Professional Modal Alert (No Browser Popups).
 */

document.addEventListener('DOMContentLoaded', () => {
    // ১. চেকআউট কার্ট আইটেম রেন্ডার করা
    if (document.getElementById('checkoutItemsContainer')) {
        renderCheckoutCart();
    }
    
    // ২. ইনপুট ফিল্ডগুলোর লাইভ রিয়াল-টাইম ভ্যালিডেশন
    initLiveValidationEngine();

    // ৩. Proceed to Payment বাটনের ইভেন্ট লিসেনার
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', handleProceedToPayment);
    }

    // ৪. মডালের বাইরের কালো ওভারলেতে ক্লিক করলে যাতে মডাল বন্ধ হয় (এক্সট্রা সেফটি)
    const alertModal = document.getElementById('checkoutAlertModal');
    if (alertModal) {
        alertModal.addEventListener('click', function(event) {
            if (event.target === this) {
                closeCheckoutAlertModal();
            }
        });
    }
});

/* =========================================================================
   🛍️ ১. কার্ট রেন্ডারিং ইঞ্জিন (Render Selected Items Only)
   ========================================================================= */
function renderCheckoutCart() {
    const container = document.getElementById('checkoutItemsContainer');
    const template = document.getElementById('cartItemTemplate');
    const subtotalText = document.getElementById('checkoutSubtotal');
    const grandTotalText = document.getElementById('checkoutGrandTotal');
    const itemsCountText = document.getElementById('totalItemsCount');
    
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    
    if (!container || !template) return;
    container.innerHTML = '';

    // শুধুমাত্র চেকমার্ক করা (selected !== false) প্রোডাক্টগুলো ফিল্টার করা হচ্ছে
    let checkedItems = currentCart.filter(item => item.selected !== false);

    // যদি চেকআউট করার মতো কোনো আইটেম না থাকে
    if (checkedItems.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 10px; color:#64748b; width:100%;">
                <i class="fa-solid fa-basket-shopping" style="font-size:44px; color:#cbd5e1; margin-bottom:12px; display:block;"></i>
                <span style="font-size:15px; font-weight:600; color:#1e293b; display:block;">No items selected for checkout!</span>
                <p style="font-size:13px; color:#94a3b8; margin:4px 0 0 0;">Go back to cart and select products to purchase.</p>
            </div>
        `;
        if (subtotalText) subtotalText.innerText = '৳0';
        if (grandTotalText) grandTotalText.innerText = '৳0';
        if (itemsCountText) itemsCountText.innerText = '0 Items';
        return;
    }

    let calculatedTotal = 0;
    let calculatedQty = 0;

    checkedItems.forEach(item => {
        const itemTotalCost = item.price * (item.quantity || 1);
        calculatedTotal += itemTotalCost;
        calculatedQty += (item.quantity || 1);

        // টেমপ্লেট ক্লোন
        const clone = template.content.cloneNode(true);

        // মিডিয়া বা ইমেজ উইথ ইমোজি হ্যান্ডলার
        const mediaFrame = clone.querySelector('.cart-media-frame-box');
        let imgSource = item.products || item.image || item.icon;

        if (imgSource && typeof imgSource === 'string' && /\.(jpg|jpeg|png|webp)$/i.test(imgSource.trim())) {
            let cleanPath = imgSource.trim();
            if (!cleanPath.startsWith('products/') && !cleanPath.startsWith('images/')) cleanPath = 'products/' + cleanPath;
            mediaFrame.innerHTML = `<img src="${cleanPath}" alt="${item.name}">`;
        } else if (item.icon && item.icon.trim() !== '') {
            mediaFrame.innerHTML = `<span style="font-size:24px;">${item.icon}</span>`;
        } else {
            mediaFrame.innerHTML = `<span>📦</span>`;
        }

        // টেক্সট ডাটা পুশ
        clone.querySelector('.cart-item-name-text').innerText = item.name;
        clone.querySelector('.cart-item-base-price-text').innerText = `৳${item.price}`;
        clone.querySelector('.cart-item-total').innerText = `৳${itemTotalCost}`;
        clone.querySelector('.qty-text').innerText = item.quantity || 1;

        // প্লাস, মাইনাস এবং ডিলিট বাটনের অ্যাকশন এসাইন
        clone.querySelector('.btn-minus').addEventListener('click', () => changeItemQuantity(item.id, -1));
        clone.querySelector('.btn-plus').addEventListener('click', () => changeItemQuantity(item.id, 1));
        
        // এটি মূল শপিং কার্ট থেকে ডিলিট করবে না, শুধু আনচেক করবে
        clone.querySelector('.checkout-row-delete-btn-main').addEventListener('click', () => temporarilyRemoveFromCheckout(item.id));

        container.appendChild(clone);
    });

    // টোটাল আপডেট
    if (subtotalText) subtotalText.innerText = `৳${calculatedTotal}`;
    if (grandTotalText) grandTotalText.innerText = `৳${calculatedTotal}`;
    if (itemsCountText) itemsCountText.innerText = `${calculatedQty} Item${calculatedQty !== 1 ? 's' : ''}`;
}

/* =========================================================================
   ⚡ ২. কোর কার্ট অ্যাকশন লজিক (Quantity & Selection Handlers)
   ========================================================================= */
function changeItemQuantity(productId, amount) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => i.id === productId);
    if (item) {
        item.quantity = (item.quantity || 1) + amount;
        if (item.quantity < 1) {
            temporarilyRemoveFromCheckout(productId);
            return;
        }
    }
    localStorage.setItem('cart', JSON.stringify(currentCart));
    renderCheckoutCart();
}

// শপিং কার্ট অক্ষত রেখে চেকআউট ভিউ থেকে হাইড করা (selected = false)
function temporarilyRemoveFromCheckout(productId) {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = currentCart.find(i => i.id === productId);
    if (item) {
        item.selected = false; 
    }
    localStorage.setItem('cart', JSON.stringify(currentCart));
    renderCheckoutCart(); 
}

/* =========================================================================
   🛡️ ৩. এডভান্সড ফর্ম ভ্যালিডেশন ইঞ্জিন (Anti-Spam & Char Limits)
   ========================================================================= */
function updateFieldUI(input, errorEl, isValid, message) {
    if (!input || !errorEl) return;
    if (input.value.trim() === "") {
        input.style.borderColor = "#cbd5e1";
        input.style.backgroundColor = "#ffffff";
        errorEl.innerText = "";
        return;
    }
    if (isValid) {
        input.style.borderColor = "#10b981"; // সাকসেস গ্রিন বর্ডার
        input.style.backgroundColor = "#f0fdf4";
        errorEl.innerText = "";
    } else {
        input.style.borderColor = "#ef4444"; // এরর রেড বর্ডার
        input.style.backgroundColor = "#fef2f2";
        errorEl.innerText = message;
    }
}

// কীবোর্ড জিবরিশ বা অনাকাঙ্ক্ষিত স্প্যাম ইনপুট প্রটেকশন
function detectSpamPattern(text) {
    const clean = text.trim().toLowerCase();
    if (clean.length < 4) return false;
    if (/([a-z\u0980-\u09ff])\1\1/.test(clean)) return true; // পর পর ৩ বার একই অক্ষর টাইপ করলে
    return false;
}

function initLiveValidationEngine() {
    const nameInput = document.getElementById('shippingFullName');
    const mobileInput = document.getElementById('shippingMobile');
    const addressInput = document.getElementById('shippingAddress');

    if (nameInput) {
        nameInput.addEventListener('input', () => {
            const val = nameInput.value.trim();
            const words = val.split(/\s+/);
            const isLengthValid = val.length >= 3; 
            const isMultiWord = words.length >= 2 && words[1] !== "";
            const isClean = !detectSpamPattern(val);

            let msg = "";
            if (!isLengthValid) msg = "Name must be at least 3 characters long.";
            else if (!isMultiWord) msg = "Please enter your full name (First & Last name).";
            else if (!isClean) msg = "Invalid name pattern detected.";

            updateFieldUI(nameInput, document.getElementById('name-error'), (isLengthValid && isMultiWord && isClean), msg);
        });
    }

    if (mobileInput) {
        mobileInput.addEventListener('input', () => {
            mobileInput.value = mobileInput.value.replace(/\D/g, ''); // শুধু সংখ্যা টাইপ করতে দেওয়া হবে
            const val = mobileInput.value.trim();
            const isValidBDMobile = /^01[3-9]\d{8}$/.test(val);

            let msg = "";
            if (val.length < 11) msg = "Mobile number must be exactly 11 digits.";
            else if (!isValidBDMobile) msg = "Please enter a valid Bangladeshi mobile number.";

            updateFieldUI(mobileInput, document.getElementById('mobile-error'), (val.length === 11 && isValidBDMobile), msg);
        });
    }

    if (addressInput) {
        addressInput.addEventListener('input', () => {
            const val = addressInput.value.trim();
            const words = val.split(/\s+/);
            const isAddressLong = words.length >= 3;
            const isClean = !detectSpamPattern(val);

            let msg = "";
            if (!isAddressLong) msg = "Please write a detailed address (at least 3 words).";
            else if (!isClean) msg = "Invalid characters detected.";

            updateFieldUI(addressInput, document.getElementById('address-error'), (isAddressLong && isClean), msg);
        });
    }
}

/* =========================================================================
   💳 🔀 ৪. পেমেন্ট গেটওয়ে পেজে সাবমিশন (Proceed To Payment Logic)
   ========================================================================= */
function handleProceedToPayment() {
    let currentCart = JSON.parse(localStorage.getItem('cart')) || [];
    const checkedItems = currentCart.filter(item => item.selected !== false);

    // ১. চেকআউট লিস্ট বা কার্ট সম্পূর্ণ খালি থাকলে কাস্টম মডাল শো করবে
    if (checkedItems.length === 0) {
        openCheckoutAlertModal("Your checkout list is empty! Please select items first.");
        return;
    }

    // ফর্মের নোডগুলো ধরা হচ্ছে
    const nameNode = document.getElementById('shippingFullName');
    const mobileNode = document.getElementById('shippingMobile');
    const addressNode = document.getElementById('shippingAddress');
    const courierNoteNode = document.getElementById('shippingCourierNote'); 

    const nameVal = nameNode ? nameNode.value.trim() : "";
    const mobileVal = mobileNode ? mobileNode.value.trim() : "";
    const addressVal = addressNode ? addressNode.value.trim() : "";
    const noteVal = courierNoteNode ? courierNoteNode.value.trim() : "";

    // চূড়ান্ত লজিক গেট ভ্যালিডেশন স্টেট
    const isNameOk = nameVal.length >= 3 && nameVal.split(/\s+/).length >= 2 && !detectSpamPattern(nameVal);
    const isMobileOk = mobileVal.length === 11 && /^01[3-9]\d{8}$/.test(mobileVal);
    const isAddressOk = addressVal.split(/\s+/).length >= 3 && !detectSpamPattern(addressVal);

    // 🎯 ২. ফর্ম ফিল্ড ফাকা থাকলে বা ভুল থাকলে কুৎসিত ব্রাউজার alert() এর বদলে কাস্টম মডাল ট্রিগার হবে
    if (!isNameOk || !isMobileOk || !isAddressOk) {
        openCheckoutAlertModal("Please fill in all required shipping fields correctly before proceeding.");
        return;
    }

    // সমস্ত ইনফরমেশন একটি অবজেক্টে নিয়ে পরবর্তী পেমেন্ট পেজের জন্য রেডি করা
    const checkoutOrderSession = {
        customerName: nameVal,
        customerMobile: mobileVal,
        customerAddress: addressVal,
        courierNote: noteVal, 
        items: checkedItems,
        paymentStatus: "Pending"
    };

    // ডাটা সাময়িকভাবে সেভ করে রাখা যাতে পেমেন্ট পেজে শো করা যায়
    localStorage.setItem('activeCheckoutSession', JSON.stringify(checkoutOrderSession));

    // প্রফেশনাল লোডিং অ্যানিমেশন এফেক্ট বাটনে
    const proceedBtn = document.getElementById('proceedToPaymentBtn');
    if (proceedBtn) {
        proceedBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Securing Connection...`;
        proceedBtn.disabled = true;
    }

    // ১.২ সেকেন্ড পর নতুন প্রফেশনাল পেমেন্ট মেথড পেজে রিডাইরেক্ট করা
    setTimeout(() => {
        window.location.href = 'payment.html';
    }, 1200);
}

/* =========================================================================
   🚨 ৫. কাস্টম অ্যালার্ট মডাল কন্ট্রোল ফাংশনসমূহ (Open/Close Handlers)
   ========================================================================= */

// মডাল উইন্ডো ওপেন করার ডাইনামিক ফাংশন
function openCheckoutAlertModal(message) {
    const alertModal = document.getElementById('checkoutAlertModal');
    if (alertModal) {
        // মডালের ভেতরের টেক্সট ডাইনামিকালি সেট করা হচ্ছে
        const messageEl = alertModal.querySelector('.custom-alert-modal-message');
        if (messageEl) {
            messageEl.innerText = message;
        }
        alertModal.style.display = 'flex';
    } else {
        // ফলব্যাক ব্যাকআপ (মডাল এলিমেন্ট কোনো কারণে মিসিং হলে)
        alert(message);
    }
}

// মডাল উইন্ডো বন্ধ করার ফাংশন ("OK, Got It" বাটনের জন্য)
function closeCheckoutAlertModal() {
    const alertModal = document.getElementById('checkoutAlertModal');
    if (alertModal) {
        alertModal.style.display = 'none';
    }
}

// অন্যান্য ফাইলে গ্লোবাল ব্যবহারের জন্য এক্সপোজ করা হলো
window.closeCheckoutAlertModal = closeCheckoutAlertModal;